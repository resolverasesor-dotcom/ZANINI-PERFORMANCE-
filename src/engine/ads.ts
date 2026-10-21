import * as THREE from 'three';

// Publicidad inventada (y de risa) para vallas, muros, pórtico y pegatinas.
// Todo dibujado con canvas: marca, eslogan e icono.

type Icon = 'paella' | 'tyre' | 'cup' | 'umbrella' | 'wrench' | 'churro' | 'bar' | 'flipflop' | 'glasses' | 'bowl' | 'cone' | 'moon' | 'icecream' | 'pump' | 'parasol' | 'octopus';

export interface Ad {
  brand: string;
  slogan: string;
  bg: string;
  fg: string;
  accent: string;
  icon: Icon;
}

export const ADS: Ad[] = [
  { brand: 'PAELLA TURBO', slogan: 'Del fuego a la meta en 20 minutos', bg: '#FFC300', fg: '#111', accent: '#D7261E', icon: 'paella' },
  { brand: 'NEUMÁTICOS CHICLE', slogan: 'Se pegan a todo. Incluso al suelo.', bg: '#111', fg: '#fff', accent: '#ff5fa2', icon: 'tyre' },
  { brand: 'HORCHATA NITRO', slogan: 'Fresquita y a 300 por hora', bg: '#f3ead2', fg: '#5a3d1e', accent: '#1E6FE0', icon: 'cup' },
  { brand: 'SEGUROS LO QUE SEA', slogan: 'Cubrimos hasta tus derrapes', bg: '#1E6FE0', fg: '#fff', accent: '#FFC300', icon: 'umbrella' },
  { brand: 'TALLER EL PITIDO', slogan: 'Si suena, cobramos', bg: '#2b2d33', fg: '#FFC300', accent: '#fff', icon: 'wrench' },
  { brand: 'CHURRERÍA LA CURVA', slogan: 'Churros con chicane incluida', bg: '#D7261E', fg: '#fff', accent: '#FFC300', icon: 'churro' },
  { brand: 'TURRÓN AERODINÁMICO', slogan: 'Duro, pero rápido', bg: '#7a4b22', fg: '#ffe9b0', accent: '#fff', icon: 'bar' },
  { brand: 'CHANCLAS RACING', slogan: 'Homologadas para el paseo marítimo', bg: '#00BCD4', fg: '#fff', accent: '#FFC300', icon: 'flipflop' },
  { brand: 'GAFAS SOL DE BENIDORM', slogan: 'Ves la meta antes que nadie', bg: '#ff8a00', fg: '#111', accent: '#fff', icon: 'glasses' },
  { brand: 'GAZPACHO GRAND PRIX', slogan: 'Se toma frío, se corre caliente', bg: '#c62828', fg: '#fff', accent: '#8bc34a', icon: 'bowl' },
  { brand: 'AUTOESCUELA YA FRENARÁS', slogan: 'Aprobados: algunos', bg: '#fff', fg: '#111', accent: '#D7261E', icon: 'cone' },
  { brand: 'SIESTA EXPRESS', slogan: 'Dormimos rápido por ti', bg: '#2a2f6b', fg: '#fff', accent: '#FFC300', icon: 'moon' },
  { brand: 'HELADOS EL SEMÁFORO', slogan: 'Rojo, ámbar y fresa', bg: '#ffd1e3', fg: '#a3134a', accent: '#43A047', icon: 'icecream' },
  { brand: 'GASOLINERA EL ABUELO', slogan: 'Llenamos el depósito y opinamos', bg: '#43A047', fg: '#fff', accent: '#FFC300', icon: 'pump' },
  { brand: 'SOMBRILLAS CLAVADAS', slogan: 'Primera fila desde las 7:00', bg: '#FFC300', fg: '#1a3a7a', accent: '#D7261E', icon: 'parasol' },
  { brand: 'PULPO A LA BRASA EL DERRAPE', slogan: 'Ocho brazos, cero frenos', bg: '#5e2b7e', fg: '#fff', accent: '#ff8a65', icon: 'octopus' },
];

const cache = new Map<string, THREE.CanvasTexture>();

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, maxW: number, start: number, family: string): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > 8) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

const HEAVY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const LIGHT = '"Segoe UI", Roboto, Arial, sans-serif';

/** Dibuja el icono de un anuncio centrado en (cx, cy) con radio r. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: Icon, cx: number, cy: number, r: number, fg: string, accent: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r / 40, r / 40);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  const circle = (x: number, y: number, rr: number, fill = true) => {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    if (fill) ctx.fill();
    else ctx.stroke();
  };
  switch (icon) {
    case 'paella':
      ctx.fillStyle = '#333';
      circle(0, 4, 32);
      ctx.fillStyle = '#f5b800';
      circle(0, 4, 26);
      ctx.fillStyle = accent;
      for (const [x, y] of [[-10, -4], [9, 10], [6, -10], [-8, 14]]) circle(x, y, 5);
      ctx.fillStyle = '#4caf50';
      circle(12, 0, 4);
      ctx.fillStyle = '#333';
      ctx.fillRect(28, -2, 14, 8);
      ctx.fillRect(-42, -2, 14, 8);
      break;
    case 'tyre':
      circle(0, 0, 34);
      ctx.fillStyle = accent;
      circle(0, 0, 18);
      ctx.fillStyle = '#ddd';
      circle(0, 0, 9);
      break;
    case 'cup':
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.moveTo(-20, -24);
      ctx.lineTo(20, -24);
      ctx.lineTo(14, 32);
      ctx.lineTo(-14, 32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(6, -24);
      ctx.lineTo(16, -40);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(-18, -4, 34, 6);
      break;
    case 'umbrella':
      ctx.beginPath();
      ctx.arc(0, 0, 34, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 30);
      ctx.arc(-8, 30, 8, 0, Math.PI);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 34, Math.PI, Math.PI * 1.33);
      ctx.lineTo(0, 0);
      ctx.fill();
      break;
    case 'wrench':
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-24, 24);
      ctx.lineTo(14, -14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(20, -20, 14, Math.PI * 0.9, Math.PI * 2.6);
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.fillStyle = accent;
      circle(-26, 26, 5);
      break;
    case 'churro':
      ctx.strokeStyle = '#e0a040';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-30, 20);
      ctx.bezierCurveTo(-10, -40, 10, 40, 30, -20);
      ctx.stroke();
      ctx.strokeStyle = '#a0651a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 20);
      ctx.bezierCurveTo(-10, -40, 10, 40, 30, -20);
      ctx.stroke();
      break;
    case 'bar':
      ctx.fillStyle = '#d9b77c';
      ctx.fillRect(-34, -14, 68, 28);
      ctx.fillStyle = '#8a5a2b';
      for (const [x, y] of [[-20, -4], [0, 6], [18, -6], [-8, -8], [24, 6]]) circle(x, y, 4);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-44, -18);
      ctx.lineTo(-56, -18);
      ctx.moveTo(-44, 0);
      ctx.lineTo(-60, 0);
      ctx.moveTo(-44, 18);
      ctx.lineTo(-56, 18);
      ctx.stroke();
      break;
    case 'flipflop':
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 34, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.lineTo(-2, -16);
      ctx.lineTo(14, 4);
      ctx.stroke();
      break;
    case 'glasses':
      ctx.fillStyle = '#111';
      circle(-18, 0, 15);
      circle(18, 0, 15);
      ctx.strokeStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, -4);
      ctx.stroke();
      ctx.fillStyle = accent;
      circle(-23, -5, 4);
      circle(13, -5, 4);
      break;
    case 'bowl':
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -4, 34, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#e53935';
      ctx.fillRect(-32, -8, 64, 8);
      ctx.fillStyle = accent;
      circle(-10, -12, 5);
      circle(10, -14, 4);
      break;
    case 'cone':
      ctx.fillStyle = '#ff6d00';
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(24, 28);
      ctx.lineTo(-24, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-14, 0, 28, 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(-32, 28, 64, 8);
      break;
    case 'moon':
      ctx.fillStyle = accent;
      circle(0, 0, 30);
      ctx.fillStyle = '#2a2f6b';
      circle(14, -10, 26);
      ctx.fillStyle = fg;
      ctx.font = `900 22px ${HEAVY}`;
      ctx.fillText('z', 10, 20);
      ctx.fillText('z', 22, 4);
      break;
    case 'icecream':
      ctx.fillStyle = '#d9a35b';
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.lineTo(0, 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e53935';
      circle(0, -26, 12);
      ctx.fillStyle = '#FFC300';
      circle(-10, -10, 12);
      ctx.fillStyle = '#ff7fae';
      circle(10, -10, 12);
      break;
    case 'pump':
      ctx.fillRect(-20, -30, 30, 62);
      ctx.fillStyle = accent;
      ctx.fillRect(-14, -24, 18, 14);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(10, -18);
      ctx.lineTo(26, -18);
      ctx.lineTo(26, 16);
      ctx.stroke();
      break;
    case 'parasol':
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-36, -2);
      ctx.quadraticCurveTo(0, -46, 36, -2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(0, -46, 12, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, 36);
      ctx.stroke();
      break;
    case 'octopus':
      ctx.fillStyle = accent;
      circle(0, -10, 22);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        const x = -20 + i * 8;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.quadraticCurveTo(x + (i % 2 ? 8 : -8), 22, x, 34);
        ctx.stroke();
      }
      ctx.fillStyle = '#111';
      circle(-8, -12, 4);
      circle(8, -12, 4);
      break;
  }
  ctx.restore();
}

/** Valla publicitaria (512x128). */
export function adTex(index: number): THREE.CanvasTexture {
  const ad = ADS[((index % ADS.length) + ADS.length) % ADS.length];
  const key = 'ad:' + ad.brand;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = ad.bg;
  ctx.fillRect(0, 0, 512, 128);
  // franja diagonal de acento
  ctx.fillStyle = ad.accent;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(430, 0);
  ctx.lineTo(512, 0);
  ctx.lineTo(512, 128);
  ctx.lineTo(380, 128);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // icono
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  drawIcon(ctx, ad.icon, 64, 64, 40, ad.fg, ad.accent);
  // textos
  ctx.fillStyle = ad.fg;
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  ctx.transform(1, 0, -0.18, 1, 14, 0);
  fitFont(ctx, ad.brand, 'italic 900', 300, 44, HEAVY);
  ctx.fillText(ad.brand, 128, 66);
  fitFont(ctx, ad.slogan, 'italic 700', 290, 22, LIGHT);
  ctx.fillText(ad.slogan, 130, 100);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Pegatina de patrocinador para los pontones (256x96). */
export function stickerTex(index: number): THREE.CanvasTexture {
  const ad = ADS[((index % ADS.length) + ADS.length) % ADS.length];
  const key = 'st:' + ad.brand;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = ad.bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 14);
  ctx.fill();
  ctx.strokeStyle = ad.accent;
  ctx.lineWidth = 6;
  ctx.stroke();
  drawIcon(ctx, ad.icon, 46, 48, 30, ad.fg, ad.accent);
  ctx.fillStyle = ad.fg;
  const words = ad.brand.split(' ');
  const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
  const l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
  fitFont(ctx, l1, 'italic 900', 160, 30, HEAVY);
  ctx.fillText(l1, 86, l2 ? 44 : 60);
  if (l2) {
    fitFont(ctx, l2, 'italic 900', 160, 30, HEAVY);
    ctx.fillText(l2, 86, 78);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
