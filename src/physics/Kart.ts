import { clamp, damp, sign, wrapAngle } from '../core/math';
import { KERB_WIDTH, makeProj, type Track, type TrackProj } from '../track/Track';
import { TYRE_FRONT, TYRE_REAR, tyreForce, type TyreOut, type TyreParams } from './tyre';

export interface KartInput {
  throttle: number;
  brake: number;
  /** -1 izquierda … 1 derecha (volante a tope = ángulo máximo de las ruedas). */
  steer: number;
  /** "Saltito": el piloto se levanta del asiento y desplaza su peso (cambia las cargas de las ruedas). */
  hop: boolean;
  /** Freno pisado para sujetar el kart (en parrilla): frena pero nunca engrana la marcha atrás. */
  hold?: boolean;
}

export function emptyInput(): KartInput {
  return { throttle: 0, brake: 0, steer: 0, hop: false };
}

/**
 * Parámetros de un kart de competición 125 cc con piloto (unidades SI).
 * Vehículo de 4 ruedas: cargas por rueda con transferencia longitudinal y
 * lateral, efecto "jacking" del avance de pivote, eje trasero macizo (las dos
 * ruedas traseras giran a la misma velocidad), ruedas delanteras libres,
 * dirección con geometría Ackermann, motor con embrague centrífugo y frenos
 * delante y detrás.
 */
export const KART = {
  /** Velocidad punta (limitador de vueltas del motor), m/s. */
  vmax: 30,
  /** Masa total kart + piloto y masa del piloto (kg). */
  mass: 165,
  driverMass: 75,
  /** Momento de inercia en guiñada (kg·m²). */
  Iz: 55,
  /** Distancia del centro de gravedad al eje delantero / trasero (m). Batalla 1,04 m. */
  a: 0.58,
  b: 0.46,
  /** Altura del centro de gravedad (m). */
  h: 0.25,
  /** Vías delantera y trasera (m). */
  trackF: 1.1,
  trackR: 1.36,
  /** Reparto de la transferencia lateral al eje delantero (rigidez del chasis). */
  rollFront: 0.55,
  /** Jacking del avance de pivote: carga que pasa en diagonal por radián de giro (N/rad). */
  jacking: 950,
  /** Rigidez vertical del neumático por rueda (N/m) y rigidez a torsión del chasis vista desde
   * una rueda que se despega (N/m): cuánto sube la rueda con la carga que "le falta". */
  wheelK: 28000,
  liftK: 6000,
  /** Retardo de la transferencia de carga por la flexión del chasis (s). */
  loadLag: 0.035,
  /** Inercia del eje trasero con ruedas, corona, disco y motor reducido (kg·m²) y de cada rueda delantera. */
  axleI: 0.2,
  frontI: 0.012,
  /** Motor: potencia útil (W) y fuerza máxima en rueda con el embrague patinando (N). */
  power: 15500,
  fMax: 1150,
  /** Velocidad a la que engrana el embrague centrífugo (m/s). */
  clutchV: 6,
  /** Freno motor (transmisión directa): par en el eje (N·m) fijo y por rad/s. */
  engineBrake: 8.5,
  engineBrakeW: 0.045,
  /** Frenos: par máximo en el eje trasero (disco único) y en cada rueda delantera (N·m). */
  brakeRear: 115,
  brakeFront: 75,
  /** Resistencia aerodinámica ½·ρ·Cd·A (N·s²/m²). */
  dragK: 0.36,
  /** Ángulo máximo de las ruedas delanteras (rad), ~23°. */
  steerMax: 0.4,
  reverseMax: 7,
  radius: 0.95,
  /** Barrera de neumáticos: rebote y fricción en el contacto. */
  wallRestitution: 0.3,
  wallFriction: 0.45,
  /** Saltito: duración del desplazamiento del piloto (s), recarga y cuánto se desplaza su peso (m). */
  hopTime: 0.32,
  hopCool: 0.7,
  hopShiftLat: 0.3,
  hopShiftLong: 0.12,
  /** Valores derivados para la IA y la línea de carrera (medidos con test:physics). */
  aLat: 14.6,
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
 * Por superficie (rueda a rueda): agarre relativo, rodadura extra (fracción de
 * la carga de esa rueda) y frenado proporcional a la velocidad (N por kg y m/s,
 * repartido entre las cuatro ruedas): hierba que se hunde, grava que traga.
 */
const SURF: Record<SurfaceKind, { grip: number; crr: number; vK: number }> = {
  track: { grip: 1, crr: 0, vK: 0 },
  kerb: { grip: 0.93, crr: 0.01, vK: 0.005 },
  asphalt: { grip: 0.9, crr: 0.005, vK: 0.005 },
  grass: { grip: 0.55, crr: 0.08, vK: 0.04 },
  sand: { grip: 0.48, crr: 0.3, vK: 0.12 },
  gravel: { grip: 0.45, crr: 0.35, vK: 0.15 },
};

/** Ángulo de deriva del pico de agarre trasero (rad), para efectos y sonido. */
export const ALPHA_PEAK = TYRE_REAR.alphaPeak;

/**
 * Dirección (−1…1) para describir en régimen estacionario una curva de
 * curvatura k (positiva = derecha): ángulo geométrico de la batalla sobre el
 * ángulo máximo de las ruedas. La usan la IA y las ayudas (la física no limita
 * la dirección con la velocidad).
 */
export function steadySteer(k: number, _v: number): number {
  const L = KART.a + KART.b;
  return clamp((Math.atan(L * k) * 1.08) / KART.steerMax, -1.5, 1.5);
}

/** Velocidad máxima a la que se puede trazar una curvatura k sin derrapar. */
export function cornerSpeed(k: number, margin = 0.92): number {
  const ak = Math.abs(k);
  if (ak < 1e-5) return KART.vmax;
  const v2 = KART.aLat * (margin / ak - KART.R0);
  return v2 <= 16 ? 4 : Math.min(KART.vmax, Math.sqrt(v2));
}

export type KartEvent = 'hop' | 'slideStart' | 'kerb';

/** Subpasos por paso de 120 Hz (960 Hz de integración). */
const SUBSTEPS = 8;
const G = 9.81;
/** Índices de rueda: delantera izq., delantera der., trasera izq., trasera der. */
const FL = 0;
const FR = 1;
const RL = 2;
const RR = 3;
const tyreTmp: TyreOut = { fx: 0, fy: 0, sigma: 0, dFdk: 0 };

/**
 * Kart con física de vehículo de 4 ruedas sobre la superficie de la pista. Integra
 * a 960 Hz el chasis (avance, deriva y guiñada), el giro del eje trasero macizo y
 * de cada rueda delantera, y la relajación lateral de cada neumático. El derrape,
 * el arrastre del eje en curva y la rueda trasera interior levantada no se
 * programan: salen de las cargas y de los neumáticos.
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
  /** Posición del volante (−1…1) tras la dinámica del brazo del piloto. */
  steer = 0;
  // Estado previo para interpolar el render.
  px = 0;
  py = 0;
  pz = 0;
  pyaw = 0;

  readonly proj: TrackProj = makeProj();
  /** Superficie bajo el centro del kart (para sonido y efectos). */
  surface: SurfaceKind = 'track';
  /** Superficie bajo cada rueda (FL, FR, RL, RR). */
  readonly wheelSurface: SurfaceKind[] = ['track', 'track', 'track', 'track'];
  /** Velocidad longitudinal (m/s, con signo). */
  vF = 0;
  /** Velocidad lateral (m/s), positiva = hacia la derecha. */
  vL = 0;

  // --- Estado de las ruedas ---
  /** Velocidad angular del eje trasero y de cada rueda delantera (rad/s). */
  axleW = 0;
  readonly frontW = [0, 0];
  /** Tangente de la deriva "relajada" de cada neumático. */
  private readonly tanA = [0, 0, 0, 0];
  /** Carga vertical de cada rueda (N) y carga sin acotar (negativa = rueda en el aire). */
  readonly load = [0, 0, 0, 0];
  readonly loadRaw = [0, 0, 0, 0];
  /** Altura a la que queda levantada cada rueda (m) y deriva / patinaje / fuerza de cada una. */
  readonly lift = [0, 0, 0, 0];
  readonly wheelAlpha = [0, 0, 0, 0];
  readonly wheelKappa = [0, 0, 0, 0];
  readonly wheelFx = [0, 0, 0, 0];
  readonly wheelSigma = [0, 0, 0, 0];
  /** Ángulos reales de cada rueda delantera (rad, positivo = derecha). */
  readonly wheelSteer = [0, 0];
  /** Balanceo y cabeceo del chasis por las cargas (rad; balanceo + = lado izquierdo arriba, cabeceo + = morro abajo). */
  chassisRoll = 0;
  chassisPitch = 0;
  /** Revoluciones del motor normalizadas (0 = 2.500 rpm, 1 = 16.000 rpm). */
  rpm = 0;

  /** Deslizando (eje trasero más allá del pico de agarre): derrape natural. */
  drifting = false;
  /** Sentido del derrape: 1 = curva a derechas. */
  driftDir = 0;
  /** Deriva media de cada eje (rad), para sonido y efectos. */
  slipRear = 0;
  slipFront = 0;
  /**
   * Lucha del eje macizo (0…1): diferencia de fuerza entre las dos ruedas
   * traseras (la interior patina hacia delante y la exterior frena).
   */
  bog = 0;
  /** Rebufo 0..1 (lo calcula el mundo). */
  slip = 0;
  /** Segundos sin colisiones con otros karts (tras reaparecer). */
  ghost = 0;
  /** Impacto contra muro en el último paso (m/s). */
  wallImpact = 0;
  kartImpact = 0;
  /** Roce continuo (m/s de deslizamiento en el contacto) contra la barrera y contra otro kart. */
  wallScrape = 0;
  kartScrape = 0;
  /** Lado del contacto respecto al kart (−1 izquierda, 1 derecha) para sonido y efectos. */
  contactSide = 0;
  /** Último punto de contacto (mundo) y normal hacia el obstáculo. */
  contactX = 0;
  contactZ = 0;
  contactNX = 0;
  contactNZ = 0;
  /** Se mantiene por compatibilidad con la repetición: la deriva ya es física. */
  driftVisual = 0;
  /** Temporizador visual del saltito del piloto. */
  hop = 0;
  /** Tiempo desde el inicio del saltito (−1 = no hay) y recarga. */
  private hopT = -1;
  hopCool = 0;
  private hopSide = 0;
  rumble = 0;
  /** Ruedas sobre el piano: 0 (ninguna), 0.5 (un lado), 1 (las cuatro). */
  kerb = 0;
  /** Lado del piano que se pisa (1 = derecha). */
  kerbSide = 0;
  /** Distancia recorrida (m), para el ritmo de los resaltes del piano. */
  odometer = 0;
  throttleVisual = 0;
  /** Para sonido/partículas. */
  events: KartEvent[] = [];
  private hopHeld = false;
  /** Aceleraciones longitudinal y lateral del chasis, filtradas por su flexión (m/s²). */
  ax = 0;
  ay = 0;
  /** Ángulo medio real de las ruedas delanteras (rad, positivo = derecha). */
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
    this.ax = this.ay = 0;
    this.axleW = 0;
    this.frontW[0] = this.frontW[1] = 0;
    this.tanA.fill(0);
    this.drifting = false;
    this.hopT = -1;
    this.hopCool = 0;
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

  /** Superficie bajo cada rueda a partir de la proyección del kart sobre la pista. */
  private wheelSurfaces(track: Track): void {
    const p = this.proj;
    const trx = -p.tz;
    const trz = p.tx;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const kerbHere = track.kerb[p.idx] === 1;
    for (let i = 0; i < 4; i++) {
      const lf = i < 2 ? KART.a : -KART.b;
      const half = (i < 2 ? KART.trackF : KART.trackR) / 2;
      const lr = i % 2 === 0 ? -half : half; // izquierda negativa (eje "derecha")
      const ox = fx * lf - fz * lr;
      const oz = fz * lf + fx * lr;
      const a = Math.abs(p.lat + ox * trx + oz * trz);
      this.wheelSurface[i] = a <= p.hw + 0.1 ? 'track' : a <= p.hw + KERB_WIDTH && kerbHere ? 'kerb' : a <= p.hw + 0.4 ? 'track' : track.surface;
    }
  }

  step(dt: number, inp: KartInput, track: Track): void {
    this.events.length = 0;
    this.wallImpact = 0;
    this.wallScrape = 0;
    if (this.ghost > 0) this.ghost -= dt;

    const thr = clamp(inp.throttle, 0, 1);
    const brk = clamp(inp.brake, 0, 1);

    // --- Brazos del piloto: el volante no salta de golpe (dinámica de entrada, no del vehículo) ---
    const steerRate = Math.abs(inp.steer) > Math.abs(this.steer) ? 10 : 14;
    this.steer = damp(this.steer, clamp(inp.steer, -1, 1), steerRate, dt);

    // --- Saltito: el piloto empuja contra el asiento y luego se descarga, desplazando su peso hacia fuera ---
    const hopPressed = inp.hop && !this.hopHeld;
    this.hopHeld = inp.hop;
    if (hopPressed && this.hopCool <= 0 && this.vF > 2) {
      this.hopT = 0;
      this.hopCool = KART.hopCool;
      this.hop = 0.16;
      // fuera de la curva: el lado opuesto al giro
      this.hopSide = -sign(this.yawRate) || 0;
      this.events.push('hop');
    }

    this.wheelSurfaces(track);

    // --- Pendiente ---
    const i0 = this.proj.idx;
    const i1 = (i0 + 1) % track.n;
    const slope = (track.py[i1] - track.py[i0]) / track.ds;

    const h = dt / SUBSTEPS;
    const m = KART.mass;
    const L = KART.a + KART.b;
    const tf = KART.trackF;
    const tr = KART.trackR;
    const wasSliding = this.drifting;
    let slideAcc = 0;
    let bogAcc = 0;
    // Ackermann: ángulo de cada rueda delantera para el ángulo "de bicicleta" δ
    const delta = this.steer * KART.steerMax; // + = derecha
    let dL = delta;
    let dR = delta;
    if (Math.abs(delta) > 1e-4) {
      const R = L / Math.tan(Math.abs(delta));
      const inner = Math.atan(L / Math.max(0.3, R - tf / 2));
      const outer = Math.atan(L / (R + tf / 2));
      if (delta > 0) {
        dR = inner;
        dL = outer;
      } else {
        dL = -inner;
        dR = -outer;
      }
    }
    this.wheelSteer[0] = dL;
    this.wheelSteer[1] = dR;
    this.wheelAngle = delta;
    // en ejes internos (y a la izquierda) el ángulo positivo gira a la izquierda
    const dF = [-dL, -dR];

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      // ejes del kart: u adelante, vy a la izquierda, w antihorario
      let u = this.vx * fx + this.vz * fz;
      let vy = this.vx * fz - this.vz * fx;
      let w = -this.yawRate;
      const spd = Math.hypot(u, vy);

      // --- Cargas por rueda ---
      const Fs = (m * G * KART.b) / L / 2;
      const Rs = (m * G * KART.a) / L / 2;
      const dLong = (m * this.ax * KART.h) / L / 2;
      const latMoment = m * this.ay * KART.h; // ay > 0 hacia la izquierda
      const dLatF = (KART.rollFront * latMoment) / tf;
      const dLatR = ((1 - KART.rollFront) * latMoment) / tr;
      // Jacking del avance de pivote: con las ruedas giradas pasa carga en diagonal
      // (del par rueda trasera interior / delantera exterior al par opuesto)
      const jack = KART.jacking * Math.abs(delta) * Math.min(1, spd / 3);
      const turnL = delta < 0 ? 1 : -1; // girando a la izquierda: interior = izquierda
      // Saltito: el piloto se levanta un instante y echa el cuerpo hacia fuera y hacia
      // delante. El peso total no cambia: solo se reparte distinto (momentos de su peso),
      // lo que descarga la rueda trasera interior y libera el eje macizo.
      let hopLat = 0;
      let hopLong = 0;
      if (this.hopT >= 0) {
        const md = KART.driverMass * G;
        // perfil suave de subida y bajada del desplazamiento
        const ph = Math.sin((Math.PI * this.hopT) / KART.hopTime);
        hopLat = this.hopSide * md * KART.hopShiftLat * ph; // N·m (+ = hacia la derecha)
        hopLong = md * KART.hopShiftLong * ph; // N·m (+ = hacia delante)
      }
      const raw = this.loadRaw;
      const hL = hopLong / L / 2;
      raw[FL] = Fs - dLong - dLatF + turnL * jack + hL - (hopLat / tf) * 0.3;
      raw[FR] = Fs - dLong + dLatF - turnL * jack + hL + (hopLat / tf) * 0.3;
      raw[RL] = Rs + dLong - dLatR - turnL * jack - hL - (hopLat / tr) * 0.7;
      raw[RR] = Rs + dLong + dLatR + turnL * jack - hL + (hopLat / tr) * 0.7;
      // Rueda en el aire: no puede tirar; su carga pasa a la otra rueda del eje
      const ld = this.load;
      for (const [aI, bI] of [
        [FL, FR],
        [RL, RR],
      ]) {
        let la = raw[aI];
        let lb = raw[bI];
        if (la < 0) {
          lb += la;
          la = 0;
        }
        if (lb < 0) {
          la += lb;
          lb = 0;
        }
        ld[aI] = Math.max(0, la);
        ld[bI] = Math.max(0, lb);
      }

      // --- Motor, embrague y frenos (pares en las ruedas) ---
      const rR = TYRE_REAR.radius;
      const axleV = this.axleW * rR;
      const vmaxEff = KART.vmax * (1 + 0.06 * this.slip);
      let driveT = 0;
      if (thr > 0.02) {
        if (u < -0.3 && axleV < 0) driveT = KART.fMax * rR * thr; // frena la marcha atrás
        else {
          driveT = Math.min(KART.fMax, KART.power / Math.max(Math.abs(axleV), 1)) * rR * thr;
          driveT *= clamp((vmaxEff - axleV) / 1.2, 0, 1); // limitador
        }
      } else if (axleV > KART.clutchV) {
        // freno motor de la transmisión directa (con el embrague engranado)
        driveT = -(KART.engineBrake + KART.engineBrakeW * this.axleW);
      }
      let reverseT = 0;
      if (!inp.hold && brk > 0.02 && thr < 0.1 && u < 0.4 && this.axleW <= 0.5 && u > -KART.reverseMax) reverseT = -45 * brk;
      const brakeOn = brk > 0.02 && !(reverseT < 0);
      const brakeTR = brakeOn ? KART.brakeRear * brk : 0;
      const brakeTF = brakeOn ? KART.brakeFront * brk : 0;
      // RPM del motor: con el embrague patinando el motor sube de vueltas con el gas
      const clutchRpm = thr * 0.42;
      this.rpm = Math.max(clutchRpm, (Math.abs(axleV) / KART.vmax) * 0.98);

      // --- Neumáticos ---
      let Fx = 0;
      let Fy = 0;
      let Mz = 0;
      let rearFx = 0;
      let rearFxDiff = 0;
      let slipR = 0;
      let slipF = 0;
      let rearTorque = 0;
      let rearK = 0;
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const tp: TyreParams = front ? TYRE_FRONT : TYRE_REAR;
        const lx = front ? KART.a : -KART.b;
        const ly = i % 2 === 0 ? (front ? tf : tr) / 2 : -(front ? tf : tr) / 2;
        // velocidad del punto de contacto (ejes del kart)
        const pvx = u - w * ly;
        const pvy = vy + w * lx;
        // a ejes de la rueda
        const d = front ? dF[i] : 0;
        const c = Math.cos(d);
        const sn = Math.sin(d);
        const wvx = pvx * c + pvy * sn;
        const wvy = -pvx * sn + pvy * c;
        const surf = SURF[this.wheelSurface[i]];
        // deriva con relajación: la fuerza lateral se construye al rodar
        const vden = Math.max(Math.abs(wvx), 1);
        const tanSS = -wvy / vden;
        this.tanA[i] += (vden / tp.relax) * (tanSS - this.tanA[i]) * h;
        this.tanA[i] = clamp(this.tanA[i], -3, 3);
        const ww = front ? this.frontW[i] : this.axleW;
        const kappa = (ww * tp.radius - wvx) / vden;
        tyreForce(tp, ld[i], kappa, this.tanA[i], surf.grip, tyreTmp);
        let tfx = tyreTmp.fx;
        const tfy = tyreTmp.fy;
        // rodadura (también la extra de la superficie)
        const rr = (tp.crr + surf.crr) * ld[i] + (surf.vK * m * Math.abs(wvx)) / 4;
        tfx -= rr * Math.tanh(wvx * 4);
        this.wheelAlpha[i] = Math.atan(this.tanA[i]);
        this.wheelKappa[i] = kappa;
        this.wheelFx[i] = tyreTmp.fx;
        this.wheelSigma[i] = tyreTmp.sigma;
        // a ejes del kart
        const bfx = tfx * c - tfy * sn;
        const bfy = tfx * sn + tfy * c;
        Fx += bfx;
        Fy += bfy;
        Mz += lx * bfy - ly * bfx;
        if (front) {
          // rueda delantera libre: solo freno y fuerza del neumático (integración implícita)
          const k = (tyreTmp.dFdk * tp.radius * tp.radius) / vden;
          const tq = -tyreTmp.fx * tp.radius;
          let wn = this.frontW[i] + (h * tq) / (KART.frontI + h * k);
          wn = applyBrake(wn, brakeTF, KART.frontI, h);
          this.frontW[i] = wn;
          slipF += Math.abs(this.wheelAlpha[i]) * 0.5;
        } else {
          rearTorque += -tyreTmp.fx * tp.radius;
          rearK += (tyreTmp.dFdk * tp.radius * tp.radius) / vden;
          rearFx += tyreTmp.fx;
          rearFxDiff += i === RL ? tyreTmp.fx : -tyreTmp.fx;
          slipR += Math.abs(this.wheelAlpha[i]) * (ld[i] > 1 ? 1 : 0);
        }
      }
      // --- Eje trasero macizo: una sola velocidad para las dos ruedas ---
      {
        const tq = driveT + reverseT + rearTorque;
        let wn = this.axleW + (h * tq) / (KART.axleI + h * rearK);
        wn = applyBrake(wn, brakeTR, KART.axleI, h);
        this.axleW = wn;
      }
      const rearGround = (ld[RL] > 1 ? 1 : 0) + (ld[RR] > 1 ? 1 : 0);
      slipR = rearGround ? slipR / rearGround : 0;
      // Lucha del eje: con las dos ruedas apoyadas, una empuja y la otra frena
      const capR = TYRE_REAR.mu * (ld[RL] + ld[RR]) + 1;
      bogAcc += ld[RL] > 1 && ld[RR] > 1 ? clamp(Math.abs(rearFxDiff) / capR - Math.abs(rearFx) / capR, 0, 1) : 0;

      // --- Resistencias del chasis ---
      const aero = KART.dragK * (1 - 0.4 * this.slip) * u * Math.abs(u);
      const gravity = -m * G * slope * (fx * this.proj.tx + fz * this.proj.tz);
      Fx += -aero + gravity;

      // --- Integración del chasis ---
      const axF = Fx / m;
      const ayF = Fy / m;
      u += (axF + vy * w) * h;
      vy += (ayF - u * w) * h;
      w += (Mz / KART.Iz) * h;
      // aceleraciones que cargan las ruedas, con el retardo de la flexión del chasis
      const kLag = Math.min(1, h / KART.loadLag);
      this.ax += (axF - this.ax) * kLag;
      this.ay += (ayF - this.ay) * kLag;

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
      this.slipRear = slipR;
      this.slipFront = slipF;
      if (slipR > TYRE_REAR.alphaPeak * 1.3 && spd > 6) slideAcc++;
      if (this.hopT >= 0) {
        this.hopT += h;
        if (this.hopT > KART.hopTime) this.hopT = -1;
      }
    }
    this.bog = bogAcc / SUBSTEPS;
    this.drifting = slideAcc >= SUBSTEPS / 2;
    if (this.drifting) {
      this.driftDir = sign(this.yawRate) || this.driftDir;
      if (!wasSliding) this.events.push('slideStart');
    }
    // Rueda levantada, balanceo y cabeceo a partir de las cargas reales
    const k = KART.wheelK;
    for (let i = 0; i < 4; i++) this.lift[i] = Math.max(0, -this.loadRaw[i]) / KART.liftK;
    const def = (i: number) => this.load[i] / k - this.lift[i];
    const left = (def(FL) + def(RL)) / 2;
    const right = (def(FR) + def(RR)) / 2;
    this.chassisRoll = Math.atan2(right - left, (tf + tr) / 2);
    this.chassisPitch = Math.atan2((def(FL) + def(FR)) / 2 - (def(RL) + def(RR)) / 2, L);
    if (this.hopCool > 0) this.hopCool -= dt;

    this.collideTrack(track, dt);

    this.driftVisual = 0;
    this.hop = Math.max(0, this.hop - dt);
    this.throttleVisual = damp(this.throttleVisual, thr, 10, dt);
  }

  /** Guarda el punto de contacto (brazo desde el centro) y la normal hacia el obstáculo. */
  setContact(ox: number, oz: number, nx: number, nz: number): void {
    this.contactX = this.x + ox;
    this.contactZ = this.z + oz;
    this.contactNX = nx;
    this.contactNZ = nz;
    // derecha del kart = (−cos yaw, sin yaw)
    this.contactSide = Math.sign(nx * -Math.cos(this.yaw) + nz * Math.sin(this.yaw)) || 1;
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
      this.wallScrape = Math.max(this.wallScrape, lastSlide);
      this.setContact(ox, oz, nx, nz);
      track.project(this.x, this.z, p.idx, p);
    }
    this.y = p.y;
    const a = Math.abs(p.lat);
    const idx = p.idx;
    // Pianos rueda a rueda: basta con que las ruedas de un lado pisen la franja
    const prevKerb = this.kerb;
    this.kerb = 0;
    this.kerbSide = 0;
    if (track.kerb[idx]) {
      for (const sd of [-1, 1]) {
        const wl = p.lat + sd * 0.6;
        if (Math.abs(wl) > p.hw - 0.05 && Math.abs(wl) < p.hw + KERB_WIDTH + 0.1 && Math.sign(wl) === sd) {
          this.kerb += 0.5;
          this.kerbSide = sd;
        }
      }
    }
    if (this.kerb > 0 && prevKerb === 0 && this.speed > 4) this.events.push('kerb');
    this.odometer += this.speed * _dt;
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
/** Velocidad tangencial (roce) del último contacto resuelto. */
let lastSlide = 0;

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
  lastSlide = Math.hypot(rvx - vn * nx, rvz - vn * nz);
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
  for (const k of karts) {
    k.kartImpact = 0;
    k.kartScrape = 0;
  }
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
      a.kartScrape = Math.max(a.kartScrape, lastSlide);
      b.kartScrape = Math.max(b.kartScrape, lastSlide);
      a.setContact(pax - a.x, paz - a.z, nx, nz);
      b.setContact(pax - b.x, paz - b.z, -nx, -nz);
    }
  }
}

/**
 * Freno de disco sobre una rueda: par que se opone al giro; si basta para pararla
 * en este paso, la rueda queda bloqueada (rozamiento estático del disco).
 */
function applyBrake(w: number, torque: number, I: number, h: number): number {
  if (torque <= 0) return w;
  const dw = (torque * h) / I;
  if (Math.abs(w) <= dw) return 0;
  return w - Math.sign(w) * dw;
}
