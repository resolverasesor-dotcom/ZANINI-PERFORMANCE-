import type { Input } from '../core/Input';
import { el } from './dom';

/**
 * Controles táctiles: flechas de dirección a la izquierda y pedales + derrape
 * a la derecha. Multitáctil; se puede deslizar el dedo entre izquierda/derecha.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private active = new Map<number, string>();

  constructor(
    parent: HTMLElement,
    private input: Input,
  ) {
    this.root = el('div', 'touch');
    this.root.innerHTML = `
      <div class="tpad tleft">
        <button class="tbtn" data-k="left" aria-label="Izquierda">◀</button>
        <button class="tbtn" data-k="right" aria-label="Derecha">▶</button>
      </div>
      <div class="tpad tright">
        <button class="tbtn tdrift" data-k="drift" aria-label="Derrapar">DERRAPE</button>
        <button class="tbtn tbrake" data-k="brake" aria-label="Frenar">FRENO</button>
        <button class="tbtn taccel" data-k="accel" aria-label="Acelerar">ACEL</button>
      </div>
      <div class="ttop">
        <button class="tbtn tsmall" data-e="respawn" aria-label="Reaparecer">↺</button>
        <button class="tbtn tsmall" data-e="pause" aria-label="Pausa">❚❚</button>
      </div>`;
    parent.appendChild(this.root);
    const opts = { passive: false } as AddEventListenerOptions;
    this.root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    this.root.addEventListener('pointermove', (e) => this.onMove(e), opts);
    this.root.addEventListener('pointerup', (e) => this.onUp(e), opts);
    this.root.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private keyAt(x: number, y: number): string | null {
    const t = document.elementFromPoint(x, y) as HTMLElement | null;
    const b = t?.closest('[data-k]') as HTMLElement | null;
    return b?.dataset.k ?? null;
  }

  private onDown(e: PointerEvent): void {
    const t = (e.target as HTMLElement).closest('button') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    if (t.dataset.e) {
      this.input.triggerTouchEdge(t.dataset.e as 'respawn' | 'pause');
      return;
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const k = t.dataset.k ?? null;
    if (k) this.active.set(e.pointerId, k);
    this.sync();
  }

  private onMove(e: PointerEvent): void {
    if (!this.active.has(e.pointerId)) return;
    e.preventDefault();
    const prev = this.active.get(e.pointerId)!;
    // Solo las flechas permiten deslizar entre botones
    if (prev !== 'left' && prev !== 'right') return;
    const k = this.keyAt(e.clientX, e.clientY);
    if (k === 'left' || k === 'right') this.active.set(e.pointerId, k);
    this.sync();
  }

  private onUp(e: PointerEvent): void {
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
    this.root.querySelectorAll('[data-k]').forEach((b) => {
      const k = (b as HTMLElement).dataset.k!;
      b.classList.toggle('down', [...this.active.values()].includes(k));
    });
    if (this.active.size) this.input.lastDevice = 'touch';
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) {
      this.active.clear();
      this.sync();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
