import type { TrackDef } from '../TrackData';
import { rounded, scaleV, type V } from './helpers';

// Corto y técnico: circuito de iniciación junto a la fábrica Zanini.
const poly: V[] = [
  [-90, 0, 0],
  [50, 0, 0],
  [100, 4, 30],
  [110, 50, 22],
  [92, 88, 20],
  [55, 92, 14],
  [34, 62, 14],
  [5, 48, 14],
  [-22, 62, 14],
  [-40, 104, 22],
  [-82, 116, 22],
  [-118, 86, 24],
  [-120, 30, 24],
];

export const zaniniRing: TrackDef = {
  id: 'zanini-ring',
  name: 'Zanini Ring',
  subtitle: 'Iniciación',
  description: 'Corto y técnico. El circuito de casa, perfecto para aprender a llevar un kart.',
  theme: 'ring',
  points: rounded(scaleV(poly, 1.25)),
  width: 12,
  runoff: 7,
  surface: 'grass',
  startAt: 0.1636,
  laps: 5,
  record: { time: 35.0, holder: 'M. Zanini' },
  length: 792,
  difficulty: 1,
  decor: [
    { type: 'grandstand', side: -1, every: 34, offset: 6, from: 0.9, to: 0.16 },
    { type: 'tyres', side: 0, every: 9, offset: 0.4, from: 0.18, to: 0.88 },
    { type: 'banner', side: 1, every: 40, offset: 1.5, from: 0.2, to: 0.9 },
    { type: 'tree', side: 0, every: 22, offset: 10, jitter: 6, from: 0.2, to: 0.9 },
  ],
  scatter: [
    { type: 'tree', count: 140, minDist: 30, maxDist: 160 },
    { type: 'rock', count: 20, minDist: 30, maxDist: 140 },
  ],
};
