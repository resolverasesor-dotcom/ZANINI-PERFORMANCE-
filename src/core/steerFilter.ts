import { KART } from '../physics/Kart';

/**
 * Filtro de ENTRADA de la dirección (no forma parte de la física del kart).
 *
 * Con teclado, botones táctiles o un pulgar sobre una pantalla es imposible dosificar
 * 2–3° de volante a 90 km/h como hace un piloto con las manos. Este filtro escala el
 * mando para que "a tope" equivalga al ángulo de ruedas que da el máximo agarre a la
 * velocidad actual (con un 25 % de margen para buscar el límite). La física recibe ese
 * ángulo tal cual: si el jugador lo desactiva, el kart responde con todo el giro real.
 */
export function filterSteer(input: number, speed: number, enabled: boolean): number {
  if (!enabled) return input;
  const v = Math.max(Math.abs(speed), 1);
  const L = KART.a + KART.b;
  const grip = Math.atan((L * KART.aLat * 1.25) / (v * v)) + 0.02;
  return input * Math.min(1, grip / KART.steerMax);
}
