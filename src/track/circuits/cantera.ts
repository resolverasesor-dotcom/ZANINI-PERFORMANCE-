import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Muy rápido, curvas largas y abiertas para derrapes eternos. Escapatorias de arena.
const poly: V[] = [
  [-230, 0, 70],
  [140, 0, 70],
  [270, 105, 60],
  [200, 225, 60],
  [60, 205, 70],
  [-50, 285, 65],
  [-220, 250, 70],
  [-310, 130, 70],
];

export const cantera: TrackDef = {
  id: 'cantera',
  name: 'Cantera',
  subtitle: 'Alta velocidad',
  description: 'Una antigua cantera convertida en pista: rapidísima y con curvas largas para dejar deslizar el kart.',
  theme: 'quarry',
  points: rounded(poly),
  width: 14,
  runoff: 10,
  surface: 'gravel',
  startAt: 0.1478,
  laps: 4,
  record: { time: 47.3, holder: 'S. Lindqvist' },
  length: 1373,
  difficulty: 3,
  decor: [
    { type: 'rock', side: 0, every: 24, offset: 5, jitter: 6 },
    { type: 'crate', side: 1, every: 60, offset: 3, jitter: 3 },
    { type: 'cone', side: 0, every: 18, offset: 0.2, from: 0.3, to: 0.95 },
    { type: 'grandstand', side: -1, every: 34, offset: 5, from: 0.94, to: 0.06 },
  ],
  scatter: [
    { type: 'rock', count: 160, minDist: 30, maxDist: 220 },
    { type: 'crate', count: 20, minDist: 30, maxDist: 120 },
  ],
};
