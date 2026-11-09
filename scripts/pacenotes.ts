// Notas de copiloto de cada circuito: deben existir, ser coherentes (sin solaparse,
// severidad 1–6, velocidad recomendada razonable) y cubrir las curvas fuertes.
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';
import { buildPaceNotes, noteText } from '../src/race/pacenotes';

let fail = false;
const only = process.argv[2];
for (const def of CIRCUITS) {
  if (only && def.id !== only) continue;
  const t = new Track(def);
  const notes = buildPaceNotes(t);
  let err = '';
  if (notes.length < 3) err = 'muy pocas notas';
  for (let i = 0; i < notes.length; i++) {
    const a = notes[i];
    if (a.severity < 1 || a.severity > 6) err = 'severidad fuera de rango';
    if (!(a.speed > 3 && a.speed <= 40)) err = 'velocidad recomendada absurda';
    const b = notes[(i + 1) % notes.length];
    let d = b.s0 - a.s0;
    if (d < 0) d += t.length;
    if (notes.length > 1 && d < 4) err = 'notas duplicadas';
  }
  // toda curva de radio < 25 m debe caer dentro de alguna nota
  for (let i = 0; i < t.n; i += 3) {
    if (Math.abs(t.curv[i]) < 1 / 25) continue;
    const s = i * t.ds;
    const hit = notes.some((n) => (n.s0 <= n.s1 ? s >= n.s0 - 2 && s <= n.s1 + 2 : s >= n.s0 - 2 || s <= n.s1 + 2));
    if (!hit) err = `curva sin nota en s=${s.toFixed(0)}`;
  }
  if (err) fail = true;
  console.log(`${err ? 'MAL' : 'OK '} ${def.name.padEnd(30)} ${String(notes.length).padStart(2)} notas${err ? ' · ' + err : ''}`);
  if (only) for (const n of notes) console.log(`   ${n.s0.toFixed(0).padStart(5)} m  ${noteText(n).padEnd(34)} R${n.radius.toFixed(0)}  ${(n.angle * 57.3).toFixed(0)}°  ~${(n.speed * 3.6).toFixed(0)} km/h`);
}
process.exit(fail ? 1 : 0);
