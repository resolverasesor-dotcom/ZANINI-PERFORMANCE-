import type { TrackDef } from '../TrackData';
import { zaniniRing } from './zaniniRing';
import { costaBlanca } from './costaBlanca';
import { montana } from './montana';
import { urbano } from './urbano';
import { cantera } from './cantera';
import { granPremio } from './granPremio';
import { altea, benidorm, calpe, denia, torrevieja } from './costaKarting';

/** Registro de circuitos. */
export const CIRCUITS: TrackDef[] = [zaniniRing, costaBlanca, montana, urbano, cantera, granPremio, benidorm, calpe, altea, torrevieja, denia];

/** Calendarios de campeonato (6 GP cada uno). */
export const SERIES = {
  zanini: { id: 'zanini', name: 'Campeonato Zanini', tracks: ['zanini-ring', 'costa-blanca', 'montana', 'urbano', 'cantera', 'gran-premio'] },
  costa: { id: 'costa', name: 'Copa Costa Blanca', tracks: ['benidorm', 'calpe', 'altea', 'costa-blanca', 'torrevieja', 'denia'] },
} as const;

export type SeriesKey = keyof typeof SERIES;

export function getCircuit(id: string): TrackDef {
  return CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0];
}
