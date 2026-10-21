import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { DIFFICULTIES, DRIVERS, type Difficulty, type DriverDef } from '../ai/Drivers';
import { DEDICATION, DEDICATION_SUB } from '../config';
import { Input } from '../core/Input';
import { formatTime } from '../core/math';
import {
  ACTION_LABELS,
  DEFAULT_KEYS,
  isMobile,
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type Action,
  type Profile,
  type Settings,
} from '../core/Settings';
import { Podium, Showroom } from '../engine/Showroom';
import type { KartLook } from '../engine/KartModel';
import type { HelmetStyle, LiveryStyle } from '../engine/livery';
import { getProgress, newUnlocks, UNLOCKS, type Unlockable } from '../race/unlocks';
import {
  applyRace,
  clearChampionship,
  loadChampionship,
  loadTrophies,
  newChampionship,
  rounds,
  seriesName,
  saveChampionship,
  saveTrophies,
  standings,
  type ChampState,
} from '../race/Championship';
import { loadRecord } from '../race/Ghost';
import { MEDAL_ICON, medalFor, medalTimes } from '../race/medals';
import type { TrackDef } from '../track/TrackData';
import type { Entrant, RaceResultRow } from '../race/RaceSim';
import { CIRCUITS, getCircuit, SERIES, type SeriesKey } from '../track/circuits/index';
import { getTrack } from '../track/trackCache';
import { el, esc, logoHTML } from '../ui/dom';
import { drawLayout } from '../ui/Minimap';
import { navigate } from '../ui/nav';
import { TouchControls } from '../ui/TouchControls';
import { RaceView, type GameCtx, type PlayerStats, type SessionOutcome, type SessionSetup } from './RaceView';
import { positionsChart, raceSummary } from '../ui/raceReport';

type Mode = 'practice' | 'timetrial' | 'quick' | 'weekend' | 'championship';

const MODE_INFO: Record<Mode, { title: string; desc: string; icon: string }> = {
  practice: { title: 'Entrenamientos libres', desc: 'Vueltas ilimitadas, deltas por sector y tu fantasma.', icon: '⏱' },
  timetrial: { title: 'Contrarreloj', desc: 'Bate el récord del circuito contra tu fantasma.', icon: '👻' },
  quick: { title: 'Carrera rápida', desc: 'Elige circuito, vueltas, dificultad y rivales.', icon: '🏁' },
  weekend: { title: 'Fin de semana', desc: 'Libres, clasificación y carrera.', icon: '📅' },
  championship: { title: 'Campeonato', desc: '6 Grandes Premios. ¿Te llevarás el título?', icon: '🏆' },
};

const POINTS_LEGEND = '25-18-15-12-10-8-6-4-2-1 · +1 vuelta rápida (top 10)';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly audio = new AudioEngine();
  settings: Settings;
  profile: Profile;
  private ui: HTMLElement;
  private screen: HTMLDivElement;
  private touch: TouchControls;
  private view: RaceView | null = null;
  private showroom: Showroom;
  private podium: Podium | null = null;
  private last = performance.now();
  private booted = false;
  private menuBack: (() => void) | null = null;
  private shownAt = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;

  constructor(container: HTMLElement) {
    this.settings = loadSettings();
    this.profile = loadProfile();
    this.input = new Input(this.settings);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.settings.quality !== 'bajo', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.applyQuality();
    this.ui = el('div', 'ui');
    container.appendChild(this.ui);
    this.screen = el('div', 'screen');
    this.ui.appendChild(this.screen);
    this.touch = new TouchControls(this.ui, this.input);
    this.touch.show(false);
    this.audio.setVolumes(this.settings.volume, this.settings.sfx, this.settings.musicVolume, this.settings.music);
    this.showroom = new Showroom(this.renderer, this.settings.quality);
    this.showroom.setKart(this.playerLook());
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.showBoot();
    requestAnimationFrame(() => this.loop());
  }

  private ctx(): GameCtx {
    return {
      renderer: this.renderer,
      input: this.input,
      audio: this.audio,
      settings: this.settings,
      profile: this.profile,
      uiRoot: this.ui,
      touch: this.touch,
      touchEnabled: () => this.touchEnabled(),
    };
  }

  private touchEnabled(): boolean {
    return this.settings.touch === 'on' || (this.settings.touch === 'auto' && isMobile());
  }

  private applyQuality(): void {
    const dpr = window.devicePixelRatio || 1;
    const q = this.settings.quality;
    const ratio = q === 'alto' ? Math.min(dpr, 2) : q === 'medio' ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.8;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = q !== 'bajo';
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.view?.onResize();
  }

  // ---------------- bucle principal ----------------
  private loop(): void {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 1) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (this.view) {
      this.view.frame(dt);
      return;
    }
    const ctrl = this.input.poll();
    if (!this.booted) {
      if (ctrl.nav.confirm || ctrl.throttle > 0 || ctrl.pause) this.boot();
    } else navigate(this.screen, ctrl.nav, () => this.menuBack?.());
    const aspect = window.innerWidth / window.innerHeight;
    if (this.podium) {
      this.podium.update(dt, aspect);
      this.renderer.render(this.podium.scene, this.podium.camera);
    } else {
      this.showroom.update(dt, aspect, aspect > 1.2 ? 2.2 : 0);
      this.renderer.render(this.showroom.scene, this.showroom.camera);
    }
  }

  // ---------------- utilidades de pantallas ----------------
  private show(html: string, handlers: Record<string, (el: HTMLElement) => void>, back: (() => void) | null, cls = ''): void {
    this.screen.className = 'screen ' + cls;
    this.screen.innerHTML = html;
    this.shownAt = performance.now();
    this.menuBack = back;
    this.screen.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      const act = b.dataset.act!;
      const h = handlers[act];
      if (!h) return;
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        // Evita el "clic fantasma" de un toque que cambió de pantalla.
        if (performance.now() - this.shownAt < 350) return;
        this.audio.unlock();
        this.audio.click();
        h(b);
      });
    });
    const first = this.screen.querySelector<HTMLElement>('[autofocus], .btn.primary, button');
    if (first && !isMobile()) first.focus({ preventScroll: true });
    this.screen.scrollTop = 0;
  }

  private backBtn(): string {
    return `<button class="btn back" data-act="back" data-back>◀ Volver</button>`;
  }

  private menuMusic(): void {
    this.audio.setMusicEnabled(this.settings.music, true);
  }

  // ---------------- arranque ----------------
  private showBoot(): void {
    this.screen.className = 'screen boot';
    this.screen.innerHTML = `
      <div class="boot-inner">
        <div class="dedication">${esc(DEDICATION)}</div>
        <div class="dedication-sub">${esc(DEDICATION_SUB)}</div>
        ${logoHTML('big')}
        <div class="press">${isMobile() ? 'Toca para empezar' : 'Pulsa cualquier tecla o haz clic para empezar'}</div>
      </div>`;
    const go = () => this.boot();
    this.screen.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
  }

  private boot(): void {
    if (this.booted) return;
    this.booted = true;
    this.audio.unlock();
    this.menuMusic();
    this.audio.select();
    this.showMain();
  }

  // ---------------- menú principal ----------------
  private showMain(): void {
    this.podium?.dispose();
    this.podium = null;
    this.announceUnlocks();
    this.menuMusic();
    const champ = loadChampionship();
    const tro = loadTrophies();
    const modes = (Object.keys(MODE_INFO) as Mode[])
      .map(
        (m) => `<button class="mode-btn" data-act="mode" data-mode="${m}">
          <span class="mode-ico">${MODE_INFO[m].icon}</span>
          <span class="mode-txt"><b>${MODE_INFO[m].title}${m === 'championship' && champ ? ' <em>(en curso)</em>' : ''}</b><small>${MODE_INFO[m].desc}</small></span>
        </button>`,
      )
      .join('');
    this.show(
      `<div class="main-menu">
        ${logoHTML('small')}
        <div class="menu-col">
          ${
            !tro.tutorial && !tro.tutorialDismissed
              ? `<div class="first-run"><b>¿Primera vez?</b> Aprende a derrapar en 20 segundos.
                  <div><button class="btn primary sm" data-act="tutorial">🎓 Tutorial</button> <button class="btn sm" data-act="notut">Ahora no</button></div></div>`
              : ''
          }
          ${champ ? `<button class="btn primary" data-act="continue">▶ Continuar campeonato · GP ${Math.min(6, champ.round + 1)}/6</button>` : ''}
          ${modes}
          <div class="row3">
            <button class="btn" data-act="profile">👤 Perfil</button>
            <button class="btn" data-act="settings">⚙ Ajustes</button>
            <button class="btn" data-act="tutorial">🎓 Tutorial</button>
          </div>
          ${isMobile() && document.fullscreenEnabled ? `<button class="btn" data-act="fullscreen">⛶ Pantalla completa</button>` : ''}
        </div>
        <div class="profile-chip"><span class="chip-num" style="background:${this.profile.color}">${this.profile.number}</span>${esc(this.profile.name)}${
          tro.titles ? ` · 🏆×${tro.titles}` : ''
        }</div>
        <div class="footer-ded">${esc(DEDICATION)} ♥</div>
      </div>`,
      {
        mode: (b) => this.onMode(b.dataset.mode as Mode),
        continue: () => this.champHub(),
        profile: () => this.showProfile(),
        tutorial: () => this.startTutorial(),
        notut: () => {
          const t = loadTrophies();
          t.tutorialDismissed = true;
          saveTrophies(t);
          this.showMain();
        },
        settings: () => this.showSettings(() => this.showMain()),
        fullscreen: () => void document.documentElement.requestFullscreen?.().catch(() => undefined),
      },
      null,
      'menu',
    );
  }

  private onMode(m: Mode): void {
    if (m === 'championship') {
      const c = loadChampionship();
      if (c) this.confirmNewChampionship(c);
      else this.champSetup();
      return;
    }
    this.showTrackSelect(m);
  }

  // ---------------- selección de circuito ----------------
  private showTrackSelect(mode: Mode): void {
    const card = (c: TrackDef) => {
      const rec = loadRecord(c.id);
      const medal = medalFor(c, rec.best);
      const mt = medalTimes(c);
      return `<button class="track-card" data-act="pick" data-id="${c.id}">
        <canvas class="track-prev" data-prev="${c.id}" width="220" height="140"></canvas>
        <div class="tc-body">
          <div class="tc-name">${esc(c.name)} ${medal ? `<span class="medal" title="Medalla de ${medal}">${MEDAL_ICON[medal]}</span>` : ''}</div>
          <div class="tc-sub">${esc(c.subtitle)} · ${(c.length / 1000).toFixed(2)} km · ${'★'.repeat(c.difficulty)}${'☆'.repeat(5 - c.difficulty)}</div>
          <div class="tc-desc">${esc(c.description)}</div>
          <div class="tc-rec"><span>Récord ${esc(c.record.holder)}: <b>${formatTime(c.record.time)}</b></span><span>Tu mejor: <b>${formatTime(rec.best)}</b></span>
          ${mode === 'timetrial' ? `<span class="tc-medals">🥇 ${formatTime(mt.oro)} · 🥈 ${formatTime(mt.plata)} · 🥉 ${formatTime(mt.bronce)}</span>` : ''}</div>
        </div>
      </button>`;
    };
    const group = (title: string, list: TrackDef[]) => `<h2 class="series-title">${title}</h2><div class="track-grid">${list.map(card).join('')}</div>`;
    const zanini = CIRCUITS.filter((c) => (c.series ?? 'zanini') === 'zanini');
    const costa = CIRCUITS.filter((c) => c.series === 'costa');
    this.show(
      `<div class="page with-preview">
        <div class="page-head">${this.backBtn()}<h1>${MODE_INFO[mode].title}</h1><div class="page-sub">Elige circuito</div></div>
        ${group('🏆 Circuitos Zanini', zanini)}
        ${group('🌴 Kartódromos de la Costa Blanca', costa)}
      </div>`,
      {
        back: () => {
          this.showroom.setPreview(null);
          this.showMain();
        },
        pick: (b) => {
          this.showroom.setPreview(null);
          const id = b.dataset.id!;
          if (mode === 'practice' || mode === 'timetrial') this.startSimple(mode, id);
          else this.showRaceSetup(mode, id);
        },
      },
      () => {
        this.showroom.setPreview(null);
        this.showMain();
      },
      'menu',
    );
    // Maqueta 3D del circuito al pasar por encima o enfocar una tarjeta
    this.screen.querySelectorAll<HTMLElement>('.track-card').forEach((el) => {
      const on = () => this.showroom.setPreview(getTrack(el.dataset.id!));
      el.addEventListener('mouseenter', on);
      el.addEventListener('focus', on);
    });
    // Vistas previas
    requestAnimationFrame(() => {
      this.screen.querySelectorAll<HTMLCanvasElement>('canvas[data-prev]').forEach((cv) => {
        const t = getTrack(cv.dataset.prev!);
        const ctx = cv.getContext('2d')!;
        drawLayout(ctx, t, cv.width, cv.height, { pad: 14, width: 5, color: '#ffffff', outline: '#D7261E' });
      });
    });
  }

  // ---------------- ajustes de carrera ----------------
  private showRaceSetup(mode: Mode, trackId: string): void {
    const def = getCircuit(trackId);
    const s = this.settings;
    let laps = s.laps || def.laps;
    let diff: Difficulty = s.difficulty;
    let rivals = s.rivals;
    const render = () => {
      this.show(
        `<div class="page narrow">
          <div class="page-head">${this.backBtn()}<h1>${MODE_INFO[mode].title}</h1><div class="page-sub">${esc(def.name)}</div></div>
          <div class="panel form">
            ${this.stepper('Vueltas', 'laps', laps, `${laps}`)}
            ${this.choice('Dificultad', 'diff', DIFFICULTIES.map((d) => [d.id, d.label]), diff)}
            ${mode === 'quick' ? this.stepper('Rivales', 'rivals', rivals, `${rivals}`) : ''}
            <div class="hint">${mode === 'weekend' ? 'Libres (5 min) → Clasificación (3 min) → Carrera. La parrilla sale por tiempos.' : 'Saldrás desde mitad de parrilla.'} ${diff === 'facil' ? 'En Fácil la IA se reagrupa para que la carrera esté siempre viva.' : ''}</div>
            <button class="btn primary big" data-act="go">¡A correr! ▶</button>
          </div>
        </div>`,
        {
          back: () => this.showTrackSelect(mode),
          'laps-': () => {
            laps = Math.max(1, laps - 1);
            render();
          },
          'laps+': () => {
            laps = Math.min(20, laps + 1);
            render();
          },
          'rivals-': () => {
            rivals = Math.max(1, rivals - 1);
            render();
          },
          'rivals+': () => {
            rivals = Math.min(11, rivals + 1);
            render();
          },
          diff: (b) => {
            diff = b.dataset.val as Difficulty;
            render();
          },
          go: () => {
            s.difficulty = diff;
            s.rivals = rivals;
            s.laps = laps === def.laps ? 0 : laps;
            saveSettings(s);
            if (mode === 'quick') this.startQuickRace(trackId, laps, diff, rivals);
            else this.startWeekend(trackId, laps, diff);
          },
        },
        () => this.showTrackSelect(mode),
        'menu',
      );
    };
    render();
  }

  private stepper(label: string, key: string, _v: number, text: string): string {
    return `<div class="field"><label>${label}</label><div class="stepper"><button class="btn sq" data-act="${key}-">−</button><span class="val">${text}</span><button class="btn sq" data-act="${key}+">+</button></div></div>`;
  }

  private choice(label: string, act: string, opts: [string, string][], cur: string): string {
    return `<div class="field"><label>${label}</label><div class="choices">${opts
      .map(([v, l]) => `<button class="btn chip ${v === cur ? 'on' : ''}" data-act="${act}" data-val="${v}">${l}</button>`)
      .join('')}</div></div>`;
  }

  // ---------------- participantes ----------------
  private playerLook(): KartLook {
    const p = this.profile;
    return { color: p.color, number: p.number, livery: p.livery, helmet: p.helmet, name: p.name };
  }

  private playerEntrant(): Entrant {
    const p = this.profile;
    return { id: 'player', name: p.name, short: p.name.slice(0, 3).toUpperCase(), nat: 'ESP', number: p.number, color: p.color, isPlayer: true, driver: null, look: this.playerLook() };
  }

  private aiEntrant(d: DriverDef): Entrant {
    const clash = d.number === this.profile.number;
    const idx = DRIVERS.indexOf(d);
    const number = clash ? d.number + 70 : d.number;
    const helmets: HelmetStyle[] = ['clasico', 'rayo', 'estrellas', 'llamas'];
    const look: KartLook = { color: d.color, number, sponsor: idx, helmet: helmets[idx % helmets.length], livery: 'basica' };
    return { id: d.id, name: d.name, short: d.short, nat: d.nat, number, color: d.color, isPlayer: false, driver: d, look };
  }

  private allEntrants(): Entrant[] {
    return [this.playerEntrant(), ...DRIVERS.map((d) => this.aiEntrant(d))];
  }

  private pickRivals(n: number): DriverDef[] {
    // Repartidos por todo el abanico de ritmos para que haya de todo en pista.
    if (n >= DRIVERS.length) return DRIVERS.slice();
    const out: DriverDef[] = [];
    for (let i = 0; i < n; i++) out.push(DRIVERS[Math.floor(((i + 0.5) * DRIVERS.length) / n)]);
    return out;
  }

  // ---------------- sesiones ----------------
  private runSession(setup: SessionSetup, onOutcome: (o: SessionOutcome) => void): void {
    this.audio.unlock();
    this.screen.innerHTML = '';
    this.screen.className = 'screen hidden';
    const loading = el('div', 'loading', `${logoHTML('small')}<div class="loading-txt">Cargando ${esc(getCircuit(setup.trackId).name)}…</div>`);
    this.ui.appendChild(loading);
    // Dejar pintar la pantalla de carga antes del trabajo pesado
    setTimeout(() => {
      this.applyQuality();
      this.view = new RaceView(this.ctx(), setup, (o) => {
        const v = this.view;
        this.view = null;
        v?.dispose();
        this.touch.show(false);
        this.screen.classList.remove('hidden');
        if (o.kind === 'restart') this.runSession(setup, onOutcome);
        else onOutcome(o);
      });
      loading.remove();
    }, 60);
  }

  private startTutorial(): void {
    this.runSession(
      {
        kind: 'practice',
        trackId: 'zanini-ring',
        laps: 0,
        difficulty: this.settings.difficulty,
        entrants: [this.playerEntrant()],
        duration: 0,
        label: 'Tutorial',
        mode: 'practice',
        canEndSession: false,
        tutorial: true,
      },
      () => {
        const t = loadTrophies();
        t.tutorial = true;
        saveTrophies(t);
        this.showMain();
      },
    );
  }

  private startSimple(mode: 'practice' | 'timetrial', trackId: string): void {
    const def = getCircuit(trackId);
    this.runSession(
      {
        kind: mode,
        trackId,
        laps: 0,
        difficulty: this.settings.difficulty,
        entrants: [this.playerEntrant()],
        duration: 0,
        label: `${def.name}`,
        mode,
        canEndSession: false,
      },
      () => this.showTrackSelect(mode),
    );
  }

  private startQuickRace(trackId: string, laps: number, diff: Difficulty, rivals: number): void {
    const ai = this.pickRivals(rivals)
      .map((d) => this.aiEntrant(d))
      .sort((a, b) => (a.driver!.pace - b.driver!.pace) + (Math.random() - 0.5) * 0.15);
    const grid = ai.slice();
    grid.splice(Math.floor(ai.length / 2), 0, this.playerEntrant());
    const def = getCircuit(trackId);
    this.runSession(
      { kind: 'race', trackId, laps, difficulty: diff, entrants: grid, duration: 0, label: `${def.name} · Carrera`, mode: 'quick', canEndSession: false },
      (o) => {
        if (o.kind === 'race') this.showResults(o.results, `${def.name} · Carrera rápida`, null, () => this.showMain(), () => this.startQuickRace(trackId, laps, diff, rivals), undefined, o.stats);
        else this.showMain();
      },
    );
  }

  // ---------------- fin de semana ----------------
  private startWeekend(trackId: string, laps: number, diff: Difficulty): void {
    const def = getCircuit(trackId);
    const entrants = this.allEntrants();
    const quali = () =>
      this.runSession(
        { kind: 'quali', trackId, laps, difficulty: diff, entrants, duration: 180, label: `${def.name} · Clasificación`, mode: 'weekend', canEndSession: true },
        (o) => {
          if (o.kind === 'quali') {
            const grid = o.standings.map((r) => r.e);
            this.showQualiResults(o.standings, `${def.name} · Clasificación`, () => race(grid));
          } else this.showMain();
        },
      );
    const race = (grid: Entrant[]) =>
      this.runSession(
        { kind: 'race', trackId, laps, difficulty: diff, entrants: grid, duration: 0, label: `${def.name} · Carrera`, mode: 'weekend', canEndSession: false },
        (o) => {
          if (o.kind === 'race') this.showResults(o.results, `${def.name} · Carrera`, null, () => this.showMain(), null, undefined, o.stats);
          else this.showMain();
        },
      );
    this.runSession(
      { kind: 'practice', trackId, laps, difficulty: diff, entrants: [this.playerEntrant()], duration: 300, label: `${def.name} · Libres`, mode: 'weekend', canEndSession: true },
      (o) => {
        if (o.kind === 'practice') this.interstitial('LIBRES TERMINADOS', `Tu mejor vuelta: <b>${formatTime(o.best)}</b>`, 'Ir a la clasificación ▶', quali);
        else this.showMain();
      },
    );
  }

  private interstitial(title: string, body: string, btn: string, next: () => void): void {
    this.show(
      `<div class="page narrow center"><div class="panel">
        <h1>${title}</h1><p class="big-p">${body}</p>
        <button class="btn primary big" data-act="next">${btn}</button>
        <button class="btn" data-act="menu">Salir al menú</button>
      </div></div>`,
      { next, menu: () => this.showMain() },
      () => this.showMain(),
      'menu',
    );
  }

  // ---------------- resultados ----------------
  private nameCell(e: Entrant): string {
    return `<span class="rc" style="background:${e.color}"></span><span class="rnum">${e.number}</span><span class="rname">${esc(e.name)}</span><span class="nat">${esc(e.nat)}</span>`;
  }

  private showQualiResults(st: { id: string; e: Entrant; best: number | null }[], title: string, next: () => void): void {
    const top = st[0]?.best ?? null;
    const rows = st
      .map(
        (r, i) => `<tr class="${r.e.isPlayer ? 'me' : ''}"><td class="pos">${i + 1}</td><td>${this.nameCell(r.e)}</td><td>${formatTime(r.best)}</td><td>${
          i === 0 || r.best == null || top == null ? '' : '+' + (r.best - top).toFixed(3)
        }</td></tr>`,
      )
      .join('');
    const me = st.findIndex((r) => r.e.isPlayer) + 1;
    this.show(
      `<div class="page">
        <div class="page-head"><h1>${esc(title)}</h1><div class="page-sub">Parrilla de salida · sales <b>P${me}</b></div></div>
        <div class="panel"><table class="results"><thead><tr><th>Pos</th><th>Piloto</th><th>Mejor vuelta</th><th>Dif.</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="actions"><button class="btn primary big" data-act="next">Ir a la carrera ▶</button></div>
      </div>`,
      { next },
      null,
      'menu',
    );
  }

  private showResults(
    results: RaceResultRow[],
    title: string,
    points: Record<string, number> | null,
    onMenu: () => void,
    onRepeat: (() => void) | null,
    nextLabel?: string,
    stats: PlayerStats | null = null,
  ): void {
    const rows = results
      .map((r) => {
        const time = r.position === 1 ? formatTime(r.total) : r.gap == null ? `+${r.lapsDown} V` : '+' + r.gap.toFixed(3);
        return `<tr class="${r.entrant.isPlayer ? 'me' : ''}"><td class="pos">${r.position}</td><td>${this.nameCell(r.entrant)}</td><td>${time}</td><td>${formatTime(r.bestLap)}${
          r.fastestLap ? ' <span class="fl" title="Vuelta rápida">⚡</span>' : ''
        }</td><td>${r.penalty ? `+${r.penalty}s` : ''}</td>${points ? `<td class="pts">${points[r.id] ? '+' + points[r.id] : ''}</td>` : ''}</tr>`;
      })
      .join('');
    const me = results.find((r) => r.entrant.isPlayer);
    if (me) {
      const t = loadTrophies();
      if (me.position === 1) t.wins++;
      if (me.position <= 3) t.podiums++;
      saveTrophies(t);
    }
    this.announceUnlocks();
    const headline = me ? (me.position === 1 ? '¡VICTORIA!' : me.position <= 3 ? `¡PODIO! P${me.position}` : `P${me.position}`) : '';
    if (me && me.position <= 3) this.audio.fanfare();
    this.show(
      `<div class="page">
        <div class="page-head"><h1>${esc(title)}</h1><div class="page-sub headline">${headline}</div></div>
        ${raceSummary(results, stats)}
        <div class="two-col results-cols">
          <div class="panel"><table class="results"><thead><tr><th>Pos</th><th>Piloto</th><th>Tiempo</th><th>Mejor vuelta</th><th>Pen.</th>${points ? '<th>Pts</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
          <div class="panel"><h3>Posiciones vuelta a vuelta</h3>${positionsChart(results)}</div>
        </div>
        <div class="actions">
          ${onRepeat ? '<button class="btn" data-act="repeat">↻ Repetir</button>' : ''}
          <button class="btn primary big" data-act="menu">${nextLabel ?? 'Menú principal'} ▶</button>
        </div>
      </div>`,
      { menu: onMenu, repeat: () => onRepeat?.() },
      null,
      'menu',
    );
  }

  // ---------------- campeonato ----------------
  private confirmNewChampionship(c: ChampState): void {
    this.show(
      `<div class="page narrow center"><div class="panel">
        <h1>Campeonato en curso</h1>
        <p class="big-p">Vas por el GP ${Math.min(6, c.round + 1)} de 6 con <b>${c.points.player ?? 0}</b> puntos.</p>
        <button class="btn primary big" data-act="cont">▶ Continuar</button>
        <button class="btn danger" data-act="new">Empezar uno nuevo (se pierde el actual)</button>
        ${this.backBtn()}
      </div></div>`,
      { cont: () => this.champHub(), new: () => this.champSetup(), back: () => this.showMain() },
      () => this.showMain(),
      'menu',
    );
  }

  private champSetup(): void {
    let diff: Difficulty = this.settings.difficulty;
    let laps = 0;
    let series: SeriesKey = 'zanini';
    const render = () =>
      this.show(
        `<div class="page narrow">
          <div class="page-head">${this.backBtn()}<h1>Nuevo campeonato</h1><div class="page-sub">6 Grandes Premios · clasificación + carrera</div></div>
          <div class="panel form">
            ${this.choice('Calendario', 'series', [['zanini', '🏆 Campeonato Zanini'], ['costa', '🌴 Copa Costa Blanca']], series)}
            <div class="hint">${SERIES[series].tracks.map((id) => esc(getCircuit(id).name)).join(' · ')}</div>
            ${this.choice('Dificultad', 'diff', DIFFICULTIES.map((d) => [d.id, d.label]), diff)}
            ${this.stepper('Vueltas por carrera', 'laps', laps, laps === 0 ? 'Las de cada circuito' : String(laps))}
            <div class="hint">Puntos: ${POINTS_LEGEND}. Se guarda automáticamente tras cada sesión.</div>
            <button class="btn primary big" data-act="go">Empezar ▶</button>
          </div>
        </div>`,
        {
          back: () => this.showMain(),
          series: (b) => {
            series = b.dataset.val as SeriesKey;
            render();
          },
          diff: (b) => {
            diff = b.dataset.val as Difficulty;
            render();
          },
          'laps-': () => {
            laps = Math.max(0, laps - 1);
            render();
          },
          'laps+': () => {
            laps = Math.min(15, laps + 1);
            render();
          },
          go: () => {
            clearChampionship();
            newChampionship(diff, laps, series);
            this.champHub();
          },
        },
        () => this.showMain(),
        'menu',
      );
    render();
  }

  private standingsTable(c: ChampState, highlight?: Record<string, number>): string {
    const ents = this.allEntrants();
    const st = standings(
      c,
      ents.map((e) => e.id),
    );
    return `<table class="results"><thead><tr><th>Pos</th><th>Piloto</th><th>Pts</th><th>Vict.</th>${highlight ? '<th>GP</th>' : ''}</tr></thead><tbody>${st
      .map((r, i) => {
        const e = ents.find((x) => x.id === r.id)!;
        return `<tr class="${e.isPlayer ? 'me' : ''}"><td class="pos">${i + 1}</td><td>${this.nameCell(e)}</td><td class="pts">${r.points}</td><td>${r.wins || ''}</td>${
          highlight ? `<td>${highlight[r.id] ? '+' + highlight[r.id] : ''}</td>` : ''
        }</tr>`;
      })
      .join('')}</tbody></table>`;
  }

  private champHub(): void {
    const c = loadChampionship();
    if (!c) return this.showMain();
    if (c.stage === 'done') return this.champCeremony(c);
    const ids = rounds(c);
    const cal = ids
      .map((id, i) => {
        const d = getCircuit(id);
        const res = c.results[i];
        const winner = res ? this.allEntrants().find((e) => e.id === res.order[0]) : null;
        const myPos = res ? res.order.indexOf('player') + 1 : 0;
        return `<div class="cal ${i === c.round ? 'now' : i < c.round ? 'past' : ''}"><span class="cal-n">GP${i + 1}</span><span class="cal-name">${esc(d.name)}</span><span class="cal-res">${
          res ? `🏁 ${esc(winner?.short ?? '')} · tú P${myPos}` : i === c.round ? (c.stage === 'quali' ? 'Siguiente: clasificación' : 'Siguiente: carrera') : ''
        }</span></div>`;
      })
      .join('');
    const def = getCircuit(ids[c.round]);
    const diffLabel = DIFFICULTIES.find((d) => d.id === c.difficulty)?.label;
    this.show(
      `<div class="page">
        <div class="page-head">${this.backBtn()}<h1>${esc(seriesName(c))}</h1><div class="page-sub">Dificultad ${diffLabel} · GP ${c.round + 1}/6 · ${esc(def.name)}</div></div>
        <div class="two-col">
          <div class="panel"><h3>Calendario</h3>${cal}</div>
          <div class="panel"><h3>Clasificación general</h3>${this.standingsTable(c)}</div>
        </div>
        <div class="actions"><button class="btn primary big" data-act="go">${c.stage === 'quali' ? `Clasificación GP ${c.round + 1} ▶` : `Carrera GP ${c.round + 1} ▶`}</button></div>
      </div>`,
      { back: () => this.showMain(), go: () => this.champRunStage(c) },
      () => this.showMain(),
      'menu',
    );
  }

  private champRunStage(c: ChampState): void {
    const trackId = rounds(c)[c.round];
    const def = getCircuit(trackId);
    const laps = c.laps || def.laps;
    const ents = this.allEntrants();
    const gpLabel = `GP ${c.round + 1}/6 · ${def.name}`;
    if (c.stage === 'quali') {
      this.runSession(
        { kind: 'quali', trackId, laps, difficulty: c.difficulty, entrants: ents, duration: 150, label: `${gpLabel} · Clasificación`, mode: 'championship', canEndSession: true },
        (o) => {
          if (o.kind === 'quali') {
            c.grid = o.standings.map((r) => r.id);
            c.stage = 'race';
            saveChampionship(c);
            this.showQualiResults(o.standings, `${gpLabel} · Clasificación`, () => this.champRunStage(c));
          } else this.champHub();
        },
      );
    } else {
      const grid = (c.grid ?? ents.map((e) => e.id)).map((id) => ents.find((e) => e.id === id)!).filter(Boolean);
      for (const e of ents) if (!grid.includes(e)) grid.push(e);
      this.runSession(
        { kind: 'race', trackId, laps, difficulty: c.difficulty, entrants: grid, duration: 0, label: `${gpLabel} · Carrera`, mode: 'championship', canEndSession: false },
        (o) => {
          if (o.kind === 'race') {
            const gp = applyRace(c, o.results);
            this.showResults(o.results, `${gpLabel} · Carrera`, gp.points, () => this.champAfterRace(c, gp.points), null, 'Clasificación general', o.stats);
          } else this.champHub();
        },
      );
    }
  }

  private champAfterRace(c: ChampState, gpPoints: Record<string, number>): void {
    this.show(
      `<div class="page narrow">
        <div class="page-head"><h1>Clasificación general</h1><div class="page-sub">Tras ${c.round} de 6 Grandes Premios</div></div>
        <div class="panel">${this.standingsTable(c, gpPoints)}</div>
        <div class="actions"><button class="btn primary big" data-act="next">${c.stage === 'done' ? '🏆 Ceremonia de campeón ▶' : 'Siguiente GP ▶'}</button></div>
      </div>`,
      { next: () => this.champHub() },
      null,
      'menu',
    );
  }

  private champCeremony(c: ChampState): void {
    const ents = this.allEntrants();
    const st = standings(
      c,
      ents.map((e) => e.id),
    );
    const top = st.slice(0, 3).map((r) => ents.find((e) => e.id === r.id)!);
    this.podium = new Podium(top.map((e) => e.look ?? { color: e.color, number: e.number }), this.renderer);
    const champ = top[0];
    const myPos = st.findIndex((r) => r.id === 'player') + 1;
    if (champ.isPlayer) {
      const t = loadTrophies();
      t.titles++;
      if (c.difficulty === 'dificil' || c.difficulty === 'pro') t.titlesHard = (t.titlesHard ?? 0) + 1;
      saveTrophies(t);
    }
    this.audio.fanfare();
    setTimeout(() => this.audio.fanfare(), 1600);
    this.show(
      `<div class="ceremony">
        <div class="cer-title">${champ.isPlayer ? `¡${esc(seriesName(c)).toUpperCase()} PARA TI!` : esc(seriesName(c)).toUpperCase()}</div>
        <div class="cer-name">${esc(champ.name)}</div>
        <div class="cer-sub">${st[0].points} puntos · ${st[0].wins} victorias</div>
        <div class="cer-podium">${top.map((e, i) => `<span>${i + 1}. ${esc(e.name)} (${st[i].points})</span>`).join('')}</div>
        ${champ.isPlayer ? `<div class="cer-ded">${esc(DEDICATION)} ♥</div>` : `<div class="cer-sub">Has terminado P${myPos}. ¡La próxima es tuya!</div>`}
        <button class="btn primary big" data-act="done">Volver al menú ▶</button>
      </div>`,
      {
        done: () => {
          clearChampionship();
          this.showMain();
        },
      },
      null,
      'ceremony-screen',
    );
  }

  // ---------------- perfil ----------------
  private showProfile(): void {
    const p = this.profile;
    const prog = getProgress();
    const render = () => {
      const lockList = (kind: Unlockable['kind']) => UNLOCKS.filter((u) => u.kind === kind);
      const swatches = lockList('color')
        .map((u) => {
          const ok = u.ok(prog);
          const on = u.id.toLowerCase() === p.color.toLowerCase();
          return `<button class="swatch ${on ? 'on' : ''} ${ok ? '' : 'locked'}" data-act="${ok ? 'color' : 'locked'}" data-val="${u.id}" data-req="${esc(u.req)}" style="background:${u.id}" title="${esc(ok ? u.label : '🔒 ' + u.req)}" aria-label="${esc(u.label)}">${ok ? '' : '🔒'}</button>`;
        })
        .join('');
      const chips = (kind: 'helmet' | 'livery', cur: string) =>
        lockList(kind)
          .map((u) => {
            const ok = u.ok(prog);
            return `<button class="btn chip ${u.id === cur ? 'on' : ''} ${ok ? '' : 'locked'}" data-act="${ok ? kind : 'locked'}" data-val="${u.id}" data-req="${esc(u.req)}">${ok ? '' : '🔒 '}${esc(u.label)}</button>`;
          })
          .join('');
      const total = UNLOCKS.length;
      const got = UNLOCKS.filter((u) => u.ok(prog)).length;
      this.show(
        `<div class="page narrow">
          <div class="page-head">${this.backBtn()}<h1>Perfil del piloto</h1><div class="page-sub">Desbloqueado ${got}/${total}</div></div>
          <div class="panel form">
            <div class="field"><label>Nombre</label><input id="pname" type="text" maxlength="12" value="${esc(p.name)}" /></div>
            ${this.stepper('Dorsal', 'num', p.number, String(p.number))}
            <div class="field"><label>Color del kart</label><div class="swatches">${swatches}</div></div>
            <div class="field"><label>Decoración</label><div class="choices">${chips('livery', p.livery)}</div></div>
            <div class="field"><label>Casco</label><div class="choices">${chips('helmet', p.helmet)}</div></div>
            <div class="hint lock-hint" id="lockhint">Gana carreras, podios, campeonatos y medallas de contrarreloj para desbloquear más.</div>
            <div class="stats-row">🏆 ${prog.titles} títulos · 🥇 ${prog.wins} victorias · 🍾 ${prog.podiums} podios · ⏱ ${prog.records} récords · 🏅 ${prog.golds} oros</div>
            <button class="btn primary" data-act="save">Guardar</button>
          </div>
        </div>`,
        {
          back: () => {
            this.saveProfileFromForm();
            this.showMain();
          },
          save: () => {
            this.saveProfileFromForm();
            this.showMain();
          },
          'num-': () => {
            this.saveProfileFromForm();
            p.number = p.number <= 1 ? 99 : p.number - 1;
            render();
          },
          'num+': () => {
            this.saveProfileFromForm();
            p.number = p.number >= 99 ? 1 : p.number + 1;
            render();
          },
          color: (b) => {
            this.saveProfileFromForm();
            p.color = b.dataset.val!;
            render();
          },
          livery: (b) => {
            this.saveProfileFromForm();
            p.livery = b.dataset.val as LiveryStyle;
            render();
          },
          helmet: (b) => {
            this.saveProfileFromForm();
            p.helmet = b.dataset.val as HelmetStyle;
            render();
          },
          locked: (b) => {
            const h = this.screen.querySelector('#lockhint');
            if (h) h.innerHTML = `🔒 <b>Bloqueado:</b> ${esc(b.dataset.req ?? '')}`;
            this.audio.warning();
          },
        },
        () => {
          this.saveProfileFromForm();
          this.showMain();
        },
        'menu',
      );
      this.showroom.setKart(this.playerLook());
    };
    render();
  }

  /** Muestra avisos de lo que se acaba de desbloquear. */
  private announceUnlocks(): void {
    const fresh = newUnlocks();
    fresh.forEach((u, i) => {
      setTimeout(() => {
        const kind = u.kind === 'color' ? 'Color' : u.kind === 'helmet' ? 'Casco' : 'Decoración';
        let box = this.ui.querySelector('.toasts');
        if (!box) {
          box = el('div', 'toasts');
          this.ui.appendChild(box);
        }
        const t = el('div', 'toast', `🔓 <b>¡Desbloqueado!</b> ${kind}: ${esc(u.label)}`);
        box.appendChild(t);
        this.audio.lapChime(true);
        setTimeout(() => t.remove(), 4200);
      }, 600 + i * 1400);
    });
  }

  private saveProfileFromForm(): void {
    const inp = this.screen.querySelector<HTMLInputElement>('#pname');
    if (inp) {
      const name = inp.value.trim().toUpperCase().slice(0, 12);
      if (name) this.profile.name = name;
    }
    saveProfile(this.profile);
    this.showroom.setKart(this.playerLook());
  }

  // ---------------- ajustes ----------------
  private showSettings(back: () => void, tab = 'juego'): void {
    const s = this.settings;
    const tabs: [string, string][] = [
      ['juego', 'Juego'],
      ['graficos', 'Gráficos'],
      ['audio', 'Audio'],
      ['controles', 'Controles'],
      ['camara', 'Cámara'],
    ];
    let body = '';
    if (tab === 'juego') {
      body = `${this.choice('Dificultad', 'diff', DIFFICULTIES.map((d) => [d.id, d.label]), s.difficulty)}
        ${this.stepper('Vueltas (carrera rápida)', 'laps', s.laps, s.laps === 0 ? 'Las del circuito' : String(s.laps))}
        ${this.stepper('Rivales (carrera rápida)', 'rivals', s.rivals, String(s.rivals))}
        <div class="hint">Fácil: la IA se reagrupa (rubber-banding). Normal, Difícil y Pro: competición pura.</div>`;
    } else if (tab === 'graficos') {
      body = `${this.choice('Calidad', 'quality', [['bajo', 'Baja (móvil)'], ['medio', 'Media'], ['alto', 'Alta']], s.quality)}
        ${this.choice('Líneas de velocidad', 'speedlines', [['on', 'Sí'], ['off', 'No']], s.speedLines ? 'on' : 'off')}
        ${this.choice('Fantasma en libres/contrarreloj', 'ghost', [['on', 'Sí'], ['off', 'No']], s.ghost ? 'on' : 'off')}
        <div class="hint">FPS actuales: ${Math.round(this.fps)}</div>`;
    } else if (tab === 'audio') {
      body = `${this.range('Volumen general', 'volume', s.volume)}${this.range('Efectos', 'sfx', s.sfx)}${this.range('Música', 'musicVolume', s.musicVolume)}
        ${this.choice('Música de menú', 'music', [['on', 'Activada'], ['off', 'Desactivada']], s.music ? 'on' : 'off')}`;
    } else if (tab === 'controles') {
      const rows = (Object.keys(ACTION_LABELS) as Action[])
        .map((a) => `<div class="keyrow"><span>${ACTION_LABELS[a]}</span><span class="keys">${s.keys[a].map(keyName).join(' / ')}</span><button class="btn sm" data-act="rebind" data-val="${a}">Cambiar</button></div>`)
        .join('');
      body = `<div class="keys-list">${rows}</div>
        <button class="btn sm" data-act="resetkeys">Restablecer teclas</button>
        <div class="hint"><b>Mando:</b> stick/cruceta girar · RT/A acelerar · LT/X frenar · RB/LB/B derrapar · Y reaparecer · Select cámara · Start pausa.</div>
        ${this.choice('Controles táctiles', 'touch', [['auto', 'Auto'], ['on', 'Siempre'], ['off', 'Nunca']], s.touch)}
        ${this.choice('Aceleración automática (táctil)', 'autoaccel', [['on', 'Sí'], ['off', 'No']], s.autoAccel ? 'on' : 'off')}
        ${this.choice('Vibración del mando', 'vibration', [['on', 'Sí'], ['off', 'No']], s.vibration ? 'on' : 'off')}`;
    } else {
      body = `${this.choice('Cámara', 'camera', [['trasera', 'Trasera'], ['cercana', 'Cercana'], ['capo', 'Capó']], s.camera)}
        <div class="hint">Durante la carrera puedes cambiarla con C (o Select en el mando).</div>`;
    }
    const save = () => {
      saveSettings(s);
      this.input.setSettings(s);
      this.audio.setVolumes(s.volume, s.sfx, s.musicVolume, s.music);
    };
    const re = () => this.showSettings(back, tab);
    this.show(
      `<div class="page narrow">
        <div class="page-head">${this.backBtn()}<h1>Ajustes</h1></div>
        <div class="tabs">${tabs.map(([id, l]) => `<button class="btn chip ${id === tab ? 'on' : ''}" data-act="tab" data-val="${id}">${l}</button>`).join('')}</div>
        <div class="panel form">${body}</div>
      </div>`,
      {
        back,
        tab: (b) => this.showSettings(back, b.dataset.val!),
        diff: (b) => {
          s.difficulty = b.dataset.val as Difficulty;
          save();
          re();
        },
        'laps-': () => {
          s.laps = Math.max(0, s.laps - 1);
          save();
          re();
        },
        'laps+': () => {
          s.laps = Math.min(20, s.laps + 1);
          save();
          re();
        },
        'rivals-': () => {
          s.rivals = Math.max(1, s.rivals - 1);
          save();
          re();
        },
        'rivals+': () => {
          s.rivals = Math.min(11, s.rivals + 1);
          save();
          re();
        },
        quality: (b) => {
          s.quality = b.dataset.val as Settings['quality'];
          save();
          this.applyQuality();
          re();
        },
        speedlines: (b) => {
          s.speedLines = b.dataset.val === 'on';
          save();
          re();
        },
        ghost: (b) => {
          s.ghost = b.dataset.val === 'on';
          save();
          re();
        },
        music: (b) => {
          s.music = b.dataset.val === 'on';
          save();
          this.audio.setMusicEnabled(s.music, true);
          re();
        },
        touch: (b) => {
          s.touch = b.dataset.val as Settings['touch'];
          save();
          re();
        },
        autoaccel: (b) => {
          s.autoAccel = b.dataset.val === 'on';
          save();
          re();
        },
        vibration: (b) => {
          s.vibration = b.dataset.val === 'on';
          save();
          re();
        },
        camera: (b) => {
          s.camera = b.dataset.val as Settings['camera'];
          save();
          re();
        },
        resetkeys: () => {
          s.keys = structuredClone(DEFAULT_KEYS);
          save();
          re();
        },
        rebind: (b) => {
          const a = b.dataset.val as Action;
          b.textContent = 'Pulsa una tecla…';
          b.classList.add('on');
          this.input.captureNext = (code) => {
            if (code !== 'Escape') {
              // Quitar la tecla de otras acciones para evitar conflictos
              for (const k of Object.keys(s.keys) as Action[]) s.keys[k] = s.keys[k].filter((c) => c !== code);
              s.keys[a] = [code];
              save();
            }
            re();
          };
        },
      },
      back,
      'menu',
    );
    // Deslizadores de volumen
    this.screen.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) =>
      r.addEventListener('input', () => {
        const key = r.dataset.key as 'volume' | 'sfx' | 'musicVolume';
        s[key] = Number(r.value) / 100;
        const out = r.parentElement?.querySelector('.val');
        if (out) out.textContent = `${r.value}%`;
        save();
      }),
    );
  }

  private range(label: string, key: string, v: number): string {
    const pct = Math.round(v * 100);
    return `<div class="field"><label>${label}</label><div class="rangebox"><input type="range" min="0" max="100" step="5" value="${pct}" data-key="${key}" /><span class="val">${pct}%</span></div></div>`;
  }
}

function keyName(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Espacio',
    ShiftLeft: 'Mayús',
    ShiftRight: 'Mayús dcha',
    Escape: 'Esc',
    Enter: 'Intro',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl dcha',
    AltLeft: 'Alt',
    Tab: 'Tab',
    Backspace: 'Retroceso',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
