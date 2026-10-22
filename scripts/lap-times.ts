// Tiempos de vuelta de referencia (IA perfecta) en cada circuito y cilindrada.
// Un circuito de karting real se da en 40–60 s; ninguno debe pasar de 1:20.
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';
import { computeRacingLine } from '../src/ai/RacingLine';
import { referenceLap } from '../src/race/RaceSim';
import { setKartClass } from '../src/physics/Kart';
import { SPEED_CLASS } from '../src/core/Settings';

const LIMIT = 80;
let fail = false;
const only = process.argv[2];
for (const def of CIRCUITS) {
  if (only && def.id !== only) continue;
  const t = new Track(def);
  computeRacingLine(t);
  const row: string[] = [];
  for (const k of ['150', '100', '50'] as const) {
    setKartClass(SPEED_CLASS[k].vmax, SPEED_CLASS[k].accel);
    const lap = referenceLap(t, 1);
    // Un jugador medio va ~8 % más lento que la IA perfecta
    if (lap * 1.08 > LIMIT) fail = true;
    row.push(`${k}cc ${lap.toFixed(1)}s`);
  }
  setKartClass(1, 1);
  console.log(`${def.name.padEnd(24)} ${t.length.toFixed(0).padStart(5)} m  récord ${def.record.time}s  | ${row.join('  ')}`);
}
process.exit(fail ? 1 : 0);
