import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/math';
import type { Quality } from '../core/Settings';
import { KART_COLORS } from '../config';
import type { Track } from '../track/Track';
import { M, makeProto, part } from './decor';
import { adTex, ADS } from './ads';
import { crowdMaterial, flagMaterial, type TimeUniform } from './ambient';
import { asphaltTex, fenceTex, glowTex, windowsTex } from './textures';

// Instalaciones de un kartódromo de verdad: barrera de neumáticos, valla
// perimetral con publicidad, paddock con carpas y karts en sus caballetes,
// edificio del club con terraza, torre de tiempos, grada pequeña, focos y
// comisarios con bandera en las curvas.

const vc = () => new THREE.MeshLambertMaterial({ vertexColors: true });

/** Separación entre pilas de neumáticos (m). */
const TYRE_STEP = 0.64;
const TYRE_R = 0.31;

export interface VenueParts {
  group: THREE.Group;
  disposables: { dispose(): void }[];
  /** Zona de la recta de meta ocupada por el paddock (no poner decoración ahí). */
  pitZone: { s0: number; s1: number; side: number };
  /** true si (x, z) cae dentro de la valla perimetral. */
  inside(x: number, z: number): boolean;
  /** true si (x, z) cae en el paddock. */
  inPaddock(x: number, z: number): boolean;
}

/**
 * Barrera de neumáticos a lo largo de los dos límites de la pista (donde está la
 * colisión). Negros en las rectas y pintados de rojo y blanco en las curvas.
 */
export function buildTyreBarrier(track: Track, quality: Quality, skip: (i: number) => boolean): THREE.InstancedMesh {
  const t = track;
  const pts: { x: number; y: number; z: number; yaw: number; corner: boolean }[] = [];
  for (const side of [-1, 1]) {
    // Recorre el límite y coloca una pila cada TYRE_STEP metros (interpolando entre muestras)
    let next = 0;
    let acc = 0;
    let px = NaN;
    let pz = NaN;
    for (let i = 0; i <= t.n; i++) {
      const k = i % t.n;
      const lim = t.hw[k] + (side < 0 ? t.runL[k] : t.runR[k]) + TYRE_R - 0.02;
      const x = t.px[k] - t.tz[k] * side * lim;
      const z = t.pz[k] + t.tx[k] * side * lim;
      if (Number.isNaN(px)) {
        px = x;
        pz = z;
        continue;
      }
      const d = Math.hypot(x - px, z - pz);
      while (next <= acc + d) {
        const f = d > 0 ? (next - acc) / d : 0;
        next += TYRE_STEP;
        if (skip(k)) continue;
        let corner = false;
        for (let j = -12; j <= 12 && !corner; j += 3) corner = Math.abs(t.curv[(k + j + t.n) % t.n]) > 1 / 28;
        pts.push({ x: px + (x - px) * f, y: t.py[k], z: pz + (z - pz) * f, yaw: Math.atan2(t.tx[k], t.tz[k]), corner });
      }
      acc += d;
      px = x;
      pz = z;
    }
  }
  const seg = quality === 'bajo' ? 6 : 10;
  const geo =
    quality === 'bajo'
      ? new THREE.CylinderGeometry(TYRE_R, TYRE_R, 0.5, seg)
      : mergeGeometries([
          new THREE.CylinderGeometry(TYRE_R, TYRE_R, 0.23, seg).translate(0, -0.125, 0),
          new THREE.CylinderGeometry(TYRE_R, TYRE_R, 0.23, seg).translate(0, 0.125, 0),
        ])!;
  geo.translate(0, 0.25, 0);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const dummy = new THREE.Object3D();
  const black = new THREE.Color('#1c1c20');
  const red = new THREE.Color('#d7261e');
  const white = new THREE.Color('#f0f0f0');
  pts.forEach((p, i) => {
    dummy.position.set(p.x, p.y - 0.05, p.z);
    dummy.rotation.set(0, p.yaw + i * 0.7, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, p.corner ? (Math.floor(i / 3) % 2 ? red : white) : i % 9 === 0 ? white : black);
  });
  mesh.receiveShadow = quality !== 'bajo';
  mesh.userData.pts = pts;
  return mesh;
}

// ---------- prototipos ----------

/** Kart de alquiler/competición sobre su caballete del paddock. */
function standKartGeo(color: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 0.55;
  // caballete
  for (const z of [-0.5, 0.5]) parts.push(part(new THREE.BoxGeometry(0.9, h, 0.08), '#4a4e56', M(0, h / 2, z)));
  parts.push(part(new THREE.BoxGeometry(1.0, 0.06, 1.7), '#8a8f98', M(0, h + 0.05, 0)));
  parts.push(part(new THREE.BoxGeometry(0.42, 0.24, 0.5), color, M(0, h + 0.2, 0.75)));
  for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.2, 0.18, 0.7), color, M(s * 0.5, h + 0.15, 0)));
  parts.push(part(new THREE.BoxGeometry(0.42, 0.42, 0.3), '#1a1a1a', M(0, h + 0.3, -0.25, -0.3)));
  for (const [x, z, r] of [[-0.55, 0.62, 0.13], [0.55, 0.62, 0.13], [-0.6, -0.6, 0.14], [0.6, -0.6, 0.14]] as const)
    parts.push(part(new THREE.CylinderGeometry(r, r, 0.17, 10), '#18181b', M(x, h + r - 0.02, z, 0, 0, Math.PI / 2)));
  return mergeGeometries(parts)!;
}

/** Carpa del equipo (4 patas y techo a dos aguas). */
function tentGeo(color: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = 6;
  const d = 4.5;
  const h = 2.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, h, 5), '#c9ccd2', M((sx * w) / 2, h / 2, (sz * d) / 2)));
  const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2, 1.0, 4, 1);
  parts.push(part(roof, color, M(0, h + 0.5, 0, 0, Math.PI / 4, 0, w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414)));
  // faldón con el color del equipo
  parts.push(part(new THREE.BoxGeometry(w, 0.3, 0.03), color, M(0, h - 0.15, d / 2)));
  parts.push(part(new THREE.BoxGeometry(w, 0.3, 0.03), color, M(0, h - 0.15, -d / 2)));
  // pared trasera y banco de trabajo
  parts.push(part(new THREE.BoxGeometry(w, h, 0.04), '#f2f2f2', M(0, h / 2, -d / 2)));
  parts.push(part(new THREE.BoxGeometry(1.6, 0.9, 0.6), '#c62828', M(-1.8, 0.45, -1.7)));
  parts.push(part(new THREE.BoxGeometry(0.5, 0.5, 0.5), '#2b2b30', M(2.0, 0.25, -1.6)));
  return mergeGeometries(parts)!;
}

function vanGeo(color: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.BoxGeometry(2.0, 2.0, 4.0), color, M(0, 1.35, -0.5)));
  parts.push(part(new THREE.BoxGeometry(2.0, 1.2, 1.3), color, M(0, 0.95, 2.1)));
  parts.push(part(new THREE.BoxGeometry(1.9, 0.6, 0.05), '#2a3440', M(0, 1.45, 2.0, -0.5)));
  for (const [x, z] of [[-0.95, 1.8], [0.95, 1.8], [-0.95, -1.6], [0.95, -1.6]] as const)
    parts.push(part(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10), '#18181b', M(x, 0.36, z, 0, 0, Math.PI / 2)));
  return mergeGeometries(parts)!;
}

/** Grada pequeña de tres filas (el público va en otra geometría animada). */
function bleacherGeo(len: number): { geo: THREE.BufferGeometry; crowd: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const people: THREE.BufferGeometry[] = [];
  const shirt = ['#D7261E', '#FFC300', '#ffffff', '#1E6FE0', '#111111', '#43A047', '#ff7fae', '#00BCD4'];
  const skin = ['#f1c7a3', '#d8a27a', '#a8714e', '#f5d6bd'];
  const r = rng(Math.round(len * 7));
  for (let row = 0; row < 3; row++) {
    parts.push(part(new THREE.BoxGeometry(len, 0.12, 0.9), '#b8bec6', M(0, 0.5 + row * 0.55, -row * 0.9)));
    parts.push(part(new THREE.BoxGeometry(len, 0.5 + row * 0.55, 0.06), '#6b717a', M(0, (0.5 + row * 0.55) / 2, -row * 0.9 + 0.42)));
    for (let x = -len / 2 + 0.6; x < len / 2 - 0.4; x += 0.75 + r() * 0.9) {
      if (r() < 0.25) continue;
      const y = 0.56 + row * 0.55;
      people.push(part(new THREE.BoxGeometry(0.5, 0.6, 0.35), shirt[Math.floor(r() * shirt.length)], M(x, y + 0.3, -row * 0.9 - 0.1)));
      people.push(part(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin[Math.floor(r() * skin.length)], M(x, y + 0.78, -row * 0.9 - 0.1)));
    }
  }
  // barandilla trasera
  parts.push(part(new THREE.BoxGeometry(len, 0.06, 0.06), '#c9ccd2', M(0, 2.6, -2.25)));
  return { geo: mergeGeometries(parts)!, crowd: mergeGeometries(people)! };
}

/** Puesto de comisario: caseta, comisario con mono naranja y bandera amarilla. */
function marshalGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.BoxGeometry(1.6, 0.3, 1.6), '#9aa0a8', M(0, 0.15, 0)));
  parts.push(part(new THREE.BoxGeometry(1.7, 0.08, 1.7), '#D7261E', M(0, 2.5, 0)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.06, 2.2, 0.06), '#d8d8d8', M(sx * 0.75, 1.4, sz * 0.75)));
  parts.push(part(new THREE.BoxGeometry(0.42, 0.75, 0.3), '#ff6d00', M(0.2, 0.75, 0.2)));
  parts.push(part(new THREE.BoxGeometry(0.3, 0.6, 0.26), '#ff6d00', M(0.2, 0.0 + 0.6, 0.2)));
  parts.push(part(new THREE.SphereGeometry(0.15, 8, 6), '#f1c7a3', M(0.2, 1.3, 0.2)));
  parts.push(part(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4), '#333', M(0.5, 1.6, 0.4, 0, 0, -0.5)));
  parts.push(part(new THREE.BoxGeometry(0.7, 0.45, 0.02), '#ffd600', M(0.95, 2.1, 0.4, 0, 0, -0.15)));
  return mergeGeometries(parts)!;
}

/** Torre de focos: poste y batería de proyectores orientada a la pista. */
function floodGeo(): { pole: THREE.BufferGeometry; lamps: THREE.BufferGeometry } {
  const pole = mergeGeometries([
    part(new THREE.CylinderGeometry(0.16, 0.28, 14, 6), '#8c929b', M(0, 7, 0)),
    part(new THREE.BoxGeometry(2.6, 0.12, 0.12), '#5f646c', M(0, 14.1, 0.3)),
    part(new THREE.BoxGeometry(2.6, 0.12, 0.12), '#5f646c', M(0, 14.9, 0.3)),
  ])!;
  const l: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) l.push(new THREE.BoxGeometry(0.7, 0.55, 0.25).applyMatrix4(M(-0.85 + c * 0.85, 14.35 + r * 0.75, 0.45, 0.35)));
  return { pole, lamps: mergeGeometries(l)! };
}

function signTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#D7261E';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 76, 512, 20);
  ctx.fillStyle = '#FFC300';
  ctx.fillRect(0, 70, 512, 6);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 900 58px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ZANINI KARTING', 256, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Panel de la torre de tiempos con posiciones y dorsales. */
function towerTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#D7261E';
  ctx.fillRect(0, 0, 128, 54);
  ctx.fillStyle = '#fff';
  ctx.font = '900 30px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LAP 5', 64, 39);
  const nums = [7, 44, 12, 3, 88, 21, 9, 55];
  ctx.font = '900 40px "Arial Black", Arial, sans-serif';
  nums.forEach((n, i) => {
    const y = 104 + i * 54;
    ctx.fillStyle = '#FFC300';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), 10, y);
    ctx.fillStyle = n === 7 ? '#ff6b5e' : '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(String(n), 118, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Construye las instalaciones del kartódromo. El paddock se coloca junto a la
 * recta de meta, en el lado contrario al interior del trazado.
 */
export function buildKartVenue(track: Track, groundY: number, quality: Quality, theme: string, time: TimeUniform, clearance: (x: number, z: number) => number): VenueParts {
  const night = theme === 'night';
  const t = track;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const r = rng(t.def.id.length * 977 + 5);
  const lp = { x: 0, y: 0, z: 0 };

  // Lado del paddock: el contrario al centro de masas del trazado
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < t.n; i++) {
    cx += t.px[i];
    cz += t.pz[i];
  }
  cx /= t.n;
  cz /= t.n;
  const rx0 = -t.tz[0];
  const rz0 = t.tx[0];
  const os = (cx - t.px[0]) * rx0 + (cz - t.pz[0]) * rz0 > 0 ? -1 : 1;
  const lim0 = t.hw[0] + (os < 0 ? t.runL[0] : t.runR[0]);
  const v0 = lim0 + 1.2;

  // Marco local del paddock: u a lo largo de la recta, v hacia fuera
  const heading = t.headingAt(0);
  t.pointAt(0, 0, lp);
  const ox = lp.x;
  const oz = lp.z;
  const baseY = groundY;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const wx = os * rx0;
  const wz = os * rz0;
  const world = (u: number, v: number): [number, number] => [ox + fx * u + wx * v, oz + fz * u + wz * v];
  const U0 = -95;
  const U1 = 55;
  const V1 = v0 + 44;
  const paddock = new THREE.Group();
  paddock.position.set(ox, baseY, oz);
  // ejes locales: +z = adelante; -os*x = hacia fuera (x local = izquierda de la pista)
  paddock.rotation.y = heading;
  const L = (u: number, v: number, y = 0) => new THREE.Vector3(-os * v, y, u);
  group.add(paddock);

  // Explanada de asfalto del paddock
  const padTex = keep(asphaltTex(true).clone());
  padTex.needsUpdate = true;
  padTex.repeat.set((V1 - v0) / 8, (U1 - U0) / 8);
  const pad = new THREE.Mesh(keep(new THREE.PlaneGeometry(V1 - v0, U1 - U0)), keep(new THREE.MeshLambertMaterial({ map: padTex, color: '#b8bcc4' })));
  pad.rotation.x = -Math.PI / 2;
  pad.position.copy(L((U0 + U1) / 2, (v0 + V1) / 2, 0.06));
  pad.receiveShadow = true;
  paddock.add(pad);
  // Líneas de las plazas del paddock
  const lineMat = keep(new THREE.MeshBasicMaterial({ color: '#e8e8e8' }));
  const lineGeo = keep(new THREE.PlaneGeometry(0.12, 7));
  for (let u = U0 + 2; u < -14; u += 9) {
    const m = new THREE.Mesh(lineGeo, lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 2;
    m.position.copy(L(u - 4.5, v0 + 17, 0.08));
    paddock.add(m);
  }

  // Carpas de los equipos con karts en los caballetes
  const tentColors = ['#D7261E', '#1E6FE0', '#FFC300', '#43A047', '#111111', '#FF6D00', '#8E24AA'];
  const tentList: THREE.Matrix4[] = [];
  const nTents = 7;
  const tentGeos = new Map<string, THREE.Matrix4[]>();
  const kartGeos = new Map<string, THREE.Matrix4[]>();
  for (let k = 0; k < nTents; k++) {
    const u = U0 + 6 + k * 9;
    if (u > -16) break;
    const col = tentColors[k % tentColors.length];
    const m = new THREE.Matrix4().compose(L(u, v0 + 17), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (os * Math.PI) / 2, 0)), new THREE.Vector3(1, 1, 1));
    tentList.push(m);
    (tentGeos.get(col) ?? tentGeos.set(col, []).get(col)!).push(m);
    for (const du of [-1.5, 1.5]) {
      const kc = KART_COLORS[(k * 3 + (du > 0 ? 1 : 0)) % KART_COLORS.length];
      const km = new THREE.Matrix4().compose(L(u + du, v0 + 16.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (os * Math.PI) / 2 + 0.15 * du, 0)), new THREE.Vector3(1, 1, 1));
      (kartGeos.get(kc) ?? kartGeos.set(kc, []).get(kc)!).push(km);
    }
  }
  const addInstanced = (map: Map<string, THREE.Matrix4[]>, make: (c: string) => THREE.BufferGeometry, shadow: boolean) => {
    for (const [col, mats] of map) {
      const g = keep(make(col));
      const mesh = new THREE.InstancedMesh(g, keep(vc()), mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = shadow && quality === 'alto';
      paddock.add(mesh);
      disposables.push(mesh);
    }
  };
  addInstanced(tentGeos, tentGeo, true);
  addInstanced(kartGeos, standKartGeo, false);
  // Furgonetas detrás de las carpas
  const vans = new Map<string, THREE.Matrix4[]>();
  for (let u = U0 + 6; u < -20; u += 7 + r() * 4) {
    const col = ['#f4f4f4', '#d0d4da', '#1E6FE0', '#2b2b30', '#D7261E'][Math.floor(r() * 5)];
    const m = new THREE.Matrix4().compose(L(u, v0 + 30 + r() * 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (os * Math.PI) / 2 + Math.PI + (r() - 0.5) * 0.2, 0)), new THREE.Vector3(1, 1, 1));
    (vans.get(col) ?? vans.set(col, []).get(col)!).push(m);
  }
  addInstanced(vans, vanGeo, true);

  // Edificio del club con terraza y cartel
  const club = new THREE.Group();
  club.position.copy(L(2, v0 + 26));
  club.rotation.y = (os * Math.PI) / 2;
  // en el grupo del club: +z mira a la pista, x a lo largo de la recta
  const wallMat = keep(new THREE.MeshLambertMaterial({ color: '#eef0f3' }));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(28, 6.4, 12)), wallMat);
  body.position.set(0, 3.2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  club.add(body);
  const glassTex = windowsTex(night, false);
  const glassMat = keep(
    night
      ? new THREE.MeshLambertMaterial({ map: glassTex, emissiveMap: windowsTex(true, true), emissive: new THREE.Color('#ffffff') })
      : new THREE.MeshLambertMaterial({ map: glassTex, color: '#cfe4f2' }),
  );
  for (const y of [1.6, 4.7]) {
    const g = new THREE.Mesh(keep(new THREE.PlaneGeometry(26, 2.2)), glassMat);
    g.position.set(0, y, 6.02);
    club.add(g);
  }
  const terrace = new THREE.Mesh(keep(new THREE.BoxGeometry(28, 0.25, 4)), keep(new THREE.MeshLambertMaterial({ color: '#9aa0a8' })));
  terrace.position.set(0, 3.2, 8);
  club.add(terrace);
  const railMat = keep(new THREE.MeshLambertMaterial({ color: '#D7261E' }));
  const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(28, 0.08, 0.08)), railMat);
  rail.position.set(0, 4.25, 9.95);
  club.add(rail);
  const railGlass = new THREE.Mesh(keep(new THREE.PlaneGeometry(28, 0.9)), keep(new THREE.MeshLambertMaterial({ color: '#bfe0f0', transparent: true, opacity: 0.35, side: THREE.DoubleSide })));
  railGlass.position.set(0, 3.8, 9.95);
  club.add(railGlass);
  for (const x of [-13.5, -4.5, 4.5, 13.5]) {
    const col = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 3.1, 0.3)), wallMat);
    col.position.set(x, 1.55, 9.6);
    club.add(col);
  }
  const roofTop = new THREE.Mesh(keep(new THREE.BoxGeometry(29, 0.4, 13)), keep(new THREE.MeshLambertMaterial({ color: '#2b2e35' })));
  roofTop.position.set(0, 6.6, 0);
  club.add(roofTop);
  const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 3)), keep(new THREE.MeshBasicMaterial({ map: keep(signTex()) })));
  sign.position.set(0, 8.4, 3);
  club.add(sign);
  const signBack = new THREE.Mesh(keep(new THREE.BoxGeometry(16.2, 3.2, 0.2)), keep(new THREE.MeshLambertMaterial({ color: '#202228' })));
  signBack.position.set(0, 8.4, 2.85);
  club.add(signBack);
  // Público en la terraza
  const terraceCrowd = bleacherGeo(24);
  const tc = new THREE.Mesh(keep(terraceCrowd.crowd), keep(crowdMaterial(time)));
  tc.position.set(0, 2.8, 9.2);
  tc.scale.set(1, 1, 0.6);
  club.add(tc);
  terraceCrowd.geo.dispose();
  paddock.add(club);

  // Torre de tiempos junto a la meta
  const tower = new THREE.Group();
  tower.position.copy(L(14, v0 + 3));
  tower.rotation.y = (os * Math.PI) / 2;
  const tpole = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 9, 0.4)), keep(new THREE.MeshLambertMaterial({ color: '#30333a' })));
  tpole.position.set(0, 4.5, -0.3);
  tower.add(tpole);
  const panel = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6, 6.4)), keep(new THREE.MeshBasicMaterial({ map: keep(towerTex()) })));
  panel.position.set(0, 5.6, 0);
  tower.add(panel);
  paddock.add(tower);

  // Grada pequeña frente a la recta
  const bl = bleacherGeo(22);
  const blMesh = new THREE.Mesh(keep(bl.geo), keep(vc()));
  const blCrowd = new THREE.Mesh(keep(bl.crowd), keep(crowdMaterial(time)));
  for (const m of [blMesh, blCrowd]) {
    m.position.copy(L(-34, v0 + 3.5));
    m.rotation.y = (os * Math.PI) / 2;
    paddock.add(m);
  }
  blMesh.castShadow = quality === 'alto';

  // Valla interior del paddock (separa el público de la pista)
  const ftex = keep(fenceTex().clone());
  ftex.needsUpdate = true;
  ftex.repeat.set((U1 - U0) / 3, 1);
  const fenceMat = keep(new THREE.MeshLambertMaterial({ map: ftex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
  const pf = new THREE.Mesh(keep(new THREE.PlaneGeometry(U1 - U0, 1.6)), fenceMat);
  pf.position.copy(L((U0 + U1) / 2, v0 + 0.2, 0.8));
  pf.rotation.y = Math.PI / 2;
  paddock.add(pf);

  // Valla perimetral (rectángulo que abarca pista y paddock)
  let minX = t.bounds.minX;
  let maxX = t.bounds.maxX;
  let minZ = t.bounds.minZ;
  let maxZ = t.bounds.maxZ;
  for (const [u, v] of [[U0, V1], [U1, V1], [U0, v0], [U1, v0]]) {
    const [x, z] = world(u, v);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const mg = 14;
  minX -= mg;
  maxX += mg;
  minZ -= mg;
  maxZ += mg;
  const perim = new THREE.Group();
  const ptex = keep(fenceTex().clone());
  ptex.needsUpdate = true;
  const pmat = keep(new THREE.MeshLambertMaterial({ map: ptex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
  const sides: [number, number, number, number][] = [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ];
  const adMats = new Map<number, THREE.Matrix4[]>();
  const fh = 2.6;
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tex = keep(ptex.clone());
    tex.needsUpdate = true;
    tex.repeat.set(len / 3, 1);
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, fh)), keep(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })));
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    m.position.set((x0 + x1) / 2, groundY + fh / 2, (z0 + z1) / 2);
    m.rotation.y = yaw;
    perim.add(m);
    // Lonas de publicidad colgadas de la valla, mirando hacia dentro
    const nx = -(z1 - z0) / len;
    const nz = (x1 - x0) / len;
    for (let d = 10; d < len - 8; d += 16) {
      const ax = x0 + ((x1 - x0) * d) / len + nx * 0.08;
      const az = z0 + ((z1 - z0) * d) / len + nz * 0.08;
      const ad = Math.floor(r() * ADS.length);
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(ax, groundY + 1.15, az), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(nx, nz)), new THREE.Vector3(1, 1, 1));
      (adMats.get(ad) ?? adMats.set(ad, []).get(ad)!).push(mm);
    }
  }
  void pmat;
  const adGeo = keep(new THREE.PlaneGeometry(6, 1.5));
  for (const [ad, mats] of adMats) {
    const mesh = new THREE.InstancedMesh(adGeo, keep(new THREE.MeshLambertMaterial({ map: adTex(ad), side: THREE.DoubleSide })), mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    perim.add(mesh);
    disposables.push(mesh);
  }
  group.add(perim);

  // Arboleda tras la valla: cierra la vista y hace que el recinto se vea pequeño
  const treeType = theme === 'coast' ? 'palm' : theme === 'ring' || theme === 'gp' ? 'tree' : 'pine';
  const tp = makeProto(treeType, theme)!;
  keep(tp.geo);
  keep(tp.mat);
  const treeMats: THREE.Matrix4[] = [];
  const gap = quality === 'bajo' ? 11 : 7;
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const nx = (z1 - z0) / len;
    const nz = -(x1 - x0) / len;
    for (let d = 0; d < len; d += gap * (0.7 + r() * 0.6)) {
      for (const row of quality === 'bajo' ? [0] : [0, 1]) {
        const off = 5 + row * 7 + r() * 4;
        const x = x0 + ((x1 - x0) * d) / len + nx * off;
        const z = z0 + ((z1 - z0) * d) / len + nz * off;
        const sc = 0.9 + r() * 0.7;
        treeMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, groundY, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(sc, sc * (0.9 + r() * 0.4), sc)));
      }
    }
  }
  const trees = new THREE.InstancedMesh(tp.geo, tp.mat, treeMats.length);
  treeMats.forEach((m, i) => trees.setMatrixAt(i, m));
  trees.castShadow = quality === 'alto';
  disposables.push(trees);
  group.add(trees);

  // Torres de focos a lo largo de la valla
  const fl = floodGeo();
  const spots: THREE.Matrix4[] = [];
  const heads: THREE.Vector3[] = [];
  const ccx = (minX + maxX) / 2;
  const ccz = (minZ + maxZ) / 2;
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 70));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * f;
      const z = z0 + (z1 - z0) * f;
      const px = x + (ccx - x) * (3 / Math.max(1, Math.hypot(ccx - x, ccz - z)));
      const pz = z + (ccz - z) * (3 / Math.max(1, Math.hypot(ccx - x, ccz - z)));
      if (clearance(px, pz) < 3) continue;
      const yaw = Math.atan2(ccx - px, ccz - pz);
      spots.push(new THREE.Matrix4().compose(new THREE.Vector3(px, groundY, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
      heads.push(new THREE.Vector3(px + Math.sin(yaw) * 0.6, groundY + 14.7, pz + Math.cos(yaw) * 0.6));
    }
  }
  const poles = new THREE.InstancedMesh(keep(fl.pole), keep(vc()), spots.length);
  const lamps = new THREE.InstancedMesh(keep(fl.lamps), keep(new THREE.MeshBasicMaterial({ color: night ? '#fff8e0' : '#c9ced6' })), spots.length);
  spots.forEach((m, i) => {
    poles.setMatrixAt(i, m);
    lamps.setMatrixAt(i, m);
  });
  disposables.push(poles, lamps);
  group.add(poles, lamps);
  if (night) {
    const glow = keep(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff2c8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    for (const h of heads) {
      const sp = new THREE.Sprite(glow);
      sp.position.copy(h);
      sp.scale.set(9, 9, 1);
      group.add(sp);
    }
  }

  // Comisarios con bandera en las curvas importantes
  const marshals: THREE.Matrix4[] = [];
  let lastS = -1e9;
  for (let i = 0; i < t.n; i++) {
    const k = t.curv[i];
    if (Math.abs(k) < 1 / 16) continue;
    const s = i * t.ds;
    if (s - lastS < 110) continue;
    // punto de curvatura máxima de esta curva
    let bi = i;
    for (let j = i; j < Math.min(t.n, i + 30); j++) if (Math.abs(t.curv[j]) > Math.abs(t.curv[bi])) bi = j;
    const outside = t.curv[bi] > 0 ? -1 : 1;
    const lim = t.hw[bi] + (outside < 0 ? t.runL[bi] : t.runR[bi]);
    t.pointAt(bi * t.ds, outside * (lim + 2.2), lp);
    if (clearance(lp.x, lp.z) < 1.2) continue;
    const yaw = Math.atan2(-outside * t.tz[bi], outside * t.tx[bi]) + Math.PI;
    marshals.push(new THREE.Matrix4().compose(new THREE.Vector3(lp.x, groundY, lp.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
    lastS = s;
    i = bi + 20;
  }
  if (marshals.length) {
    const mm = new THREE.InstancedMesh(keep(marshalGeo()), keep(vc()), marshals.length);
    marshals.forEach((m, i) => mm.setMatrixAt(i, m));
    mm.castShadow = quality === 'alto';
    disposables.push(mm);
    group.add(mm);
  }

  // Banderas del club en mástiles a la entrada del paddock
  const W = 2.0;
  const poleGeo = keep(new THREE.CylinderGeometry(0.05, 0.07, 7, 5));
  poleGeo.translate(0, 3.5, 0);
  const clothGeo = keep(new THREE.PlaneGeometry(W, 1.2, 10, 2));
  clothGeo.translate(W / 2, 0, 0);
  const flagCols = ['#D7261E', '#FFC300', '#ffffff', '#111111', '#D7261E'];
  const flagPoles = new THREE.InstancedMesh(poleGeo, keep(new THREE.MeshLambertMaterial({ color: '#d8d8d8' })), flagCols.length);
  const flags = new THREE.InstancedMesh(clothGeo, keep(flagMaterial(time, W)), flagCols.length);
  const dummy = new THREE.Object3D();
  flagCols.forEach((c, i) => {
    const [x, z] = world(24 + i * 3.2, v0 + 9);
    dummy.position.set(x, groundY, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flagPoles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, groundY + 6.3, z);
    dummy.rotation.set(0, 0.6, 0);
    dummy.updateMatrix();
    flags.setMatrixAt(i, dummy.matrix);
    flags.setColorAt(i, new THREE.Color(c));
  });
  flags.frustumCulled = false;
  disposables.push(flagPoles, flags);
  group.add(flagPoles, flags);
  void tentList;

  // Zona de la recta ocupada por el paddock
  const pitZone = { s0: U0 - 4, s1: U1 + 4, side: os };
  const inside = (x: number, z: number) => x > minX && x < maxX && z > minZ && z < maxZ;
  const inPaddock = (x: number, z: number) => {
    const dx = x - ox;
    const dz = z - oz;
    const u = dx * fx + dz * fz;
    const v = dx * wx + dz * wz;
    return u > U0 - 6 && u < U1 + 6 && v > v0 - 1 && v < V1 + 6;
  };
  return { group, disposables, pitZone, inside, inPaddock };
}
