// Modelos de kart (chasis) que puede elegir el jugador.
//
// Cada modelo cambia magnitudes FÍSICAS reales del vehículo (masa, inercia, potencia,
// agarre del compuesto, reparto de rigidez del chasis, frenos); nada de multiplicadores
// sobre el resultado. Están equilibrados para que ninguno sea el mejor en todo: el
// tiempo por vuelta queda parecido y cambia la forma de conducir.

export type ChassisId = 'r1' | 'saeta' | 'toro' | 'lapa' | 'tostadora' | 'ale';

export type BodyStyle = 'std' | 'aero' | 'tanque' | 'retro' | 'ale';

export interface ChassisSpec {
  id: ChassisId;
  name: string;
  /** Frase de presentación (con humor). */
  tagline: string;
  /** Para quién es. */
  style: string;
  body: BodyStyle;
  /** Factores sobre el kart de referencia (1 = igual). */
  mass: number;
  Iz: number;
  power: number;
  vmax: number;
  fMax: number;
  grip: number;
  brake: number;
  /** Cambio del reparto de la transferencia lateral al eje delantero (+ = más subvirador). */
  rollFront: number;
  /** Barras de la ficha (1…5). */
  stats: { punta: number; acel: number; agarre: number; agil: number };
}

export const CHASSIS: ChassisSpec[] = [
  {
    id: 'r1',
    name: 'Zanini R1',
    tagline: 'El de toda la vida. Hecho en un garaje, afinado en mil vueltas.',
    style: 'Equilibrado. Si dudas, este.',
    body: 'std',
    mass: 1,
    Iz: 1,
    power: 1,
    vmax: 1,
    fMax: 1,
    grip: 1,
    brake: 1,
    rollFront: 0,
    stats: { punta: 3, acel: 3, agarre: 3, agil: 3 },
  },
  {
    id: 'saeta',
    name: 'Saeta S7',
    tagline: 'Pesa menos que la compra del sábado. Gira antes de que lo pienses.',
    style: 'Ágil y nervioso: para quien sabe sujetar la zaga.',
    body: 'aero',
    mass: 0.95,
    Iz: 0.84,
    power: 0.97,
    vmax: 0.99,
    fMax: 0.97,
    grip: 0.99,
    brake: 1.02,
    rollFront: -0.03,
    stats: { punta: 2, acel: 4, agarre: 3, agil: 5 },
  },
  {
    id: 'toro',
    name: 'Toro V12*',
    tagline: '*Tiene un cilindro. Pero empuja como doce. Frena como uno.',
    style: 'Punta y empuje. Pesado en las horquillas.',
    body: 'tanque',
    mass: 1.06,
    Iz: 1.12,
    power: 1.08,
    vmax: 1.035,
    fMax: 1.06,
    grip: 0.98,
    brake: 0.94,
    rollFront: 0.02,
    stats: { punta: 5, acel: 4, agarre: 2, agil: 2 },
  },
  {
    id: 'lapa',
    name: 'Lapa GT',
    tagline: 'Se pega al asfalto como el chicle a la zapatilla.',
    style: 'Mucho agarre y muy noble. Ideal para empezar.',
    body: 'std',
    mass: 1.02,
    Iz: 1.04,
    power: 0.95,
    vmax: 0.97,
    fMax: 0.96,
    grip: 1.05,
    brake: 1.06,
    rollFront: 0.04,
    stats: { punta: 2, acel: 2, agarre: 5, agil: 3 },
  },
  {
    id: 'tostadora',
    name: 'La Tostadora 1978',
    tagline: 'Del abuelo. Huele a aceite y a gloria. Hace tostadas en las rectas.',
    style: 'Clásico de chapa: potente pero poco agarre. Para valientes.',
    body: 'retro',
    mass: 1.04,
    Iz: 1.08,
    power: 1.06,
    vmax: 1.02,
    fMax: 1.02,
    grip: 0.95,
    brake: 0.9,
    rollFront: -0.03,
    stats: { punta: 4, acel: 3, agarre: 1, agil: 2 },
  },
  {
    id: 'ale',
    name: 'Bólido de Ale',
    tagline: 'Montado tornillo a tornillo por papá. No está en venta.',
    style: 'Lo mejor de cada uno. Hay que ganárselo.',
    body: 'ale',
    mass: 0.97,
    Iz: 0.93,
    power: 1.03,
    vmax: 1.01,
    fMax: 1.02,
    grip: 1.02,
    brake: 1.03,
    rollFront: 0,
    stats: { punta: 4, acel: 4, agarre: 4, agil: 4 },
  },
];

export const STANDARD_CHASSIS = CHASSIS[0];

export function getChassis(id: string | undefined): ChassisSpec {
  return CHASSIS.find((c) => c.id === id) ?? STANDARD_CHASSIS;
}

/** Modelos de los rivales (por orden de piloto): variedad en pista, todos equilibrados. */
export const AI_CHASSIS: ChassisId[] = ['r1', 'saeta', 'toro', 'lapa', 'r1', 'tostadora'];
