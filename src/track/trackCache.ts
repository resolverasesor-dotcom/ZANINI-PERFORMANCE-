import { computeRacingLine } from '../ai/RacingLine';
import { referenceLap } from '../race/RaceSim';
import { KART } from '../physics/Kart';
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

/** Vuelta de referencia de una IA perfecta al ritmo indicado (simulada y cacheada). */
export function getRefLap(id: string, speedFactor = 1): number {
  const key = `${id}@${speedFactor}@${KART.vmax}`;
  let r = refs.get(key);
  if (r == null) {
    r = referenceLap(getTrack(id), speedFactor);
    refs.set(key, r);
  }
  return r;
}
