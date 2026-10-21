// Parrilla de pilotos rivales. Atributos 0..1.

export interface DriverDef {
  id: string;
  name: string;
  short: string;
  nat: string;
  number: number;
  color: string;
  /** Ritmo puro. */
  pace: number;
  /** Consistencia: menos errores y menos variación. */
  consistency: number;
  /** Agresividad al adelantar. */
  aggression: number;
  /** Defensa de posición. */
  defense: number;
}

export const DRIVERS: DriverDef[] = [
  { id: 'bellini', name: 'Marco Bellini', short: 'BEL', nat: 'ITA', number: 5, color: '#1E6FE0', pace: 0.95, consistency: 0.9, aggression: 0.65, defense: 0.75 },
  { id: 'rios', name: 'Sofía Ríos', short: 'RIO', nat: 'ESP', number: 11, color: '#8E24AA', pace: 0.92, consistency: 0.85, aggression: 0.8, defense: 0.6 },
  { id: 'brenner', name: 'Kai Brenner', short: 'BRE', nat: 'GER', number: 3, color: '#B0BEC5', pace: 0.9, consistency: 0.95, aggression: 0.45, defense: 0.85 },
  { id: 'okafor', name: 'Daniel Okafor', short: 'OKA', nat: 'GBR', number: 44, color: '#F4511E', pace: 0.88, consistency: 0.8, aggression: 0.75, defense: 0.7 },
  { id: 'lindqvist', name: 'Saga Lindqvist', short: 'LIN', nat: 'SWE', number: 9, color: '#26C6DA', pace: 0.85, consistency: 0.88, aggression: 0.5, defense: 0.65 },
  { id: 'tanaka', name: 'Hiro Tanaka', short: 'TAN', nat: 'JPN', number: 18, color: '#EC407A', pace: 0.82, consistency: 0.75, aggression: 0.7, defense: 0.55 },
  { id: 'martin', name: 'Chloé Martin', short: 'MAR', nat: 'FRA', number: 14, color: '#3949AB', pace: 0.78, consistency: 0.82, aggression: 0.55, defense: 0.6 },
  { id: 'costa', name: 'Rafael Costa', short: 'COS', nat: 'BRA', number: 27, color: '#43A047', pace: 0.74, consistency: 0.7, aggression: 0.85, defense: 0.5 },
  { id: 'ferrer', name: 'Lucas Ferrer', short: 'FER', nat: 'ESP', number: 22, color: '#00897B', pace: 0.7, consistency: 0.78, aggression: 0.4, defense: 0.7 },
  { id: 'novak', name: 'Emma Novak', short: 'NOV', nat: 'CZE', number: 31, color: '#FFB300', pace: 0.65, consistency: 0.72, aggression: 0.5, defense: 0.45 },
  { id: 'cruz', name: 'Valentina Cruz', short: 'CRU', nat: 'ARG', number: 63, color: '#7CB342', pace: 0.6, consistency: 0.65, aggression: 0.6, defense: 0.5 },
];

export type Difficulty = 'facil' | 'normal' | 'dificil' | 'pro';

export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'facil', label: 'Fácil' },
  { id: 'normal', label: 'Normal' },
  { id: 'dificil', label: 'Difícil' },
  { id: 'pro', label: 'Pro' },
];

/** Fracción del perfil de velocidad ideal que usa la IA por dificultad. */
export const DIFF_SPEED: Record<Difficulty, number> = {
  facil: 0.86,
  normal: 0.925,
  dificil: 0.97,
  pro: 1.0,
};

/** Multiplicador de probabilidad de error por dificultad. */
export const DIFF_MISTAKES: Record<Difficulty, number> = {
  facil: 1.5,
  normal: 1.0,
  dificil: 0.6,
  pro: 0.3,
};

/** Factor de ritmo de un piloto (0.97..1.0 del ideal de la dificultad). */
export function paceFactor(d: DriverDef): number {
  return 0.965 + 0.035 * d.pace;
}
