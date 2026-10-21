import { CatmullRomCurve3, Vector3 } from 'three';
import type { RunoffSurface, TrackDef } from './TrackData';
import { clamp, lerp, mod, wrapAngle } from '../core/math';

/** Resultado de proyectar una posición sobre la pista. */
export interface TrackProj {
  idx: number;
  /** Distancia a lo largo de la vuelta (m), continua. */
  s: number;
  /** Desplazamiento lateral (m): positivo = derecha según el sentido de marcha. */
  lat: number;
  y: number;
  hw: number;
  limL: number;
  limR: number;
  tx: number;
  tz: number;
}

export function makeProj(): TrackProj {
  return { idx: 0, s: 0, lat: 0, y: 0, hw: 5, limL: 8, limR: 8, tx: 0, tz: 1 };
}

export const KERB_WIDTH = 1.1;

/**
 * Representación de la pista en tiempo de ejecución: muestras equiespaciadas
 * (~1 m) de la spline central con anchura, escapatorias, curvatura y altura.
 * Lo usan la física, la IA, la cámara, el minimapa y el generador de mallas.
 */
export class Track {
  readonly def: TrackDef;
  readonly length: number;
  readonly n: number;
  readonly ds: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Semianchura de la pista. */
  readonly hw: Float32Array;
  readonly runL: Float32Array;
  readonly runR: Float32Array;
  /** Curvatura con signo (1/m): positiva = curva a derechas. */
  readonly curv: Float32Array;
  readonly kerb: Uint8Array;
  /** 1 si el tramo es un puente (sin escapatoria lateral, con pilares). */
  readonly bridge: Uint8Array;
  readonly surface: RunoffSurface;
  readonly sectorStart: [number, number, number];
  readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity };

  // Rellenado por computeRacingLine (ai/RacingLine.ts)
  lineOffset: Float32Array;
  lineSpeed: Float32Array;
  lineCurv: Float32Array;

  constructor(def: TrackDef) {
    this.def = def;
    this.surface = def.surface;
    const pts = def.points;
    const curve = new CatmullRomCurve3(
      pts.map((p) => new Vector3(p.x, p.y ?? 0, p.z)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = pts.length * 120;
    curve.updateArcLengths();
    const L = curve.getLength();
    const n = Math.max(64, Math.round(L));
    this.n = n;
    this.length = L;
    this.ds = L / n;

    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.hw = new Float32Array(n);
    this.runL = new Float32Array(n);
    this.runR = new Float32Array(n);
    this.curv = new Float32Array(n);
    this.kerb = new Uint8Array(n);
    this.bridge = new Uint8Array(n);
    this.lineOffset = new Float32Array(n);
    this.lineSpeed = new Float32Array(n).fill(20);
    this.lineCurv = new Float32Array(n);

    const startAt = def.startAt ?? 0;
    const np = pts.length;
    const v = new Vector3();
    for (let i = 0; i < n; i++) {
      const u = mod(startAt + i / n, 1);
      curve.getPointAt(u, v);
      this.px[i] = v.x;
      this.py[i] = v.y;
      this.pz[i] = v.z;
      // Interpolación de atributos por punto de control.
      const t = curve.getUtoTmapping(u, 0) * np;
      const i0 = Math.floor(t) % np;
      const i1 = (i0 + 1) % np;
      let f = t - Math.floor(t);
      f = f * f * (3 - 2 * f);
      const a = pts[i0];
      const b = pts[i1];
      this.hw[i] = lerp(a.w ?? def.width, b.w ?? def.width, f) / 2;
      this.runL[i] = lerp(a.runL ?? def.runoff, b.runL ?? def.runoff, f);
      this.runR[i] = lerp(a.runR ?? def.runoff, b.runR ?? def.runoff, f);
      const b0 = this.bounds;
      b0.minX = Math.min(b0.minX, v.x);
      b0.maxX = Math.max(b0.maxX, v.x);
      b0.minZ = Math.min(b0.minZ, v.z);
      b0.maxZ = Math.max(b0.maxZ, v.z);
      b0.minY = Math.min(b0.minY, v.y);
      b0.maxY = Math.max(b0.maxY, v.y);
    }

    // Tangentes por diferencias centrales.
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let dx = this.px[b] - this.px[a];
      let dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
    }

    // Curvatura con signo (positiva = gira hacia la derecha = lat positivo).
    const raw = new Float32Array(n);
    const span = 3;
    for (let i = 0; i < n; i++) {
      const a = (i - span + n) % n;
      const b = (i + span) % n;
      const ha = Math.atan2(this.tx[a], this.tz[a]);
      const hb = Math.atan2(this.tx[b], this.tz[b]);
      raw[i] = -wrapAngle(hb - ha) / (2 * span * this.ds);
    }
    smoothInto(raw, this.curv, 4);

    // Puentes: detección automática de tramos que pasan por encima de otros.
    const reach = new Float32Array(n);
    for (let i = 0; i < n; i++) reach[i] = this.hw[i] + Math.max(this.runL[i], this.runR[i]);
    const step = 2;
    for (let i = 0; i < n; i += step) {
      for (let j = 0; j < n; j += step) {
        if (this.py[i] - this.py[j] < 4) continue;
        const dx = this.px[i] - this.px[j];
        const dz = this.pz[i] - this.pz[j];
        const lim = reach[i] + reach[j] + 6;
        if (dx * dx + dz * dz < lim * lim) {
          for (let k = -8; k <= 8; k++) this.bridge[(i + k + n) % n] = 1;
          break;
        }
      }
    }

    // Limitar escapatorias del lado interior para que el muro no se cruce consigo mismo.
    const maxK = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let mk = 0;
      for (let j = -10; j <= 10; j++) mk = Math.max(mk, Math.abs(this.curv[(i + j + n) % n]));
      maxK[i] = mk;
    }
    for (let i = 0; i < n; i++) {
      const k = this.curv[i];
      if (this.bridge[i]) {
        this.runL[i] = Math.min(this.runL[i], 0.9);
        this.runR[i] = Math.min(this.runR[i], 0.9);
      }
      if (maxK[i] > 1e-4) {
        const lim = Math.max(0.6, 0.8 / maxK[i] - this.hw[i]);
        if (k > 0) this.runR[i] = Math.min(this.runR[i], lim);
        else this.runL[i] = Math.min(this.runL[i], lim);
      }
    }
    minSmooth(this.runL, 6);
    minSmooth(this.runR, 6);

    // Pianos en curvas de radio < 70 m.
    for (let i = 0; i < n; i++) {
      if (maxK[i] > 1 / 70 && !this.bridge[i]) this.kerb[i] = 1;
    }

    const sec = def.sectors ?? [1 / 3, 2 / 3];
    this.sectorStart = [0, sec[0] * L, sec[1] * L];
  }

  /** Índice de muestra para una distancia s (con vuelta). */
  index(s: number): number {
    return mod(Math.floor(s / this.ds), this.n);
  }

  /** Interpola un array por muestras en la distancia s. */
  sample(arr: Float32Array, s: number): number {
    const f = mod(s / this.ds, this.n);
    const i0 = Math.floor(f);
    const i1 = (i0 + 1) % this.n;
    return lerp(arr[i0], arr[i1], f - i0);
  }

  /** Posición del mundo en (s, lat). */
  pointAt(s: number, lat: number, out: { x: number; y: number; z: number }): void {
    const f = mod(s / this.ds, this.n);
    const i0 = Math.floor(f);
    const i1 = (i0 + 1) % this.n;
    const t = f - i0;
    const x = lerp(this.px[i0], this.px[i1], t);
    const z = lerp(this.pz[i0], this.pz[i1], t);
    let tx = lerp(this.tx[i0], this.tx[i1], t);
    let tz = lerp(this.tz[i0], this.tz[i1], t);
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.x = x - tz * lat;
    out.z = z + tx * lat;
    out.y = lerp(this.py[i0], this.py[i1], t);
  }

  /** Rumbo (yaw) de la pista en s. Convención: forward = (sin yaw, cos yaw). */
  headingAt(s: number): number {
    const i = this.index(s);
    return Math.atan2(this.tx[i], this.tz[i]);
  }

  /** Proyección local partiendo de un índice cercano (búsqueda en ventana). */
  project(x: number, z: number, hint: number, out: TrackProj, window = 14): TrackProj {
    const n = this.n;
    let best = hint;
    let bestD = Infinity;
    for (let j = -window; j <= window; j++) {
      const i = (hint + j + n) % n;
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return this.finishProj(x, z, best, out);
  }

  /** Proyección global (respawn, inicio). Prefiere muestras a altura similar. */
  projectGlobal(x: number, z: number, y: number | null, out: TrackProj): TrackProj {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      let d = dx * dx + dz * dz;
      if (y != null) {
        const dy = y - this.py[i];
        d += dy * dy * 6;
      }
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return this.finishProj(x, z, best, out);
  }

  private finishProj(x: number, z: number, best: number, out: TrackProj): TrackProj {
    const n = this.n;
    // Refinar sobre el segmento (best, best+1) o (best-1, best).
    const tx = this.tx[best];
    const tz = this.tz[best];
    const along = (x - this.px[best]) * tx + (z - this.pz[best]) * tz;
    let i0: number;
    let t: number;
    if (along >= 0) {
      i0 = best;
      t = clamp(along / this.ds, 0, 1);
    } else {
      i0 = (best - 1 + n) % n;
      t = clamp(1 + along / this.ds, 0, 1);
    }
    const i1 = (i0 + 1) % n;
    const cx = lerp(this.px[i0], this.px[i1], t);
    const cz = lerp(this.pz[i0], this.pz[i1], t);
    let ttx = lerp(this.tx[i0], this.tx[i1], t);
    let ttz = lerp(this.tz[i0], this.tz[i1], t);
    const l = Math.hypot(ttx, ttz) || 1;
    ttx /= l;
    ttz /= l;
    // derecha = (-tz, tx)
    out.lat = (x - cx) * -ttz + (z - cz) * ttx;
    out.idx = best;
    out.s = (i0 + t) * this.ds;
    out.y = lerp(this.py[i0], this.py[i1], t);
    out.hw = lerp(this.hw[i0], this.hw[i1], t);
    out.limL = out.hw + lerp(this.runL[i0], this.runL[i1], t);
    out.limR = out.hw + lerp(this.runR[i0], this.runR[i1], t);
    out.tx = ttx;
    out.tz = ttz;
    return out;
  }

  /** Posición de parrilla (0 = pole). Devuelve s (puede ser negativo) y lat. */
  gridSlot(i: number): { s: number; lat: number } {
    const hw = this.hw[this.index(-8)];
    const lat = Math.min(2.4, hw - 1.4) * (i % 2 === 0 ? -1 : 1);
    return { s: -9 - i * 6.2, lat };
  }
}

function smoothInto(src: Float32Array, dst: Float32Array, radius: number): void {
  const n = src.length;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -radius; j <= radius; j++) acc += src[(i + j + n) % n];
    dst[i] = acc / (2 * radius + 1);
  }
}

/** Filtro de mínimo seguido de suavizado (mantiene el límite). */
function minSmooth(arr: Float32Array, radius: number): void {
  const n = arr.length;
  const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = -radius; j <= radius; j++) m = Math.min(m, arr[(i + j + n) % n]);
    tmp[i] = m;
  }
  smoothInto(tmp, arr, radius);
  for (let i = 0; i < n; i++) arr[i] = Math.min(arr[i], tmp[i] + 0.3);
}
