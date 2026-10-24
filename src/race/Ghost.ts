import { load, save } from '../core/Storage';

/** Muestras de una vuelta: [x, y, z, yaw] cada GHOST_DT segundos. */
export interface GhostData {
  lapTime: number;
  frames: number[];
}

export const GHOST_DT = 1 / 20;

export class GhostRecorder {
  private frames: number[] = [];
  private acc = 0;

  reset(): void {
    this.frames = [];
    this.acc = GHOST_DT;
  }

  sample(dt: number, x: number, y: number, z: number, yaw: number): void {
    this.acc += dt;
    while (this.acc >= GHOST_DT) {
      this.acc -= GHOST_DT;
      this.frames.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100, Math.round(yaw * 1000) / 1000);
    }
  }

  finish(lapTime: number): GhostData {
    return { lapTime, frames: this.frames.slice() };
  }
}

/** Interpola la posición del fantasma en el instante t de la vuelta. */
export function ghostPose(g: GhostData, t: number, out: { x: number; y: number; z: number; yaw: number }): boolean {
  const n = g.frames.length / 4;
  if (n < 2) return false;
  const f = t / GHOST_DT;
  if (f < 0 || f >= n - 1) return false;
  const i = Math.floor(f);
  const a = f - i;
  const k = i * 4;
  const fr = g.frames;
  out.x = fr[k] + (fr[k + 4] - fr[k]) * a;
  out.y = fr[k + 1] + (fr[k + 5] - fr[k + 1]) * a;
  out.z = fr[k + 2] + (fr[k + 6] - fr[k + 2]) * a;
  let dy = fr[k + 7] - fr[k + 3];
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  out.yaw = fr[k + 3] + dy * a;
  return true;
}

// Cada cambio de física hace que los tiempos dejen de ser comparables: récords y
// fantasmas se guardan con claves por versión (v3 = vehículo de 4 ruedas).
const V = '3:';

export function loadGhost(trackId: string): GhostData | null {
  return load<GhostData | null>('ghost' + V + trackId, null);
}

export function saveGhost(trackId: string, g: GhostData): void {
  save('ghost' + V + trackId, g);
}

// ---- Récords por circuito ----
export interface TrackRecord {
  best: number | null;
  sectors: (number | null)[];
}

export function loadRecord(trackId: string): TrackRecord {
  return load<TrackRecord>('record' + V + trackId, { best: null, sectors: [null, null, null] });
}

export function saveRecord(trackId: string, r: TrackRecord): void {
  save('record' + V + trackId, r);
}

/** Mejor vuelta con la física anterior (solo para no perder desbloqueables ya ganados). */
export function loadLegacyBest(trackId: string): number | null {
  const a = load<TrackRecord>('record2:' + trackId, { best: null, sectors: [] }).best;
  return a ?? load<TrackRecord>('record:' + trackId, { best: null, sectors: [] }).best;
}
