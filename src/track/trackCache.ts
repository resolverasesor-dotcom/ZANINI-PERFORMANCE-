import { computeRacingLine } from '../ai/RacingLine';
import { referenceLap } from '../race/RaceSim';
import { getCircuit } from './circuits/index';
import { Track } from './Track';

const tracks = new Map<string, Track>();
const refs = new Map<string, number>();

/** Pista lista para usar (con línea de carrera calculada), cacheada por id. */
export function getTrack(id: string): Track {
  let t = tracks.get(id);
  if (!t) {
    t = new Track(getCircuit(id));
    computeRacingLine(t);
    tracks.set(id, t);
  }
  return t;
}

/** Vuelta de referencia de la IA a ritmo máximo (simulada, cacheada). */
export function getRefLap(id: string): number {
  let r = refs.get(id);
  if (r == null) {
    r = referenceLap(getTrack(id), 1.0);
    refs.set(id, r);
  }
  return r;
}
