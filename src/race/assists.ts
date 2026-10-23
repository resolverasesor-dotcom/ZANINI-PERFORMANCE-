import { AIDriver, type AIWorld } from '../ai/AIDriver';
import { clamp } from '../core/math';
import type { AssistLevel } from '../core/Settings';
import { emptyInput, type Kart, type KartInput } from '../physics/Kart';
import type { Track } from '../track/Track';

/**
 * Ayudas a la conducción del jugador (no afectan a la IA rival).
 *
 *  - Media: red de seguridad. Si vas a salirte de la pista corrige la dirección y,
 *    si llegas demasiado rápido a una curva, frena por ti.
 *  - Máxima: un "copiloto" (el mismo cerebro que la IA) conduce cuando no tocas la
 *    dirección y frena en las curvas; en cuanto giras, mandas tú (mezclado).
 */
export class DriverAssist {
  private copilot: AIDriver;
  private world: AIWorld;
  private scratch: KartInput = emptyInput();

  constructor(
    private kart: Kart,
    private track: Track,
  ) {
    this.copilot = new AIDriver(kart, null, 'pro', 77);
    this.copilot.perfect = true;
    this.copilot.speedFactor = 0.93;
    this.world = { track, karts: [kart], racing: true, rubber: 1 };
  }

  apply(pi: KartInput, level: AssistLevel, dt: number): void {
    if (level === 'ninguna') return;
    const k = this.kart;
    const v = Math.max(0, k.vF);
    // El copiloto siempre "piensa" (mantiene su estado), aunque solo se use a veces
    const ai = this.copilot.update(dt, this.world);
    const sc = this.scratch;
    sc.steer = ai.steer;
    sc.throttle = ai.throttle;
    sc.brake = ai.brake;
    if (v < 3) return;
    const strong = level === 'maxima';
    const user = Math.abs(pi.steer);

    if (!k.drifting) {
      // Máxima: el copiloto conduce si no tocas nada; si giras, mezcla.
      // Media: un toque suave del copiloto (20 %) que alisa la trazada.
      if (strong) pi.steer = user < 0.15 ? sc.steer : clamp(pi.steer * 0.6 + sc.steer * 0.4, -1, 1);
      else pi.steer = clamp(pi.steer * 0.8 + sc.steer * 0.2, -1, 1);
    }
    // Red de seguridad anti-salida (si conduce el copiloto no hace falta: ya va por la trazada,
    // y en pistas de karting de 8 m la red le estorbaría al usar todo el ancho)
    if (!(strong && user < 0.15)) this.antiOff(pi, strong);
    // Frenada automática antes de las curvas
    if (!k.drifting && pi.brake < 0.1) {
      // Máxima: el pedal lo lleva el copiloto (en los kartódromos estrechos hace falta su precisión)
      if (strong) {
        pi.throttle = Math.min(pi.throttle, sc.throttle);
        pi.brake = Math.max(pi.brake, sc.brake);
      }
      const target = this.track.sample(this.track.lineSpeed, k.proj.s + v * 0.45 + 3) * this.copilot.speedFactor * (strong ? 1.02 : 1.07);
      if (v > target + 0.4) {
        pi.throttle = 0;
        pi.brake = clamp((v - target) / 4, 0.25, strong ? 1 : 0.7);
      }
    }
  }

  private antiOff(pi: KartInput, strong: boolean): void {
    const k = this.kart;
    const p = k.proj;
    const rx = -p.tz;
    const rz = p.tx;
    const vLat = k.vx * rx + k.vz * rz;
    const latPred = p.lat + vLat * 0.75;
    // Deja usar el piano (como la trazada de la IA), corrige más allá
    const limit = p.hw - (strong ? 0.6 : 0.45);
    if (Math.abs(latPred) <= limit) return;
    const over = clamp((Math.abs(latPred) - limit) / 1.4, 0, 1);
    // Si el morro apunta hacia fuera, corregir con más fuerza
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    const outward = (fx * rx + fz * rz) * Math.sign(latPred);
    const gain = (strong ? 1.3 : 1.1) * (outward > 0 ? 1 + outward * 1.5 : 0.6);
    pi.steer = clamp(pi.steer - Math.sign(latPred) * over * gain, -1, 1);
  }
}
