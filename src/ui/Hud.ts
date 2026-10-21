import { formatDelta, formatTime } from '../core/math';
import { el, esc } from './dom';

export interface TowerRow {
  pos: number;
  short: string;
  color: string;
  player: boolean;
  text: string;
  sub?: string;
}

/** HUD de carrera (DOM). Se actualiza a ~20 Hz salvo velocímetro y mensajes. */
export class Hud {
  readonly root: HTMLDivElement;
  private posEl: HTMLDivElement;
  private lapEl: HTMLDivElement;
  private timeEl: HTMLDivElement;
  private lastEl: HTMLDivElement;
  private bestEl: HTMLDivElement;
  private deltaEl: HTMLDivElement;
  private sectorEls: HTMLDivElement[] = [];
  private speedEl: HTMLDivElement;
  private gauge: HTMLDivElement;
  private driftEl: HTMLDivElement;
  private tower: HTMLDivElement;
  private towerRows: HTMLDivElement[] = [];
  private msg: HTMLDivElement;
  private msgTimer = 0;
  private sub: HTMLDivElement;
  private subTimer = 0;
  private lightsEl: HTMLDivElement;
  private lightDots: HTMLDivElement[] = [];
  private wrongWay: HTMLDivElement;
  private sessionEl: HTMLDivElement;
  private flagEl: HTMLDivElement;
  readonly mapSlot: HTMLDivElement;
  readonly speedLines: HTMLCanvasElement;
  private slCtx: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    this.speedLines = el('canvas', 'speedlines');
    this.slCtx = this.speedLines.getContext('2d')!;
    this.root.appendChild(this.speedLines);

    const tl = el('div', 'hud-tl');
    this.posEl = el('div', 'hud-pos');
    this.lapEl = el('div', 'hud-lap');
    this.sessionEl = el('div', 'hud-session');
    tl.append(this.posEl, this.lapEl, this.sessionEl);
    this.root.appendChild(tl);

    const tr = el('div', 'hud-tr');
    this.timeEl = el('div', 'hud-time');
    this.deltaEl = el('div', 'hud-delta');
    const secs = el('div', 'hud-sectors');
    for (let i = 0; i < 3; i++) {
      const s = el('div', 'sector', `S${i + 1}`);
      this.sectorEls.push(s);
      secs.appendChild(s);
    }
    this.lastEl = el('div', 'hud-small');
    this.bestEl = el('div', 'hud-small');
    tr.append(this.timeEl, this.deltaEl, secs, this.lastEl, this.bestEl);
    this.root.appendChild(tr);

    this.tower = el('div', 'hud-tower');
    this.root.appendChild(this.tower);

    const br = el('div', 'hud-br');
    this.gauge = el('div', 'hud-gauge');
    this.speedEl = el('div', 'hud-speed');
    const unit = el('div', 'hud-unit', 'km/h');
    this.driftEl = el('div', 'hud-drift');
    this.gauge.append(this.speedEl, unit);
    br.append(this.driftEl, this.gauge);
    this.root.appendChild(br);

    this.mapSlot = el('div', 'hud-map');
    this.root.appendChild(this.mapSlot);

    this.msg = el('div', 'hud-msg');
    this.sub = el('div', 'hud-sub');
    this.root.append(this.msg, this.sub);

    this.lightsEl = el('div', 'hud-lights hidden');
    for (let i = 0; i < 5; i++) {
      const d = el('div', 'light');
      this.lightDots.push(d);
      this.lightsEl.appendChild(d);
    }
    this.root.appendChild(this.lightsEl);

    this.wrongWay = el('div', 'hud-wrong hidden', 'DIRECCIÓN CONTRARIA');
    this.root.appendChild(this.wrongWay);
    this.flagEl = el('div', 'hud-flag hidden');
    this.root.appendChild(this.flagEl);
    parent.appendChild(this.root);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.speedLines.width = Math.round(window.innerWidth * dpr * 0.5);
    this.speedLines.height = Math.round(window.innerHeight * dpr * 0.5);
  }

  setPosition(pos: number | null, total: number): void {
    if (pos == null) {
      this.posEl.style.display = 'none';
      return;
    }
    this.posEl.style.display = '';
    this.posEl.innerHTML = `<span class="hud-pos-label">POS</span>${pos}<span class="hud-pos-total">/${total}</span>`;
  }

  setLap(text: string): void {
    this.lapEl.textContent = text;
  }

  setSession(text: string): void {
    this.sessionEl.textContent = text;
    this.sessionEl.style.display = text ? '' : 'none';
  }

  setTimes(cur: number | null, last: number | null, best: number | null, invalid: boolean): void {
    this.timeEl.textContent = formatTime(cur);
    this.timeEl.classList.toggle('invalid', invalid);
    this.lastEl.innerHTML = `<b>ÚLTIMA</b> ${formatTime(last)}`;
    this.bestEl.innerHTML = `<b>MEJOR</b> ${formatTime(best)}`;
  }

  setDelta(d: number | null): void {
    if (d == null) {
      this.deltaEl.textContent = '';
      this.deltaEl.className = 'hud-delta';
      return;
    }
    this.deltaEl.textContent = formatDelta(d);
    this.deltaEl.className = 'hud-delta ' + (d <= 0 ? 'good' : 'bad');
  }

  setSector(i: number, color: string | null, text?: string): void {
    const e = this.sectorEls[i];
    e.className = 'sector' + (color ? ' ' + color : '');
    e.textContent = text ?? `S${i + 1}`;
  }

  resetSectors(): void {
    for (let i = 0; i < 3; i++) this.setSector(i, null);
  }

  setSpeed(kmh: number, ratio: number, boost: boolean): void {
    this.speedEl.textContent = String(Math.round(kmh));
    const deg = Math.min(1, ratio) * 270;
    this.gauge.style.setProperty('--deg', `${deg}deg`);
    this.gauge.classList.toggle('boost', boost);
  }

  setDrift(level: number, charge: number, drifting: boolean): void {
    if (!drifting) {
      this.driftEl.className = 'hud-drift';
      this.driftEl.textContent = '';
      return;
    }
    this.driftEl.className = 'hud-drift on l' + level;
    const pct = Math.min(100, (charge / 2.05) * 100);
    this.driftEl.innerHTML = `<span>DERRAPE${level ? ' ' + 'I'.repeat(level) : ''}</span><i style="width:${pct}%"></i>`;
  }

  setTower(rows: TowerRow[]): void {
    while (this.towerRows.length < rows.length) {
      const r = el('div', 'trow');
      this.towerRows.push(r);
      this.tower.appendChild(r);
    }
    this.towerRows.forEach((r, i) => {
      const d = rows[i];
      if (!d) {
        r.style.display = 'none';
        return;
      }
      r.style.display = '';
      const key = `${d.pos}|${d.short}|${d.text}|${d.player}|${d.sub ?? ''}`;
      if (r.dataset.key === key) return;
      r.dataset.key = key;
      r.className = 'trow' + (d.player ? ' me' : '');
      r.innerHTML = `<span class="tp">${d.pos}</span><span class="tc" style="background:${d.color}"></span><span class="tn">${esc(d.short)}</span><span class="tt">${esc(d.text)}</span>${d.sub ? `<span class="ts">${esc(d.sub)}</span>` : ''}`;
    });
  }

  showTower(v: boolean): void {
    this.tower.style.display = v ? '' : 'none';
  }

  message(text: string, cls = '', duration = 2): void {
    this.msg.innerHTML = text;
    this.msg.className = 'hud-msg show ' + cls;
    this.msgTimer = duration;
  }

  subMessage(text: string, cls = '', duration = 2.5): void {
    this.sub.innerHTML = text;
    this.sub.className = 'hud-sub show ' + cls;
    this.subTimer = duration;
  }

  setLights(n: number, visible: boolean, out = false): void {
    this.lightsEl.classList.toggle('hidden', !visible);
    this.lightsEl.classList.toggle('out', out);
    this.lightDots.forEach((d, i) => d.classList.toggle('on', i < n));
  }

  setWrongWay(v: boolean): void {
    this.wrongWay.classList.toggle('hidden', !v);
  }

  setFlag(kind: 'checkered' | 'none'): void {
    this.flagEl.classList.toggle('hidden', kind === 'none');
  }

  /** Líneas de velocidad radiales. */
  drawSpeedLines(intensity: number, boost: boolean): void {
    const c = this.slCtx;
    const w = this.speedLines.width;
    const h = this.speedLines.height;
    c.clearRect(0, 0, w, h);
    if (intensity <= 0.02) return;
    const cx = w / 2;
    const cy = h * 0.45;
    const n = Math.floor(10 + intensity * 30);
    const maxR = Math.hypot(w, h) / 2;
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = maxR * (0.45 + Math.random() * 0.3);
      const r1 = r0 + maxR * (0.12 + Math.random() * 0.3 * intensity);
      c.strokeStyle = boost ? `rgba(255,${180 + Math.floor(Math.random() * 60)},80,${0.18 + intensity * 0.3})` : `rgba(255,255,255,${0.08 + intensity * 0.22})`;
      c.lineWidth = 1 + Math.random() * 2.5 * intensity;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
  }

  tick(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('show');
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.classList.remove('show');
    }
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
