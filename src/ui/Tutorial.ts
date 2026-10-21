import type { Input } from '../core/Input';
import type { Settings } from '../core/Settings';
import type { Kart } from '../physics/Kart';
import { el } from './dom';

interface Step {
  text: string;
  max: number;
  done?: () => boolean;
}

/** Tutorial interactivo: 5 pasos, 20 segundos como máximo en total. */
export class Tutorial {
  readonly root: HTMLDivElement;
  private card: HTMLDivElement;
  private bar: HTMLElement;
  private steps: Step[];
  private i = 0;
  private stepT = 0;
  private total = 0;
  private steerT = 0;
  private boosted = false;
  private stepOk = false;
  private okT = 0;
  finished = false;
  static readonly LIMIT = 20;

  constructor(
    parent: HTMLElement,
    private kart: Kart,
    input: Input,
    settings: Settings,
    private onSkip: () => void,
    name = 'Ale',
  ) {
    const dev = input.lastDevice;
    const key = (a: keyof Settings['keys']) => {
      const c = settings.keys[a][0] ?? '';
      const map: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'ESPACIO', ShiftLeft: 'MAYÚS', Escape: 'ESC' };
      return map[c] ?? c.replace('Key', '');
    };
    const K =
      dev === 'gamepad'
        ? { accel: 'RT', steer: 'el stick', drift: 'RB', respawn: 'Y', pause: 'START' }
        : dev === 'touch'
          ? { accel: 'ACEL', steer: '◀ ▶', drift: 'DERRAPE', respawn: '↺', pause: '❚❚' }
          : { accel: key('accel'), steer: `${key('left')} ${key('right')}`, drift: key('drift'), respawn: key('respawn'), pause: key('pause') };
    this.steps = [
      input.autoAccelActive
        ? { text: 'El kart <b>acelera solo</b> 🚀 · <kbd>FRENO</kbd> para frenar', max: 3.5, done: () => this.kart.vF > 13 }
        : { text: `Mantén <kbd>${K.accel}</kbd> para acelerar`, max: 4.5, done: () => this.kart.vF > 13 },
      dev === 'touch' && settings.touchSteer === 'inclinar'
        ? { text: '<b>Inclina el móvil</b> como un volante para girar', max: 4.5, done: () => this.steerT > 0.35 }
        : dev === 'touch' && settings.touchSteer !== 'botones'
        ? { text: 'Pon el dedo en la <b>barra de la izquierda</b> y deslízalo para girar', max: 4.5, done: () => this.steerT > 0.35 }
        : { text: `Gira con <kbd>${K.steer}</kbd>`, max: 3.5, done: () => this.steerT > 0.35 },
      {
        text: dev === 'touch' ? `Mantén <kbd>DERRAPE</kbd> mientras giras (también acelera)` : `Mantén <kbd>${K.drift}</kbd> mientras giras para <b>DERRAPAR</b>`,
        max: 6,
        done: () => this.kart.driftLevel >= 1,
      },
      { text: '¡Suéltalo! <b>Mini-turbo</b> 🔥<br><small>Chispas azules = nivel 1 · naranjas = nivel 2</small>', max: 3.5, done: () => this.boosted },
      { text: `<kbd>${K.respawn}</kbd> reaparecer · <kbd>${K.pause}</kbd> pausa<br><b>¡A por todas, ${name}!</b>`, max: 2.5 },
    ];
    this.root = el('div', 'tutorial');
    this.root.innerHTML = `<div class="tut-head"><span>TUTORIAL</span><button class="btn sm" data-skip>Saltar ▶</button></div><div class="tut-card"></div><div class="tut-bar"><i></i></div>`;
    this.card = this.root.querySelector('.tut-card')!;
    this.bar = this.root.querySelector('.tut-bar i')!;
    this.root.querySelector('[data-skip]')!.addEventListener('click', () => this.onSkip());
    parent.appendChild(this.root);
    this.show();
  }

  private show(): void {
    const s = this.steps[this.i];
    this.card.innerHTML = `<span class="tut-n">${this.i + 1}/${this.steps.length}</span> ${s.text}`;
    this.card.classList.remove('ok');
    void this.card.offsetWidth;
    this.card.classList.add('in');
  }

  /** Avisa de un mini-turbo (evento de la física). */
  boost(): void {
    this.boosted = true;
  }

  update(dt: number, steer: number): void {
    if (this.finished) return;
    this.total += dt;
    this.stepT += dt;
    if (Math.abs(steer) > 0.5) this.steerT += dt;
    this.bar.style.width = `${Math.min(100, (this.total / Tutorial.LIMIT) * 100)}%`;
    const s = this.steps[this.i];
    if (!this.stepOk && (s.done?.() ?? false)) {
      this.stepOk = true;
      this.okT = 0;
      this.card.classList.add('ok');
    }
    if (this.stepOk) this.okT += dt;
    if ((this.stepOk && this.okT > 0.6) || this.stepT >= s.max || this.total >= Tutorial.LIMIT) {
      this.i++;
      this.stepT = 0;
      this.stepOk = false;
      if (this.i >= this.steps.length || this.total >= Tutorial.LIMIT) {
        this.finished = true;
        this.card.innerHTML = '🏁 <b>¡Tutorial completado!</b>';
        this.card.classList.add('ok');
        return;
      }
      this.show();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
