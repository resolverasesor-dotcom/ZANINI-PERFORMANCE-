import { AIDriver, type AIWorld } from '../ai/AIDriver';
import { paceFactor, type Difficulty, type DriverDef } from '../ai/Drivers';
import { clamp, damp, rng } from '../core/math';
import { collideKarts, emptyInput, Kart, KART, type KartInput } from '../physics/Kart';
import { KERB_WIDTH, type Track } from '../track/Track';
import type { KartLook } from '../engine/KartModel';

export type SessionKind = 'practice' | 'timetrial' | 'quali' | 'race';

export interface Entrant {
  id: string;
  name: string;
  short: string;
  nat: string;
  number: number;
  color: string;
  isPlayer: boolean;
  driver: DriverDef | null;
  /** Decoración del kart (solo visual). */
  look?: KartLook;
}

export interface SimConfig {
  track: Track;
  kind: SessionKind;
  laps: number;
  difficulty: Difficulty;
  /** Orden de parrilla (el primero sale en pole). */
  entrants: Entrant[];
  /** Duración de la sesión en segundos (libres/clasificación). 0 = ilimitada. */
  duration?: number;
  /** Vuelta de referencia de una IA perfecta a ritmo de la dificultad (simula la clasificación). */
  refLap?: number;
  seed?: number;
}

export type SimEvent =
  | { type: 'light'; n: number }
  | { type: 'go' }
  | { type: 'jumpstart'; id: string }
  | { type: 'lap'; id: string; time: number; best: boolean; valid: boolean; lap: number }
  | { type: 'sector'; id: string; sector: number; time: number; color: 'purple' | 'green' | 'yellow' }
  | { type: 'warning'; id: string; text: string }
  | { type: 'penalty'; id: string; seconds: number; reason: string }
  | { type: 'invalid'; id: string }
  | { type: 'flag' }
  | { type: 'finish'; id: string; position: number }
  | { type: 'lastlap' }
  | { type: 'timeup' };

const CHECKPOINT = 20;
const DELTA_STEP = 10;

/** Estado de carrera de cada participante. */
export class Competitor {
  readonly e: Entrant;
  readonly kart = new Kart();
  ai: AIDriver | null = null;
  input: KartInput = emptyInput();
  totalDist = 0;
  lastS = 0;
  lapsDone = 0;
  lapStart = 0;
  lastLap: number | null = null;
  bestLap: number | null = null;
  lapTimes: number[] = [];
  sector = 0;
  sectorStart = 0;
  curSectors: (number | null)[] = [null, null, null];
  bestSectors: (number | null)[] = [null, null, null];
  lapValid = true;
  cuts = 0;
  penalty = 0;
  finished = false;
  finishTime = 0;
  position = 1;
  gap = 0;
  interval = 0;
  lapsBehind = 0;
  gridX = 0;
  gridZ = 0;
  jumpStart = false;
  // Tiempos parciales cada DELTA_STEP m de la vuelta actual y de la mejor.
  curSplits: number[] = [];
  bestSplits: number[] | null = null;
  private excActive = false;
  private excStart = 0;
  private excK = 0;
  private excN = 0;
  private excSide = 0;
  checkpoint = -1;
  /** Puesto de salida y puesto al completar cada vuelta (gráfico de posiciones). */
  grid = 0;
  posHistory: number[] = [];
  overtakes = 0;
  lastPos = 0;
  /** Para clasificación simulada de la IA. */
  simLaps: { at: number; time: number }[] = [];

  constructor(e: Entrant) {
    this.e = e;
  }

  get id(): string {
    return this.e.id;
  }

  /** Detección de atajos: excursión por el interior de una curva ganando distancia. */
  checkCut(track: Track): boolean {
    const p = this.kart.proj;
    const a = Math.abs(p.lat);
    if (!this.excActive) {
      if (a > p.hw + KERB_WIDTH + 0.8) {
        this.excActive = true;
        this.excStart = this.totalDist;
        this.excK = 0;
        this.excN = 0;
        this.excSide = Math.sign(p.lat);
      }
      return false;
    }
    this.excK += track.curv[p.idx] * this.excSide;
    this.excN++;
    if (a < p.hw + 0.4) {
      this.excActive = false;
      const gain = this.totalDist - this.excStart;
      const inside = this.excK / Math.max(1, this.excN);
      return gain > 14 && inside > 1 / 90;
    }
    return false;
  }
}

/**
 * Simulación de una sesión (sin render): física, IA, cronometraje y reglamento.
 * Se avanza a paso fijo; la capa de presentación lee el estado y los eventos.
 */
export class RaceSim {
  readonly cfg: SimConfig;
  readonly track: Track;
  readonly comps: Competitor[] = [];
  readonly player: Competitor | null;
  readonly events: SimEvent[] = [];
  phase: 'countdown' | 'racing' | 'finished' = 'countdown';
  /** Reloj de sesión (desde el apagado de semáforos o el inicio). */
  time = 0;
  countdown = 0;
  lights = 0;
  private holdTime = 0;
  flag = false;
  flagTime = 0;
  finishOrder: Competitor[] = [];
  private firstArrival: number[] = [];
  private rand: () => number;
  /** Mejores sectores absolutos de la sesión (para morado). */
  sessionBestSectors: (number | null)[] = [null, null, null];
  /** Récords guardados previamente (morado en libres). */
  recordSectors: (number | null)[] = [null, null, null];
  sessionBestLap: { id: string; time: number } | null = null;
  timeLeft = 0;
  timeUp = false;
  private aiWorld: AIWorld;
  private gridInput: KartInput = emptyInput();
  private overtakeClock = 0;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.track = cfg.track;
    this.rand = rng(cfg.seed ?? 1234);
    const isRace = cfg.kind === 'race';
    cfg.entrants.forEach((e, i) => {
      // En clasificación la IA no rueda físicamente: sus tiempos se simulan.
      if (!isRace && !e.isPlayer) return;
      const c = new Competitor(e);
      this.comps.push(c);
      const slot = isRace ? this.track.gridSlot(i) : { s: -45, lat: 0 };
      c.kart.setPose(this.track, slot.s, slot.lat);
      c.totalDist = slot.s;
      c.lastS = c.kart.proj.s;
      c.gridX = c.kart.x;
      c.gridZ = c.kart.z;
      c.grid = i + 1;
      c.posHistory = [i + 1];
      if (!e.isPlayer) c.ai = new AIDriver(c.kart, e.driver, cfg.difficulty, (cfg.seed ?? 1) * 31 + i * 7);
    });
    this.player = this.comps.find((c) => c.e.isPlayer) ?? null;
    if (!isRace) {
      this.phase = 'racing';
      this.timeLeft = cfg.duration ?? 0;
    }
    this.holdTime = 0.7 + this.rand() * 1.6;
    if (cfg.kind === 'quali' && cfg.refLap) this.setupAIQuali(cfg.refLap);
    this.aiWorld = { track: this.track, karts: this.comps.map((c) => c.kart), racing: false, rubber: 1 };
  }

  get isRace(): boolean {
    return this.cfg.kind === 'race';
  }

  /** Avanza la simulación un paso fijo. */
  step(dt: number, playerInput: KartInput, playerRespawn: boolean): void {
    const track = this.track;
    const racing = this.phase !== 'countdown';

    if (this.phase === 'countdown') {
      this.countdown += dt;
      const n = Math.min(5, Math.floor(this.countdown - 0.5));
      if (n > this.lights && n >= 1) {
        this.lights = n;
        this.events.push({ type: 'light', n });
      }
      if (this.countdown > 5.5 + this.holdTime) {
        this.lights = 0;
        this.phase = 'racing';
        this.events.push({ type: 'go' });
      }
    } else {
      this.time += dt;
    }

    if (this.timeLeft > 0 && racing && !this.timeUp) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.timeUp = true;
        this.events.push({ type: 'timeup' });
      }
    }

    // Entradas y física
    const playerDist = this.player?.totalDist ?? 0;
    for (const c of this.comps) {
      c.kart.savePrev();
      let inp: KartInput;
      if (c.ai) {
        this.aiWorld.racing = racing;
        this.aiWorld.rubber = this.rubberFor(c, playerDist);
        inp = c.ai.update(dt, this.aiWorld);
        if (c.ai.wantsRespawn) {
          c.ai.wantsRespawn = false;
          c.kart.respawn(track);
        }
      } else {
        inp = playerInput;
        if (!racing) {
          // En parrilla el freno no engrana la marcha atrás.
          this.gridInput.throttle = inp.throttle;
          this.gridInput.steer = inp.steer;
          // En parrilla el piloto sujeta el kart con el freno (sin marcha atrás)
          this.gridInput.brake = 1;
          this.gridInput.hold = true;
          this.gridInput.hop = false;
          inp = this.gridInput;
        }
        if (playerRespawn && racing) c.kart.respawn(track);
      }
      c.input = inp;
      c.kart.step(dt, inp, track);
    }
    collideKarts(this.aiWorld.karts);
    for (const c of this.comps) c.kart.collideTrack(track, 0);
    this.updateSlipstream(dt);

    // Salida anticipada
    if (this.phase === 'countdown') {
      for (const c of this.comps) {
        if (c.jumpStart) continue;
        // Solo cuenta avanzar (en el sentido de la pista) antes de tiempo.
        const fwd = (c.kart.x - c.gridX) * c.kart.proj.tx + (c.kart.z - c.gridZ) * c.kart.proj.tz;
        if (fwd > 0.7) {
          c.jumpStart = true;
          c.penalty += 5;
          this.events.push({ type: 'jumpstart', id: c.id });
          this.events.push({ type: 'penalty', id: c.id, seconds: 5, reason: 'Salida anticipada' });
        }
      }
    }

    // Cronometraje
    for (const c of this.comps) this.updateTiming(c);
    if (this.isRace) this.updatePositions();
    else this.updateQualiOrder();

    // Fin de sesión
    if (this.isRace && this.flag && this.phase === 'racing') {
      const allDone = this.comps.every((c) => c.finished);
      const playerDone = !this.player || this.player.finished;
      if (allDone || (playerDone && this.time - this.flagTime > 40)) this.finishRace();
    }
  }

  private rubberFor(c: Competitor, playerDist: number): number {
    if (this.cfg.difficulty !== 'facil' || !this.isRace || !this.player || this.phase !== 'racing') return 1;
    const dd = c.totalDist - playerDist;
    return clamp(1 - dd * 0.0005, 0.94, 1.06);
  }

  private updateSlipstream(dt: number): void {
    for (const a of this.comps) {
      const ka = a.kart;
      let target = 0;
      if (ka.vF > 14) {
        const fx = Math.sin(ka.yaw);
        const fz = Math.cos(ka.yaw);
        for (const b of this.comps) {
          if (b === a) continue;
          const kb = b.kart;
          const dx = kb.x - ka.x;
          const dz = kb.z - ka.z;
          const along = dx * fx + dz * fz;
          if (along < 2 || along > 16) continue;
          const lat = Math.abs(dx * -fz + dz * fx);
          if (lat > 1.6 || Math.abs(kb.y - ka.y) > 1.5) continue;
          target = Math.max(target, 1 - (along - 2) / 14);
        }
      }
      ka.slip = damp(ka.slip, target, target > ka.slip ? 2.5 : 4, dt);
    }
  }

  private updateTiming(c: Competitor): void {
    const track = this.track;
    const L = track.length;
    const k = c.kart;
    let ds = k.proj.s - c.lastS;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    c.lastS = k.proj.s;
    if (this.phase === 'countdown') return;
    c.totalDist += ds;

    if (c.finished) return;

    // Atajos
    if (c.checkCut(track)) {
      if (this.isRace) {
        c.cuts++;
        if (c.cuts === 1) this.events.push({ type: 'warning', id: c.id, text: 'Límites de pista: AVISO' });
        else {
          c.penalty += 3;
          this.events.push({ type: 'penalty', id: c.id, seconds: 3, reason: 'Atajar' });
        }
      } else if (c.lapsDone > 0 && c.lapValid) {
        c.lapValid = false;
        this.events.push({ type: 'invalid', id: c.id });
      }
    }

    const lapOrigin = this.isRace ? c.lapsDone * L : (c.lapsDone - 1) * L;
    const lapPos = c.totalDist - lapOrigin;
    // Parciales para delta
    if (c.lapsDone > 0 || this.isRace) {
      const si = Math.floor(lapPos / DELTA_STEP);
      while (c.curSplits.length <= si && si >= 0) c.curSplits.push(this.time - c.lapStart);
    }
    // Sectores
    const secIdx = lapPos < track.sectorStart[1] ? 0 : lapPos < track.sectorStart[2] ? 1 : 2;
    if (lapPos >= 0 && secIdx > c.sector && (c.lapsDone > 0 || this.isRace)) {
      this.closeSector(c, c.sector);
      c.sector = secIdx;
    }
    // Vuelta completada
    if (c.totalDist >= lapOrigin + L) {
      const lapTime = this.time - c.lapStart;
      const timed = this.isRace || c.lapsDone > 0;
      if (timed) {
        this.closeSector(c, 2);
        const valid = c.lapValid;
        let best = false;
        if (valid) {
          c.lastLap = lapTime;
          c.lapTimes.push(lapTime);
          if (c.bestLap == null || lapTime < c.bestLap) {
            c.bestLap = lapTime;
            c.bestSplits = c.curSplits.slice();
            best = true;
          }
          if (!this.sessionBestLap || lapTime < this.sessionBestLap.time) this.sessionBestLap = { id: c.id, time: lapTime };
        } else {
          c.lastLap = lapTime;
          c.lapTimes.push(lapTime);
        }
        this.events.push({ type: 'lap', id: c.id, time: lapTime, best, valid, lap: c.lapsDone + 1 });
      }
      c.lapsDone++;
      if (this.isRace && c.posHistory.length <= this.cfg.laps) c.posHistory.push(c.position);
      c.lapStart = this.time;
      c.sector = 0;
      c.sectorStart = this.time;
      c.curSectors = [null, null, null];
      c.curSplits = [];
      c.lapValid = true;
      if (this.isRace) {
        if (c.lapsDone >= this.cfg.laps || (this.flag && !c.finished)) this.finishCompetitor(c);
        else if (c.lapsDone === this.cfg.laps - 1 && c === this.leader()) this.events.push({ type: 'lastlap' });
      }
    }

    // Diferencias (carrera)
    if (this.isRace) {
      const cp = Math.floor(c.totalDist / CHECKPOINT);
      if (cp > c.checkpoint && cp >= 0) {
        c.checkpoint = cp;
        if (this.firstArrival[cp] == null) this.firstArrival[cp] = this.time;
        c.gap = this.time - this.firstArrival[cp];
      }
    }
  }

  private closeSector(c: Competitor, idx: number): void {
    const t = this.time - c.sectorStart;
    c.sectorStart = this.time;
    c.curSectors[idx] = t;
    let color: 'purple' | 'green' | 'yellow' = 'yellow';
    if (c.lapValid) {
      const sb = this.sessionBestSectors[idx];
      const rec = this.recordSectors[idx];
      const overall = sb == null ? rec : rec == null ? sb : Math.min(sb, rec);
      const pb = c.bestSectors[idx];
      if (overall == null || t < overall) color = 'purple';
      else if (pb == null || t < pb) color = 'green';
      if (pb == null || t < pb) c.bestSectors[idx] = t;
      if (sb == null || t < sb) this.sessionBestSectors[idx] = t;
    }
    this.events.push({ type: 'sector', id: c.id, sector: idx, time: t, color });
  }

  private finishCompetitor(c: Competitor): void {
    c.finished = true;
    c.finishTime = this.time;
    if (!this.flag) {
      this.flag = true;
      this.flagTime = this.time;
      this.events.push({ type: 'flag' });
    }
    this.finishOrder.push(c);
    this.events.push({ type: 'finish', id: c.id, position: this.finishOrder.length });
    // Tras cruzar la meta, la IA lleva el kart (vuelta de enfriamiento).
    if (!c.ai) {
      c.ai = new AIDriver(c.kart, null, 'facil', 99);
      c.ai.perfect = true;
      c.ai.speedFactor = 0.75;
    }
  }

  leader(): Competitor {
    let best = this.comps[0];
    for (const c of this.comps) if (c.totalDist > best.totalDist) best = c;
    return best;
  }

  private updatePositions(): void {
    const order = this.comps.slice().sort((a, b) => {
      if (a.finished && b.finished) return this.finishOrder.indexOf(a) - this.finishOrder.indexOf(b);
      if (a.finished !== b.finished) {
        // Un kart que ha terminado va delante de otro que sigue en su misma vuelta o menos
        const fa = a.finished ? a.lapsDone : a.totalDist / this.track.length;
        const fb = b.finished ? b.lapsDone : b.totalDist / this.track.length;
        return fb - fa;
      }
      return b.totalDist - a.totalDist;
    });
    const L = this.track.length;
    const lead = order[0];
    // Adelantamientos: puestos ganados entre muestras cada 2 s (filtra los cruces de ida y vuelta)
    const sample = this.phase === 'racing' && this.time - this.overtakeClock >= 2;
    if (sample) this.overtakeClock = this.time;
    order.forEach((c, i) => {
      if (sample) {
        if (c.lastPos > 0 && i + 1 < c.lastPos && !c.finished && this.time > 3) c.overtakes += c.lastPos - (i + 1);
        c.lastPos = i + 1;
      }
      c.position = i + 1;
      c.lapsBehind = Math.max(0, Math.floor((lead.totalDist - c.totalDist) / L));
      c.interval = i === 0 ? 0 : Math.max(0, c.gap - order[i - 1].gap);
    });
  }

  private updateQualiOrder(): void {
    const order = this.qualiStandings();
    for (const c of this.comps) c.position = order.findIndex((r) => r.id === c.id) + 1;
  }

  /** Tabla de tiempos (libres/clasificación) incluyendo IA simulada. */
  qualiStandings(): { id: string; e: Entrant; best: number | null }[] {
    const rows: { id: string; e: Entrant; best: number | null }[] = [];
    for (const e of this.cfg.entrants) {
      if (e.isPlayer) {
        rows.push({ id: e.id, e, best: this.player?.bestLap ?? null });
      } else {
        const sim = this.aiQuali.get(e.id);
        let best: number | null = null;
        if (sim) for (const l of sim) if (l.at <= this.time && (best == null || l.time < best)) best = l.time;
        rows.push({ id: e.id, e, best });
      }
    }
    rows.sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9));
    return rows;
  }

  /** Vueltas simuladas de la IA en clasificación: id -> [{momento, tiempo}]. */
  readonly aiQuali = new Map<string, { at: number; time: number }[]>();

  private setupAIQuali(refLap: number): void {
    const dur = Math.max(60, this.cfg.duration ?? 180);
    for (const e of this.cfg.entrants) {
      if (e.isPlayer || !e.driver) continue;
      const d = e.driver;
      // El tiempo de vuelta escala aprox. con (1/velocidad)^0.72 (las rectas van a tope).
      const base = refLap / Math.pow(paceFactor(d), 0.72);
      const laps: { at: number; time: number }[] = [];
      const n = 3;
      let at = dur * (0.18 + this.rand() * 0.15);
      for (let i = 0; i < n; i++) {
        const noise = (1 - d.consistency) * 0.03 * this.rand() + this.rand() * 0.006;
        const improve = (n - 1 - i) * 0.004;
        laps.push({ at, time: base * (1 + noise + improve) });
        at += base * (1.05 + this.rand() * 0.6);
        if (at > dur * 0.98) at = dur * (0.9 + this.rand() * 0.08);
      }
      this.aiQuali.set(e.id, laps);
    }
  }

  /** Revela todos los tiempos simulados (fin de clasificación). */
  revealAllQuali(): void {
    for (const laps of this.aiQuali.values()) for (const l of laps) l.at = Math.min(l.at, this.time);
  }

  /** Delta en directo frente a la mejor vuelta propia. */
  liveDelta(c: Competitor): number | null {
    if (!c.bestSplits || c.curSplits.length === 0) return null;
    const i = c.curSplits.length - 1;
    if (i >= c.bestSplits.length) return null;
    return c.curSplits[i] - c.bestSplits[i];
  }

  private finishRace(): void {
    // Clasificar a los que no han terminado por distancia, con tiempo estimado.
    const L = this.track.length;
    const rest = this.comps.filter((c) => !c.finished).sort((a, b) => b.totalDist - a.totalDist);
    for (const c of rest) {
      const lapsDone = c.lapsDone;
      const remaining = Math.max(0, (lapsDone + 1) * L - c.totalDist);
      const v = Math.max(8, c.kart.speed);
      c.finished = true;
      c.finishTime = this.time + remaining / v;
      c.lapsDone = lapsDone + (remaining > 0 ? 1 : 0);
      this.finishOrder.push(c);
    }
    this.phase = 'finished';
  }

  /** Clasificación final (con penalizaciones aplicadas). */
  results(): RaceResultRow[] {
    const laps = this.cfg.laps;
    const rows = this.finishOrder.map((c) => ({
      c,
      laps: Math.min(c.lapsDone, laps),
      total: c.finishTime + c.penalty,
    }));
    rows.sort((a, b) => (b.laps !== a.laps ? b.laps - a.laps : a.total - b.total));
    const winner = rows[0];
    let fastest: Competitor | null = null;
    for (const c of this.comps) if (c.bestLap != null && (!fastest || c.bestLap < (fastest.bestLap ?? Infinity))) fastest = c;
    return rows.map((r, i) => ({
      position: i + 1,
      id: r.c.id,
      entrant: r.c.e,
      total: r.total,
      gap: i === 0 ? 0 : r.laps < winner.laps ? null : r.total - winner.total,
      lapsDown: winner.laps - r.laps,
      bestLap: r.c.bestLap,
      penalty: r.c.penalty,
      fastestLap: r.c === fastest,
      grid: r.c.grid,
      posHistory: [...r.c.posHistory.slice(0, laps), i + 1],
      overtakes: r.c.overtakes,
    }));
  }

  /** Para terminar la sesión al instante (p. ej. tiempo agotado o salir). */
  forceFinish(): void {
    if (this.isRace) this.finishRace();
    else this.phase = 'finished';
  }
}

export interface RaceResultRow {
  position: number;
  id: string;
  entrant: Entrant;
  total: number;
  gap: number | null;
  lapsDown: number;
  bestLap: number | null;
  penalty: number;
  fastestLap: boolean;
  grid: number;
  /** Puesto en la salida, al final de cada vuelta y en meta. */
  posHistory: number[];
  overtakes: number;
}

/** Calcula el tiempo de vuelta de referencia de la IA (simulación sin render). */
export function referenceLap(track: Track, speedFactor: number): number {
  const k = new Kart();
  k.setPose(track, -20, track.sample(track.lineOffset, -20));
  const ai = new AIDriver(k, null, 'pro', 1);
  ai.perfect = true;
  ai.speedFactor = speedFactor;
  const w: AIWorld = { track, karts: [k], racing: true, rubber: 1 };
  const dt = 1 / 120;
  let dist = -20;
  let lastS = k.proj.s;
  let t = 0;
  let lapStart = -1;
  const L = track.length;
  for (let i = 0; i < 120 * 600; i++) {
    const inp = ai.update(dt, w);
    if (ai.wantsRespawn) {
      ai.wantsRespawn = false;
      k.respawn(track);
    }
    k.step(dt, inp, track);
    t += dt;
    let ds = k.proj.s - lastS;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    lastS = k.proj.s;
    const before = dist;
    dist += ds;
    if (before < L && dist >= L) lapStart = t;
    if (before < 2 * L && dist >= 2 * L) return t - lapStart;
  }
  return L / 15;
}

export { KART };
