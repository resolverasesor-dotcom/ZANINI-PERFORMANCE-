import type { Track } from '../track/Track';

/** Transformación mundo -> lienzo para que el trazado quepa. */
export function layoutTransform(track: Track, w: number, h: number, pad: number): { s: number; ox: number; oz: number } {
  const b = track.bounds;
  const sx = (w - pad * 2) / (b.maxX - b.minX);
  const sz = (h - pad * 2) / (b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = pad + (w - pad * 2 - (b.maxX - b.minX) * s) / 2 - b.minX * s;
  const oz = pad + (h - pad * 2 - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s;
  return { s, ox, oz };
}

/** Dibuja el trazado visto desde arriba (x a la derecha, z hacia abajo). */
export function drawLayout(ctx: CanvasRenderingContext2D, track: Track, w: number, h: number, opts: { pad?: number; width?: number; color?: string; outline?: string; start?: boolean } = {}): { s: number; ox: number; oz: number } {
  const pad = opts.pad ?? 10;
  const tf = layoutTransform(track, w, h, pad);
  const P = (i: number): [number, number] => [track.px[i] * tf.s + tf.ox, track.pz[i] * tf.s + tf.oz];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= track.n; i += 2) {
      const [x, y] = P(i % track.n);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  path();
  ctx.strokeStyle = opts.outline ?? 'rgba(0,0,0,0.6)';
  ctx.lineWidth = (opts.width ?? 4) + 3;
  ctx.stroke();
  path();
  ctx.strokeStyle = opts.color ?? '#f2f2f2';
  ctx.lineWidth = opts.width ?? 4;
  ctx.stroke();
  // Puente: resaltar tramo superior
  for (let i = 0; i < track.n; i += 2) {
    if (!track.bridge[i]) continue;
    const [x, y] = P(i);
    ctx.fillStyle = opts.color ?? '#f2f2f2';
    ctx.beginPath();
    ctx.arc(x, y, (opts.width ?? 4) * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.start !== false) {
    const [x, y] = P(0);
    const tx = track.tx[0];
    const tz = track.tz[0];
    const len = (opts.width ?? 4) * 1.6;
    ctx.strokeStyle = '#D7261E';
    ctx.lineWidth = Math.max(2, (opts.width ?? 4) * 0.6);
    ctx.beginPath();
    ctx.moveTo(x - tz * len, y + tx * len);
    ctx.lineTo(x + tz * len, y - tx * len);
    ctx.stroke();
  }
  return tf;
}

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private tf: { s: number; ox: number; oz: number };
  private size: number;

  constructor(track: Track, size: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = Math.round(size * dpr);
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = Math.round(size * dpr);
    const bctx = this.base.getContext('2d')!;
    bctx.scale(dpr, dpr);
    this.tf = drawLayout(bctx, track, size, size, { pad: 10, width: 4 });
  }

  draw(karts: { x: number; z: number; color: string; player: boolean; ghost?: boolean }[]): void {
    const c = this.ctx;
    const s = this.size;
    c.clearRect(0, 0, s, s);
    c.drawImage(this.base, 0, 0, s, s);
    const tf = this.tf;
    // Primero rivales, luego el jugador encima
    for (const pass of [0, 1]) {
      for (const k of karts) {
        if ((pass === 1) !== k.player) continue;
        const x = k.x * tf.s + tf.ox;
        const y = k.z * tf.s + tf.oz;
        c.beginPath();
        c.arc(x, y, k.player ? 5.5 : 3.6, 0, Math.PI * 2);
        c.fillStyle = k.ghost ? 'rgba(255,255,255,0.45)' : k.color;
        c.fill();
        c.lineWidth = k.player ? 2.5 : 1.2;
        c.strokeStyle = k.player ? '#FFC300' : '#111';
        c.stroke();
      }
    }
  }
}
