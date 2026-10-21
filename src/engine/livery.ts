import * as THREE from 'three';

// Texturas de decoración del kart: cascos, placa con el nombre, llamas y cuadros.

export type LiveryStyle = 'basica' | 'ale' | 'llamas' | 'cuadros' | 'oro';
export type HelmetStyle = 'clasico' | 'estrellas' | 'rayo' | 'llamas' | 'corona';

export const LIVERY_LABELS: Record<LiveryStyle, string> = {
  basica: 'Básica',
  ale: 'Edición Ale',
  llamas: 'Llamas',
  cuadros: 'Bandera a cuadros',
  oro: 'Oro cromado',
};

export const HELMET_LABELS: Record<HelmetStyle, string> = {
  clasico: 'Clásico',
  estrellas: 'Estrellas',
  rayo: 'Rayo',
  llamas: 'Llamas',
  corona: 'Corona de campeón',
};

const cache = new Map<string, THREE.CanvasTexture>();
const HEAVY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

function tex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function flames(ctx: CanvasRenderingContext2D, w: number, h: number, fromBottom: boolean): void {
  const cols = ['#ff3d00', '#ff9100', '#ffd600'];
  cols.forEach((c, k) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    const base = fromBottom ? h : 0;
    ctx.moveTo(0, base);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w;
      const peak = h * (0.75 - k * 0.2) * (0.6 + ((i * 37) % 10) / 25);
      const y = fromBottom ? h - peak : peak;
      ctx.quadraticCurveTo(x - w / n / 2, fromBottom ? h - peak * 0.3 : peak * 0.3, x, y);
    }
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fill();
  });
}

/**
 * Casco (mapa equirectangular: x = vuelta completa, y = de arriba abajo).
 * u = 0.25 es la parte delantera y u = 0.75 la trasera.
 */
export function helmetTex(style: HelmetStyle, color: string, accent: string, name: string): THREE.CanvasTexture {
  return tex(`helm:${style}:${color}:${accent}:${name}`, 512, 256, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 256);
    const stripe = (w: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(128 - w / 2, 0, w, 140);
      ctx.fillRect(384 - w / 2, 0, w, 140);
    };
    switch (style) {
      case 'clasico':
        stripe(46, '#ffffff');
        stripe(16, accent);
        break;
      case 'estrellas':
        stripe(40, accent);
        ctx.fillStyle = accent;
        for (const [x, y, r] of [[40, 70, 18], [230, 60, 22], [300, 100, 14], [470, 80, 18], [190, 110, 12], [60, 120, 12], [450, 30, 12]]) star(ctx, x, y, r);
        ctx.fillStyle = '#ffffff';
        star(ctx, 128, 64, 20);
        break;
      case 'rayo':
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(0, 100);
        for (let x = 0; x <= 512; x += 64) {
          ctx.lineTo(x + 32, 70);
          ctx.lineTo(x + 64, 100);
        }
        ctx.lineTo(512, 130);
        for (let x = 512; x >= 0; x -= 64) {
          ctx.lineTo(x - 32, 160);
          ctx.lineTo(x - 64, 130);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'llamas':
        flames(ctx, 512, 256, true);
        break;
      case 'corona':
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(0, 110, 512, 26);
        stripe(30, '#d4a017');
        ctx.fillStyle = '#fff6c0';
        for (let x = 16; x < 512; x += 48) star(ctx, x, 123, 8);
        break;
    }
    // Nombre en la nuca
    if (name) {
      ctx.save();
      ctx.fillStyle = '#111';
      ctx.font = `italic 900 40px ${HEAVY}`;
      ctx.textAlign = 'center';
      ctx.fillText(name.slice(0, 6), 384, 176);
      ctx.restore();
    }
  });
}

/** Placa lateral con el nombre y el dorsal. */
export function namePlateTex(name: string, number: number, color: string, accent: string): THREE.CanvasTexture {
  return tex(`name:${name}:${number}:${color}:${accent}`, 256, 96, (ctx) => {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(256, 0);
    ctx.lineTo(238, 96);
    ctx.lineTo(0, 96);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(170, 0, 86, 96);
    ctx.fillStyle = '#111';
    ctx.font = `italic 900 58px ${HEAVY}`;
    ctx.fillText(name.slice(0, 5), 22, 70);
    ctx.fillStyle = '#fff';
    ctx.font = `italic 900 54px ${HEAVY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(number), 212, 70);
  });
}

export function flameDecalTex(): THREE.CanvasTexture {
  return tex('flamedecal', 256, 96, (ctx) => {
    ctx.save();
    ctx.translate(256, 0);
    ctx.rotate(Math.PI / 2);
    flames(ctx, 96, 256, true);
    ctx.restore();
  });
}

export function checkerDecalTex(): THREE.CanvasTexture {
  const t = tex('checkdecal', 128, 32, (ctx) => {
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Banderín del dorsal en la antena. */
export function pennantTex(number: number, accent: string): THREE.CanvasTexture {
  return tex(`pen:${number}:${accent}`, 128, 64, (ctx) => {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(128, 32);
    ctx.lineTo(0, 64);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `900 40px ${HEAVY}`;
    ctx.fillText(String(number), 10, 47);
  });
}

/** Color de contraste para un color de kart. */
export function accentFor(color: string): string {
  const c = color.toLowerCase();
  if (c === '#ffc300' || c === '#ffffff' || c === '#00bcd4') return '#D7261E';
  return '#FFC300';
}
