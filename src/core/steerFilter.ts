import { KART } from '../physics/Kart';
import { TYRE_FRONT, TYRE_REAR } from '../physics/tyre';

/**
 * Filtro de ENTRADA de la dirección (no forma parte de la física del kart).
 *
 * Con teclado, botones táctiles o un pulgar es imposible dosificar 2–3° de volante a
 * 90 km/h como hace un piloto con las manos. Este filtro escala el mando para que "a
 * tope" equivalga al ángulo de ruedas del giro estacionario en el límite de agarre,
 * calculado como lo haría un ingeniero:
 *
 *   δ = L·a/v²  (geometría para la curva más cerrada que permite el agarre)
 *     + α_delantera − α_trasera  (deriva de los neumáticos trabajando en su pico)
 *
 * más un margen para poder pasarse un poco (ahí empieza el derrape). La física recibe
 * ese ángulo tal cual: si el jugador desactiva el filtro, tiene todo el giro real.
 *
 * Además imita el volante "suelto" de un kart real: cuando la trasera se va, el par de
 * autoalineado del avance gira las ruedas hacia donde va el kart (contravolante). Un
 * piloto lo deja pasar entre las manos; con un pulgar no se puede, así que se suma aquí.
 * Así el derrape se sostiene y se recupera en vez de acabar en trompo.
 */
export function filterSteer(input: number, speed: number, enabled: boolean, vLat = 0): number {
  if (!enabled) return input;
  const v = Math.max(Math.abs(speed), 1);
  const L = KART.a + KART.b;
  // En horquillas lentas, con mucho volante, el avance levanta la rueda trasera interior
  // y el agarre total cae (~1,1 g frente a ~1,5 g en curva rápida): el tope se adapta.
  const fast = clamp01((v - 8) / 7);
  const grip = 0.62 + (1.05 - 0.62) * fast * fast * (3 - 2 * fast);
  const geo = Math.atan((L * KART.aLat * grip) / (v * v));
  // En curva rápida "a tope" pasa algo del pico delantero: la trasera empieza a deslizar
  // (derrape natural) y el contravolante del avance lo sostiene.
  const slip = TYRE_FRONT.alphaPeak * (1.25 + 0.35 * fast) - TYRE_REAR.alphaPeak * 0.3;
  const out = input * Math.min(1, (geo + slip) / KART.steerMax);
  if (speed < 2) return out;
  // Ángulo de deriva del kart (positivo = el kart va hacia su derecha)
  const beta = Math.atan2(vLat, v);
  const dead = 0.05;
  const b = Math.sign(beta) * Math.max(0, Math.abs(beta) - dead);
  const counter = (COUNTER_GAIN * b) / KART.steerMax;
  return Math.max(-1, Math.min(1, out + counter));
}

/** Fracción del ángulo de deriva que el autoalineado devuelve al volante. */
export const COUNTER_GAIN = 0.75;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
