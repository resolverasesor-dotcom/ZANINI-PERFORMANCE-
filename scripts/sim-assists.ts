// Prueba de las ayudas: un "jugador" que solo acelera (y otro que gira al azar)
// debe completar vueltas sin chocar demasiado gracias a la ayuda.
import { CIRCUITS } from '../src/track/circuits/index';
import { Track } from '../src/track/Track';
import { computeRacingLine } from '../src/ai/RacingLine';
import { Kart, setKartClass, emptyInput } from '../src/physics/Kart';
import { DriverAssist } from '../src/race/assists';
import { filterSteer } from '../src/core/steerFilter';
import { AIDriver } from '../src/ai/AIDriver';
import { KERB_WIDTH } from '../src/track/Track';
import type { AssistLevel } from '../src/core/Settings';

const cls = Number(process.argv[2] ?? 0.84);
setKartClass(cls, cls === 1 ? 1 : 0.9);
for (const level of ((process.argv[3] ?? 'media,maxima').split(',')) as AssistLevel[]) {
  for (const def of CIRCUITS) {
    const t = new Track(def);
    computeRacingLine(t);
    const k = new Kart();
    k.setPose(t, -20, 0);
    let dist = 0;
    let last = k.proj.s;
    let hits = 0;
    let off = 0;
    const assist = new DriverAssist(k, t);
    // "Humano" impreciso: sigue la pista con 0.25 s de retraso, ruido y sin frenar nunca
    const human = new AIDriver(k, null, 'pro', 3);
    human.perfect = true;
    const delay: number[] = [];
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 90; i++) {
      const inp = emptyInput();
      inp.throttle = 1;
      if (level !== 'maxima') {
        const h = human.update(dt, { track: t, karts: [k], racing: true, rubber: 1 });
        delay.push(h.steer);
        const d = delay.length > 30 ? delay.shift()! : 0;
        inp.steer = Math.max(-1, Math.min(1, d * 1.15 + Math.sin(i / 37) * 0.25));
      }
      // Misma cadena que en el juego: filtro de entrada del mando y después la ayuda
      inp.steer = filterSteer(inp.steer, k.vF, true);
      assist.apply(inp, level, dt);
      k.step(dt, inp, t);
      let ds = k.proj.s - last;
      if (ds > t.length / 2) ds -= t.length;
      if (ds < -t.length / 2) ds += t.length;
      last = k.proj.s;
      dist += ds;
      if (k.wallImpact > 3) hits++;
      if (Math.abs(k.proj.lat) > k.proj.hw + KERB_WIDTH + 0.5) off++;
    }
    console.log(`${level.padEnd(7)} ${def.name.padEnd(24)} vueltas=${(dist / t.length).toFixed(2)} golpes=${hits} fuera=${((off / (120 * 90)) * 100).toFixed(0)}%`);
  }
}
