// Utilidades matemáticas compartidas (sin dependencias).

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Suavizado exponencial independiente del framerate. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Lleva un ángulo a (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const d = wrapAngle(target - current);
  return current + d * (1 - Math.exp(-rate * dt));
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Formatea segundos como m:ss.mmm */
export function formatTime(t: number | null | undefined, showMinutesAlways = true): string {
  if (t == null || !isFinite(t)) return '--:--.---';
  const neg = t < 0;
  t = Math.abs(t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  const body = m > 0 || showMinutesAlways ? `${m}:${ss}` : s.toFixed(3);
  return (neg ? '-' : '') + body;
}

/** Diferencia con signo: +1.234 / -0.512 */
export function formatDelta(d: number): string {
  const sgn = d >= 0 ? '+' : '-';
  return sgn + Math.abs(d).toFixed(3);
}
