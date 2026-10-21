// Valida los circuitos: longitud, radios mínimos y que ninguna parte del trazado
// (con sus escapatorias) se solape con otra, salvo en puentes. Genera SVGs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';

const outDir = process.argv[2] ?? 'track-previews';
mkdirSync(outDir, { recursive: true });
let failed = false;
for (const def of CIRCUITS) {
  const t = new Track(def);
  let maxK = 0;
  for (let i = 0; i < t.n; i++) maxK = Math.max(maxK, Math.abs(t.curv[i]));
  let worst = Infinity;
  let worstPair = '';
  for (let i = 0; i < t.n; i += 2) {
    for (let j = i + 2; j < t.n; j += 2) {
      let ds = Math.abs(i - j) * t.ds;
      ds = Math.min(ds, t.length - ds);
      if (ds < 70) continue;
      if (Math.abs(t.py[i] - t.py[j]) > 4) continue;
      const d = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
      const need = t.hw[i] + Math.max(t.runL[i], t.runR[i]) + t.hw[j] + Math.max(t.runL[j], t.runR[j]) + 1;
      const margin = d - need;
      if (margin < worst) {
        worst = margin;
        worstPair = `s=${(i * t.ds).toFixed(0)} vs s=${(j * t.ds).toFixed(0)} d=${d.toFixed(1)} need=${need.toFixed(1)}`;
      }
    }
  }
  let gridK = 0;
  for (let d = -85; d <= 25; d++) gridK = Math.max(gridK, Math.abs(t.curv[t.index(d)]));
  if (gridK > 1 / 200) {
    failed = true;
    console.log(`ERR ${def.name}: parrilla/meta en curva (R=${(1 / gridK).toFixed(0)} m)`);
  }
  let bridges = 0;
  for (let i = 0; i < t.n; i++) bridges += t.bridge[i];
  const ok = worst >= 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK ' : 'ERR'} ${def.name.padEnd(20)} L=${t.length.toFixed(0)}m  Rmin=${(1 / maxK).toFixed(1)}m  clearance=${worst.toFixed(1)} (${worstPair})  bridge=${bridges}`,
  );
  // SVG
  const b = t.bounds;
  const pad = 30;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxZ - b.minZ + pad * 2;
  const P = (x: number, z: number) => `${(x - b.minX + pad).toFixed(1)},${(z - b.minZ + pad).toFixed(1)}`;
  const center: string[] = [];
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= t.n; i++) {
    const k = i % t.n;
    const rx = -t.tz[k];
    const rz = t.tx[k];
    center.push(P(t.px[k], t.pz[k]));
    left.push(P(t.px[k] - rx * (t.hw[k] + t.runL[k]), t.pz[k] - rz * (t.hw[k] + t.runL[k])));
    right.push(P(t.px[k] + rx * (t.hw[k] + t.runR[k]), t.pz[k] + rz * (t.hw[k] + t.runR[k])));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}" style="background:#234">
<polyline points="${center.join(' ')}" fill="none" stroke="#888" stroke-width="${t.hw[0] * 2}"/>
<polyline points="${left.join(' ')}" fill="none" stroke="#f44" stroke-width="1"/>
<polyline points="${right.join(' ')}" fill="none" stroke="#4f4" stroke-width="1"/>
<circle cx="${P(t.px[0], t.pz[0]).split(',')[0]}" cy="${P(t.px[0], t.pz[0]).split(',')[1]}" r="5" fill="#ff0"/>
<circle cx="${P(t.px[20], t.pz[20]).split(',')[0]}" cy="${P(t.px[20], t.pz[20]).split(',')[1]}" r="3" fill="#0ff"/>
</svg>`;
  writeFileSync(`${outDir}/${def.id}.svg`, svg);
}
process.exit(failed ? 1 : 0);
