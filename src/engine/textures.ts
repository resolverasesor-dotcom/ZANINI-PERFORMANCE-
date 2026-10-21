import * as THREE from 'three';
import { rng } from '../core/math';

// Texturas generadas con canvas: cero archivos externos.

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(key: string, c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, seed: number, dots = 0.5): void {
  const img = ctx.createImageData(w, h);
  const r = rng(seed);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * amp + (r() < dots * 0.02 ? (r() - 0.5) * amp * 3 : 0);
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function asphaltTex(dark = false): THREE.Texture {
  const key = 'asphalt' + dark;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, dark ? [46, 48, 54] : [78, 80, 86], 26, 11, 2);
  // Marcas de neumático sutiles
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 4; i++) ctx.fillRect(70 + i * 30 + (i > 1 ? 40 : 0), 0, 10, 256);
  ctx.globalAlpha = 1;
  return finish(key, c);
}

export function grassTex(): THREE.Texture {
  const key = 'grass';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [78, 140, 58], 30, 21, 1);
  // Franjas de césped cortado
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 128, 256);
  ctx.globalAlpha = 1;
  return finish(key, c);
}

export function groundTex(theme: string): THREE.Texture {
  const key = 'ground' + theme;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  const base: Record<string, [number, number, number]> = {
    ring: [86, 146, 62],
    gp: [80, 140, 60],
    coast: [190, 176, 128],
    mountain: [72, 116, 60],
    night: [38, 40, 48],
    quarry: [176, 140, 96],
    sunset: [150, 140, 100],
  };
  noiseFill(ctx, 256, 256, base[theme] ?? [86, 146, 62], theme === 'night' ? 14 : 34, 31, 2);
  return finish(key, c);
}

export function gravelTex(): THREE.Texture {
  const key = 'gravel';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [186, 170, 142], 60, 41, 6);
  return finish(key, c);
}

export function sandTex(): THREE.Texture {
  const key = 'sand';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [226, 204, 150], 26, 51, 1);
  return finish(key, c);
}

export function kerbTex(): THREE.Texture {
  const key = 'kerb';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(32, 64);
  ctx.fillStyle = '#D7261E';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 32, 32, 32);
  return finish(key, c);
}

export function checkerTex(): THREE.Texture {
  const key = 'checker';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(128, 32);
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = finish(key, c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Muro: hormigón con franjas o barrera de neumáticos según el tema. */
export function wallTex(theme: string): THREE.Texture {
  const key = 'wall' + theme;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 64);
  if (theme === 'night') {
    noiseFill(ctx, 256, 64, [150, 150, 156], 16, 61, 0);
    ctx.fillStyle = '#D7261E';
    ctx.fillRect(0, 50, 256, 14);
    ctx.fillStyle = '#FFC300';
    for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 50, 32, 14);
  } else if (theme === 'mountain' || theme === 'quarry') {
    // Guardarraíl
    noiseFill(ctx, 256, 64, [170, 172, 178], 10, 62, 0);
    ctx.fillStyle = '#8a8d94';
    ctx.fillRect(0, 18, 256, 6);
    ctx.fillRect(0, 40, 256, 6);
    ctx.fillStyle = '#555';
    for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 6, 64);
  } else {
    // Barrera de neumáticos con banda de color
    ctx.fillStyle = '#16161a';
    ctx.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 64; y += 21) {
        ctx.fillStyle = '#27272d';
        ctx.beginPath();
        ctx.arc(x + 16, y + 10, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0c0c0e';
        ctx.beginPath();
        ctx.arc(x + 16, y + 10, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = theme === 'gp' ? '#FFC300' : '#D7261E';
    ctx.fillRect(0, 26, 256, 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 900 11px Arial Black, Arial, sans-serif';
    ctx.fillText('ZANINI PERFORMANCE', 30, 36);
    ctx.fillText('ZANINI PERFORMANCE', 158, 36);
  }
  return finish(key, c);
}

export function embankTex(theme: string): THREE.Texture {
  const key = 'emb' + theme;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(128, 128);
  noiseFill(ctx, 128, 128, theme === 'mountain' ? [118, 112, 104] : [140, 130, 118], 40, 71, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < 128; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 4);
    ctx.stroke();
  }
  return finish(key, c);
}

export function promenadeTex(): THREE.Texture {
  const key = 'prom';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(128, 128);
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 8; y++) {
      const wave = (x + y) % 2;
      ctx.fillStyle = wave ? '#d9c7a4' : '#b8432f';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  return finish(key, c);
}

export function waterTex(): THREE.Texture {
  const key = 'water';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 256);
  noiseFill(ctx, 256, 256, [30, 120, 170], 18, 81, 0);
  const r = rng(5);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = r() * 256;
    const y = r() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 3, x + 16, y);
    ctx.stroke();
  }
  return finish(key, c);
}

/** Fachada con ventanas; lit = probabilidad de ventana encendida. */
export function windowsTex(night: boolean, emissive = false): THREE.Texture {
  const key = `win${night}${emissive}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(128, 256);
  const r = rng(night ? 9 : 3);
  if (emissive) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 256);
  } else {
    noiseFill(ctx, 128, 256, night ? [70, 70, 84] : [214, 206, 190], 14, 91, 0);
  }
  for (let y = 8; y < 256; y += 24) {
    for (let x = 8; x < 128; x += 24) {
      const lit = r() < (night ? 0.5 : 0);
      if (emissive) ctx.fillStyle = lit ? (r() < 0.7 ? '#ffd27a' : '#bfe3ff') : '#000';
      else ctx.fillStyle = night ? (lit ? '#ffd27a' : '#20232e') : r() < 0.5 ? '#6f8fae' : '#8fb2d2';
      ctx.fillRect(x, y, 14, 16);
    }
  }
  return finish(key, c);
}

export function garageTex(): THREE.Texture {
  const key = 'garage';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(8 + i * 64, 14, 48, 50);
    ctx.fillStyle = '#3c3f47';
    for (let y = 18; y < 64; y += 6) ctx.fillRect(8 + i * 64, y, 48, 2);
    ctx.fillStyle = i % 2 ? '#D7261E' : '#FFC300';
    ctx.fillRect(8 + i * 64, 4, 48, 7);
  }
  return finish(key, c);
}

/** Pancarta publicitaria con el logo. */
export function bannerTex(variant = 0): THREE.Texture {
  const key = 'banner' + variant;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(512, 96);
  const bg = ['#D7261E', '#111111', '#FFC300', '#ffffff'][variant % 4];
  const fg = ['#ffffff', '#FFC300', '#111111', '#D7261E'][variant % 4];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.save();
  ctx.transform(1, 0, -0.25, 1, 20, 0);
  ctx.fillStyle = fg;
  for (let i = 0; i < 4; i++) ctx.fillRect(20, 26 + i * 12, 60 - i * 12, 5);
  ctx.font = 'italic 900 52px "Arial Black", Arial, sans-serif';
  ctx.fillText('ZANINI', 100, 64);
  ctx.font = 'italic 700 22px Arial, sans-serif';
  ctx.fillText('PERFORMANCE', 330, 62);
  ctx.restore();
  return finish(key, c, false);
}

export function numberTex(num: number, color: string): THREE.Texture {
  const key = `num${num}${color}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 58, 58);
  ctx.fillStyle = '#111';
  ctx.font = '900 40px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 32, 35);
  return finish(key, c, false);
}

/** Textura radial para brillos y charcos de luz. */
export function glowTex(): THREE.Texture {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return finish(key, c, false);
}

/** Sombra difusa bajo los karts. */
export function blobTex(): THREE.Texture {
  const key = 'blob';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return finish(key, c, false);
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
