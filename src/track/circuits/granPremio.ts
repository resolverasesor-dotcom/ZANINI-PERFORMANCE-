import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// El más largo y difícil: recta de 550 m, horquilla, eses, chicane y curvas rápidas.
const poly: V[] = [
  [-300, 0, 34],
  [290, 0, 13],
  [300, 46, 13],
  [180, 60, 38],
  [122, 130, 32],
  [200, 200, 36],
  [162, 280, 40],
  [40, 262, 24],
  [8, 186, 18],
  [-58, 192, 26],
  [-118, 282, 55],
  [-280, 272, 46],
  [-362, 152, 58],
  [-345, 42, 40],
];

export const granPremio: TrackDef = {
  id: 'gran-premio',
  name: 'Gran Premio Zanini',
  subtitle: 'El desafío final',
  description: 'El trazado más largo y exigente. Recta enorme, horquilla, eses y chicane.',
  theme: 'gp',
  points: rounded(poly),
  width: 12.5,
  runoff: 8,
  surface: 'gravel',
  startAt: 0.0865,
  laps: 3,
  record: { time: 66.8, holder: 'A. Zanini' },
  length: 1841,
  difficulty: 5,
  decor: [
    { type: 'grandstand', side: 1, every: 34, offset: 5, from: 0.95, to: 0.2 },
    { type: 'grandstand', side: -1, every: 40, offset: 5, from: 0.0, to: 0.18 },
    { type: 'tyres', side: 0, every: 10, offset: 0.4, from: 0.22, to: 0.93 },
    { type: 'banner', side: 0, every: 55, offset: 1.5 },
    { type: 'tree', side: 0, every: 24, offset: 12, jitter: 8, from: 0.25, to: 0.9 },
  ],
  scatter: [
    { type: 'tree', count: 220, minDist: 34, maxDist: 220 },
    { type: 'rock', count: 30, minDist: 40, maxDist: 200 },
  ],
};
