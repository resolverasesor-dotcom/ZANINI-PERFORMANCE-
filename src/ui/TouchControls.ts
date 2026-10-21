import type { Input } from '../core/Input';
import type { Settings } from '../core/Settings';
import { el } from './dom';

/**
 * Controles táctiles pensados para el pulgar:
 *  - Izquierda: barra de dirección ANALÓGICA. Pones el dedo y lo deslizas: cuanto más
 *    lejos del centro, más giras. (Opcional: flechas clásicas.)
 *  - Derecha: DERRAPE (botón principal), FRENO y ACEL (solo si no hay aceleración automática).
 *  - Arriba: reaparecer y pausa.
 * Multitáctil con captura de puntero: el dedo puede salirse del control sin soltarlo.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private active = new Map<number, string>();
  private steerPointer: number | null = null;
  private pad!: HTMLElement;
  private knob!: HTMLElement;

  constructor(
    private parent: HTMLElement,
    private input: Input,
    private settings: () => Settings,
  ) {
    this.root = el('div', 'touch');
    parent.appendChild(this.root);
    this.build();
    const opts = { passive: false } as AddEventListenerOptions;
    this.root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    this.root.addEventListener('pointermove', (e) => this.onMove(e), opts);
    this.root.addEventListener('pointerup', (e) => this.onUp(e), opts);
    this.root.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    this.root.addEventListener('lostpointercapture', (e) => this.onUp(e as PointerEvent), opts);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** (Re)construye según los ajustes (aceleración automática, tipo de dirección). */
  build(): void {
    const s = this.settings();
    const auto = s.autoAccel;
    const steer =
      s.touchSteer === 'botones'
        ? `<div class="tsteer-btns"><button class="tbtn tarrow" data-k="left" aria-label="Izquierda">◀</button><button class="tbtn tarrow" data-k="right" aria-label="Derecha">▶</button></div>`
        : `<div class="tsteer" data-steer aria-label="Dirección: desliza el dedo"><div class="tsteer-track"><span>◀</span><span>▶</span></div><div class="tsteer-knob"></div></div>`;
    this.root.className = 'touch' + (auto ? ' auto' : '');
    this.root.innerHTML = `
      <div class="tzone tleft">${steer}</div>
      <div class="tzone tright">
        <button class="tbtn tbrake" data-k="brake" aria-label="Frenar">FRENO</button>
        ${auto ? '' : '<button class="tbtn taccel" data-k="accel" aria-label="Acelerar">ACEL</button>'}
        <button class="tbtn tdrift" data-k="drift" aria-label="Derrapar">DERRAPE</button>
      </div>
      <div class="ttop">
        <button class="tbtn tsmall" data-e="respawn" aria-label="Reaparecer">↺</button>
        <button class="tbtn tsmall" data-e="pause" aria-label="Pausa">❚❚</button>
      </div>`;
    this.pad = this.root.querySelector('[data-steer]') as HTMLElement;
    this.knob = this.root.querySelector('.tsteer-knob') as HTMLElement;
    this.active.clear();
    this.steerPointer = null;
    this.sync();
  }

  private steerFrom(e: PointerEvent): void {
    if (!this.pad) return;
    const r = this.pad.getBoundingClientRect();
    const half = r.width * 0.42;
    let v = (e.clientX - (r.left + r.width / 2)) / half;
    v = Math.max(-1, Math.min(1, v));
    const knobX = v * half;
    // zona muerta pequeña y curva suave para correcciones finas
    const a = Math.abs(v);
    const out = a < 0.08 ? 0 : Math.sign(v) * Math.pow((a - 0.08) / 0.92, 1.25);
    this.input.touch.steerAxis = out === 0 ? 0 : out;
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${knobX}px), -50%)`;
    this.pad.classList.add('down');
  }

  private onDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    const steer = target.closest('[data-steer]');
    if (steer) {
      e.preventDefault();
      this.steerPointer = e.pointerId;
      try {
        (steer as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* puntero sintético o ya liberado */
      }
      this.steerFrom(e);
      this.input.lastDevice = 'touch';
      return;
    }
    const t = target.closest('button') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    if (t.dataset.e) {
      this.input.triggerTouchEdge(t.dataset.e as 'respawn' | 'pause');
      return;
    }
    const k = t.dataset.k ?? null;
    if (k) this.active.set(e.pointerId, k);
    if (navigator.vibrate && this.settings().vibration && k === 'drift') navigator.vibrate(12);
    this.sync();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.steerPointer) {
      e.preventDefault();
      this.steerFrom(e);
      return;
    }
    if (!this.active.has(e.pointerId)) return;
    e.preventDefault();
    const prev = this.active.get(e.pointerId)!;
    // Con flechas se puede deslizar el dedo de una a otra
    if (prev !== 'left' && prev !== 'right') return;
    const b = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-k]') as HTMLElement | null;
    const k = b?.dataset.k;
    if (k === 'left' || k === 'right') this.active.set(e.pointerId, k);
    this.sync();
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.steerPointer) {
      this.steerPointer = null;
      this.input.touch.steerAxis = 0;
      if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
      this.pad?.classList.remove('down');
      return;
    }
    this.active.delete(e.pointerId);
    this.sync();
  }

  private sync(): void {
    const t = this.input.touch;
    t.left = t.right = t.accel = t.brake = t.drift = false;
    for (const k of this.active.values()) {
      if (k === 'left') t.left = true;
      if (k === 'right') t.right = true;
      if (k === 'accel') t.accel = true;
      if (k === 'brake') t.brake = true;
      if (k === 'drift') t.drift = true;
    }
    const on = new Set(this.active.values());
    this.root.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('down', on.has((b as HTMLElement).dataset.k!)));
    if (this.active.size) this.input.lastDevice = 'touch';
  }

  show(v: boolean): void {
    if (v) this.build();
    this.root.style.display = v ? '' : 'none';
    this.parent.classList.toggle('touch-on', v);
    this.input.touchVisible = v;
    if (v) this.input.lastDevice = 'touch';
    if (!v) {
      this.active.clear();
      this.steerPointer = null;
      this.input.touch.steerAxis = 0;
      this.sync();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
