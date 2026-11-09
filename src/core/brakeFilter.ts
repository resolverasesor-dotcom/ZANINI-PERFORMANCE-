import type { Kart } from '../physics/Kart';
import { TYRE_FRONT, TYRE_REAR } from '../physics/tyre';

/**
 * Filtro de ENTRADA del freno (no forma parte de la física del kart): el "pie" del piloto.
 *
 * Un botón o una tecla solo valen 0 o 1. Pisar a fondo de golpe bloquea las ruedas, y una
 * rueda bloqueada no tiene agarre lateral: el kart se va recto aunque gires. Un piloto
 * de verdad dosifica:
 *
 * - aprieta progresivamente (no de un golpe);
 * - frena en el límite: si nota que una rueda se bloquea, afloja un poco;
 * - al girar suelta parte del freno para dejar agarre al giro ("trail braking": el
 *   círculo de fricción del neumático se reparte entre frenar y girar).
 *
 * La física recibe esa presión tal cual. Con el filtro desactivado, el freno es directo.
 */
export class BrakeFilter {
  private p = 0;

  reset(): void {
    this.p = 0;
  }

  update(input: number, steer: number, k: Kart, dt: number, enabled: boolean): number {
    if (!enabled || input <= 0.02) {
      this.p = enabled ? Math.max(0, this.p - dt * 8) : input;
      return enabled ? Math.min(this.p, input) : input;
    }
    const v = Math.abs(k.vF);
    // Parado o casi: freno directo (sujetar el kart, marcha atrás)
    if (v < 3) {
      this.p = input;
      return input;
    }
    // Reparto con el giro: cuanto más volante, menos freno (deja agarre lateral)
    const turn = Math.min(1, Math.abs(steer));
    let target = input * (1 - 0.55 * turn);
    // Sensación de bloqueo: patinaje de cada eje respecto a su pico
    const kf = Math.min(k.wheelKappa[0], k.wheelKappa[1]) / TYRE_FRONT.kappaPeak;
    const kr = Math.min(k.wheelKappa[2], k.wheelKappa[3]) / TYRE_REAR.kappaPeak;
    const over = Math.max(-kf, -kr);
    if (over > 1.15) target = Math.min(target, this.p * (1 - Math.min(0.5, (over - 1.15) * 0.6)));
    // Girando: si el tren delantero pasa de su pico combinado (freno + giro), el morro
    // deja de obedecer; el piloto lo nota en el volante y afloja
    const satF = Math.max(k.wheelSigma[0], k.wheelSigma[1]);
    if (turn > 0.08 && satF > 1.0) target = Math.min(target, this.p * (1 - Math.min(0.6, (satF - 1.0) * 1.2)));
    // El pie sube rápido pero no de golpe, y afloja aún más rápido
    const rate = target > this.p ? 5 : 14;
    this.p += Math.max(-rate * dt, Math.min(rate * dt, target - this.p));
    return Math.max(0, Math.min(1, this.p));
  }
}
