// Definición de un circuito como DATOS. Añadir un circuito = crear un TrackDef
// y registrarlo en circuits/index.ts. Todo lo demás (malla, colisiones, línea de
// carrera de la IA, minimapa, sectores) se genera automáticamente.

export type RunoffSurface = 'grass' | 'gravel' | 'sand' | 'asphalt';

export type ThemeId = 'ring' | 'coast' | 'mountain' | 'night' | 'quarry' | 'gp' | 'sunset';

/** Serie a la que pertenece el circuito (agrupa la pantalla de selección y los campeonatos). */
export type SeriesId = 'kart' | 'zanini' | 'costa';

/** Monumentos y elementos singulares del paisaje. */
export type LandmarkType = 'penon' | 'intempo' | 'church' | 'whitehouses' | 'castle' | 'lighthouse' | 'boats' | 'saltlake' | 'saltpiles' | 'skyline';

export interface Landmark {
  type: LandmarkType;
  x: number;
  z: number;
  scale?: number;
  rot?: number;
  /** Para lagos: semiejes. */
  rx?: number;
  rz?: number;
}

/** Punto de control de la spline central (en metros). y = altura. */
export interface ControlPoint {
  x: number;
  z: number;
  y?: number;
  /** Anchura de la pista en este punto (si no, la del circuito). */
  w?: number;
  /** Escapatoria a la izquierda / derecha (m) hasta el muro. */
  runL?: number;
  runR?: number;
}

export type DecorType =
  | 'tree'
  | 'pine'
  | 'palm'
  | 'rock'
  | 'building'
  | 'lamp'
  | 'grandstand'
  | 'tyres'
  | 'banner'
  | 'cone'
  | 'crate'
  | 'promenade';

/** Regla de decoración a lo largo de la pista (fracciones de vuelta 0..1). */
export interface DecorRule {
  type: DecorType;
  /** -1 izquierda, 1 derecha, 0 ambos lados. */
  side: -1 | 0 | 1;
  /** Separación en metros entre elementos. */
  every: number;
  /** Distancia extra fuera del muro (m). */
  offset?: number;
  from?: number;
  to?: number;
  /** Aleatoriedad de posición (m). */
  jitter?: number;
}

/** Dispersión libre por el paisaje (lejos de la pista). */
export interface ScatterRule {
  type: DecorType;
  count: number;
  minDist: number;
  maxDist: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  theme: ThemeId;
  /** Spline cerrada; el primer punto queda cerca de la línea de meta. */
  points: ControlPoint[];
  width: number;
  runoff: number;
  surface: RunoffSurface;
  /** Fracción de vuelta en la que está la línea de meta (0..1). */
  startAt?: number;
  /** Inicio de los sectores 2 y 3 (fracciones de vuelta). */
  sectors?: [number, number];
  /** Vueltas por defecto en carrera. */
  laps: number;
  /** Récord de referencia del circuito (segundos) y su autor. */
  record: { time: number; holder: string };
  /** Longitud aproximada declarada (m). La real se calcula de la spline. */
  length: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  decor: DecorRule[];
  scatter: ScatterRule[];
  series?: SeriesId;
  /**
   * Tipo de instalación. 'karting' = kartódromo: barreras de neumáticos en vez
   * de muros, valla perimetral, paddock con carpas, edificio del club y focos.
   */
  venue?: 'karting';
  /** Límite de la pista: muro de hormigón o barrera de neumáticos (por defecto, neumáticos en kartódromos). */
  barrier?: 'wall' | 'tyres';
  landmarks?: Landmark[];
  /** Mar (Costa Blanca): todo lo que quede más allá de esta línea es agua. */
  sea?: { axis: 'x' | 'z'; value: number; dir: 1 | -1 };
}
