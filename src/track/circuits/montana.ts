import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Ocho con puente: el tramo superior cruza por encima del inferior.
// Cuarto valor de cada vértice = altura (m).
const poly: V[] = [
  [0, 0, 0, 9.5],
  [70, 70, 30, 8.6],
  [140, 96, 24, 7],
  [186, 56, 22, 6],
  [160, 12, 18, 5],
  [192, -40, 22, 4],
  [142, -96, 28, 2.6],
  [70, -70, 24, 1],
  [0, 0, 0, 0],
  [-70, 70, 24, 0.8],
  [-142, 96, 28, 2.4],
  [-192, 44, 22, 4],
  [-160, 0, 18, 5.5],
  [-190, -52, 22, 7],
  [-140, -96, 28, 8.6],
  [-70, -70, 24, 9.5],
];

export const montana: TrackDef = {
  id: 'montana',
  name: 'Montaña',
  subtitle: 'Puente y desniveles',
  description: 'Un ocho entre pinos con subidas, bajadas, curvas enlazadas y un puente.',
  theme: 'mountain',
  points: rounded(poly),
  width: 11.5,
  runoff: 5,
  surface: 'grass',
  startAt: 0.5245,
  laps: 4,
  record: { time: 44.9, holder: 'K. Brenner' },
  length: 1157,
  difficulty: 3,
  decor: [
    { type: 'pine', side: 0, every: 14, offset: 6, jitter: 6 },
    { type: 'rock', side: 0, every: 45, offset: 12, jitter: 6 },
    { type: 'tyres', side: 0, every: 12, offset: 0.4 },
  ],
  scatter: [
    { type: 'pine', count: 260, minDist: 26, maxDist: 190 },
    { type: 'rock', count: 50, minDist: 30, maxDist: 190 },
  ],
};
