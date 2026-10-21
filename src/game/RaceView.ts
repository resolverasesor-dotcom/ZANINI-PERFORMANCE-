import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { DIFF_SPEED, type Difficulty } from '../ai/Drivers';
import type { Input } from '../core/Input';
import { clamp, damp, formatDelta, formatTime } from '../core/math';
import type { CameraMode, Profile, Settings } from '../core/Settings';
import { saveSettings } from '../core/Settings';
import { CameraRig } from '../engine/CameraRig';
import { Effects, SkidMarks } from '../engine/Effects';
import { buildKart, wavePennant, type KartMesh } from '../engine/KartModel';
import { skyEnvironment } from '../engine/envmap';
import { TrackScene } from '../engine/TrackScene';
import { KART, type KartEvent, type KartInput, emptyInput } from '../physics/Kart';
import { ghostPose, GhostRecorder, loadGhost, loadRecord, saveGhost, saveRecord, type GhostData } from '../race/Ghost';
import { RaceSim, type Competitor, type Entrant, type RaceResultRow, type SessionKind, type SimEvent } from '../race/RaceSim';
import { getRefLap, getTrack } from '../track/trackCache';
import type { Track } from '../track/Track';
import { AIDriver } from '../ai/AIDriver';
import { DEBUG } from '../core/debug';
import { el } from '../ui/dom';
import { Hud, type TowerRow } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { Tutorial } from '../ui/Tutorial';
import { navigate } from '../ui/nav';
import type { TouchControls } from '../ui/TouchControls';

export interface GameCtx {
  renderer: THREE.WebGLRenderer;
  input: Input;
  audio: AudioEngine;
  settings: Settings;
  profile: Profile;
  uiRoot: HTMLElement;
  touch: TouchControls | null;
  touchEnabled: () => boolean;
}

export interface SessionSetup {
  kind: SessionKind;
  trackId: string;
  laps: number;
  difficulty: Difficulty;
  entrants: Entrant[];
  /** Duración (s) para libres/clasificación; 0 = sin límite. */
  duration: number;
  /** Texto de contexto (p. ej. "GP 2/6 · Carrera"). */
  label: string;
  /** Modo del menú que la originó. */
  mode: 'practice' | 'timetrial' | 'quick' | 'weekend' | 'championship';
  /** Permite terminar la sesión desde pausa (fin de semana / campeonato). */
  canEndSession: boolean;
  /** Sesión de tutorial (libres guiados de 20 s). */
  tutorial?: boolean;
}

export type SessionOutcome =
  | { kind: 'race'; results: RaceResultRow[] }
  | { kind: 'quali'; standings: { id: string; e: Entrant; best: number | null }[] }
  | { kind: 'practice'; best: number | null }
  | { kind: 'exit' }
  | { kind: 'restart' };

const STEP = 1 / 120;

class KartView {
  readonly mesh: KartMesh;
  /** Eventos e impactos acumulados durante el frame (puede haber varios pasos de física). */
  events: KartEvent[] = [];
  wallImpact = 0;
  kartImpact = 0;
  private spin = 0;
  constructor(
    readonly comp: Competitor,
    scene: THREE.Scene,
    reflective: boolean,
  ) {
    this.mesh = buildKart(comp.e.color, comp.e.number, { ...(comp.e.look ?? {}), reflective });
    this.mesh.root.rotation.order = 'YXZ';
    scene.add(this.mesh.root);
  }

  update(alpha: number, dt: number, track: Track): void {
    const k = this.comp.kart;
    const r = this.mesh.root;
    r.position.set(k.px + (k.x - k.px) * alpha, k.py + (k.y - k.py) * alpha, k.pz + (k.z - k.pz) * alpha);
    let dy = k.yaw - k.pyaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    r.rotation.y = k.pyaw + dy * alpha;
    const i0 = k.proj.idx;
    const i1 = (i0 + 1) % track.n;
    const slope = (track.py[i1] - track.py[i0]) / track.ds;
    const along = Math.sin(k.yaw) * k.proj.tx + Math.cos(k.yaw) * k.proj.tz;
    r.rotation.x = damp(r.rotation.x, -Math.atan(slope * along), 10, dt);
    const b = this.mesh.body;
    b.rotation.y = k.driftVisual;
    const roll = clamp(-k.yawRate * Math.max(0, k.vF) * 0.012, -0.12, 0.12);
    b.rotation.z = damp(b.rotation.z, roll, 8, dt);
    b.position.y = (k.hop > 0 ? Math.sin((k.hop / 0.16) * Math.PI) * 0.18 : 0) + (k.rumble > 0.5 && k.speed > 5 ? (Math.random() - 0.5) * 0.03 : 0);
    for (const p of this.mesh.frontPivots) p.rotation.y = -k.steer * 0.45;
    this.spin += (k.vF * dt) / 0.16;
    for (const w of this.mesh.wheels) w.rotation.x = this.spin;
    wavePennant(this.mesh, performance.now() / 1000, Math.abs(k.vF));
    const fl = this.mesh.flame;
    fl.visible = k.boostTime > 0;
    if (fl.visible) {
      const s = 0.8 + Math.random() * 0.6;
      fl.scale.set(s, s * (k.boostLevel === 2 ? 1.6 : 1.1), s);
      (fl.material as THREE.MeshBasicMaterial).color.set(k.boostLevel === 2 ? '#ff9a1f' : '#4aa8ff');
    }
  }
}

export class RaceView {
  readonly scene = new THREE.Scene();
  readonly sim: RaceSim;
  readonly track: Track;
  private trackScene: TrackScene;
  private rig: CameraRig;
  private views: KartView[] = [];
  private effects: Effects;
  private tutorial: Tutorial | null = null;
  private tutorialEnd = 0;
  private skids: SkidMarks;
  private hud: Hud;
  private minimap: Minimap;
  private acc = 0;
  private respawnReq = false;
  paused = false;
  private pauseEl: HTMLDivElement;
  private endPrompt: HTMLDivElement;
  private done = false;
  private hudTimer = 0;
  private mapTimer = 0;
  private ghostRec = new GhostRecorder();
  private ghostData: GhostData | null = null;
  private ghostMesh: KartMesh | null = null;
  private storedRecord: { best: number | null; sectors: (number | null)[] };
  private lapSectors: (number | null)[] = [null, null, null];
  private finishedAt = -1;
  private qualiEndArmed = false;
  private playerInput: KartInput = emptyInput();
  private wrongWayTime = 0;
  private visualTime = 0;

  constructor(
    private ctx: GameCtx,
    readonly setup: SessionSetup,
    private onDone: (o: SessionOutcome) => void,
  ) {
    this.track = getTrack(setup.trackId);
    const refLap = setup.kind === 'quali' ? getRefLap(setup.trackId, DIFF_SPEED[setup.difficulty]) : undefined;
    this.sim = new RaceSim({
      track: this.track,
      kind: setup.kind,
      laps: setup.laps,
      difficulty: setup.difficulty,
      entrants: setup.entrants,
      duration: setup.duration,
      refLap,
      seed: Math.floor(Math.random() * 100000),
    });
    // Parámetro de depuración ?autopilot: la IA conduce el kart del jugador (pruebas).
    if (DEBUG.autopilot && this.sim.player) {
      const ai = new AIDriver(this.sim.player.kart, null, 'pro', 5);
      ai.perfect = true;
      this.sim.player.ai = ai;
    }
    this.storedRecord = loadRecord(setup.trackId);
    this.sim.recordSectors = this.storedRecord.sectors.slice();

    const quality = ctx.settings.quality;
    this.trackScene = new TrackScene(this.track, quality, this.scene);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.mode = ctx.settings.camera;
    this.effects = new Effects(quality === 'bajo');
    this.scene.add(this.effects.group);
    this.skids = new SkidMarks(quality === 'bajo' ? 500 : 1600);
    this.scene.add(this.skids.mesh);
    for (const c of this.sim.comps) this.views.push(new KartView(c, this.scene, quality !== 'bajo'));
    // Reflejos: entorno generado a partir del cielo del circuito
    if (quality !== 'bajo') {
      const lk = this.trackScene.look;
      this.scene.environment = skyEnvironment(ctx.renderer, lk.skyTop, lk.skyHorizon, lk.hemiGround, lk.sun, lk.sunDir);
    }

    // Fantasma
    if (ctx.settings.ghost && (setup.kind === 'practice' || setup.kind === 'timetrial')) {
      this.ghostData = loadGhost(setup.trackId);
      this.ghostMesh = buildKart('#ffffff', 0, { ghost: true });
      this.ghostMesh.root.visible = false;
      this.ghostMesh.root.rotation.order = 'YXZ';
      this.scene.add(this.ghostMesh.root);
    }

    this.hud = new Hud(ctx.uiRoot);
    this.minimap = new Minimap(this.track, window.innerWidth < 700 ? 110 : 170);
    this.hud.mapSlot.appendChild(this.minimap.canvas);
    this.hud.showTower(setup.kind === 'race' || setup.kind === 'quali');
    this.hud.setPosition(null, 0);

    this.pauseEl = el('div', 'overlay pause hidden');
    ctx.uiRoot.appendChild(this.pauseEl);
    this.endPrompt = el('div', 'end-prompt hidden');
    this.endPrompt.innerHTML = `<button class="btn primary" data-act="results">Ver resultados ▶</button>`;
    this.endPrompt.querySelector('button')!.addEventListener('click', () => {
      this.ctx.audio.select();
      this.sim.forceFinish();
    });
    ctx.uiRoot.appendChild(this.endPrompt);

    if (setup.tutorial && this.sim.player) {
      this.trackScene.setStartLights(0, true);
      this.tutorial = new Tutorial(ctx.uiRoot, this.sim.player.kart, ctx.input, ctx.settings, () => this.finish({ kind: 'practice', best: null }), ctx.profile.name.charAt(0) + ctx.profile.name.slice(1).toLowerCase());
    } else if (setup.kind === 'race') {
      this.trackScene.setStartLights(0);
      this.hud.message(this.setup.label.toUpperCase(), 'title', 3);
    } else {
      this.trackScene.setStartLights(0, true);
      const t = { practice: 'ENTRENAMIENTOS LIBRES', timetrial: 'CONTRARRELOJ', quali: 'CLASIFICACIÓN', race: '' }[setup.kind];
      this.hud.message(t, 'title', 2.5);
      this.hud.subMessage(setup.kind === 'quali' ? 'Marca tu mejor vuelta antes de que acabe el tiempo' : 'La primera vuelta es de lanzamiento', '', 3.5);
    }
    ctx.audio.stopMusic();
    this.ctx.touch?.show(ctx.touchEnabled());
    this.onResize();
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.rig.setAspect(w / h);
    this.hud.resize();
  }

  get player(): Competitor | null {
    return this.sim.player;
  }

  setCamera(mode: CameraMode): void {
    this.rig.mode = mode;
    this.rig.reset();
  }

  // ---------- pausa ----------
  private openPause(): void {
    if (this.done) return;
    this.paused = true;
    this.ctx.audio.silenceLoops();
    const s = this.setup;
    const endLabel = s.kind === 'quali' ? 'Terminar clasificación' : 'Terminar sesión';
    this.pauseEl.innerHTML = `
      <div class="panel pause-panel">
        <h2>PAUSA</h2>
        <div class="pause-info">${s.label}</div>
        <button class="btn primary" data-act="resume">Continuar</button>
        ${s.kind !== 'race' && s.canEndSession ? `<button class="btn" data-act="end">${endLabel}</button>` : ''}
        <button class="btn" data-act="restart">Reiniciar</button>
        <button class="btn" data-act="camera">Cámara: <b>${{ trasera: 'Trasera', cercana: 'Cercana', capo: 'Capó' }[this.rig.mode]}</b></button>
        <button class="btn danger" data-act="exit" >Salir al menú</button>
        <button class="hidden" data-back data-act="resume"></button>
        <div class="pause-help">Controles: ←→ girar · ↑ acelerar · ↓ frenar · Espacio derrapar · R reaparecer · C cámara</div>
      </div>`;
    this.pauseEl.classList.remove('hidden');
    this.ctx.touch?.show(false);
    this.pauseEl.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        this.ctx.audio.click();
        const a = b.dataset.act;
        if (a === 'resume') this.closePause();
        else if (a === 'restart') this.finish({ kind: 'restart' });
        else if (a === 'exit') this.finish({ kind: 'exit' });
        else if (a === 'end') {
          this.closePause();
          this.endSession();
        } else if (a === 'camera') {
          this.cycleCamera();
          this.openPause();
        }
      }),
    );
    (this.pauseEl.querySelector('[data-act="resume"]') as HTMLElement).focus();
  }

  private closePause(): void {
    this.paused = false;
    this.pauseEl.classList.add('hidden');
    this.ctx.touch?.show(this.ctx.touchEnabled());
  }

  private cycleCamera(): void {
    const order: CameraMode[] = ['trasera', 'cercana', 'capo'];
    const next = order[(order.indexOf(this.rig.mode) + 1) % order.length];
    this.setCamera(next);
    this.ctx.settings.camera = next;
    saveSettings(this.ctx.settings);
  }

  /** Termina libres o clasificación. */
  private endSession(): void {
    if (this.setup.kind === 'quali') {
      this.sim.revealAllQuali();
      this.finish({ kind: 'quali', standings: this.sim.qualiStandings() });
    } else if (this.setup.kind === 'race') {
      this.sim.forceFinish();
    } else {
      this.finish({ kind: 'practice', best: this.player?.bestLap ?? null });
    }
  }

  private finish(o: SessionOutcome): void {
    if (this.done) return;
    this.done = true;
    this.ctx.audio.silenceLoops();
    this.onDone(o);
  }

  // ---------- bucle ----------
  frame(dt: number): void {
    if (this.done) return;
    const ctrl = this.ctx.input.poll();
    if (this.paused) {
      if (ctrl.pause) this.closePause();
      else navigate(this.pauseEl, ctrl.nav);
      this.render();
      return;
    }
    if (ctrl.pause) {
      this.openPause();
      return;
    }
    if (ctrl.camera) this.cycleCamera();
    if (ctrl.respawn) this.respawnReq = true;
    if (!this.endPrompt.classList.contains('hidden')) navigate(this.endPrompt, ctrl.nav);

    const pi = this.playerInput;
    pi.steer = ctrl.steer;
    pi.throttle = ctrl.throttle;
    pi.brake = ctrl.brake;
    pi.drift = ctrl.drift;

    this.acc += Math.min(dt, 0.1) * DEBUG.timeScale;
    const player = this.player;
    while (this.acc >= STEP) {
      this.sim.step(STEP, pi, this.respawnReq);
      this.respawnReq = false;
      // Acumular eventos e impactos de todos los pasos de este frame
      for (const v of this.views) {
        const k = v.comp.kart;
        for (const e of k.events) v.events.push(e);
        v.wallImpact = Math.max(v.wallImpact, k.wallImpact);
        v.kartImpact = Math.max(v.kartImpact, k.kartImpact);
      }
      if (player && player.lapsDone > 0) {
        const k = player.kart;
        this.ghostRec.sample(STEP, k.x, k.y, k.z, k.yaw);
      }
      this.handleEvents();
      this.acc -= STEP;
      if (this.done) return;
    }
    const alpha = this.acc / STEP;
    this.visualTime += dt;
    if (this.tutorial) {
      const pv = this.views.find((v) => v.comp === player);
      if (pv?.events.some((e) => e === 'boost1' || e === 'boost2')) this.tutorial.boost();
      this.tutorial.update(dt, pi.steer);
      if (this.tutorial.finished) {
        this.tutorialEnd += dt;
        if (this.tutorialEnd > 1.4) {
          this.finish({ kind: 'practice', best: null });
          return;
        }
      }
    }

    for (const v of this.views) v.update(alpha, dt, this.track);
    this.updateEffects(dt);
    this.updateCamera(dt);
    for (const v of this.views) {
      v.events.length = 0;
      v.wallImpact = 0;
      v.kartImpact = 0;
    }
    // Un kart pegado a la cámara taparía la vista: se oculta.
    const cp = this.rig.camera.position;
    for (const v of this.views) {
      if (v.comp === this.player) continue;
      const p = v.mesh.root.position;
      v.mesh.root.visible = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 + (p.z - cp.z) ** 2 > 2.6 * 2.6;
    }
    this.updateGhost();
    this.updateAudio();
    this.updateHud(dt);
    this.checkEnd();
    this.render();
  }

  private render(): void {
    this.ctx.renderer.render(this.scene, this.rig.camera);
  }

  private updateCamera(dt: number): void {
    const p = this.player ?? this.sim.comps[0];
    const v = this.views.find((x) => x.comp === p)!;
    const k = p.kart;
    const pos = v.mesh.root.position;
    const sp = k.speed;
    const velYaw = sp > 3 ? Math.atan2(k.vx, k.vz) : v.mesh.root.rotation.y;
    const i0 = k.proj.idx;
    const slope = (this.track.py[(i0 + 3) % this.track.n] - this.track.py[i0]) / (3 * this.track.ds);
    const along = Math.sin(k.yaw) * k.proj.tx + Math.cos(k.yaw) * k.proj.tz;
    this.rig.follow(dt, pos.x, pos.y, pos.z, v.mesh.root.rotation.y + k.driftVisual * 0.5, velYaw, sp / KART.vmax, k.boostTime > 0, slope * along);
    if (v.wallImpact > 2) {
      this.rig.addShake(Math.min(1, v.wallImpact / 10));
      this.ctx.input.rumble(Math.min(1, v.wallImpact / 12), 180);
    }
    if (v.kartImpact > 2) {
      this.rig.addShake(Math.min(0.6, v.kartImpact / 12));
      this.ctx.input.rumble(0.4, 100);
    }
    if (k.rumble > 0 && sp > 8) this.rig.addShake(0.015 * k.rumble);
    this.trackScene.update(dt, pos);
  }

  private updateGhost(): void {
    const g = this.ghostMesh;
    if (!g) return;
    const p = this.player;
    const data = this.ghostData;
    if (!p || !data || p.lapsDone === 0) {
      g.root.visible = false;
      return;
    }
    const t = this.sim.time - p.lapStart;
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    if (ghostPose(data, t, pose)) {
      g.root.visible = true;
      g.root.position.set(pose.x, pose.y, pose.z);
      g.root.rotation.y = pose.yaw;
    } else g.root.visible = false;
  }

  private updateEffects(dt: number): void {
    const cam = this.rig.camera.position;
    for (const v of this.views) {
      const k = v.comp.kart;
      const pos = v.mesh.root.position;
      const d2 = (pos.x - cam.x) ** 2 + (pos.z - cam.z) ** 2;
      if (d2 > 70 * 70) continue;
      const yaw = v.mesh.root.rotation.y + k.driftVisual;
      if (k.drifting && k.speed > 6) {
        this.effects.driftSparks(pos.x, pos.y, pos.z, yaw, k.driftLevel, k.driftDir);
        if (Math.random() < 0.35) this.effects.puff(pos.x - Math.sin(yaw) * 0.8, pos.y, pos.z - Math.cos(yaw) * 0.8, [0.85, 0.85, 0.85], 0.5, 0.7, 0.6);
      }
      // Marcas de neumático al derrapar, deslizar o frenar a fondo
      const sliding = (k.drifting || Math.abs(k.vL) > 2.6 || (v.comp.input.brake > 0.8 && k.vF > 12)) && k.speed > 5;
      const onAsphalt = k.surface === 'track' || k.surface === 'asphalt';
      for (const side of [-1, 1]) {
        const key = `${v.comp.id}${side}`;
        if (sliding && onAsphalt) {
          const fx = Math.sin(yaw);
          const fz = Math.cos(yaw);
          this.skids.mark(key, pos.x - fx * 0.62 - fz * side * 0.62, pos.y, pos.z - fz * 0.62 + fx * side * 0.62);
        } else this.skids.lift(key);
      }
      const off = k.surface === 'grass' || k.surface === 'gravel' || k.surface === 'sand';
      if (off && k.speed > 4 && Math.random() < 0.7) {
        const c: [number, number, number] = k.surface === 'grass' ? [0.45, 0.5, 0.3] : k.surface === 'sand' ? [0.9, 0.82, 0.6] : [0.78, 0.7, 0.58];
        this.effects.puff(pos.x - Math.sin(yaw) * 0.9, pos.y, pos.z - Math.cos(yaw) * 0.9, c, 0.8, 0.9, 1.2);
      }
      if (v.wallImpact > 3) {
        this.effects.impact(pos.x, pos.y, pos.z, v.wallImpact);
        if (d2 < 30 * 30) this.ctx.audio.hit(v.wallImpact * (v.comp === this.player ? 1 : 0.5));
      }
      if (v.kartImpact > 3 && d2 < 25 * 25) this.ctx.audio.hit(v.kartImpact * 0.6);
      for (const e of v.events) {
        if (e === 'boost1' || e === 'boost2') {
          this.effects.boostBurst(pos.x, pos.y, pos.z, yaw, e === 'boost2' ? 2 : 1);
          if (v.comp === this.player) {
            this.ctx.audio.boost(e === 'boost2' ? 2 : 1);
            this.rig.addShake(0.15);
          }
        }
        if ((e === 'driftLevel1' || e === 'driftLevel2') && v.comp === this.player) this.ctx.audio.driftLevel(e === 'driftLevel2' ? 2 : 1);
      }
    }
    this.effects.update(dt);
  }

  private updateAudio(): void {
    const p = this.player;
    if (!p) return;
    const k = p.kart;
    const ratio = Math.abs(k.vF) / KART.vmax;
    const thr = this.playerInput.throttle;
    const moving = k.speed > 1;
    const rpm = moving ? clamp(0.14 + ratio * 0.82 + thr * 0.08 + (k.boostTime > 0 ? 0.08 : 0), 0, 1.1) : 0.12 + thr * 0.55;
    const rivals = this.sim.comps
      .filter((c) => c !== p)
      .map((c) => ({ rpm: clamp(0.14 + (Math.abs(c.kart.vF) / KART.vmax) * 0.85, 0, 1), dist: Math.hypot(c.kart.x - k.x, c.kart.z - k.z) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    this.ctx.audio.updateEngines({ rpm, load: thr }, rivals);
    const skid = k.drifting ? 0.85 : clamp((Math.abs(k.vL) - 1.5) / 5, 0, 1);
    const off = k.surface === 'grass' || k.surface === 'gravel' || k.surface === 'sand' ? 1 : k.surface === 'kerb' ? 0.55 : 0;
    this.ctx.audio.updateLoops(k.speed > 3 ? skid : 0, off * clamp(k.speed / 12, 0, 1), ratio * ratio);
  }

  // ---------- eventos ----------
  private handleEvents(): void {
    const ev = this.sim.events;
    if (!ev.length) return;
    for (const e of ev) this.onEvent(e);
    ev.length = 0;
  }

  private isPlayer(id: string): boolean {
    return this.player?.id === id;
  }

  private onEvent(e: SimEvent): void {
    const hud = this.hud;
    const a = this.ctx.audio;
    switch (e.type) {
      case 'light':
        hud.setLights(e.n, true);
        this.trackScene.setStartLights(e.n);
        a.lightBeep();
        break;
      case 'go':
        hud.setLights(0, true, true);
        this.trackScene.setStartLights(0);
        hud.message('¡YA!', 'go', 1.2);
        a.goBeep();
        setTimeout(() => hud.setLights(0, false), 900);
        break;
      case 'jumpstart':
        if (this.isPlayer(e.id)) {
          hud.subMessage('SALIDA ANTICIPADA · +5 s', 'bad', 3.5);
          a.warning();
        }
        break;
      case 'penalty':
        if (this.isPlayer(e.id) && e.reason !== 'Salida anticipada') {
          hud.subMessage(`PENALIZACIÓN +${e.seconds} s · ${e.reason}`, 'bad', 3.5);
          a.warning();
        }
        break;
      case 'warning':
        if (this.isPlayer(e.id)) {
          hud.subMessage(`⚠ ${e.text}`, 'warn', 3);
          a.warning();
        }
        break;
      case 'invalid':
        if (this.isPlayer(e.id)) {
          hud.subMessage('VUELTA INVALIDADA · has atajado', 'bad', 3);
          a.warning();
        }
        break;
      case 'sector':
        if (this.isPlayer(e.id)) {
          this.lapSectors[e.sector] = e.time;
          if (e.sector === 0) hud.resetSectors();
          hud.setSector(e.sector, e.color, `S${e.sector + 1} ${e.time.toFixed(2)}`);
        }
        break;
      case 'lap':
        if (this.isPlayer(e.id)) this.onPlayerLap(e.time, e.best, e.valid, e.lap);
        break;
      case 'lastlap':
        hud.subMessage('ÚLTIMA VUELTA', 'warn', 2.5);
        break;
      case 'flag':
        hud.setFlag('checkered');
        break;
      case 'finish':
        if (this.isPlayer(e.id)) {
          const pos = this.sim.player!.position;
          hud.message(`<span class="flagtxt">🏁</span> ¡META! <b>P${pos}</b>`, 'finish', 5);
          a.fanfare();
          this.finishedAt = this.visualTime;
        }
        break;
      case 'timeup':
        if (this.setup.kind !== 'timetrial') {
          hud.message('TIEMPO CUMPLIDO', 'title', 2.5);
          hud.subMessage('Termina tu vuelta', '', 3);
          this.qualiEndArmed = true;
        }
        break;
    }
  }

  private onPlayerLap(time: number, best: boolean, valid: boolean, lap: number): void {
    const hud = this.hud;
    const p = this.player!;
    const kind = this.setup.kind;
    // Fantasma y récords (cualquier modo con vuelta válida)
    const ghost = this.ghostRec.finish(time);
    this.ghostRec.reset();
    if (valid) {
      const rec = this.storedRecord;
      let changed = false;
      for (let i = 0; i < 3; i++) {
        const s = this.lapSectors[i];
        if (s != null && (rec.sectors[i] == null || s < rec.sectors[i]!)) {
          rec.sectors[i] = s;
          changed = true;
        }
      }
      if (rec.best == null || time < rec.best) {
        const prev = rec.best;
        rec.best = time;
        changed = true;
        saveGhost(this.setup.trackId, ghost);
        hud.subMessage(prev == null ? '¡PRIMER RÉCORD PERSONAL!' : `¡NUEVO RÉCORD PERSONAL! ${formatDelta(time - prev)}`, 'purple', 3.5);
      }
      if (changed) saveRecord(this.setup.trackId, rec);
      if (best && (kind === 'practice' || kind === 'timetrial')) {
        // En libres el fantasma es tu mejor vuelta de la sesión salvo que el récord sea mejor.
        if (!this.ghostData || time <= this.ghostData.lapTime || kind === 'practice') this.ghostData = ghost;
      }
    }
    const txt = `${kind === 'race' ? `VUELTA ${lap}` : 'VUELTA'} · ${formatTime(time)}`;
    if (!valid) hud.message(`<span class="strike">${formatTime(time)}</span>`, 'bad', 2.2);
    else if (best && p.lapTimes.length > 1) hud.message(`¡MEJOR VUELTA! ${formatTime(time)}`, 'purple', 2.5);
    else hud.message(txt, '', 2);
    this.ctx.audio.lapChime(best && valid);
    this.lapSectors = [null, null, null];
    if (kind === 'quali' && this.qualiEndArmed) {
      this.sim.revealAllQuali();
      setTimeout(() => this.finish({ kind: 'quali', standings: this.sim.qualiStandings() }), 1800);
    }
    if (kind === 'practice' && this.qualiEndArmed && this.setup.duration > 0) {
      setTimeout(() => this.finish({ kind: 'practice', best: p.bestLap }), 1800);
    }
  }

  private checkEnd(): void {
    const sim = this.sim;
    if (sim.isRace) {
      if (this.finishedAt >= 0 && this.endPrompt.classList.contains('hidden') && this.visualTime - this.finishedAt > 2.5) {
        this.endPrompt.classList.remove('hidden');
        (this.endPrompt.querySelector('button') as HTMLElement).focus();
      }
      if (sim.phase === 'finished') {
        this.endPrompt.classList.add('hidden');
        this.finish({ kind: 'race', results: sim.results() });
      }
    } else if (this.qualiEndArmed) {
      // Si estaba en la vuelta de lanzamiento o tarda demasiado, cerrar.
      const p = this.player!;
      const waited = sim.time - (sim.cfg.duration ?? 0);
      if (p.lapsDone === 0 || waited > 120) {
        if (this.setup.kind === 'quali') {
          sim.revealAllQuali();
          this.finish({ kind: 'quali', standings: sim.qualiStandings() });
        } else this.finish({ kind: 'practice', best: p.bestLap });
      }
    }
  }

  // ---------- HUD ----------
  private updateHud(dt: number): void {
    const hud = this.hud;
    hud.tick(dt);
    const p = this.player;
    if (!p) return;
    const k = p.kart;
    const ratio = Math.abs(k.vF) / KART.vmax;
    hud.setSpeed(Math.abs(k.vF) * 3.6, ratio, k.boostTime > 0);
    hud.setDrift(k.driftLevel, k.driftCharge, k.drifting);
    const sl = this.ctx.settings.speedLines ? clamp((ratio - 0.72) / 0.35, 0, 1) + (k.boostTime > 0 ? 0.5 : 0) : 0;
    hud.drawSpeedLines(Math.min(1, sl), k.boostTime > 0);

    // Dirección contraria
    const along = Math.sin(k.yaw) * k.proj.tx + Math.cos(k.yaw) * k.proj.tz;
    if (along < -0.5 && k.speed > 3 && this.sim.phase === 'racing') this.wrongWayTime += dt;
    else this.wrongWayTime = 0;
    hud.setWrongWay(this.wrongWayTime > 1.2);

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 30;
      const marks: { x: number; z: number; color: string; player: boolean; ghost?: boolean }[] = this.sim.comps.map((c) => ({ x: c.kart.x, z: c.kart.z, color: c.e.color, player: c.e.isPlayer }));
      if (this.ghostMesh?.root.visible) marks.unshift({ x: this.ghostMesh.root.position.x, z: this.ghostMesh.root.position.z, color: '#fff', player: false, ghost: true });
      this.minimap.draw(marks);
    }

    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.05;
    const sim = this.sim;
    const kind = this.setup.kind;
    const cur = sim.phase === 'countdown' ? 0 : p.lapsDone === 0 && kind !== 'race' ? null : sim.time - p.lapStart;
    hud.setTimes(cur, p.lastLap, p.bestLap, !p.lapValid && p.lapsDone > 0);
    hud.setDelta(kind === 'race' ? null : sim.liveDelta(p));
    if (kind === 'race') {
      const total = sim.comps.length;
      hud.setPosition(p.position, total);
      const lap = Math.min(sim.cfg.laps, Math.max(1, p.lapsDone + 1));
      hud.setLap(p.finished ? 'TERMINADO' : `VUELTA ${lap}/${sim.cfg.laps}`);
      hud.setSession(this.setup.label);
      const order = sim.comps.slice().sort((a, b) => a.position - b.position);
      const rows: TowerRow[] = order.map((c) => {
        let text: string;
        if (c.position === 1) text = c.finished ? 'META' : 'LÍDER';
        else if (c.lapsBehind > 0 && !c.finished) text = `+${c.lapsBehind} V`;
        else text = '+' + c.gap.toFixed(1);
        return { pos: c.position, short: c.e.short, color: c.e.color, player: c.e.isPlayer, text: c.penalty ? `${text} ⚑` : text };
      });
      hud.setTower(rows);
    } else {
      const st = sim.qualiStandings();
      const pos = st.findIndex((r) => r.id === p.id) + 1;
      hud.setPosition(kind === 'quali' ? pos : null, st.length);
      hud.setLap(p.lapsDone === 0 ? 'VUELTA DE LANZAMIENTO' : `VUELTA ${p.lapsDone}`);
      let session = this.setup.label;
      if (sim.cfg.duration) session += ` · ${sim.timeUp ? 'FIN' : formatClock(sim.timeLeft)}`;
      if (kind === 'timetrial') {
        const rec = this.storedRecord.best;
        session += ` · Récord ${formatTime(rec ?? this.track.def.record.time)}`;
      }
      hud.setSession(session);
      if (kind === 'quali') {
        const top = st[0]?.best ?? null;
        hud.setTower(
          st.map((r, i) => ({
            pos: i + 1,
            short: r.e.short,
            color: r.e.color,
            player: r.e.isPlayer,
            text: r.best == null ? '—' : i === 0 || top == null ? formatTime(r.best) : '+' + (r.best - top).toFixed(3),
          })),
        );
      }
    }
  }

  dispose(): void {
    this.trackScene.dispose(this.scene);
    this.effects.dispose();
    this.skids.dispose();
    for (const v of this.views) for (const m of v.mesh.materials) m.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    this.hud.dispose();
    this.pauseEl.remove();
    this.tutorial?.dispose();
    this.endPrompt.remove();
    this.ctx.audio.silenceLoops();
  }
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
