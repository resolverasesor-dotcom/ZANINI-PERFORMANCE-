import { el, esc } from './dom';

// Radio del equipo: papá desde el muro de boxes comenta tu carrera (con humor).
// Solo texto en pantalla con un "chasquido" de radio; nunca tapa el centro de la pista.

export type RadioTopic =
  | 'start'
  | 'gain'
  | 'lose'
  | 'lead'
  | 'last'
  | 'wall'
  | 'kart'
  | 'offtrack'
  | 'drift'
  | 'hop'
  | 'bestlap'
  | 'lastlap'
  | 'win'
  | 'podium'
  | 'finish'
  | 'jumpstart'
  | 'invalid'
  | 'record';

const LINES: Record<RadioTopic, string[]> = {
  start: ['Respira. Suelta el freno con el verde. Y que no te vean ni el polvo.', 'Recuerda: el pedal derecho es el que corre.', 'Ojos en la primera curva. El resto, ya lo hemos hablado.'],
  gain: ['¡Adelantamiento de manual! Lo enmarco y lo cuelgo en el garaje.', '¡Uno menos! Sigue, sigue, sigue…', '¡Por dentro y sin pedir permiso! Así se hace.', 'Ese ni te ha visto. Bueno, ahora sí: por el retrovisor.'],
  lose: ['Te han pasado. Tranquilidad: aún quedan vueltas para devolvérsela.', 'Vale, ese duele. Respira y busca el rebufo.', 'No pasa nada. Bueno, pasa uno. Pero se arregla.'],
  lead: ['¡Vas PRIMERO! No mires atrás, que ahí no hay nada que ver.', 'Líder. Ahora toca lo difícil: no aburrirse.'],
  last: ['Estrategia de remontada activada. Muy valiente.', 'Desde atrás se ve toda la carrera. Ahora a por ellos.'],
  wall: ['Esa barrera no estaba en el plano…', 'Tranquilo, los neumáticos de la barrera están para eso. Creo.', '¡Ay! Eso lo pagamos a medias, ¿vale?', 'La pared 1 – Nosotros 0. Revancha en la siguiente vuelta.'],
  kart: ['¡Ojo con los codos! Esto es karting, no autos de choque.', 'Un toque es un toque. Dos ya es amistad.', 'Pídele perdón con la mano… cuando lo adelantes.'],
  offtrack: ['Eso es hierba. La pista es la parte gris.', 'Si querías cortar el césped, en casa tenemos uno.', 'Vuelve al asfalto, que ahí se agarra más.'],
  drift: ['¡Qué derrape! Contravolante de libro.', 'Así, de lado y con estilo. Como los mayores.', 'Esa zaga bailaba… y tú la has sacado a bailar.'],
  hop: ['¡Saltito! Ciencia pura. Bueno, casi.', 'Eso es: descarga la rueda de dentro y que el eje respire.'],
  bestlap: ['¡Vuelta rápida! El cronómetro ha sudado.', 'Morado en el crono. Esto ya huele a récord.', '¡Mejor vuelta! Repite eso diez veces más.'],
  lastlap: ['Última vuelta. Todo lo que quede en el depósito, ahora.', 'Última. Ni un error. Bueno, uno pequeñito si acaso.'],
  win: ['¡¡GANAMOS!! Papá está llorando. Es el aceite. No, no es el aceite.', '¡VICTORIA! Esto se celebra con churros.'],
  podium: ['¡Podio! Ya tenemos algo que enseñar en la cena.', '¡Al cajón! Muy, muy bien hecho.'],
  finish: ['Bandera a cuadros. Hemos aprendido un montón; la próxima es nuestra.', 'Terminada. Lo importante es acabar. Y merendar.'],
  jumpstart: ['¡Te has adelantado al semáforo! Cinco segundos de castigo… y de vergüenza.'],
  invalid: ['Vuelta anulada: atajar no vale, que nos conocemos.', 'Eso ha sido un atajo. Los comisarios tienen gafas.'],
  record: ['¡Récord personal! Esto va a la nevera con un imán.'],
};

const PRIORITY: Partial<Record<RadioTopic, number>> = { win: 3, podium: 3, finish: 3, jumpstart: 3, lastlap: 2, bestlap: 2, record: 2, lead: 2, invalid: 2 };

export class TeamRadio {
  private box: HTMLDivElement;
  private timer = 0;
  private cool = 0;
  private used: Partial<Record<RadioTopic, number[]>> = {};
  private topicCool: Partial<Record<RadioTopic, number>> = {};
  enabled = true;

  constructor(
    parent: HTMLElement,
    private squelch: () => void,
  ) {
    this.box = el('div', 'radio');
    parent.appendChild(this.box);
  }

  /** Intenta decir algo de un tema; respeta pausas para no agobiar. */
  say(topic: RadioTopic): void {
    if (!this.enabled) return;
    const pr = PRIORITY[topic] ?? 1;
    if (pr < 3 && this.cool > 0 && !(pr >= 2 && this.cool < 2)) return;
    if ((this.topicCool[topic] ?? 0) > 0 && pr < 3) return;
    const lines = LINES[topic];
    const used = (this.used[topic] ??= []);
    if (used.length >= lines.length) used.length = 0;
    let i = Math.floor(Math.random() * lines.length);
    while (used.includes(i)) i = (i + 1) % lines.length;
    used.push(i);
    this.box.innerHTML = `<span class="radio-ico">📻</span><b>PAPÁ</b> <span class="radio-txt">${esc(lines[i])}</span>`;
    this.box.classList.add('show');
    this.timer = 3.6 + lines[i].length * 0.02;
    this.cool = 7;
    this.topicCool[topic] = topic === 'wall' || topic === 'kart' || topic === 'offtrack' ? 20 : 12;
    this.squelch();
  }

  tick(dt: number): void {
    this.cool -= dt;
    for (const k in this.topicCool) this.topicCool[k as RadioTopic]! -= dt;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.box.classList.remove('show');
    }
  }

  dispose(): void {
    this.box.remove();
  }
}
