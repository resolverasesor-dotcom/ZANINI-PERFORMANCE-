// Banco de pruebas de la física del kart (sin render). Mide lo que mediría un
// ingeniero en pista: aceleración, punta, inercia al soltar, frenada, agarre
// lateral máximo, respuesta a un golpe de volante, frenar girando y saltitos.
import { Track } from '../src/track/Track';
import type { TrackDef } from '../src/track/TrackData';
import { emptyInput, Kart, KART, ALPHA_PEAK, setKartClass, steadySteer, type KartInput } from '../src/physics/Kart';

// "Explanada": un círculo de 1,5 km de radio y 300 m de ancho (sin muros a la vista)
const pts = [];
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  pts.push({ x: Math.cos(a) * 1500, z: Math.sin(a) * 1500 });
}
const def: TrackDef = { id: 'pad', name: 'pad', subtitle: '', description: '', theme: 'ring', points: pts, width: 300, runoff: 20, surface: 'grass', laps: 1, record: { time: 0, holder: '' }, length: 0, difficulty: 1, decor: [], scatter: [] };
const track = new Track(def);
const dt = 1 / 120;
const cls = process.argv[2] ?? '150';
if (cls === '100') setKartClass(0.84, 0.9);
if (cls === '50') setKartClass(0.68, 0.8);

function fresh(): Kart {
  const k = new Kart();
  k.setPose(track, 0, 0);
  return k;
}
function run(k: Kart, secs: number, f: (t: number, inp: KartInput) => void, each?: (t: number) => void): void {
  for (let t = 0; t < secs; t += dt) {
    const inp = emptyInput();
    f(t, inp);
    k.step(dt, inp, track);
    each?.(t);
  }
}
const kmh = (v: number) => (v * 3.6).toFixed(1);
const out: string[] = [];
const log = (s: string) => {
  out.push(s);
  console.log(s);
};

// 1. Aceleración
{
  const k = fresh();
  let t60 = 0, t100 = 0, d = 0;
  run(k, 20, (_, i) => (i.throttle = 1), (t) => {
    d += k.vF * dt;
    if (!t60 && k.vF * 3.6 >= 60) t60 = t;
    if (!t100 && k.vF * 3.6 >= 100) t100 = t;
  });
  log(`Aceleración: 0-60 ${t60.toFixed(2)} s · 0-100 ${t100 ? t100.toFixed(2) + ' s' : '—'} · punta ${kmh(k.vF)} km/h (limitador ${kmh(KART.vmax)})`);
}
// 2. Inercia al soltar el acelerador
{
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = 1));
  const v0 = k.vF;
  run(k, 3, () => {});
  log(`Soltar a ${kmh(v0)} km/h: tras 3 s ${kmh(k.vF)} km/h (deceleración media ${((v0 - k.vF) / 3).toFixed(2)} m/s² ≈ ${((v0 - k.vF) / 3 / 9.81).toFixed(2)} g)`);
}
// 3. Frenada a fondo desde la punta
{
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = 1));
  const v0 = k.vF;
  let d = 0, tt = 0, maxYaw = 0;
  run(k, 8, (_, i) => (i.brake = k.vF > 0.3 ? 1 : 0), (t) => {
    if (k.vF > 0.3) { d += k.vF * dt; tt = t; }
    maxYaw = Math.max(maxYaw, Math.abs(k.yawRate));
  });
  log(`Frenada ${kmh(v0)}→0: ${d.toFixed(1)} m en ${tt.toFixed(2)} s (media ${(v0 / tt / 9.81).toFixed(2)} g) · guiñada máx ${maxYaw.toFixed(3)} rad/s`);
}
// 4. Agarre lateral máximo: a velocidad constante, ir cerrando el volante poco a poco
for (const vt of [10, 15, 20, 25]) {
  if (vt > KART.vmax - 1) continue;
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = k.vF < vt ? 1 : 0.3));
  let best = 0, at = 0;
  run(k, 8, (t, i) => {
    i.steer = Math.min(1, t / 8);
    i.throttle = k.vF < vt ? 1 : 0.2;
  }, (t) => {
    const ay = Math.abs(k.vF * k.yawRate);
    if (!k.drifting && ay > best && Math.abs(k.vF - vt) < 1.5) { best = ay; at = Math.min(1, t / 8); }
  });
  log(`Agarre a ${kmh(vt)} km/h: ${(best / 9.81).toFixed(2)} g laterales (con el volante al ${(at * 100).toFixed(0)} %)`);
}
// 5. Golpe de volante a fondo a 60 km/h
{
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = k.vF < 16.7 ? 1 : 0.3));
  let maxBeta = 0, slid = false, spun = false;
  const y0 = k.yaw;
  run(k, 2, (_, i) => { i.steer = 1; i.throttle = 0.5; }, () => {
    maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(k.vL, Math.max(1, k.vF))));
    slid ||= k.drifting;
  });
  spun = Math.abs(k.yawRate) > 3;
  log(`Volantazo a 60 km/h: deriva máx ${(maxBeta * 57.3).toFixed(1)}° · desliza ${slid ? 'sí' : 'no'} · trompo ${spun ? 'sí' : 'no'} · guiñada ${k.yawRate.toFixed(2)} rad/s · giro ${((k.yaw - y0) * 57.3).toFixed(0)}°`);
}
// 6. Frenar girando (entrar pasado): la zaga debe soltarse de forma natural y controlable
for (const [st, bt] of [[0.5, 0.6], [0.8, 0.9]] as const) {
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = k.vF < 22 ? 1 : 0.4));
  let slideT = 0, maxBeta = 0;
  run(k, 1.8, (t, i) => { i.steer = st; i.brake = t < bt ? 1 : 0; i.throttle = t >= bt ? 0.6 : 0; }, () => {
    if (k.drifting) slideT += dt;
    maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(k.vL, Math.max(1, k.vF))));
  });
  log(`Frenar a fondo girando (volante ${st * 100} %, ${bt} s) a 80 km/h: desliza ${slideT.toFixed(2)} s · ángulo máx ${(maxBeta * 57.3).toFixed(1)}° · sale a ${kmh(k.vF)} km/h${maxBeta > 1.2 ? ' · TROMPO' : ''}`);
}
// 7. Levantar en plena curva (sin frenar): cuánta velocidad se conserva
{
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = k.vF < 20 ? 1 : 0.3));
  const v0 = k.vF;
  run(k, 1.5, (_, i) => { i.steer = 0.5; });
  log(`Levantar en curva a ${kmh(v0)} km/h: tras 1,5 s ${kmh(k.vF)} km/h (sin freno)`);
}
// 8. Saltitos a la salida de una horquilla
for (const hops of [false, true]) {
  const k = fresh();
  run(k, 20, (_, i) => (i.throttle = k.vF < 8 ? 1 : 0.2));
  let d = 0;
  run(k, 3, (t, i) => {
    i.throttle = 1;
    i.steer = t < 1.2 ? 0.9 : 0.2;
    i.hop = hops && Math.floor(t / 0.4) % 2 === 0;
  }, () => (d += k.vF * dt));
  log(`Salida de horquilla ${hops ? 'CON saltitos' : 'sin saltitos'}: ${kmh(k.vF)} km/h a los 3 s · ${d.toFixed(1)} m recorridos`);
}
log(`(pico de agarre del neumático a ${(ALPHA_PEAK * 57.3).toFixed(1)}° de deriva)`);
