import { clamp, damp, sign, wrapAngle } from '../core/math';
import { KERB_WIDTH, makeProj, type Track, type TrackProj } from '../track/Track';

export interface KartInput {
  throttle: number;
  brake: number;
  /** -1 izquierda … 1 derecha */
  steer: number;
  drift: boolean;
}

export function emptyInput(): KartInput {
  return { throttle: 0, brake: 0, steer: 0, drift: false };
}

/** Parámetros del kart (arcade, ajustados para que sea divertido). */
export const KART = {
  vmax: 30, // m/s (108 km/h)
  accel: 13,
  brake: 26,
  reverseMax: 7,
  coast: 1.4,
  /** Radio mínimo de giro a velocidad ~0 y aceleración lateral máxima. */
  R0: 2.6,
  aLat: 15,
  grip: 9,
  driftGrip: 2.4,
  driftTurn: 1.25,
  boostAccel: 9,
  boostVmax: 1.2,
  slipVmax: 0.08,
  radius: 0.95,
  wallRadius: 0.8,
  driftLevel1: 0.95,
  driftLevel2: 2.05,
};

export type SurfaceKind = 'track' | 'kerb' | 'grass' | 'gravel' | 'sand' | 'asphalt';

const SURF: Record<SurfaceKind, { grip: number; drag: number; vmax: number }> = {
  track: { grip: 1, drag: 0, vmax: 1 },
  kerb: { grip: 0.96, drag: 0.6, vmax: 0.985 },
  asphalt: { grip: 0.92, drag: 0.8, vmax: 0.93 },
  grass: { grip: 0.6, drag: 6, vmax: 0.55 },
  sand: { grip: 0.52, drag: 8, vmax: 0.48 },
  gravel: { grip: 0.48, drag: 10, vmax: 0.42 },
};

/** Velocidad angular máxima de giro (rad/s) a una velocidad dada. */
export function maxYawRate(v: number): number {
  const a = Math.abs(v);
  return a / (KART.R0 + (a * a) / KART.aLat);
}

/** Velocidad máxima a la que se puede trazar una curvatura k sin derrapar. */
export function cornerSpeed(k: number, margin = 0.92): number {
  const ak = Math.abs(k);
  if (ak < 1e-5) return KART.vmax;
  const v2 = KART.aLat * (margin / ak - KART.R0);
  return v2 <= 16 ? 4 : Math.min(KART.vmax, Math.sqrt(v2));
}

export type KartEvent = 'boost1' | 'boost2' | 'driftLevel1' | 'driftLevel2' | 'driftStart';

/**
 * Física arcade de un kart en 2.5D: el movimiento es en el plano XZ y la altura
 * la marca la pista. Estable a 120 Hz.
 */
export class Kart {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  yawRate = 0;
  steer = 0;
  // Estado previo para interpolar el render.
  px = 0;
  py = 0;
  pz = 0;
  pyaw = 0;

  readonly proj: TrackProj = makeProj();
  surface: SurfaceKind = 'track';
  /** Velocidad longitudinal (m/s, con signo). */
  vF = 0;
  vL = 0;

  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  driftLevel = 0;
  boostTime = 0;
  boostLevel = 0;
  /** Rebufo 0..1 (lo calcula el mundo). */
  slip = 0;
  /** Segundos sin colisiones con otros karts (tras reaparecer). */
  ghost = 0;
  /** Impacto contra muro en el último paso (m/s). */
  wallImpact = 0;
  kartImpact = 0;
  /** Ángulo visual extra del derrape. */
  driftVisual = 0;
  hop = 0;
  rumble = 0;
  throttleVisual = 0;
  /** Para sonido/partículas. */
  events: KartEvent[] = [];
  private driftHeld = false;
  private driftKick = 0;
  /** Freno de mano activo (botón de derrape pulsado sin entrar en derrape). */
  handbrake = false;

  setPose(track: Track, s: number, lat: number): void {
    const p = { x: 0, y: 0, z: 0 };
    track.pointAt(s, lat, p);
    this.x = this.px = p.x;
    this.z = this.pz = p.z;
    this.y = this.py = p.y;
    this.yaw = this.pyaw = track.headingAt(s);
    this.vx = this.vz = 0;
    this.yawRate = 0;
    this.vF = this.vL = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.boostTime = 0;
    this.steer = 0;
    track.projectGlobal(p.x, p.z, p.y, this.proj);
  }

  respawn(track: Track): void {
    const s = this.proj.s;
    const lat = clamp(track.sample(track.lineOffset, s), -2, 2);
    this.setPose(track, s, lat);
    this.ghost = 2;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  savePrev(): void {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.pyaw = this.yaw;
  }

  step(dt: number, inp: KartInput, track: Track): void {
    this.events.length = 0;
    this.wallImpact = 0;
    if (this.ghost > 0) this.ghost -= dt;

    const vF0 = this.vF;

    const surf = SURF[this.surface];
    const offroad = this.surface !== 'track' && this.surface !== 'kerb';

    // --- Dirección ---
    const steerRate = Math.abs(inp.steer) > Math.abs(this.steer) ? 9 : 14;
    this.steer = damp(this.steer, clamp(inp.steer, -1, 1), steerRate, dt);

    // --- Derrape ---
    const driftPressed = inp.drift && !this.driftHeld;
    this.driftHeld = inp.drift;
    if (!this.drifting && inp.drift && Math.abs(this.steer) > 0.3 && vF0 > 9 && !offroad && (driftPressed || this.hop <= 0)) {
      this.drifting = true;
      this.driftDir = sign(this.steer);
      this.driftCharge = 0;
      this.driftLevel = 0;
      this.hop = 0.16;
      this.driftKick = 0.2;
      this.events.push('driftStart');
    }
    if (this.drifting) {
      const into = Math.max(0, this.steer * this.driftDir);
      if (!offroad) this.driftCharge += dt * (0.7 + 0.65 * into);
      const lvl = this.driftCharge > KART.driftLevel2 ? 2 : this.driftCharge > KART.driftLevel1 ? 1 : 0;
      if (lvl > this.driftLevel) {
        this.driftLevel = lvl;
        this.events.push(lvl === 2 ? 'driftLevel2' : 'driftLevel1');
      }
      if (!inp.drift || vF0 < 7 || offroad) {
        if (this.driftLevel > 0 && !offroad && vF0 > 5) {
          this.boostLevel = this.driftLevel;
          this.boostTime = this.driftLevel === 2 ? 1.25 : 0.6;
          this.events.push(this.driftLevel === 2 ? 'boost2' : 'boost1');
        }
        this.drifting = false;
        this.driftLevel = 0;
        this.driftCharge = 0;
      }
    }

    // Freno de mano sin derrape (botón pulsado sin girar lo bastante): frena las
    // ruedas traseras, la zaga pierde agarre y el kart rota algo más al girar.
    this.handbrake = inp.drift && !this.drifting && vF0 > 3;

    // --- Giro ---
    const wMax = maxYawRate(vF0) * (0.55 + 0.45 * surf.grip);
    let turn: number;
    if (this.drifting) {
      turn = this.driftDir * wMax * KART.driftTurn * (1 + 0.5 * this.steer * this.driftDir);
      // Golpe de volante al iniciar el derrape: el morro entra en la curva al instante
      if (this.driftKick > 0) {
        turn *= 1.45;
        this.driftKick -= dt;
      }
    } else {
      turn = this.steer * wMax * (vF0 < -0.3 ? -1 : 1) * (this.handbrake ? 1.3 : 1);
    }
    this.yawRate = damp(this.yawRate, turn, this.drifting ? 7 : 16, dt);
    this.yaw = wrapAngle(this.yaw - this.yawRate * dt);

    // Descomponer la velocidad (fija en el mundo) en los ejes NUEVOS del kart:
    // al girar, aparece velocidad lateral que el agarre va absorbiendo (derrape natural).
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;

    // --- Motor y frenos ---
    const boosting = this.boostTime > 0;
    let vmaxEff = KART.vmax * surf.vmax * (1 + KART.slipVmax * this.slip);
    if (boosting) vmaxEff *= KART.boostVmax;
    let acc = 0;
    const thr = clamp(inp.throttle, 0, 1);
    const brk = clamp(inp.brake, 0, 1);
    if (brk > 0.05 && vF > 0.4) {
      acc -= KART.brake * brk;
    } else if (brk > 0.05 && thr < 0.1) {
      // marcha atrás
      if (vF > -KART.reverseMax) acc -= 6 * brk;
    }
    if (thr > 0.05) {
      if (vF < -0.4) acc += KART.brake * thr;
      else {
        const r = vF / vmaxEff;
        acc += (KART.accel + (boosting ? KART.boostAccel : 0) + this.slip * 1.5) * thr * Math.max(0, 1 - r * r);
      }
    } else if (brk <= 0.05) {
      acc -= KART.coast * sign(vF) + 0.004 * vF * Math.abs(vF);
    }
    if (vF > vmaxEff) acc -= (vF - vmaxEff) * 1.6;
    acc -= surf.drag * (Math.abs(vF) / KART.vmax) * sign(vF);
    if (this.drifting) acc -= 0.7;
    if (this.handbrake) acc -= 7;
    // Pendiente
    const i0 = this.proj.idx;
    const i1 = (i0 + 1) % track.n;
    const slope = (track.py[i1] - track.py[i0]) / track.ds;
    const along = fx * this.proj.tx + fz * this.proj.tz;
    acc -= 9.8 * 0.6 * slope * along * sign(vF || 1);
    const vFprev = vF;
    vF += acc * dt;
    // evitar que el freno/rozamiento invierta el sentido
    if (thr <= 0.05 && brk <= 0.05 && sign(vF) !== sign(vFprev) && vFprev !== 0) vF = 0;
    if (brk > 0.05 && vFprev > 0 && vF < 0) vF = 0;

    // --- Agarre lateral ---
    const gripRate = (this.drifting ? KART.driftGrip : this.handbrake ? KART.grip * 0.4 : KART.grip) * surf.grip;
    const newVL = vL * Math.exp(-gripRate * dt);
    const lost = Math.abs(vL) - Math.abs(newVL);
    if (vF > 1) vF += lost * (this.drifting ? 0.72 : 0.45);
    vL = newVL;

    this.vx = fx * vF + rx * vL;
    this.vz = fz * vF + rz * vL;
    this.vF = vF;
    this.vL = vL;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    if (this.boostTime > 0) this.boostTime -= dt;

    this.collideTrack(track, dt);

    // Visual
    // Ángulo visual del chasis: el morro apunta HACIA DENTRO de la curva.
    // (yaw positivo = giro a la izquierda, por eso el signo negativo)
    const visTarget = this.drifting ? -this.driftDir * 0.22 : this.handbrake ? -this.steer * 0.12 : 0;
    this.driftVisual = damp(this.driftVisual, visTarget, 8, dt);
    this.hop = Math.max(0, this.hop - dt);
    this.throttleVisual = damp(this.throttleVisual, thr, 10, dt);
  }

  /** Superficie, altura y rebote contra muros. */
  collideTrack(track: Track, dt: number): void {
    const p = track.project(this.x, this.z, this.proj.idx, this.proj);
    const rx = -p.tz;
    const rz = p.tx;
    const R = KART.wallRadius;
    let pen = 0;
    let nx = 0;
    let nz = 0;
    if (p.lat > p.limR - R) {
      pen = p.lat - (p.limR - R);
      nx = rx;
      nz = rz;
    } else if (p.lat < -(p.limL - R)) {
      pen = -(p.limL - R) - p.lat;
      nx = -rx;
      nz = -rz;
    }
    if (pen > 0) {
      this.x -= nx * pen;
      this.z -= nz * pen;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.wallImpact = vn;
        const e = 0.35;
        this.vx -= nx * vn * (1 + e);
        this.vz -= nz * vn * (1 + e);
        const scrub = 1 - Math.min(0.45, vn * 0.035);
        this.vx *= scrub;
        this.vz *= scrub;
        if (vn > 5 && this.drifting) {
          this.drifting = false;
          this.driftLevel = 0;
          this.driftCharge = 0;
        }
      }
      // Girar el morro para alinearlo con el muro y evitar quedarse clavado.
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const into = fx * nx + fz * nz;
      if (into > 0.05) {
        const dir = fx * p.tx + fz * p.tz >= 0 ? 1 : -1;
        const target = Math.atan2(p.tx * dir, p.tz * dir);
        const d = wrapAngle(target - this.yaw);
        this.yaw = wrapAngle(this.yaw + d * Math.min(1, 6 * dt));
      }
      track.project(this.x, this.z, p.idx, p);
    }
    this.y = p.y;
    const a = Math.abs(p.lat);
    const idx = p.idx;
    if (a <= p.hw + 0.3) this.surface = 'track';
    else if (a <= p.hw + KERB_WIDTH && track.kerb[idx]) this.surface = 'kerb';
    else if (a <= p.hw + 0.6) this.surface = 'track';
    else this.surface = track.surface;
    this.rumble = this.surface === 'kerb' ? 1 : this.surface === 'track' || this.surface === 'asphalt' ? 0 : 0.6;
  }
}

/** Colisiones kart-kart: círculos con empuje y restitución. */
export function collideKarts(karts: Kart[]): void {
  const R2 = KART.radius * 2;
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    a.kartImpact = 0;
  }
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    if (a.ghost > 0) continue;
    for (let j = i + 1; j < karts.length; j++) {
      const b = karts[j];
      if (b.ghost > 0) continue;
      if (Math.abs(a.y - b.y) > 1.8) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R2 * R2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      dx /= d;
      dz /= d;
      const pen = R2 - d;
      a.x -= dx * pen * 0.5;
      a.z -= dz * pen * 0.5;
      b.x += dx * pen * 0.5;
      b.z += dz * pen * 0.5;
      const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;
      if (rv < 0) {
        const e = 0.3;
        const jimp = (-(1 + e) * rv) / 2;
        a.vx -= dx * jimp;
        a.vz -= dz * jimp;
        b.vx += dx * jimp;
        b.vz += dz * jimp;
        a.kartImpact = Math.max(a.kartImpact, -rv);
        b.kartImpact = Math.max(b.kartImpact, -rv);
      }
    }
  }
}
