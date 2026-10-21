import type { Track } from '../track/Track';
import { cornerSpeed, KART } from '../physics/Kart';

/**
 * Calcula la línea de carrera (desplazamiento lateral por muestra) minimizando la
 * curvatura con una "banda elástica", y el perfil de velocidades objetivo
 * (velocidad de paso por curva + frenadas hacia atrás).
 */
export function computeRacingLine(track: Track): void {
  const step = 3;
  const m = Math.floor(track.n / step);
  const cx = new Float64Array(m);
  const cz = new Float64Array(m);
  const rx = new Float64Array(m);
  const rz = new Float64Array(m);
  const lim = new Float64Array(m);
  const off = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const i = k * step;
    cx[k] = track.px[i];
    cz[k] = track.pz[i];
    rx[k] = -track.tz[i];
    rz[k] = track.tx[i];
    lim[k] = Math.max(0, track.hw[i] - 1.5);
  }
  const iters = 400;
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < m; k++) {
      const a = (k - 1 + m) % m;
      const b = (k + 1) % m;
      const ax = cx[a] + rx[a] * off[a];
      const az = cz[a] + rz[a] * off[a];
      const bx = cx[b] + rx[b] * off[b];
      const bz = cz[b] + rz[b] * off[b];
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const target = (mx - cx[k]) * rx[k] + (mz - cz[k]) * rz[k];
      let o = off[k] + (target - off[k]) * 0.6;
      if (o > lim[k]) o = lim[k];
      if (o < -lim[k]) o = -lim[k];
      off[k] = o;
    }
  }
  // Suavizar y volcar a resolución completa.
  const n = track.n;
  for (let i = 0; i < n; i++) {
    const f = i / step;
    const k0 = Math.floor(f) % m;
    const k1 = (k0 + 1) % m;
    const t = f - Math.floor(f);
    track.lineOffset[i] = off[k0] * (1 - t) + off[k1] * t;
  }
  // Curvatura de la línea de carrera.
  const lx = new Float64Array(n);
  const lz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lx[i] = track.px[i] - track.tz[i] * track.lineOffset[i];
    lz[i] = track.pz[i] + track.tx[i] * track.lineOffset[i];
  }
  const span = 5;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - span + n) % n;
    const b = (i + span) % n;
    raw[i] = menger(lx[a], lz[a], lx[i], lz[i], lx[b], lz[b]);
  }
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -4; j <= 4; j++) acc += raw[(i + j + n) % n];
    track.lineCurv[i] = acc / 9;
  }
  // Perfil de velocidad: límite por curva y frenada hacia atrás (dos pasadas por el cierre).
  const v = track.lineSpeed;
  for (let i = 0; i < n; i++) v[i] = cornerSpeed(track.lineCurv[i]);
  const decel = 15;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[(i + 1) % n];
      const lim2 = Math.sqrt(next * next + 2 * decel * track.ds);
      if (v[i] > lim2) v[i] = lim2;
    }
  }
  for (let i = 0; i < n; i++) v[i] = Math.min(v[i], KART.vmax);
}

/** Curvatura con signo por tres puntos (positiva = giro a derechas). */
function menger(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const bcx = cx - bx;
  const bcz = cz - bz;
  const acx = cx - ax;
  const acz = cz - az;
  const cross = abx * bcz - abz * bcx;
  const d = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(acx, acz);
  if (d < 1e-9) return 0;
  // Con derecha = (-tz, tx), un producto cruzado positivo es un giro a derechas.
  return (2 * cross) / d;
}
