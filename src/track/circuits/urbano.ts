import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Circuito urbano nocturno: ángulos rectos, muros pegados a la pista y farolas.
const poly: V[] = [
  [-160, 0, 18],
  [120, 0, 15],
  [120, 90, 13],
  [60, 90, 12],
  [60, 152, 13],
  [-40, 152, 13],
  [-40, 96, 11],
  [-92, 96, 11],
  [-92, 142, 13],
  [-160, 142, 18],
];

export const urbano: TrackDef = {
  id: 'urbano',
  name: 'Urbano Nocturno',
  subtitle: 'Muros cerca',
  description: 'Calles cerradas de noche. Muros a un palmo y curvas de noventa grados.',
  theme: 'night',
  points: rounded(poly),
  width: 11,
  runoff: 1.4,
  surface: 'asphalt',
  startAt: 0.1781,
  laps: 4,
  record: { time: 45.1, holder: 'D. Okafor' },
  length: 897,
  difficulty: 4,
  decor: [
    { type: 'lamp', side: 0, every: 26, offset: 0.6 },
    { type: 'building', side: 0, every: 22, offset: 7, jitter: 2 },
    { type: 'banner', side: 1, every: 46, offset: 0.4 },
  ],
  scatter: [{ type: 'building', count: 90, minDist: 30, maxDist: 170 }],
};
