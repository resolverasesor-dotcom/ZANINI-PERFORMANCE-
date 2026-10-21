// Sugiere el valor de startAt de cada circuito: la meta en el primer punto con
// ~95 m de recta detrás (parrilla) y 35 m delante, lejos de puentes.
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';

for (const def of CIRCUITS) {
  const t = new Track(def);
  let best = 0;
  let bestK = Infinity;
  for (let s0 = 0; s0 < t.length; s0 += 2) {
    let k = 0;
    for (let d = -95; d <= 35; d++) k = Math.max(k, Math.abs(t.curv[t.index(s0 + d)]) + (t.bridge[t.index(s0 + d)] ? 1 : 0));
    if (k < bestK - 1e-6) {
      bestK = k;
      best = s0;
    }
  }
  const u = ((def.startAt ?? 0) + best / t.length) % 1;
  console.log(`${def.id.padEnd(14)} startAt: ${u.toFixed(4)}  (radio mínimo en parrilla ${bestK > 0 ? (1 / bestK).toFixed(0) : '∞'} m)  longitud ${t.length.toFixed(0)} m`);
}
