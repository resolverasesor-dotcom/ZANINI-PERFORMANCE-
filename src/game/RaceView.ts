import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { DIFF_SPEED, type Difficulty } from '../ai/Drivers';
import type { Input } from '../core/Input';
import { clamp, damp, formatDelta, formatTime } from '../core/math';
import type { CameraMode, Profile, Settings } from '../core/Settings';
import { ASSIST_LABELS, saveSettings, SPEED_CLASS, type AssistLevel } from '../core/Settings';
import { CameraRig } from '../engine/CameraRig';
import { Effects, SkidMarks } from '../engine/Effects';
import { buildKart, wavePennant, type KartMesh } from '../engine/KartModel';
import { skyEnvironment } from '../engine/envmap';
import type { PostFX } from '../engine/PostFX';
import { TrackScene } from '../engine/TrackScene';
import { KART, setKartClass, type KartEvent, type KartInput, emptyInput } from '../physics/Kart';
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
import { DriverAssist } from '../race/assists';
import { MEDAL_ICON, medalFor, medalTimes, type Medal } from '../race/medals';
import { ReplayBuffer, TVDirector } from './Replay';
import { makeProj } from '../track/Track';
import { navigate } from '../ui/nav';
import type { TouchControls } from '../ui/TouchControls';

export interface GameCtx {
  renderer: THREE.WebGLRenderer;
  draw: (scene: THREE.Scene, camera: THREE.Camera) => void;
  portrait: { ok: boolean };
  post: () => PostFX | null;
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
  | { kind: 'race'; results: RaceResultRow[]; stats: PlayerStats }
  | { kind: 'quali'; standings: { id: string; e: Entrant; best: number | null }[] }
  | { kind: 'practice'; best: number | null }
  | { kind: 'exit' }
  | { kind: 'restart' };

const STEP = 1 / 120;

/** Datos curiosos de la carrera del jugador para el resumen. */
export interface PlayerStats {
  wallHits: number;
  hops: number;
  topSpeed: number;
  driftTime: number;
}

class KartView {
  readonly mesh: KartMesh;
  /** Eventos e impactos acumulados durante el frame (puede haber varios pasos de física). */
  events: KartEvent[] = [];
  wallImpact = 0;
  kartImpact = 0;
  prevThrottle = 0;
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

  /** Coloca el kart desde la repetición. */
  setPose(p: { x: number; y: number; z: number; yaw: number; drift: number; steer: number }, dt: number, track: Track): void {
    const r = this.mesh.root;
    const moved = Math.hypot(p.x - r.position.x, p.z - r.position.z);
    r.position.set(p.x, p.y, p.z);
    r.rotation.y = p.yaw;
    this.mesh.body.rotation.y = p.drift;
    for (const piv of this.mesh.frontPivots) piv.rotation.y = -p.steer * 0.45;
    this.spin += moved / 0.16;
    for (const w of this.mesh.wheels) w.rotation.x = this.spin;
    this.mesh.flame.visible = false;
    void dt;
    void track;
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
    b.rotation.y = 0;
    // Un kart no tiene suspensión: no balancea como un coche. Con mucho apoyo lateral
    // (>0,9 g) el chasis se retuerce y levanta la rueda trasera interior.
    const ay = k.yawRate * Math.max(0, k.vF);
    const roll = -Math.sign(ay) * clamp((Math.abs(ay) - 9) / 7, 0, 1) * 0.07;
    b.rotation.z = damp(b.rotation.z, roll, 10, dt);
    // Cabeceo leve: morro abajo al frenar, arriba al acelerar
    b.rotation.x = damp(b.rotation.x, clamp(-k.ax * 0.0025, -0.03, 0.02), 10, dt);
    // Piano: el kart traquetea al ritmo de los resaltes (y se inclina hacia el lado que pisa)
    const kerbBump = k.kerb > 0 && k.speed > 3 ? Math.abs(Math.sin((k.odometer / 0.42) * Math.PI)) * 0.022 * k.kerb : 0;
    if (kerbBump) b.rotation.z += -k.kerbSide * kerbBump * 1.5;
    b.position.y = (k.hop > 0 ? Math.sin((k.hop / 0.16) * Math.PI) * 0.07 : 0) + kerbBump + (k.rumble > 0.5 && k.speed > 5 ? (Math.random() - 0.5) * 0.03 : 0);
    // Ruedas delanteras con su ángulo real (a alta velocidad apenas giran)
    for (const p of this.mesh.frontPivots) p.rotation.y = -k.wheelAngle;
    // Piloto: volante, cabeza que mira e inclina hacia la curva
    // Volante con desmultiplicación ~1:3 respecto a las ruedas, más la intención del piloto
    this.mesh.steering.rotation.z = clamp(k.wheelAngle * 3.2 + k.steer * 0.25, -1.6, 1.6);
    const m = this.mesh.helmet;
    // Al derrapar el piloto mira hacia donde va el kart (contra el ángulo de deriva)
    m.rotation.y = damp(m.rotation.y, -k.steer * 0.3 + clamp(Math.atan2(k.vL, Math.max(2, k.vF)), -0.6, 0.6) * 0.8, 8, dt);
    // En el saltito el piloto se levanta del asiento
    m.position.y = 1.0 + (k.hop > 0 ? Math.sin((k.hop / 0.16) * Math.PI) * 0.12 : 0);
    // El piloto inclina la cabeza hacia el interior de la curva (contra la fuerza G)
    m.rotation.z = damp(m.rotation.z, clamp(-ay * 0.014, -0.28, 0.28), 8, dt);
    // Luz de freno
    if (this.mesh.brakeMat) {
      const braking = this.comp.input.brake > 0.1 && k.vF > 1;
      this.mesh.brakeMat.color.setRGB(braking ? 6 : 0.25, braking ? 0.35 : 0.02, braking ? 0.25 : 0.02);
    }
    this.spin += (k.vF * dt) / 0.16;
    for (const w of this.mesh.wheels) w.rotation.x = this.spin;
    wavePennant(this.mesh, performance.now() / 1000, Math.abs(k.vF));
    this.mesh.flame.visible = false;
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
  private stats: PlayerStats = { wallHits: 0, hops: 0, topSpeed: 0, driftTime: 0 };
  private replay: ReplayBuffer | null = null;
  private tv: TVDirector | null = null;
  private replayAt = -1;
  private replayT = -1;
  private replayEl: HTMLDivElement | null = null;
  private replayProj = makeProj();
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
    // Cilindrada de esta sesión (afecta a todos los karts por igual)
    const sc = SPEED_CLASS[ctx.settings.speedClass] ?? SPEED_CLASS['150'];
    setKartClass(sc.vmax, sc.accel);
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

    if (setup.kind === 'race') {
      this.replay = new ReplayBuffer(this.views.length, 10);
      this.tv = new TVDirector(this.track);
    }
    const theme = this.track.def.theme;
    if (theme === 'night' && this.player) {
      // De noche, un foco cálido sobre el kart del jugador (y su charco de luz en el asfalto)
      const pv = this.views.find((v) => v.comp === this.player)!;
      const lamp = new THREE.PointLight('#ffdcae', 30, 22, 1.6);
      lamp.position.set(0, 3.2, 1.5);
      pv.mesh.root.add(lamp);
    }
    ctx.post()?.setLook(
      theme === 'night'
        ? { bloom: 0.75, threshold: 0.8, vignette: 0.38, sat: 1.12 }
        : theme === 'sunset'
          ? { bloom: 0.5, threshold: 0.92, vignette: 0.3, sat: 1.06, tint: '#fff6ee' }
          : { bloom: 0.38, threshold: 0.98, vignette: 0.3, sat: 1.1 },
    );
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
    if (ctx.touchEnabled() && window.innerHeight > window.innerWidth && !ctx.portrait.ok) this.openRotateHint();
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
        <button class="btn" data-act="assist">Ayudas: <b>${ASSIST_LABELS[this.ctx.settings.assist]}</b></button>
        ${this.ctx.touchEnabled() ? `<button class="btn" data-act="autoaccel">Aceleración automática: <b>${this.ctx.settings.autoAccel ? 'Sí' : 'No'}</b></button>` : ''}
        <button class="btn" data-act="camera">Cámara: <b>${{ trasera: 'Trasera', cercana: 'Cercana', capo: 'Capó' }[this.rig.mode]}</b></button>
        <button class="btn danger" data-act="exit" >Salir al menú</button>
        <button class="hidden" data-back data-act="resume"></button>
        <div class="pause-help">Controles: ←→ girar · ↑ acelerar · ↓ frenar · Espacio saltito · R reaparecer · C cámara</div>
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
        } else if (a === 'assist') {
          const order: AssistLevel[] = ['ninguna', 'media', 'maxima'];
          this.ctx.settings.assist = order[(order.indexOf(this.ctx.settings.assist) + 1) % order.length];
          saveSettings(this.ctx.settings);
          this.openPause();
        } else if (a === 'autoaccel') {
          this.ctx.settings.autoAccel = !this.ctx.settings.autoAccel;
          saveSettings(this.ctx.settings);
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
    if (this.rotateEl) {
      const landscape = window.innerWidth > window.innerHeight;
      if (landscape || this.ctx.portrait.ok) this.closeRotateHint();
      else {
        this.render();
        return;
      }
    }
    if (this.replayT >= 0) {
      if (ctrl.pause || ctrl.nav.confirm || ctrl.nav.back) this.endReplay();
      else this.runReplay(dt);
      return;
    }
    if (this.replayAt > 0 && this.visualTime >= this.replayAt) {
      this.replayAt = -1;
      this.startReplay();
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
    // Con aceleración automática no se acelera en parrilla (evita la salida anticipada)
    pi.throttle = this.ctx.input.autoAccelActive && this.sim.phase === 'countdown' && !this.ctx.input.touch.accel ? 0 : ctrl.throttle;
    pi.brake = ctrl.brake;
    pi.hop = ctrl.hop;
    if (this.player && !this.player.ai && this.sim.phase !== 'countdown') this.applyAssists(pi, Math.min(dt, 0.1));

    this.acc += Math.min(dt, 0.1) * DEBUG.timeScale;
    const player = this.player;
    while (this.acc >= STEP) {
      this.sim.step(STEP, pi, this.respawnReq);
      this.respawnReq = false;
      if (this.replay && this.replay.tick(STEP)) {
        const f = this.replay.push();
        this.views.forEach((v, i) => {
          const k = v.comp.kart;
          ReplayBuffer.write(f, i, k.x, k.y, k.z, k.yaw, k.driftVisual, k.steer);
        });
      }
      if (player && !player.finished) {
        const k = player.kart;
        if (k.wallImpact > 3) this.stats.wallHits++;
        if (k.events.includes('hop')) this.stats.hops++;
        if (k.drifting) this.stats.driftTime += STEP;
        this.stats.topSpeed = Math.max(this.stats.topSpeed, k.vF * 3.6);
      }
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
      if (pv?.events.includes('hop')) this.tutorial.hop();
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
    this.ctx.draw(this.scene, this.rig.camera);
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
    this.rig.follow(dt, pos.x, pos.y, pos.z, v.mesh.root.rotation.y, velYaw, sp / KART.vmax, false, slope * along);
    if (v.wallImpact > 2) {
      this.rig.addShake(Math.min(1, v.wallImpact / 10));
      this.ctx.input.rumble(Math.min(1, v.wallImpact / 12), 180);
    }
    if (v.kartImpact > 2) {
      this.rig.addShake(Math.min(0.6, v.kartImpact / 12));
      this.ctx.input.rumble(0.4, 100);
    }
    if (k.rumble > 0 && sp > 8) this.rig.addShake(0.015 * k.rumble);
    // Piano: temblor de cámara y vibración rítmica del mando / móvil
    if (k.kerb > 0 && sp > 5) {
      this.rig.addShake(0.03 * k.kerb * Math.min(1, sp / 20));
      this.kerbBuzz -= dt;
      if (this.kerbBuzz <= 0) {
        this.kerbBuzz = 0.12;
        this.ctx.input.rumble(0.2 + 0.35 * k.kerb, 100);
        if (this.ctx.touchEnabled() && this.ctx.settings.vibration && navigator.vibrate) navigator.vibrate(18);
      }
    } else this.kerbBuzz = 0;
    this.trackScene.update(dt, pos);
  }

  private kerbBuzz = 0;

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
      const yaw = v.mesh.root.rotation.y;
      // Humo de goma cuando la zaga desliza (más cuanto mayor es el ángulo)
      const slideK = clamp((Math.abs(k.slipRear) - 0.1) / 0.25, 0, 1);
      if (k.drifting && k.speed > 6 && Math.random() < 0.2 + slideK * 0.5) {
        this.effects.puff(pos.x - Math.sin(yaw) * 0.8, pos.y, pos.z - Math.cos(yaw) * 0.8, [0.85, 0.85, 0.85], 0.4 + slideK * 0.4, 0.7, 0.6);
      }
      // Marcas de neumático al derrapar, deslizar o frenar a fondo
      const sliding = (k.drifting || Math.abs(k.slipFront) > 0.16 || (v.comp.input.brake > 0.8 && k.vF > 12)) && k.speed > 5;
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
      // Petardeo al soltar el acelerador a alta velocidad
      const thr = v.comp.input.throttle;
      if (v.prevThrottle > 0.8 && thr < 0.2 && k.vF > 17 && Math.random() < 0.8) {
        this.effects.backfire(pos.x, pos.y, pos.z, v.mesh.root.rotation.y);
        if (v.comp === this.player || d2 < 20 * 20) this.ctx.audio.pop();
      }
      v.prevThrottle = thr;
      if (v.wallImpact > 3) {
        this.effects.impact(pos.x, pos.y, pos.z, v.wallImpact);
        if (d2 < 30 * 30) this.ctx.audio.hitBarrier(v.wallImpact * (v.comp === this.player ? 1 : 0.5));
      }
      if (v.kartImpact > 1.5 && d2 < 25 * 25) this.ctx.audio.hitKart(v.kartImpact * (v.comp === this.player ? 1 : 0.6));
      for (const e of v.events) {
        if (e === 'kerb' && v.comp !== this.player && d2 < 15 * 15) this.ctx.audio.kerbHit(k.speed * 0.5);
        if (e === 'kerb' && v.comp === this.player) {
          this.ctx.audio.kerbHit(k.speed);
          this.ctx.input.rumble(0.45, 90);
        }
        if (e === 'hop' && v.comp === this.player) {
          this.ctx.audio.hop();
          this.rig.addShake(0.06);
          this.ctx.input.rumble(0.25, 60);
        }
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
    const rpm = moving ? clamp(0.14 + ratio * 0.82 + thr * 0.08, 0, 1.1) : 0.12 + thr * 0.55;
    // Rivales: los 3 más cercanos, con estéreo (respecto al morro del jugador) y Doppler
    const rx = -Math.cos(k.yaw);
    const rz = Math.sin(k.yaw);
    const rivals = this.sim.comps
      .filter((c) => c !== p)
      .map((c) => {
        const o = c.kart;
        const dx = o.x - k.x;
        const dz = o.z - k.z;
        const dist = Math.hypot(dx, dz) || 1;
        const ux = dx / dist;
        const uz = dz / dist;
        // f' = f·(c + v_oyente)/(c − v_fuente), velocidades hacia el otro
        const vl = k.vx * ux + k.vz * uz;
        const vs = -(o.vx * ux + o.vz * uz);
        const doppler = clamp((343 + vl) / (343 - vs), 0.88, 1.12);
        const oRpm = clamp(0.14 + (Math.abs(o.vF) / KART.vmax) * 0.85 + c.input.throttle * 0.06, 0, 1.1);
        return { rpm: oRpm, dist, pan: clamp((ux * rx + uz * rz) * 0.85, -0.85, 0.85), doppler };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    this.ctx.audio.updateEngines({ rpm, load: thr }, rivals);
    // Neumáticos: rozamiento al acercarse al límite de agarre y chirrido al deslizar
    const sF = Math.abs(k.slipFront);
    const sR = Math.abs(k.slipRear);
    const moving3 = k.speed > 3 ? 1 : 0;
    const scrub = clamp((Math.max(sF, sR) - 0.035) / 0.07, 0, 1) * moving3;
    const squeal = clamp((Math.max(sR, sF * 0.9) - 0.1) / 0.16, 0, 1) * moving3 + (this.playerInput.brake > 0.8 && k.vF > 12 ? 0.25 : 0);
    const surf = k.surface;
    this.ctx.audio.updateLoops(
      {
        speed: k.speed,
        scrub,
        squeal: Math.min(1, squeal),
        kerb: k.kerb,
        kerbSide: k.kerbSide,
        grass: surf === 'grass' ? 1 : 0,
        gravel: surf === 'gravel' || surf === 'sand' ? 1 : 0,
        load: thr,
        wind: ratio * ratio,
      },
      this.sim.phase === 'countdown' ? 1 : 0.6,
    );
  }

  // ---------- ayudas a la conducción ----------
  private assist: DriverAssist | null = null;

  private applyAssists(pi: KartInput, dt: number): void {
    if (!this.assist) this.assist = new DriverAssist(this.player!.kart, this.track);
    this.assist.apply(pi, this.ctx.settings.assist, dt);
  }

  // ---------- orientación ----------
  private rotateEl: HTMLDivElement | null = null;

  private openRotateHint(): void {
    const r = el('div', 'rotate-hint');
    r.innerHTML = `<div class="rh-phone"><i></i></div>
      <div class="rh-title">Gira el móvil</div>
      <div class="rh-sub">Se juega mucho mejor en horizontal</div>
      <button class="btn" data-portrait>Jugar en vertical</button>`;
    r.querySelector('[data-portrait]')!.addEventListener('click', () => {
      this.ctx.portrait.ok = true;
      this.closeRotateHint();
    });
    this.ctx.uiRoot.appendChild(r);
    this.rotateEl = r;
  }

  private closeRotateHint(): void {
    this.rotateEl?.remove();
    this.rotateEl = null;
    this.onResize();
  }

  // ---------- repetición ----------
  private startReplay(): void {
    if (!this.replay) return;
    this.replayT = 0;
    this.tv?.reset();
    this.hud.show(false);
    this.ctx.touch?.show(false);
    this.ctx.audio.silenceLoops();
    this.endPrompt.classList.add('hidden');
    const el2 = el('div', 'replay-ov');
    el2.innerHTML = `<div class="rp-bars"></div><div class="rp-tag"><i></i> REPETICIÓN</div><button class="btn sm" data-skip>Saltar ▶</button>`;
    el2.querySelector('[data-skip]')!.addEventListener('click', () => this.endReplay());
    this.ctx.uiRoot.appendChild(el2);
    this.replayEl = el2;
  }

  private runReplay(dt: number): void {
    const rb = this.replay!;
    this.replayT += dt * 0.85;
    if (this.replayT >= rb.duration - 0.05) {
      this.endReplay();
      return;
    }
    const pose = { x: 0, y: 0, z: 0, yaw: 0, drift: 0, steer: 0 };
    let target: THREE.Vector3 | null = null;
    this.views.forEach((v, i) => {
      rb.sample(this.replayT, i, pose);
      v.setPose(pose, dt, this.track);
      if (v.comp === this.player) target = v.mesh.root.position;
    });
    if (target && this.tv) {
      const tp = target as THREE.Vector3;
      const p = this.track.project(tp.x, tp.z, this.replayProj.idx, this.replayProj, this.replayT === 0 ? this.track.n : 20);
      this.tv.frame(this.rig.camera, tp, p.s, dt);
    }
    this.trackScene.update(dt, target ?? new THREE.Vector3());
    this.render();
  }

  private endReplay(): void {
    if (this.replayT < 0) return;
    this.replayT = -1;
    this.replayEl?.remove();
    this.rotateEl?.remove();
    this.replayEl = null;
    this.hud.show(true);
    this.ctx.touch?.show(this.ctx.touchEnabled());
    this.rig.reset();
    this.finishedAt = this.visualTime - 3;
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
        a.cheer(0.8);
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
          a.cheer(1);
          this.finishedAt = this.visualTime;
          if (this.replay && this.replay.duration > 3) this.replayAt = this.visualTime + 1.8;
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
        const before = medalFor(this.track.def, prev);
        rec.best = time;
        changed = true;
        saveGhost(this.setup.trackId, ghost);
        const after = medalFor(this.track.def, time);
        if (after && after !== before) {
          hud.subMessage(`${MEDAL_ICON[after]} ¡MEDALLA DE ${after.toUpperCase()}! ${formatTime(time)}`, 'purple', 4);
          this.ctx.audio.fanfare();
        } else hud.subMessage(prev == null ? '¡PRIMER RÉCORD PERSONAL!' : `¡NUEVO RÉCORD PERSONAL! ${formatDelta(time - prev)}`, 'purple', 3.5);
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
      if (sim.phase === 'finished' && this.replayAt < 0 && this.replayT < 0) {
        this.endPrompt.classList.add('hidden');
        this.finish({ kind: 'race', results: sim.results(), stats: this.stats });
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
    hud.setSpeed(Math.abs(k.vF) * 3.6, ratio, false);
    hud.setGrip(k.drifting ? Math.abs(Math.atan2(k.vL, Math.max(2, k.vF))) : 0, k.bog > 0.18 && this.playerInput.throttle > 0.5 && k.hopCool <= 0);
    // En móvil (pantalla pequeña) los efectos de velocidad se suavizan a la mitad
    const fxK = this.ctx.touchEnabled() ? 0.5 : 1;
    this.ctx.post()?.setSpeed(this.ctx.settings.speedLines ? clamp((ratio - 0.82) / 0.3, 0, 1) * 0.45 * fxK : 0);
    const sl = fxK * (this.ctx.settings.speedLines ? clamp((ratio - 0.72) / 0.35, 0, 1) : 0);
    hud.drawSpeedLines(Math.min(1, sl), false);

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
        const def = this.track.def;
        const m = medalFor(def, rec);
        const mt = medalTimes(def);
        const next: Medal | null = m === 'oro' ? null : m === 'plata' ? 'oro' : m === 'bronce' ? 'plata' : 'bronce';
        session += ` · Tu récord ${formatTime(rec)}${m ? ' ' + MEDAL_ICON[m] : ''}`;
        session += next ? ` · Objetivo ${MEDAL_ICON[next]} ${formatTime(mt[next])}` : ' · ¡Oro conseguido!';
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
    this.replayEl?.remove();
    this.endPrompt.remove();
    this.ctx.audio.silenceLoops();
  }
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
