import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Paseo marítimo con palmeras y el Mediterráneo a la izquierda en la recta.
const poly: V[] = [
  [-235, 0, 0],
  [190, 0, 34, 0, 13, 4, 7],
  [235, 60, 30],
  [195, 110, 26],
  [140, 98, 20],
  [105, 70, 22],
  [62, 72, 22],
  [25, 100, 26],
  [-55, 124, 30],
  [-108, 100, 24],
  [-135, 60, 20],
  [-185, 62, 22],
  [-258, 88, 24],
  [-280, 30, 26],
];

export const costaBlanca: TrackDef = {
  id: 'costa-blanca',
  name: 'Costa Blanca',
  subtitle: 'Paseo marítimo',
  description: 'Recta interminable junto al mar entre palmeras. Ideal para el rebufo.',
  theme: 'coast',
  points: rounded(poly).map((p) => ({ ...p, runL: p.z < 20 && p.x > -230 && p.x < 200 ? 3 : p.runL })),
  width: 12.5,
  runoff: 7,
  surface: 'sand',
  startAt: 0.1153,
  laps: 4,
  record: { time: 47.1, holder: 'L. Ferrer' },
  length: 1155,
  difficulty: 2,
  decor: [
    { type: 'promenade', side: -1, every: 12, offset: 0, from: 0.0, to: 0.36 },
    { type: 'palm', side: -1, every: 16, offset: 4, from: 0.0, to: 0.36 },
    { type: 'lamp', side: -1, every: 32, offset: 1.5, from: 0.0, to: 0.36 },
    { type: 'palm', side: 0, every: 26, offset: 6, jitter: 4, from: 0.37, to: 0.98 },
    { type: 'building', side: 1, every: 30, offset: 16, jitter: 4, from: 0.0, to: 0.34 },
    { type: 'grandstand', side: 1, every: 34, offset: 5, from: 0.96, to: 0.08 },
    { type: 'tyres', side: 0, every: 10, offset: 0.4, from: 0.38, to: 0.95 },
  ],
  scatter: [
    { type: 'palm', count: 70, minDist: 30, maxDist: 140 },
    { type: 'building', count: 30, minDist: 60, maxDist: 170 },
  ],
  sea: { axis: 'z', value: -26, dir: -1 },
};
