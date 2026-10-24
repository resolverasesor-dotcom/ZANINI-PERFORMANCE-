// Modelo de neumático completo para slicks de karting.
//
// - Deslizamiento combinado: el neumático no ve por separado el patinaje
//   longitudinal (κ, slip ratio) y la deriva lateral (α, slip angle), sino un
//   único vector de deslizamiento normalizado. La fuerza total sale de una curva
//   de fórmula mágica y se reparte en la dirección del deslizamiento, así que
//   acelerar o frenar a fondo deja menos agarre lateral (círculo de fricción) de
//   forma natural.
// - Sensibilidad a la carga: el coeficiente de agarre baja al aumentar la carga.
// - Longitud de relajación: la fuerza lateral no aparece al instante, sino tras
//   rodar unos centímetros (estable a cualquier velocidad, también parado).
// - Resistencia a la rodadura proporcional a la carga.

export interface TyreParams {
  /** Coeficiente de agarre con la carga nominal. */
  mu: number;
  /** Carga nominal (N). */
  fz0: number;
  /** Pérdida relativa de μ por cada 100 % de carga extra. */
  loadSens: number;
  /** Patinaje longitudinal del pico de fuerza. */
  kappaPeak: number;
  /** Ángulo de deriva del pico de fuerza (rad). */
  alphaPeak: number;
  /** Forma de la curva (1,1–1,6): cuánto cae la fuerza al pasar del pico. */
  C: number;
  /** Longitud de relajación lateral (m). */
  relax: number;
  /** Coeficiente de resistencia a la rodadura. */
  crr: number;
  /** Radio de rodadura (m) e inercia de la rueda (kg·m²). */
  radius: number;
}

/** Delanteros 10x4.50-5 y traseros 11x7.10-5 de un kart de competición. */
export const TYRE_FRONT: TyreParams = { mu: 1.62, fz0: 360, loadSens: 0.22, kappaPeak: 0.09, alphaPeak: 0.105, C: 1.6, relax: 0.22, crr: 0.016, radius: 0.13 };
export const TYRE_REAR: TyreParams = { mu: 1.88, fz0: 450, loadSens: 0.18, kappaPeak: 0.1, alphaPeak: 0.11, C: 1.2, relax: 0.26, crr: 0.016, radius: 0.14 };

/** Resultado de evaluar un neumático (en ejes de la rueda: x adelante, y izquierda). */
export interface TyreOut {
  fx: number;
  fy: number;
  /** Deslizamiento combinado normalizado (1 = pico de agarre). */
  sigma: number;
  /** Pendiente dFx/dκ (para el integrador implícito del giro de la rueda). */
  dFdk: number;
}

/**
 * Fuerzas del neumático.
 * @param kappa patinaje longitudinal (positivo = la rueda gira más rápido que el suelo: tracción)
 * @param tanAlpha tangente de la deriva (positiva = la fuerza empuja hacia la izquierda)
 * @param grip agarre relativo de la superficie (asfalto 1, hierba ~0,55…)
 */
export function tyreForce(p: TyreParams, fz: number, kappa: number, tanAlpha: number, grip: number, out: TyreOut): TyreOut {
  out.fx = out.fy = out.sigma = 0;
  out.dFdk = 0;
  if (fz <= 0) return out;
  const mu = p.mu * grip * Math.min(1.3, Math.max(0.7, 1 - p.loadSens * (fz / p.fz0 - 1)));
  const fmax = mu * fz;
  const sx = kappa / p.kappaPeak;
  const sy = tanAlpha / Math.tan(p.alphaPeak);
  const s = Math.hypot(sx, sy);
  // Curva normalizada con el pico en s = 1
  const Bn = Math.tan(Math.PI / (2 * p.C));
  const shape = (x: number) => Math.sin(p.C * Math.atan(Bn * x));
  if (s < 1e-6) {
    // Pendiente en el origen (rigidez longitudinal)
    out.dFdk = (fmax * p.C * Bn) / p.kappaPeak;
    return out;
  }
  const f = fmax * shape(s);
  out.fx = (f * sx) / s;
  out.fy = (f * sy) / s;
  out.sigma = s;
  // dFx/dκ numérica (acotada a valores positivos para que el integrador sea estable)
  const e = 0.002;
  const sx2 = (kappa + e) / p.kappaPeak;
  const s2 = Math.hypot(sx2, sy);
  const fx2 = (fmax * shape(s2) * sx2) / s2;
  out.dFdk = Math.max((fmax * 0.05) / p.kappaPeak, (fx2 - out.fx) / e);
  return out;
}
