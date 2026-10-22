// Prueba sin render: carreras completas solo con IA en todos los circuitos.
// Verifica que todos terminan, que nadie atraviesa muros y cuántas veces
// la IA ha necesitado reaparecer.
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';
import { computeRacingLine } from '../src/ai/RacingLine';
import { DRIVERS, DIFF_SPEED, type Difficulty } from '../src/ai/Drivers';
import { RaceSim, referenceLap, type Entrant } from '../src/race/RaceSim';
import { emptyInput } from '../src/physics/Kart';

(globalThis as any).__aiRespawn = {};
const diff = (process.argv[2] as Difficulty) ?? 'normal';
const only = process.argv[3];
let fail = false;
for (const def of CIRCUITS) {
  if (only && def.id !== only) continue;
  const track = new Track(def);
  computeRacingLine(track);
  const t0 = Date.now();
  const ref = referenceLap(track, 1.0);
  const refN = referenceLap(track, DIFF_SPEED[diff]);
  const entrants: Entrant[] = DRIVERS.map((d) => ({ id: d.id, name: d.name, short: d.short, nat: d.nat, number: d.number, color: d.color, isPlayer: false, driver: d }));
  const sim = new RaceSim({ track, kind: 'race', laps: 3, difficulty: diff, entrants, seed: 7 });
  let respawns = 0;
  for (const c of sim.comps) {
    const orig = c.kart.respawn.bind(c.kart);
    c.kart.respawn = (t) => { respawns++; orig(t); };
  }
  const dt = 1 / 120;
  let maxOut = 0;
  let steps = 0;
  let wallHits = 0, kartHits = 0, drifts = 0;
  while (sim.phase !== 'finished' && steps < 120 * 900) {
    sim.step(dt, emptyInput(), false);
    for (const c of sim.comps) {
      const p = c.kart.proj;
      const out = p.lat > 0 ? p.lat - p.limR : -p.lat - p.limL;
      maxOut = Math.max(maxOut, out);
      if (c.kart.wallImpact > 3) wallHits++;
      if (c.kart.kartImpact > 2) kartHits++;
      if (c.kart.events.includes("slideStart")) drifts++;
    }
    sim.events.length = 0;
    steps++;
  }
  const res = sim.phase === 'finished' ? sim.results() : [];
  const ok = sim.phase === 'finished' && maxOut < 0.01;
  if (!ok) fail = true;
  const best = Math.min(...sim.comps.map((c) => c.bestLap ?? 1e9));
  console.log(`${ok ? 'OK ' : 'ERR'} ${def.name.padEnd(20)} ref(pro)=${ref.toFixed(2)} ref(${diff})=${refN.toFixed(2)} best=${best.toFixed(2)} winner=${res[0]?.entrant.short} t=${sim.time.toFixed(0)}s respawns=${respawns} wallHits=${wallHits} kartHits=${kartHits} drifts=${drifts} maxOut=${maxOut.toFixed(3)} (${Date.now() - t0}ms) ${JSON.stringify((globalThis as any).__aiRespawn)}`); (globalThis as any).__aiRespawn = {};
  if (process.argv[4] === 'v') for (const r of res) console.log(`   ${r.position}. ${r.entrant.short} ${r.total.toFixed(2)} best=${r.bestLap?.toFixed(2)} pen=${r.penalty} down=${r.lapsDown}`);
}
process.exit(fail ? 1 : 0);
