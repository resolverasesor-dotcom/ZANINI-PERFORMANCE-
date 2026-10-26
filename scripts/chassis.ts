// Modelos de kart: equilibrio de tiempos por vuelta (IA perfecta con la línea de cada
// chasis) y carácter al volante (volante a tope a varias velocidades, con el filtro).
// Ninguno debe ser más de un 1,5 % más rápido o lento que el R1 (el Bólido de Ale,
// que se gana, puede ir hasta un 2 % más rápido).
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';
import { computeRacingLine } from '../src/ai/RacingLine';
import { referenceLap } from '../src/race/RaceSim';
import { emptyInput, Kart, KART } from '../src/physics/Kart';
import { CHASSIS } from '../src/physics/chassis';
import { filterSteer } from '../src/core/steerFilter';

const ids = ['zanini-ring', 'la-nucia', 'gran-premio', 'costa-blanca', 'finestrat'];
const base = { vmax: KART.vmax, aLat: KART.aLat };
const tot: Record<string, number> = {};
for (const id of ids) {
  const def = CIRCUITS.find((c) => c.id === id)!;
  for (const c of CHASSIS) {
    // la IA conduce con la línea y el perfil de velocidad de ese chasis
    KART.vmax = base.vmax * c.vmax;
    KART.aLat = base.aLat * c.grip;
    const t = new Track(def);
    computeRacingLine(t);
    tot[c.id] = (tot[c.id] ?? 0) + referenceLap(t, 1, c);
    KART.vmax = base.vmax;
    KART.aLat = base.aLat;
  }
}

// Plataforma enorme para medir el carácter
const pts = [];
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  pts.push({ x: Math.cos(a) * 1500, z: Math.sin(a) * 1500 });
}
const pad = new Track({ id: 'pad', name: '', subtitle: '', description: '', theme: 'ring', points: pts, width: 300, runoff: 20, surface: 'grass', laps: 1, record: { time: 0, holder: '' }, length: 0, difficulty: 1, decor: [], scatter: [] } as never);
function character(c: (typeof CHASSIS)[number], vt: number): { g: number; slide: number } {
  const dt = 1 / 120;
  const k = new Kart();
  k.spec = c;
  k.setPose(pad, 0, 0);
  for (let t = 0; t < 20; t += dt) {
    const i = emptyInput();
    i.throttle = k.vF < vt ? 1 : 0;
    k.step(dt, i, pad);
  }
  let g = 0;
  let slide = 0;
  for (let t = 0; t < 2.5; t += dt) {
    const i = emptyInput();
    i.steer = filterSteer(1, k.vF, true, k.vL);
    i.throttle = k.vF < vt ? 1 : 0.3;
    k.step(dt, i, pad);
    if (t > 0.3) {
      g = Math.max(g, Math.abs(k.ay) / 9.81);
      slide = Math.max(slide, k.slipRear * 57.3);
    }
  }
  return { g, slide };
}

let fail = false;
const ref = tot.r1;
for (const c of CHASSIS) {
  const d = ((tot[c.id] - ref) / ref) * 100;
  const lo = c.id === 'ale' ? -2 : -1.5;
  const ok = d >= lo && d <= 1.5;
  if (!ok) fail = true;
  const a = character(c, 14);
  const b = character(c, 24);
  console.log(
    `${ok ? 'OK ' : 'MAL'} ${c.name.padEnd(18)} 5 vueltas ${tot[c.id].toFixed(2)} s (${d >= 0 ? '+' : ''}${d.toFixed(2)} %) · a 50 km/h ${a.g.toFixed(2)} g, zaga ${a.slide.toFixed(0)}° · a 86 km/h ${b.g.toFixed(2)} g, zaga ${b.slide.toFixed(0)}°`,
  );
}
process.exit(fail ? 1 : 0);
