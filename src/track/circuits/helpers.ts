import type { ControlPoint } from '../TrackData';

/**
 * Vértice de un polígono redondeado:
 * [x, z, radio de la curva, altura?, anchura?, escapatoria izq?, escapatoria der?]
 */
export type V = [number, number, number, number?, number?, number?, number?];

/**
 * Convierte un polígono (vértices con radio de giro) en puntos de control densos:
 * cada esquina se sustituye por un arco del radio indicado y las rectas se
 * subdividen. Así diseñar un circuito es tan sencillo como trazar un polígono.
 */
export function rounded(vs: V[]): ControlPoint[] {
  const out: ControlPoint[] = [];
  const n = vs.length;
  const mk = (x: number, z: number, v: V): ControlPoint => {
    const p: ControlPoint = { x, z };
    if (v[3] != null) p.y = v[3];
    if (v[4] != null) p.w = v[4];
    if (v[5] != null) p.runL = v[5];
    if (v[6] != null) p.runR = v[6];
    return p;
  };
  const lerpP = (a: ControlPoint, b: ControlPoint, t: number): ControlPoint => {
    const p: ControlPoint = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (a.y != null && b.y != null) p.y = a.y + (b.y - a.y) * t;
    if (a.w != null && b.w != null) p.w = a.w + (b.w - a.w) * t;
    if (a.runL != null && b.runL != null) p.runL = a.runL + (b.runL - a.runL) * t;
    if (a.runR != null && b.runR != null) p.runR = a.runR + (b.runR - a.runR) * t;
    return p;
  };

  const corners: ControlPoint[][] = [];
  for (let i = 0; i < n; i++) {
    const v = vs[i];
    const p = vs[(i - 1 + n) % n];
    const q = vs[(i + 1) % n];
    let ix = v[0] - p[0];
    let iz = v[1] - p[1];
    const li = Math.hypot(ix, iz);
    ix /= li;
    iz /= li;
    let ox = q[0] - v[0];
    let oz = q[1] - v[1];
    const lo = Math.hypot(ox, oz);
    ox /= lo;
    oz /= lo;
    const dot = Math.max(-1, Math.min(1, ix * ox + iz * oz));
    const theta = Math.acos(dot);
    let r = v[2];
    if (theta < 0.03 || r <= 0) {
      corners.push([mk(v[0], v[1], v)]);
      continue;
    }
    let tl = r * Math.tan(theta / 2);
    const maxT = 0.45 * Math.min(li, lo);
    if (tl > maxT) {
      tl = maxT;
      r = tl / Math.tan(theta / 2);
    }
    const ax = v[0] - ix * tl;
    const az = v[1] - iz * tl;
    const bx = v[0] + ox * tl;
    const bz = v[1] + oz * tl;
    // Centro del arco: desde el punto de entrada, perpendicular hacia el interior.
    const cross = ix * oz - iz * ox;
    const side = cross > 0 ? 1 : -1;
    const cx = ax + -iz * r * side;
    const cz = az + ix * r * side;
    const a0 = Math.atan2(az - cz, ax - cx);
    const a1 = Math.atan2(bz - cz, bx - cx);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const segs = Math.max(2, Math.ceil(Math.abs(sweep) / 0.35));
    const arc: ControlPoint[] = [];
    for (let k = 0; k <= segs; k++) {
      const a = a0 + (sweep * k) / segs;
      arc.push(mk(cx + Math.cos(a) * r, cz + Math.sin(a) * r, v));
    }
    corners.push(arc);
  }

  for (let i = 0; i < n; i++) {
    const arc = corners[i];
    for (const p of arc) out.push(p);
    const a = arc[arc.length - 1];
    const b = corners[(i + 1) % n][0];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.floor(d / 30);
    for (let k = 1; k <= steps; k++) out.push(lerpP(a, b, k / (steps + 1)));
  }
  return out;
}

/** Escala un polígono (útil para ajustar la longitud de un trazado). */
export function scaleV(vs: V[], k: number): V[] {
  return vs.map((v) => [v[0] * k, v[1] * k, v[2] * k, v[3], v[4], v[5], v[6]] as V);
}
