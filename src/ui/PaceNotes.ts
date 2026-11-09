import { nextNote, noteText, type PaceNote } from '../race/pacenotes';
import { el } from './dom';

// Copiloto en pantalla: la próxima curva con flecha, severidad, matices, distancia y
// velocidad recomendada; avisa "FRENA" cuando toca. Opcionalmente la canta con voz.

const COLORS = ['#ff3b30', '#ff3b30', '#ff8a00', '#ffc300', '#9be15d', '#39e05a', '#39e05a'];

/** Flecha según lo cerrada que es la curva (dibujada hacia la derecha). */
function arrowPath(n: PaceNote): string {
  if (n.hairpin) return 'M14 54 V26 a12 12 0 0 1 24 0 V40 M28 32 l10 10 l10 -10';
  if (n.severity <= 2) return 'M16 54 V34 a10 10 0 0 1 10 -10 H44 M34 14 l12 10 l-12 10';
  if (n.severity <= 4) return 'M16 54 V40 Q16 22 36 18 L42 17 M32 8 l12 9 l-9 12';
  return 'M20 54 V38 Q20 22 34 12 M24 10 l12 0 l0 12';
}

export class PaceNoteHud {
  private root: HTMLDivElement;
  private icon: HTMLDivElement;
  private main: HTMLDivElement;
  private sub: HTMLDivElement;
  private brake: HTMLDivElement;
  private shown = -1;
  private called = -1;
  private brakeOn = false;
  voice = false;
  enabled = true;

  constructor(
    parent: HTMLElement,
    private notes: PaceNote[],
    private length: number,
    private tick: () => void,
  ) {
    this.root = el('div', 'pnote');
    this.root.innerHTML = `<div class="pn-icon"></div><div class="pn-txt"><div class="pn-main"></div><div class="pn-sub"></div></div><div class="pn-brake">FRENA</div>`;
    parent.appendChild(this.root);
    this.icon = this.root.querySelector('.pn-icon')!;
    this.main = this.root.querySelector('.pn-main')!;
    this.sub = this.root.querySelector('.pn-sub')!;
    this.brake = this.root.querySelector('.pn-brake')!;
  }

  /** s = distancia del kart en la vuelta, v = velocidad (m/s). */
  update(s: number, v: number, active: boolean): void {
    const nx = this.enabled && active ? nextNote(this.notes, s, this.length) : null;
    // Se canta con más antelación cuanto más rápido se llega
    const look = Math.max(38, Math.min(150, v * 3.4));
    if (!nx || nx.dist > look || v < 3) {
      if (this.shown !== -1) {
        this.shown = -1;
        this.root.classList.remove('show');
      }
      return;
    }
    const n = this.notes[nx.idx];
    if (this.shown !== nx.idx) {
      this.shown = nx.idx;
      const col = COLORS[n.hairpin ? 0 : n.severity];
      this.root.style.setProperty('--pn', col);
      this.icon.innerHTML = `<svg viewBox="0 0 60 60" style="transform:scaleX(${n.dir > 0 ? 1 : -1})"><path d="${arrowPath(n)}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${n.hairpin ? 'U' : n.severity}</b>`;
      this.main.textContent = noteText(n);
      this.root.classList.add('show');
      if (this.called !== nx.idx) {
        this.called = nx.idx;
        this.tick();
        if (this.voice) this.speak(noteText(n));
      }
    }
    this.sub.textContent = `${Math.round(nx.dist / 5) * 5} m · ${Math.round((n.speed * 3.6) / 5) * 5} km/h`;
    // Aviso de frenada: distancia para bajar hasta la velocidad recomendada (con margen de reacción)
    const vt = n.speed * 1.1 + 1;
    const need = v > vt ? (v * v - vt * vt) / (2 * 8.5) + v * 0.3 : -1;
    const on = need > 0 && nx.dist <= need && nx.dist > 3;
    if (on !== this.brakeOn) {
      this.brakeOn = on;
      this.brake.classList.toggle('on', on);
    }
  }

  private speak(text: string): void {
    try {
      const ss = window.speechSynthesis;
      if (!ss) return;
      ss.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/,/g, '.'));
      u.lang = 'es-ES';
      u.rate = 1.3;
      u.volume = 0.9;
      ss.speak(u);
    } catch {
      /* sin voz en este navegador */
    }
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  dispose(): void {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* nada */
    }
    this.root.remove();
  }
}
