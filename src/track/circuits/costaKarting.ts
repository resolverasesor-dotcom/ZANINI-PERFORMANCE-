import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Kartódromos de la Costa Blanca: pistas estrechas, cortas y muy reviradas,
// cada una con su monumento. Forman la "Copa Costa Blanca".

const kart = { width: 9.5, runoff: 4.5, barrier: 'tyres' as const };

const benidormPoly: V[] = [
  [-150, 0, 0],
  [120, 0, 14],
  [140, 44, 10],
  [98, 64, 10],
  [58, 40, 11],
  [18, 72, 13],
  [-32, 58, 11],
  [-62, 98, 13],
  [-124, 92, 15],
  [-158, 48, 13],
];

export const benidorm: TrackDef = {
  id: 'benidorm',
  name: 'Kartódromo Benidorm',
  subtitle: 'Rascacielos y playa',
  description: 'Entre la playa de Levante y los rascacielos. Curvas cerradas y una recta frente al mar.',
  theme: 'coast',
  series: 'costa',
  points: rounded(benidormPoly),
  ...kart,
  surface: 'sand',
  startAt: 0.1867,
  laps: 6,
  record: { time: 32.9, holder: 'P. Ramírez' },
  length: 718,
  difficulty: 2,
  sea: { axis: 'z', value: -30, dir: -1 },
  landmarks: [
    { type: 'intempo', x: -40, z: 210, scale: 1 },
    { type: 'skyline', x: 60, z: 230 },
  ],
  decor: [
    { type: 'palm', side: -1, every: 14, offset: 3, from: 0.0, to: 0.3 },
    { type: 'promenade', side: -1, every: 12, from: 0.0, to: 0.3 },
    { type: 'banner', side: 1, every: 30, offset: 1 },
    { type: 'tyres', side: 0, every: 8, offset: 0.4, from: 0.32, to: 0.97 },
    { type: 'grandstand', side: 1, every: 34, offset: 4, from: 0.02, to: 0.14 },
  ],
  scatter: [
    { type: 'palm', count: 50, minDist: 20, maxDist: 110 },
    { type: 'building', count: 40, minDist: 50, maxDist: 160 },
  ],
};

const calpePoly: V[] = [
  [-130, 0, 0],
  [110, 0, 12],
  [124, 46, 9],
  [72, 54, 9],
  [62, 98, 10],
  [124, 114, 12],
  [112, 166, 14],
  [-22, 170, 16],
  [-44, 124, 10],
  [0, 96, 10],
  [-12, 54, 10],
  [-84, 70, 12],
  [-146, 40, 14],
];

export const calpe: TrackDef = {
  id: 'calpe',
  name: 'Calpe · Peñón de Ifach',
  subtitle: 'Horquillas junto al Peñón',
  description: 'A los pies del Peñón de Ifach. Horquillas, eses y el mar a la izquierda.',
  theme: 'coast',
  series: 'costa',
  points: rounded(calpePoly),
  ...kart,
  surface: 'gravel',
  startAt: 0.1437,
  laps: 6,
  record: { time: 44.7, holder: 'C. Llorca' },
  length: 932,
  difficulty: 3,
  sea: { axis: 'z', value: -32, dir: -1 },
  landmarks: [
    { type: 'penon', x: 260, z: -230, scale: 1 },
    { type: 'boats', x: 60, z: -70 },
  ],
  decor: [
    { type: 'palm', side: 0, every: 22, offset: 4, jitter: 4 },
    { type: 'tyres', side: 0, every: 8, offset: 0.4 },
    { type: 'banner', side: -1, every: 36, offset: 1 },
    { type: 'grandstand', side: 1, every: 34, offset: 4, from: 0.02, to: 0.12 },
  ],
  scatter: [
    { type: 'palm', count: 40, minDist: 20, maxDist: 120 },
    { type: 'rock', count: 30, minDist: 25, maxDist: 140 },
    { type: 'building', count: 16, minDist: 60, maxDist: 160 },
  ],
};

const alteaPoly: V[] = [
  [-100, 0, 0],
  [140, 0, 16],
  [162, 62, 14],
  [112, 82, 10],
  [152, 132, 12],
  [92, 172, 14],
  [22, 142, 10],
  [-30, 178, 12],
  [-112, 152, 16],
  [-92, 92, 10],
  [-142, 50, 14],
];

export const altea: TrackDef = {
  id: 'altea',
  name: 'Altea · Pueblo Blanco',
  subtitle: 'Atardecer',
  description: 'Al atardecer, bajo la iglesia de la cúpula azul. Curvas enlazadas entre casas blancas.',
  theme: 'sunset',
  series: 'costa',
  points: rounded(alteaPoly),
  ...kart,
  surface: 'grass',
  startAt: 0.1509,
  laps: 6,
  record: { time: 40.5, holder: 'M. Ivars' },
  length: 875,
  difficulty: 3,
  sea: { axis: 'z', value: -34, dir: -1 },
  landmarks: [
    { type: 'church', x: 30, z: 290, scale: 1 },
    { type: 'whitehouses', x: 30, z: 270 },
  ],
  decor: [
    { type: 'tree', side: 0, every: 20, offset: 5, jitter: 4 },
    { type: 'lamp', side: 1, every: 30, offset: 0.5 },
    { type: 'tyres', side: 0, every: 8, offset: 0.4 },
    { type: 'banner', side: -1, every: 34, offset: 1 },
  ],
  scatter: [
    { type: 'palm', count: 30, minDist: 22, maxDist: 110 },
    { type: 'tree', count: 50, minDist: 22, maxDist: 140 },
  ],
};

const torreviejaPoly: V[] = [
  [-180, 0, 0],
  [150, 0, 30],
  [200, 80, 30],
  [140, 150, 28],
  [44, 142, 12],
  [4, 112, 12],
  [-58, 150, 18],
  [-170, 132, 28],
  [-222, 62, 26],
];

export const torrevieja: TrackDef = {
  id: 'torrevieja',
  name: 'Torrevieja · Salinas',
  subtitle: 'Lagunas rosas',
  description: 'Junto a la laguna rosa de las salinas. Rápida, llana y con montañas de sal.',
  theme: 'coast',
  series: 'costa',
  points: rounded(torreviejaPoly),
  ...kart,
  width: 10,
  surface: 'sand',
  startAt: 0.1331,
  laps: 5,
  record: { time: 37.9, holder: 'R. Galiana' },
  length: 992,
  difficulty: 2,
  landmarks: [
    { type: 'saltlake', x: -20, z: 62, rx: 120, rz: 24 },
    { type: 'saltlake', x: 40, z: -150, rx: 220, rz: 80 },
    { type: 'saltpiles', x: 60, z: 260 },
  ],
  decor: [
    { type: 'cone', side: 0, every: 14, offset: 0.2 },
    { type: 'banner', side: 1, every: 30, offset: 1 },
    { type: 'grandstand', side: 1, every: 34, offset: 4, from: 0.02, to: 0.1 },
    { type: 'tyres', side: 0, every: 10, offset: 0.4, from: 0.15, to: 0.95 },
  ],
  scatter: [
    { type: 'palm', count: 30, minDist: 22, maxDist: 140 },
    { type: 'rock', count: 10, minDist: 30, maxDist: 140 },
  ],
};

const deniaPoly: V[] = [
  [-130, 0, 0],
  [130, 0, 18],
  [150, 50, 10],
  [110, 70, 10],
  [130, 120, 14],
  [60, 150, 12],
  [30, 106, 10],
  [-20, 120, 10],
  [-60, 160, 14],
  [-130, 140, 14],
  [-110, 90, 10],
  [-150, 54, 14],
];

export const denia: TrackDef = {
  id: 'denia',
  name: 'Dénia · Puerto',
  subtitle: 'Castillo y faro',
  description: 'En el puerto, entre barcos, con el castillo vigilando desde la colina. Muy técnica.',
  theme: 'coast',
  series: 'costa',
  points: rounded(deniaPoly),
  ...kart,
  surface: 'asphalt',
  runoff: 2.5,
  startAt: 0.1544,
  laps: 6,
  record: { time: 39.4, holder: 'J. Signes' },
  length: 855,
  difficulty: 4,
  sea: { axis: 'z', value: -28, dir: -1 },
  landmarks: [
    { type: 'castle', x: -20, z: 260, scale: 1 },
    { type: 'lighthouse', x: 220, z: -40 },
    { type: 'boats', x: -40, z: -60 },
  ],
  decor: [
    { type: 'lamp', side: 0, every: 28, offset: 0.5 },
    { type: 'crate', side: -1, every: 40, offset: 3, jitter: 2 },
    { type: 'banner', side: 1, every: 30, offset: 0.5 },
    { type: 'tyres', side: 0, every: 10, offset: 0.4 },
  ],
  scatter: [
    { type: 'palm', count: 30, minDist: 22, maxDist: 120 },
    { type: 'building', count: 30, minDist: 50, maxDist: 160 },
  ],
};
