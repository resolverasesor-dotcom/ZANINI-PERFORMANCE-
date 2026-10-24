import type { TrackDef } from '../TrackData';
import { rounded, type V } from './helpers';

// Kartódromos de verdad: parcelas pequeñas, pista de 8 m de ancho, tramos
// paralelos separados solo por hierba y neumáticos, horquillas y rectas cortas.
// Vueltas de 35–50 s, como en un kartódromo real.

const kd = { width: 8, runoff: 3, surface: 'grass' as const, venue: 'karting' as const, series: 'kart' as const };

const nuciaPoly: V[] = [
  [-90, 0, 10],
  [100, 0, 10],
  [100, 40, 9],
  [60, 40, 8],
  [60, 20, 8],
  [20, 20, 8],
  [20, 60, 10],
  [120, 60, 10],
  [120, 90, 10],
  [-10, 90, 9],
  [-10, 50, 9],
  [-50, 50, 9],
  [-50, 90, 9],
  [-90, 90, 10],
];

export const nucia: TrackDef = {
  id: 'la-nucia',
  name: 'Kartódromo La Nucía',
  subtitle: 'El ratonero',
  description: 'Rectas cortas, horquillas y ángulos de 90°. Aquí se gana frenando tarde y saliendo bien.',
  theme: 'ring',
  points: rounded(nuciaPoly),
  ...kd,
  startAt: 0.1601,
  laps: 8,
  record: { time: 51.0, holder: 'L. Pérez' },
  length: 825,
  difficulty: 2,
  decor: [
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'pine', count: 60, minDist: 30, maxDist: 120 }],
};

const finestratPoly: V[] = [
  [-170, 0, 12, 0],
  [0, 0, 12, 0],
  [110, 90, 14, 0.5],
  [150, 60, 12, 2.5],
  [140, 10, 12, 4.5],
  [110, 0, 12, 6],
  [0, 90, 12, 6],
  [-40, 90, 9, 5],
  [-60, 50, 8, 3],
  [-90, 90, 9, 1.5],
  [-170, 90, 12, 0.5],
];

export const finestrat: TrackDef = {
  id: 'finestrat',
  name: 'Kartódromo Finestrat',
  subtitle: 'El ocho del puente',
  description: 'Trazado en ocho con un puente que cruza la recta de meta. Subidas, bajadas y mucho ritmo.',
  theme: 'sunset',
  points: rounded(finestratPoly),
  ...kd,
  startAt: 0.1415,
  laps: 8,
  record: { time: 46.9, holder: 'M. Soler' },
  length: 862,
  difficulty: 3,
  decor: [
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'pine', count: 50, minDist: 30, maxDist: 120 }],
};

const elchePoly: V[] = [
  [-100, 0, 12],
  [110, 0, 18],
  [150, 30, 18],
  [110, 50, 14],
  [-10, 40, 16],
  [-40, 70, 14],
  [-10, 95, 14],
  [120, 90, 16],
  [150, 130, 18],
  [100, 150, 14],
  [-130, 140, 20],
  [-150, 70, 16],
  [-130, 20, 14],
];

export const elche: TrackDef = {
  id: 'elche',
  name: 'Karting Elche · Palmeral',
  subtitle: 'Entre palmeras',
  description: 'El más rápido de la liga: curvas enlazadas entre palmeras y una horquilla para adelantar.',
  theme: 'coast',
  points: rounded(elchePoly),
  ...kd,
  startAt: 0.1230,
  laps: 8,
  record: { time: 52.5, holder: 'J. Botella' },
  length: 1090,
  difficulty: 2,
  decor: [
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'palm', count: 70, minDist: 25, maxDist: 120 }],
};

const santaPolaPoly: V[] = [
  [-80, 0, 9],
  [90, 0, 9],
  [90, 30, 8],
  [40, 30, 7],
  [40, 55, 8],
  [100, 55, 9],
  [100, 85, 9],
  [0, 85, 8],
  [0, 40, 7],
  [-40, 40, 7],
  [-40, 80, 8],
  [-90, 80, 9],
  [-90, 40, 8],
];

export const santaPola: TrackDef = {
  id: 'santa-pola',
  name: 'Karting Santa Pola',
  subtitle: 'Nocturna bajo focos',
  description: 'Carrera de noche bajo los focos. El más corto y revirado: no hay ni un segundo de descanso.',
  theme: 'night',
  points: rounded(santaPolaPoly),
  ...kd,
  startAt: 0.1674,
  laps: 10,
  record: { time: 44.8, holder: 'S. Mira' },
  length: 681,
  difficulty: 4,
  decor: [
    { type: 'lamp', side: -1, every: 26, offset: 0.6 },
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'building', count: 20, minDist: 60, maxDist: 160 }],
};

const xabiaPoly: V[] = [
  [-90, 0, 10],
  [100, 0, 10],
  [120, 30, 9],
  [90, 45, 8],
  [40, 35, 8],
  [20, 65, 9],
  [70, 75, 9],
  [110, 85, 10],
  [120, 120, 10],
  [60, 125, 8],
  [45, 105, 6],
  [25, 125, 6],
  [-40, 125, 12],
  [-60, 85, 9],
  [-30, 60, 8],
  [-60, 35, 8],
  [-115, 30, 12],
];

export const xabia: TrackDef = {
  id: 'xabia',
  name: 'Karting Xàbia · Montgó',
  subtitle: 'A los pies del Montgó',
  description: 'Técnico y bacheado, con la montaña de fondo. La chicane del final decide las carreras.',
  theme: 'mountain',
  points: rounded(xabiaPoly),
  ...kd,
  startAt: 0.1567,
  laps: 8,
  record: { time: 49.8, holder: 'C. Ferrándiz' },
  length: 817,
  difficulty: 3,
  decor: [
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'pine', count: 60, minDist: 30, maxDist: 120 }],
};

const internacionalPoly: V[] = [
  [-120, 0, 12],
  [140, 0, 14],
  [170, 45, 14],
  [130, 70, 10],
  [70, 50, 12],
  [20, 80, 20],
  [60, 120, 12],
  [150, 130, 16],
  [170, 170, 14],
  [100, 180, 12],
  [-60, 175, 25],
  [-100, 130, 10],
  [-50, 100, 10],
  [-40, 60, 12],
  [-110, 50, 14],
  [-150, 30, 14],
];

export const internacional: TrackDef = {
  id: 'internacional',
  name: 'Kartódromo Internacional Zanini',
  subtitle: 'Homologado CIK',
  description: 'La casa de Ale. Pista ancha de campeonato, recta larga y una última curva para la historia.',
  theme: 'gp',
  points: rounded(internacionalPoly),
  ...kd,
  startAt: 0.1175,
  width: 9,
  laps: 7,
  record: { time: 59.8, holder: 'A. Zanini' },
  length: 1158,
  difficulty: 3,
  decor: [
    { type: 'banner', side: 0, every: 46, offset: 1.2 },
    { type: 'tyres', side: 0, every: 70, offset: 2.5 },
  ],
  scatter: [{ type: 'tree', count: 60, minDist: 30, maxDist: 120 }],
};
