import { cornerSpeed } from '../physics/Kart';
import type { Track } from '../track/Track';

// Notas de copiloto (pacenotes), al estilo de los rallies pero para karting:
// cada curva del circuito se describe con su sentido, su severidad (1 = horquilla
// … 6 = casi a fondo) y matices ("larga", "cierra", "abre", "enlaza"). Se generan
// solas a partir de la curvatura del trazado, sin depender del render.

export interface PaceNote {
  /** Distancia (m) de entrada, vértice y salida de la curva. */
  s0: number;
  sApex: number;
  s1: number;
  /** 1 = derecha, −1 = izquierda. */
  dir: number;
  /** Radio mínimo (m) y giro total (rad). */
  radius: number;
  angle: number;
  /** 1 (horquilla) … 6 (rápida). */
  severity: number;
  long: boolean;
  tightens: boolean;
  opens: boolean;
  /** Giro de más de 140°. */
  hairpin: boolean;
  /** La siguiente curva llega enseguida. */
  linked: boolean;
  /** Velocidad recomendada en el vértice (m/s). */
  speed: number;
}

/** Severidad por radio, a escala de kartódromo. */
function severityOf(R: number): number {
  if (R < 7) return 1;
  if (R < 10) return 2;
  if (R < 14) return 3;
  if (R < 20) return 4;
  if (R < 32) return 5;
  return 6;
}

const K_IN = 1 / 85;

export function buildPaceNotes(track: Track): PaceNote[] {
  const t = track;
  const n = t.n;
  // Empezar en el punto más recto para no partir una curva
  let i0 = 0;
  for (let i = 0; i < n; i++) if (Math.abs(t.curv[i]) < Math.abs(t.curv[i0])) i0 = i;
  const notes: PaceNote[] = [];
  let i = 0;
  while (i < n) {
    const j = (i0 + i) % n;
    const k = t.curv[j];
    if (Math.abs(k) < K_IN) {
      i++;
      continue;
    }
    const dir = Math.sign(k);
    // Recorrer la curva mientras mantenga el sentido (se toleran 12 m de casi recta:
    // dos giros de 90° seguidos son una sola horquilla)
    let len = 0;
    let gap = 0;
    let peak = 0;
    let peakAt = 0;
    let angle = 0;
    let m = 0;
    while (m < n) {
      const kk = t.curv[(j + m) % n];
      if (Math.sign(kk) === dir && Math.abs(kk) >= K_IN) {
        gap = 0;
        len = m;
        angle += Math.abs(kk) * t.ds;
        if (Math.abs(kk) > peak) {
          peak = Math.abs(kk);
          peakAt = m;
        }
      } else {
        gap += t.ds;
        if (gap > 12 || (Math.sign(kk) === -dir && Math.abs(kk) >= K_IN)) break;
      }
      m++;
    }
    const length = (len + 1) * t.ds;
    // Descartar ondulaciones: poco giro o radio enorme
    if (angle > 0.3 && peak > 1 / 70) {
      const R = 1 / peak;
      const apexFrac = peakAt / Math.max(1, len);
      const kStart = Math.abs(t.curv[(j + Math.floor(len * 0.2)) % n]);
      const kEnd = Math.abs(t.curv[(j + Math.floor(len * 0.8)) % n]);
      const s0 = ((j * t.ds) % t.length + t.length) % t.length;
      notes.push({
        s0,
        sApex: (s0 + peakAt * t.ds) % t.length,
        s1: (s0 + length) % t.length,
        dir,
        radius: R,
        angle,
        severity: severityOf(R),
        hairpin: angle > 2.45,
        long: angle > 1.75 && angle <= 2.45 && length > 28,
        tightens: apexFrac > 0.62 && kEnd > kStart * 1.5,
        opens: apexFrac < 0.38 && kStart > kEnd * 1.5,
        linked: false,
        speed: cornerSpeed(peak, 0.95),
      });
    }
    i += Math.max(1, m);
  }
  notes.sort((a, b) => a.s0 - b.s0);
  for (let q = 0; q < notes.length; q++) {
    const a = notes[q];
    const b = notes[(q + 1) % notes.length];
    let d = b.s0 - a.s1;
    if (d < 0) d += t.length;
    a.linked = notes.length > 1 && d < 14;
  }
  return notes;
}

/** Texto de la nota, tal como la cantaría un copiloto. */
export function noteText(n: PaceNote): string {
  const side = n.dir > 0 ? 'Derecha' : 'Izquierda';
  let s = n.hairpin ? `Horquilla a ${side.toLowerCase()}` : `${side} ${n.severity}`;
  if (n.long) s += ', larga';
  if (n.tightens) s += ', cierra';
  else if (n.opens) s += ', abre';
  if (n.linked) s += ', enlaza';
  return s;
}

/** Índice de la próxima nota por delante de s y distancia hasta su entrada. */
export function nextNote(notes: PaceNote[], s: number, L: number): { idx: number; dist: number } | null {
  if (!notes.length) return null;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < notes.length; i++) {
    let d = notes[i].s0 - s;
    if (d < -4) d += L;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { idx: best, dist: Math.max(0, bestD) };
}
