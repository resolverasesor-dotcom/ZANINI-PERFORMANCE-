import { clamp, damp, sign, wrapAngle } from '../core/math';
import { KERB_WIDTH, makeProj, type Track, type TrackProj } from '../track/Track';

export interface KartInput {
  throttle: number;
  brake: number;
  /** -1 izquierda … 1 derecha */
  steer: number;
  /** "Saltito": el piloto descarga peso desde el asiento para liberar el eje trasero. */
  hop: boolean;
}

export function emptyInput(): KartInput {
  return { throttle: 0, brake: 0, steer: 0, hop: false };
}

/**
 * Parámetros físicos de un kart de competición 125 cc con piloto (unidades SI).
 * Modelo "bicicleta" con neumáticos de fórmula mágica simplificada, transferencia
 * de carga longitudinal, eje trasero rígido y motor limitado por potencia.
 */
export const KART = {
  /** Velocidad punta (limitador de vueltas del motor), m/s. */
  vmax: 30,
  mass: 165,
  /** Momento de inercia en guiñada (kg·m²). */
  Iz: 58,
  /** Distancia del centro de gravedad al eje delantero / trasero (m). Batalla 1,04 m. */
  a: 0.58,
  b: 0.46,
  /** Altura del centro de gravedad (m). */
  h: 0.22,
  /** Vía trasera (m). */
  track: 1.2,
  /** Coeficiente de agarre de los slicks. */
  mu: 1.75,
  /** Curva del neumático: pico de fuerza a ~6° de deriva y 0,88 al deslizar. */
  tyreB: 22,
  tyreC: 1.35,
  /** Trasero: algo más de agarre y caída más suave tras el pico (kart estable). */
  muRear: 1.06,
  /** Sensibilidad del agarre a la carga vertical. */
  loadSens: 0.3,
  tyreCRear: 1.12,
  /** Potencia útil en rueda (W) y fuerza máxima de tracción (N). */
  power: 15500,
  fMax: 1150,
  /** Resistencias: aerodinámica (½·ρ·Cd·A), rodadura y freno motor (transmisión directa). */
  dragK: 0.36,
  crr: 0.018,
  engineBrake: 60,
  engineBrakeV: 2.2,
  /** Freno: deceleración pedida con el pedal a fondo y reparto delante. */
  brakeDecel: 11.5,
  brakeFront: 0.6,
  /** Ángulo máximo de dirección a baja velocidad (rad). */
  steerMax: 0.42,
  /** Arrastre del eje rígido en curva (fracción del peso trasero). */
  scrub: 0.55,
  /** Amortiguación de guiñada del chasis y el eje rígido (N·m·s/rad). */
  yawDamp: 60,
  reverseMax: 7,
  radius: 0.95,
  /** Barrera de neumáticos: rebote y fricción en el contacto. */
  wallRestitution: 0.3,
  wallFriction: 0.45,
  /** Saltito: duración, recarga y ganancia de tracción. */
  hopTime: 0.3,
  hopCool: 0.7,
  hopGain: 0.28,
  /** Valores derivados para la IA y la línea de carrera. */
  aLat: 15.5,
  R0: 2.5,
};

/** Valores originales (150cc) para poder cambiar de cilindrada entre sesiones. */
const KART_BASE = { vmax: KART.vmax, power: KART.power, fMax: KART.fMax };

/** Aplica una cilindrada: factor de velocidad punta y de aceleración. */
export function setKartClass(vmaxFactor: number, accelFactor: number): void {
  KART.vmax = KART_BASE.vmax * vmaxFactor;
  KART.power = KART_BASE.power * accelFactor * vmaxFactor;
  KART.fMax = KART_BASE.fMax * accelFactor;
}

export type SurfaceKind = 'track' | 'kerb' | 'grass' | 'gravel' | 'sand' | 'asphalt';

/**
 * Por superficie: agarre relativo, rodadura extra (fracción del peso) y frenado
 * proporcional a la velocidad (hierba que se hunde, grava que "traga" el kart).
 * La hierba apenas frena, lo que castiga es que no agarra; la grava sí para el kart.
 */
const SURF: Record<SurfaceKind, { grip: number; crr: number; vK: number }> = {
  track: { grip: 1, crr: 0, vK: 0 },
  kerb: { grip: 0.93, crr: 0.01, vK: 0.005 },
  asphalt: { grip: 0.9, crr: 0.005, vK: 0.005 },
  grass: { grip: 0.55, crr: 0.08, vK: 0.04 },
  sand: { grip: 0.48, crr: 0.3, vK: 0.12 },
  gravel: { grip: 0.45, crr: 0.35, vK: 0.15 },
};

/** Fuerza lateral normalizada del neumático para un ángulo de deriva (−1…1, pico ≈ 1). */
export function tyreCurve(alpha: number, c = KART.tyreC): number {
  return Math.sin(c * Math.atan(KART.tyreB * alpha));
}

/** Ángulo de deriva del pico de agarre (rad). */
export const ALPHA_PEAK = Math.tan(Math.PI / (2 * KART.tyreC)) / KART.tyreB;

/**
 * Ángulo de dirección máximo disponible a una velocidad (dirección progresiva):
 * el volante a fondo pide un poco más que la curva de máximo agarre, nunca un
 * disparate que haga barrer las cuatro ruedas (en un kart real a 80 km/h las
 * ruedas apenas giran 2–3°).
 */
export function steerLimit(v: number): number {
  const u = Math.max(Math.abs(v), 1);
  const L = KART.a + KART.b;
  return Math.min(KART.steerMax, (L * KART.aLat * 1.25) / (u * u) + 0.012);
}

/**
 * Dirección (−1…1) necesaria para describir en régimen estacionario una curva de
 * curvatura k (positiva = derecha) a velocidad v. Con el reparto de pesos del kart
 * ambos ejes trabajan a la misma fracción de agarre, así que es casi neutro:
 * basta el ángulo geométrico (Ackermann) más un pequeño margen.
 */
export function steadySteer(k: number, v: number): number {
  const L = KART.a + KART.b;
  return clamp((Math.atan(L * k) * 1.05) / steerLimit(v), -1.5, 1.5);
}

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

export type KartEvent = 'hop' | 'slideStart';

const SUBSTEPS = 4;

/**
 * Física de un kart en 2.5D: el movimiento es en el plano XZ y la altura la marca
 * la pista. Integra un modelo de bicicleta (dos ejes) con neumáticos no lineales a
 * 4 subpasos por paso de 120 Hz. El derrape no es un botón: aparece solo cuando un
 * eje supera su agarre (entrar pasado, frenar girando, levantar o pisar a destiempo).
 */
export class Kart {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  /** Velocidad de guiñada (rad/s), positiva = girando a la derecha. */
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
  /** Velocidad lateral (m/s), positiva = hacia la derecha. */
  vL = 0;

  /** Deslizando (eje trasero más allá del pico de agarre): derrape natural. */
  drifting = false;
  /** Sentido del derrape: 1 = curva a derechas. */
  driftDir = 0;
  /** Ángulo de deriva del eje trasero (rad) y del delantero, para sonido y efectos. */
  slipRear = 0;
  slipFront = 0;
  /** Fracción de tracción perdida por el arrastre del eje rígido (0…1). */
  bog = 0;
  /** Rebufo 0..1 (lo calcula el mundo). */
  slip = 0;
  /** Segundos sin colisiones con otros karts (tras reaparecer). */
  ghost = 0;
  /** Impacto contra muro en el último paso (m/s). */
  wallImpact = 0;
  kartImpact = 0;
  /** Se mantiene por compatibilidad con la repetición: la deriva ya es física. */
  driftVisual = 0;
  /** Temporizador visual del saltito del piloto. */
  hop = 0;
  /** Tiempo restante del efecto del saltito y de su recarga. */
  hopActive = 0;
  hopCool = 0;
  rumble = 0;
  throttleVisual = 0;
  /** Para sonido/partículas. */
  events: KartEvent[] = [];
  private hopHeld = false;
  /** Aceleración longitudinal filtrada (transferencia de carga y cabeceo visual). */
  ax = 0;
  /** Ángulo real de las ruedas delanteras (rad, positivo = derecha). */
  wheelAngle = 0;

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
    this.ax = 0;
    this.drifting = false;
    this.hopActive = this.hopCool = 0;
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

    const surf = SURF[this.surface];
    const thr = clamp(inp.throttle, 0, 1);
    const brk = clamp(inp.brake, 0, 1);

    // --- Dirección (cremallera rápida; vuelve sola al centro por el avance de pivote) ---
    const steerRate = Math.abs(inp.steer) > Math.abs(this.steer) ? 10 : 14;
    this.steer = damp(this.steer, clamp(inp.steer, -1, 1), steerRate, dt);

    // --- Saltito ---
    const hopPressed = inp.hop && !this.hopHeld;
    this.hopHeld = inp.hop;
    if (hopPressed && this.hopCool <= 0 && this.vF > 2) {
      this.hopActive = KART.hopTime;
      this.hopCool = KART.hopCool;
      this.hop = 0.16;
      this.events.push('hop');
    }

    // --- Pendiente ---
    const i0 = this.proj.idx;
    const i1 = (i0 + 1) % track.n;
    const slope = (track.py[i1] - track.py[i0]) / track.ds;

    const h = dt / SUBSTEPS;
    const m = KART.mass;
    const g = 9.81;
    const L = KART.a + KART.b;
    const wasSliding = this.drifting;
    let slideAcc = 0;
    let bogAcc = 0;
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // Velocidades en ejes del kart. Internamente: y hacia la IZQUIERDA y w antihorario.
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      let u = this.vx * fx + this.vz * fz;
      let vy = -(this.vx * -fz + this.vz * fx);
      let w = -this.yawRate;
      const au = Math.abs(u);

      // Ángulo de las ruedas: dirección progresiva con la velocidad. Al contravolantear
      // un derrape hay recorrido extra para alinear las ruedas con la trayectoria.
      let lim = steerLimit(u);
      if (this.steer * this.yawRate < 0 && au > 3) lim += Math.min(0.4, Math.abs(Math.atan2(vy, au)) * 1.1);
      const delta = -this.steer * lim;

      // Cargas por eje con transferencia longitudinal
      const dFz = (m * this.ax * KART.h) / L;
      const FzF = Math.max(80, (m * g * KART.b) / L - dFz);
      const FzR = Math.max(80, (m * g * KART.a) / L + dFz);
      // Sensibilidad a la carga: un neumático más cargado agarra proporcionalmente menos
      const FzF0 = (m * g * KART.b) / L;
      const FzR0 = (m * g * KART.a) / L;
      let muR = KART.mu * KART.muRear * surf.grip * clamp(1 - KART.loadSens * (FzR / FzR0 - 1), 0.7, 1.25);
      const muF = KART.mu * surf.grip * clamp(1 - KART.loadSens * (FzF / FzF0 - 1), 0.7, 1.25);
      // Al despegar del asiento la zaga se descarga un instante
      if (this.hopActive > KART.hopTime - 0.12) muR *= 0.86;

      // --- Fuerzas longitudinales ---
      const vmaxEff = KART.vmax * (1 + 0.06 * this.slip);
      let drive = 0;
      if (thr > 0.02) {
        if (u < -0.3) drive = m * KART.brakeDecel * 0.6 * thr; // frenar la marcha atrás
        else {
          drive = Math.min(KART.fMax, KART.power / Math.max(au, 1)) * thr;
          // limitador de vueltas
          drive *= clamp((vmaxEff - u) / 1.2, 0, 1);
          // El saltito ayuda sobre todo cuando el eje rígido está "clavado" en curva
          if (this.hopActive > 0 && thr > 0.5 && u < vmaxEff * 0.9) drive *= 1 + KART.hopGain * clamp(this.bog / 0.25, 0.2, 1);
        }
      }
      let brakeF = 0;
      let brakeR = 0;
      let reverse = 0;
      if (brk > 0.02) {
        if (u > 0.3) {
          const want = m * KART.brakeDecel * brk;
          brakeF = Math.min(want * KART.brakeFront, 0.97 * muF * FzF);
          // El trasero no llega a bloquear del todo (el piloto modula): deja agarre lateral
          brakeR = Math.min(want * (1 - KART.brakeFront), (0.7 - 0.35 * Math.abs(this.steer)) * muR * FzR);
        } else if (thr < 0.1 && u > -KART.reverseMax) reverse = -420 * brk;
      }
      // Eje trasero: tracción/frenada limitada por el círculo de fricción
      const capR = muR * FzR;
      let FxR = clamp(drive + reverse - brakeR, -0.98 * capR, 0.98 * capR);
      const FyRcap = Math.sqrt(Math.max(0, capR * capR - FxR * FxR));
      const FyFcap = Math.sqrt(Math.max(0, (muF * FzF) ** 2 - brakeF * brakeF));

      // --- Fuerzas laterales (ángulos de deriva) ---
      const uu = Math.max(au, 0.5);
      const alphaF = delta - Math.atan2(vy + KART.a * w, uu);
      const alphaR = -Math.atan2(vy - KART.b * w, uu);
      // Por debajo de ~1 m/s el neumático no puede generar fuerza lateral apreciable
      // (sin esto, un kart parado con las ruedas giradas "se empujaría" solo)
      const fade = clamp(Math.hypot(u, vy) / 1.2, 0, 1);
      const FyF = FyFcap * tyreCurve(alphaF) * fade;
      const FyR = FyRcap * tyreCurve(alphaR, KART.tyreCRear) * fade;
      this.wheelAngle = -delta;
      this.slipFront = alphaF;
      this.slipRear = alphaR;

      // Arrastre del eje rígido: la rueda interior tiene que patinar en curva
      const scrubSlip = (Math.abs(w) * KART.track) / Math.max(au, 3);
      let bog = clamp(scrubSlip * 5, 0, 0.6);
      if (this.hopActive > 0) bog *= 0.2;
      const scrubF = KART.scrub * FzR * surf.grip * bog;
      bogAcc += bog;

      // Resistencias (siempre contra el avance)
      const rollF = (KART.crr + surf.crr) * m * g + surf.vK * m * au;
      const aeroF = KART.dragK * (1 - 0.4 * this.slip) * u * u;
      const engF = thr < 0.05 && u > 0 ? KART.engineBrake + KART.engineBrakeV * u : 0;
      const resist = (rollF + aeroF + engF + scrubF) * sign(u);
      const gravity = -m * g * slope * (fx * this.proj.tx + fz * this.proj.tz);
      // freno de la rueda delantera en la dirección de la rueda
      const FxF = -brakeF * sign(u);

      const Fx = FxR + FxF * Math.cos(delta) - FyF * Math.sin(delta) - resist + gravity;
      const Fy = FyR + FyF * Math.cos(delta) + FxF * Math.sin(delta);
      // El eje rígido arrastra la rueda interior: par que se opone al giro
      const axleM = -sign(w) * scrubF * KART.track * 0.5 - w * KART.yawDamp;
      const Mz = KART.a * (FyF * Math.cos(delta) + FxF * Math.sin(delta)) - KART.b * FyR + axleM;

      const uPrev = u;
      const axForce = Fx / m;
      u += (Fx / m + vy * w) * h;
      vy += (Fy / m - u * w) * h;
      w += (Mz / KART.Iz) * h;
      // El rozamiento no invierte el sentido de la marcha
      if (thr <= 0.02 && reverse === 0 && uPrev !== 0 && sign(u) !== sign(uPrev)) u = 0;
      if (brk > 0.02 && uPrev > 0 && u < 0) u = 0;

      // A baja velocidad, mezcla con el modelo cinemático (estable al arrancar y maniobrar)
      const kb = clamp((Math.hypot(u, vy) - 1.5) / 3.5, 0, 1);
      if (kb < 1) {
        const wk = (u * Math.tan(delta)) / L;
        const vyk = KART.b * wk;
        w = wk + (w - wk) * kb;
        vy = vyk + (vy - vyk) * kb;
      }

      // Rozamiento estático: parado y sin gas, el kart no se mueve (ni gira sobre sí mismo)
      if (thr <= 0.02 && reverse === 0 && Math.hypot(u, vy) < 0.25 && Math.abs(gravity) < KART.crr * m * g * 3) {
        u = 0;
        vy = 0;
        w = 0;
      }
      this.ax = this.ax + (axForce - this.ax) * Math.min(1, h * 25);
      this.yaw = wrapAngle(this.yaw + w * h);
      const nfx = Math.sin(this.yaw);
      const nfz = Math.cos(this.yaw);
      // izquierda = (cos yaw, −sin yaw)
      this.vx = nfx * u + nfz * vy;
      this.vz = nfz * u - nfx * vy;
      this.yawRate = -w;
      this.x += this.vx * h;
      this.z += this.vz * h;
      this.vF = u;
      this.vL = -vy;
      if (Math.abs(alphaR) > ALPHA_PEAK * 1.3 && au > 6) slideAcc++;
    }
    this.bog = bogAcc / SUBSTEPS;
    this.drifting = slideAcc >= SUBSTEPS / 2;
    if (this.drifting) {
      this.driftDir = sign(this.yawRate) || this.driftDir;
      if (!wasSliding) this.events.push('slideStart');
    }

    if (this.hopActive > 0) this.hopActive -= dt;
    if (this.hopCool > 0) this.hopCool -= dt;

    this.collideTrack(track, dt);

    this.driftVisual = 0;
    this.hop = Math.max(0, this.hop - dt);
    this.throttleVisual = damp(this.throttleVisual, thr, 10, dt);
  }

  /**
   * Superficie, altura y choque contra la barrera. El contacto se resuelve en la
   * esquina del kart que toca (paragolpes o rueda), con impulso, restitución de
   * neumático y fricción: un golpe de refilón hace girar el kart como en la realidad.
   */
  collideTrack(track: Track, _dt: number): void {
    const p = track.project(this.x, this.z, this.proj.idx, this.proj);
    const trx = -p.tz;
    const trz = p.tx;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let pen = 0;
    let side = 0;
    let ox = 0;
    let oz = 0;
    for (const [lf, lr] of CORNERS) {
      const cx = fx * lf - fz * lr;
      const cz = fz * lf + fx * lr;
      const clat = p.lat + cx * trx + cz * trz;
      const pr = clat - p.limR;
      const pl = -p.limL - clat;
      if (pr > pen) {
        pen = pr;
        side = 1;
        ox = cx;
        oz = cz;
      }
      if (pl > pen) {
        pen = pl;
        side = -1;
        ox = cx;
        oz = cz;
      }
    }
    if (pen > 0) {
      const nx = side * trx;
      const nz = side * trz;
      this.x -= nx * pen;
      this.z -= nz * pen;
      const res = applyImpulse(this, null, ox, oz, 0, 0, nx, nz, KART.wallRestitution, KART.wallFriction);
      if (res > 0) this.wallImpact = res;
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

/** Huella del kart para los choques: (adelante, derecha) en metros. */
const CORNERS: [number, number][] = [
  [0.95, 0.6],
  [0.95, -0.6],
  [-0.9, 0.68],
  [-0.9, -0.68],
];
/** Contorno para choques entre karts: dos círculos (morro y zaga). */
const BODY_R = 0.66;
const BODY_C = [0.3, -0.3];

/**
 * Impulso en un punto de contacto entre el kart a y (opcionalmente) el kart b.
 * (rax, raz) y (rbx, rbz) son los brazos desde cada centro de gravedad; n apunta de
 * a hacia el obstáculo. Devuelve la velocidad de impacto (m/s) o 0 si se separaban.
 */
function applyImpulse(a: Kart, b: Kart | null, rax: number, raz: number, rbx: number, rbz: number, nx: number, nz: number, e: number, mu: number): number {
  const m = KART.mass;
  const I = KART.Iz;
  // velocidad angular antihoraria (la guiñada del kart es positiva a la derecha)
  const wa = -a.yawRate;
  const wb = b ? -b.yawRate : 0;
  // velocidad de un punto: v + w·(rz, −rx)
  let rvx = a.vx + wa * raz;
  let rvz = a.vz - wa * rax;
  if (b) {
    rvx -= b.vx + wb * rbz;
    rvz -= b.vz - wb * rbx;
  }
  const vn = rvx * nx + rvz * nz;
  if (vn <= 0) return 0;
  const cross = (rx: number, rz: number, jx: number, jz: number) => jx * rz - jz * rx;
  const ka = 1 / m + cross(rax, raz, nx, nz) ** 2 / I;
  const kb = b ? 1 / m + cross(rbx, rbz, nx, nz) ** 2 / I : 0;
  const j = ((1 + e) * vn) / (ka + kb);
  let jx = -j * nx;
  let jz = -j * nz;
  // Fricción tangencial (limitada por Coulomb)
  const tx = rvx - vn * nx;
  const tz = rvz - vn * nz;
  const vt = Math.hypot(tx, tz);
  if (vt > 1e-4) {
    const ux = tx / vt;
    const uz = tz / vt;
    const kta = 1 / m + cross(rax, raz, ux, uz) ** 2 / I;
    const ktb = b ? 1 / m + cross(rbx, rbz, ux, uz) ** 2 / I : 0;
    const jt = Math.min(mu * j, vt / (kta + ktb));
    jx -= jt * ux;
    jz -= jt * uz;
  }
  a.vx += jx / m;
  a.vz += jz / m;
  a.yawRate -= cross(rax, raz, jx, jz) / I;
  if (b) {
    b.vx -= jx / m;
    b.vz -= jz / m;
    b.yawRate += cross(rbx, rbz, jx, jz) / I;
  }
  return vn;
}

/**
 * Colisiones kart-kart con dos círculos por kart: empuje para separarlos e impulso
 * en el punto de contacto (un toque en la zaga hace girar al de delante).
 */
export function collideKarts(karts: Kart[]): void {
  for (const k of karts) k.kartImpact = 0;
  const R2 = BODY_R * 2;
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    if (a.ghost > 0) continue;
    const afx = Math.sin(a.yaw);
    const afz = Math.cos(a.yaw);
    for (let j = i + 1; j < karts.length; j++) {
      const b = karts[j];
      if (b.ghost > 0) continue;
      if (Math.abs(a.y - b.y) > 1.8) continue;
      const dcx = b.x - a.x;
      const dcz = b.z - a.z;
      if (dcx * dcx + dcz * dcz > 9) continue;
      const bfx = Math.sin(b.yaw);
      const bfz = Math.cos(b.yaw);
      // par de círculos más metido
      let best = 0;
      let nx = 0;
      let nz = 0;
      let pax = 0;
      let paz = 0;
      for (const ca of BODY_C) {
        const ax = a.x + afx * ca;
        const az = a.z + afz * ca;
        for (const cb of BODY_C) {
          const bx = b.x + bfx * cb;
          const bz = b.z + bfz * cb;
          const dx = bx - ax;
          const dz = bz - az;
          const d = Math.hypot(dx, dz);
          const pen = R2 - d;
          if (pen > best && d > 1e-6) {
            best = pen;
            nx = dx / d;
            nz = dz / d;
            pax = ax + nx * BODY_R;
            paz = az + nz * BODY_R;
          }
        }
      }
      if (best <= 0) continue;
      a.x -= nx * best * 0.5;
      a.z -= nz * best * 0.5;
      b.x += nx * best * 0.5;
      b.z += nz * best * 0.5;
      const v = applyImpulse(a, b, pax - a.x, paz - a.z, pax - b.x, paz - b.z, nx, nz, 0.25, 0.3);
      a.kartImpact = Math.max(a.kartImpact, v);
      b.kartImpact = Math.max(b.kartImpact, v);
    }
  }
}
