import { clamp, damp, rng, sign } from '../core/math';
import { emptyInput, Kart, KART, maxYawRate, type KartInput } from '../physics/Kart';
import type { Track } from '../track/Track';
import { DIFF_MISTAKES, DIFF_SPEED, paceFactor, type Difficulty, type DriverDef } from './Drivers';

/** Lo que la IA necesita saber del mundo en cada paso. */
export interface AIWorld {
  track: Track;
  karts: Kart[];
  racing: boolean;
  /** Factor de rubber-banding para este kart (1 = sin ayuda). */
  rubber: number;
}

type Mistake = { kind: 'late' | 'wide' | 'lift'; t: number; dir: number };

/**
 * Piloto IA: sigue la línea de carrera con persecución pura, regula la velocidad
 * según el perfil precalculado, adelanta, defiende, comete errores según su
 * consistencia, derrapa en curvas largas y nunca se queda atascado.
 */
export class AIDriver {
  readonly input: KartInput = emptyInput();
  readonly driver: DriverDef | null;
  readonly kart: Kart;
  difficulty: Difficulty;
  speedFactor: number;
  /** Desplazamiento lateral respecto a la línea ideal (adelantar/defender). */
  bias = 0;
  private biasTarget = 0;
  private trafficTimer = 0;
  private trafficSlow = Infinity;
  private defendSide = 0;
  private noisePhase: number;
  private noiseFreq: number;
  private mistake: Mistake | null = null;
  private mistakeClock = 0;
  private stuckTime = 0;
  private reverseTime = 0;
  private wrongWay = 0;
  private offTime = 0;
  wantsRespawn = false;
  private rand: () => number;
  private canDrift: boolean;
  /** Sin errores ni ruido (cálculo de tiempos de referencia, piloto automático). */
  perfect = false;

  constructor(kart: Kart, driver: DriverDef | null, difficulty: Difficulty, seed: number) {
    this.kart = kart;
    this.driver = driver;
    this.difficulty = difficulty;
    this.rand = rng(seed);
    this.noisePhase = this.rand() * 100;
    this.noiseFreq = 0.15 + this.rand() * 0.2;
    this.speedFactor = DIFF_SPEED[difficulty] * (driver ? paceFactor(driver) : 1);
    this.canDrift = difficulty !== 'facil' && (driver ? driver.pace > 0.55 : true);
  }

  private get consistency(): number {
    return this.perfect ? 1 : (this.driver?.consistency ?? 0.9);
  }

  update(dt: number, w: AIWorld): KartInput {
    const k = this.kart;
    const t = w.track;
    const inp = this.input;
    const s = k.proj.s;
    const v = Math.max(0, k.vF);
    const hw = k.proj.hw;
    this.noisePhase += dt * this.noiseFreq;

    // --- Errores ---
    if (w.racing && !this.perfect) {
      this.mistakeClock += dt;
      if (this.mistakeClock >= 1) {
        this.mistakeClock = 0;
        const p = (1 - this.consistency) * 0.03 * DIFF_MISTAKES[this.difficulty];
        if (!this.mistake && this.rand() < p) {
          const r = this.rand();
          const kind = r < 0.4 ? 'late' : r < 0.75 ? 'wide' : 'lift';
          this.mistake = { kind, t: kind === 'lift' ? 1.2 : 2.2, dir: 0 };
        }
      }
    }
    if (this.mistake) {
      this.mistake.t -= dt;
      if (this.mistake.t <= 0) this.mistake = null;
    }

    // --- Tráfico (cada 0.1 s) ---
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0) {
      this.trafficTimer = 0.1;
      this.scanTraffic(w);
    }
    this.bias = damp(this.bias, this.biasTarget, 1.6, dt);

    // --- Dirección: persecución pura sobre la línea ---
    const Ld = clamp(5 + v * 0.42, 6, 18);
    const ts = s + Ld;
    const curvAhead = t.sample(t.lineCurv, s + Ld * 1.5);
    let lat = t.sample(t.lineOffset, ts) + this.bias;
    const cons = this.consistency;
    lat += Math.sin(this.noisePhase * 6.28) * (1 - cons) * 1.4;
    if (this.mistake?.kind === 'wide') {
      if (this.mistake.dir === 0) this.mistake.dir = -sign(curvAhead || 1);
      lat += this.mistake.dir * 2.5;
    }
    const hwT = t.sample(t.hw, ts);
    lat = clamp(lat, -(hwT - 1.0), hwT - 1.0);
    const tp = { x: 0, y: 0, z: 0 };
    t.pointAt(ts, lat, tp);
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    const dx = tp.x - k.x;
    const dz = tp.z - k.z;
    const lf = dx * fx + dz * fz;
    const lr = dx * -fz + dz * fx;
    const alpha = Math.atan2(lr, lf);
    const dist = Math.hypot(dx, dz) || 1;
    const wantYaw = (2 * Math.sin(alpha) * Math.max(v, 3)) / dist; // >0 = derecha
    const wMax = Math.max(0.05, maxYawRate(Math.max(v, 3)));

    // --- Derrape (curvas largas de radio medio) ---
    let driftWanted = false;
    if (this.canDrift && w.racing && !this.mistake) {
      let kSum = 0;
      let kMin = Infinity;
      for (let d = 4; d <= 26; d += 2) {
        const c = t.sample(t.lineCurv, s + d);
        kSum += c;
        kMin = Math.min(kMin, Math.abs(c));
      }
      const kMean = kSum / 12;
      const ak = Math.abs(kMean);
      if (k.drifting) {
        const near = t.sample(t.lineCurv, s + 6);
        driftWanted = sign(near) === k.driftDir && Math.abs(near) > 1 / 75 && v > 9;
      } else {
        driftWanted = v > 15 && ak > 1 / 80 && ak < 1 / 14 && kMin > 1 / 120 && sign(wantYaw) === sign(kMean) && Math.abs(lat - t.sample(t.lineOffset, ts)) < 1.5;
      }
    }

    let steer: number;
    if (k.drifting) {
      const base = k.driftDir * wMax * KART.driftTurn;
      steer = ((wantYaw / base - 1) / 0.5) * k.driftDir;
    } else {
      steer = wantYaw / wMax;
    }
    inp.steer = clamp(steer, -1, 1);
    inp.drift = driftWanted;

    // --- Velocidad ---
    let target = t.sample(t.lineSpeed, s + v * 0.3 + 2) * this.speedFactor * w.rubber;
    if (!this.perfect) target *= 1 + Math.sin(this.noisePhase * 3.1 + 1.3) * (1 - cons) * 0.025;
    if (this.mistake?.kind === 'late') target *= 1.12;
    if (this.trafficSlow < target) target = this.trafficSlow;
    // Fuera de pista: recuperar con calma
    if (k.surface !== 'track' && k.surface !== 'kerb' && k.surface !== 'asphalt') target = Math.min(target, 16);
    if (Math.abs(k.proj.lat) > hw + 0.5) {
      // apuntar hacia dentro con más decisión
      inp.steer = clamp(inp.steer - sign(k.proj.lat) * 0.15, -1, 1);
    }
    const err = target - v;
    if (err > 0.4) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (err > -1.2) {
      inp.throttle = clamp(0.55 + err * 0.5, 0, 1);
      inp.brake = 0;
    } else {
      inp.throttle = 0;
      inp.brake = clamp(-err * 0.18, 0.15, 1);
    }
    if (this.mistake?.kind === 'lift') inp.throttle = Math.min(inp.throttle, 0.35);

    if (!w.racing) {
      inp.throttle = 0;
      inp.brake = 1;
      inp.drift = false;
      this.stuckTime = 0;
      return inp;
    }

    // --- Anti-atascos ---
    const along = fx * k.proj.tx + fz * k.proj.tz;
    if (along < -0.3) {
      const g = globalThis as unknown as { __aiWrong?: string[] };
      if (this.wrongWay === 0 && g.__aiWrong) g.__aiWrong.push(`v=${v.toFixed(1)} vL=${k.vL.toFixed(1)} drift=${k.drifting} rev=${this.reverseTime.toFixed(2)} stuck=${this.stuckTime.toFixed(2)} s=${s.toFixed(0)} lat=${k.proj.lat.toFixed(1)} hw=${hw.toFixed(1)} surf=${k.surface} mistake=${this.mistake?.kind}`);
      this.wrongWay += dt;
    }
    else this.wrongWay = Math.max(0, this.wrongWay - dt);
    if (Math.abs(k.proj.lat) > hw + 2) this.offTime += dt;
    else this.offTime = 0;
    // Maniobra de tres puntos si está casi parado y mirando hacia otro lado.
    if (this.reverseTime <= 0 && v < 5 && Math.abs(alpha) > 1.45) this.reverseTime = 1.4;
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      if (Math.abs(alpha) < 0.5) this.reverseTime = 0;
      inp.throttle = 0;
      inp.brake = 1;
      inp.drift = false;
      inp.steer = -Math.sign(alpha);
    } else if (v < 1.5 && inp.throttle > 0.5) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.6 && this.stuckTime < 3) this.reverseTime = 0.9;
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    }
    if (this.stuckTime > 4.5 || this.wrongWay > 5 || this.offTime > 8) {
      const g = globalThis as unknown as { __aiRespawn?: Record<string, number> };
      if (g.__aiRespawn) {
        const r = this.stuckTime > 4.5 ? 'stuck' : this.wrongWay > 5 ? 'wrong' : 'off';
        g.__aiRespawn[r] = (g.__aiRespawn[r] ?? 0) + 1;
      }
      this.wantsRespawn = true;
      this.stuckTime = 0;
      this.wrongWay = 0;
      this.offTime = 0;
      this.reverseTime = 0;
    }
    return inp;
  }

  /** Busca karts cerca para adelantar, evitar alcances o defender. */
  private scanTraffic(w: AIWorld): void {
    const k = this.kart;
    const t = w.track;
    const L = t.length;
    const myS = k.proj.s;
    const myLat = k.proj.lat;
    const hw = k.proj.hw;
    const v = k.vF;
    const aggr = this.driver?.aggression ?? 0.6;
    const def = this.driver?.defense ?? 0.6;
    let ahead: Kart | null = null;
    let aheadDs = Infinity;
    let behind: Kart | null = null;
    let behindDs = Infinity;
    for (const o of w.karts) {
      if (o === k || o.ghost > 0 || Math.abs(o.y - k.y) > 2) continue;
      let ds = o.proj.s - myS;
      if (ds > L / 2) ds -= L;
      if (ds < -L / 2) ds += L;
      const dl = o.proj.lat - myLat;
      if (ds > 0 && ds < 22 && Math.abs(dl) < 2.6 && ds < aheadDs) {
        ahead = o;
        aheadDs = ds;
      } else if (ds < 0 && ds > -12 && -ds < behindDs) {
        behind = o;
        behindDs = -ds;
      }
    }
    this.trafficSlow = Infinity;
    const lineLat = t.sample(t.lineOffset, myS + 10);
    if (ahead) {
      const closing = v - ahead.vF;
      if (closing > -0.5 || aheadDs < 9) {
        const o = ahead.proj.lat;
        const roomL = o + hw - 1.2; // espacio a la izquierda del rival
        const roomR = hw - 1.2 - o;
        const gap = 2.3 + (1 - aggr) * 0.6;
        let side: number;
        if (roomL > gap && roomR > gap) side = myLat < o ? -1 : 1;
        else if (roomL > gap) side = -1;
        else if (roomR > gap) side = 1;
        else side = 0;
        if (side !== 0) {
          this.biasTarget = clamp(o + side * gap - lineLat, -hw * 1.6, hw * 1.6);
        }
        // No hay hueco o está muy cerca: igualar velocidad para no embestir.
        const tooClose = aheadDs < 4.5 + (1 - aggr) * 3;
        if (side === 0 || (tooClose && Math.abs(ahead.proj.lat - myLat) < 1.7)) {
          this.trafficSlow = Math.max(4, ahead.vF - (aheadDs < 3 ? 1.5 : 0.2));
        }
      }
      this.defendSide = 0;
    } else if (behind && behindDs < 9 && this.rand() < def * 0.6) {
      // Defender: cubrir el interior de la próxima curva (una sola vez, sin zigzag).
      if (this.defendSide === 0) {
        const c = t.sample(t.lineCurv, myS + 30);
        this.defendSide = Math.abs(c) > 1 / 120 ? sign(c) : sign(behind.proj.lat - myLat) || 1;
      }
      const targetLat = this.defendSide * Math.min(hw - 1.6, 2.2 + def);
      this.biasTarget = clamp(targetLat - lineLat, -3, 3) * 0.7;
    } else {
      this.defendSide = 0;
      this.biasTarget *= 0.5;
      if (Math.abs(this.biasTarget) < 0.05) this.biasTarget = 0;
    }
  }
}
