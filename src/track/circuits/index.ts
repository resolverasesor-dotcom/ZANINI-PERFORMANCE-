import type { TrackDef } from '../TrackData';
import { zaniniRing } from './zaniniRing';
import { costaBlanca } from './costaBlanca';
import { montana } from './montana';
import { urbano } from './urbano';
import { cantera } from './cantera';
import { granPremio } from './granPremio';

/** Registro de circuitos. El orden es el del campeonato. */
export const CIRCUITS: TrackDef[] = [zaniniRing, costaBlanca, montana, urbano, cantera, granPremio];

export function getCircuit(id: string): TrackDef {
  return CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0];
}
