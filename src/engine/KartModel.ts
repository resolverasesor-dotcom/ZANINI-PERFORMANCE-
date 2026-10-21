import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobTex, numberTex } from './textures';
import { stickerTex } from './ads';
import { accentFor, checkerDecalTex, flameDecalTex, helmetTex, namePlateTex, pennantTex, type HelmetStyle, type LiveryStyle } from './livery';

// Kart low-poly construido con primitivas fusionadas en una sola malla con colores
// por vértice (una llamada de dibujo para la carrocería + ruedas).

function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.dispose();
  return g;
}

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function darker(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

export function buildKartBody(color: string, suit: string, livery: LiveryStyle, accent: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const carbon = '#16171b';
  const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
  // Chasis
  parts.push(colored(box(0.95, 0.07, 1.7), carbon, M(0, 0.13, 0)));
  // Morro y spoiler delantero
  parts.push(colored(box(0.92, 0.2, 0.36), color, M(0, 0.24, 0.84, -0.25)));
  parts.push(colored(box(1.12, 0.08, 0.16), livery === 'ale' ? accent : carbon, M(0, 0.15, 1.02)));
  // Pontones laterales
  for (const s of [-1, 1]) {
    parts.push(colored(box(0.26, 0.2, 0.82), color, M(s * 0.56, 0.22, 0.02)));
    parts.push(colored(box(0.2, 0.06, 0.82), darker(color, 0.7), M(s * 0.56, 0.34, 0.02)));
  }
  // Parachoques trasero
  parts.push(colored(box(1.3, 0.14, 0.16), carbon, M(0, 0.24, -0.98)));
  // Motor y escape
  parts.push(colored(box(0.3, 0.3, 0.34), '#7a7f88', M(0.34, 0.36, -0.58)));
  parts.push(colored(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), '#b9bec7', M(0.34, 0.34, -0.85, Math.PI / 2)));
  // Asiento
  parts.push(colored(box(0.44, 0.4, 0.3), carbon, M(0, 0.38, -0.36, -0.2)));
  // Piloto: torso, piernas, brazos y guantes
  parts.push(colored(box(0.42, 0.46, 0.28), suit, M(0, 0.66, -0.24, -0.25)));
  parts.push(colored(box(0.36, 0.16, 0.62), suit, M(0, 0.32, 0.2)));
  for (const s of [-1, 1]) {
    parts.push(colored(box(0.1, 0.1, 0.42), suit, M(s * 0.2, 0.68, 0.0, 0.35, 0, 0)));
    parts.push(colored(box(0.11, 0.11, 0.1), livery === 'ale' ? accent : '#222', M(s * 0.16, 0.62, 0.2)));
  }
  // Visera y cuello (el casco va aparte, con textura)
  parts.push(colored(box(0.26, 0.08, 0.1), '#0d1a26', M(0, 1.01, 0.04)));
  parts.push(colored(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 8), carbon, M(0, 0.86, -0.16)));
  // Volante
  parts.push(colored(new THREE.TorusGeometry(0.14, 0.025, 4, 10), carbon, M(0, 0.66, 0.24, -1.0)));
  // Ejes
  parts.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), '#555', M(0, 0.17, -0.62, 0, 0, Math.PI / 2)));

  if (livery === 'ale') {
    // Franjas de carreras sobre morro y pontones
    for (const x of [-0.13, 0.13]) parts.push(colored(box(0.09, 0.02, 0.38), accent, M(x, 0.35, 0.84, -0.25)));
    for (const s of [-1, 1]) parts.push(colored(box(0.07, 0.02, 0.82), accent, M(s * 0.56, 0.375, 0.02)));
    // Alerón trasero con soportes
    for (const x of [-0.42, 0.42]) parts.push(colored(box(0.05, 0.36, 0.05), carbon, M(x, 0.48, -0.98)));
    parts.push(colored(box(1.16, 0.05, 0.26), accent, M(0, 0.68, -1.0, 0.12)));
    for (const x of [-0.6, 0.6]) parts.push(colored(box(0.03, 0.16, 0.3), color, M(x, 0.66, -1.0)));
    // Antena del banderín
    parts.push(colored(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), '#d0d0d0', M(-0.55, 0.85, -0.95)));
  }
  return mergeGeometries(parts)!;
}

const wheelGeos = new Map<string, THREE.BufferGeometry>();
function wheelGeo(rear: boolean, hubColor: string): THREE.BufferGeometry {
  const key = `${rear}${hubColor}`;
  const hit = wheelGeos.get(key);
  if (hit) return hit;
  const r = rear ? 0.17 : 0.15;
  const w = rear ? 0.24 : 0.18;
  const tyre = colored(new THREE.CylinderGeometry(r, r, w, 12), '#18181b', M(0, 0, 0, 0, 0, Math.PI / 2));
  const hub = colored(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 6), hubColor, M(0, 0, 0, 0, 0, Math.PI / 2));
  const g = mergeGeometries([tyre, hub])!;
  g.userData.shared = true;
  wheelGeos.set(key, g);
  return g;
}

const lambertBody = new THREE.MeshLambertMaterial({ vertexColors: true });
const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glossy = new Map<string, THREE.MeshStandardMaterial>();
function bodyMaterial(reflective: boolean, livery: LiveryStyle): THREE.Material {
  if (!reflective) return lambertBody;
  const key = livery === 'oro' ? 'oro' : 'std';
  let m = glossy.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: livery === 'oro' ? 0.9 : 0.25,
      roughness: livery === 'oro' ? 0.16 : 0.34,
    });
    glossy.set(key, m);
  }
  return m;
}

export interface KartMesh {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  frontPivots: THREE.Group[];
  flame: THREE.Mesh;
  blob: THREE.Mesh;
  pennant: THREE.Mesh | null;
  materials: THREE.Material[];
}

/** Aspecto de un kart (color, dorsal y decoración). */
export interface KartLook {
  color: string;
  number: number;
  livery?: LiveryStyle;
  helmet?: HelmetStyle;
  name?: string;
  sponsor?: number;
}

export interface KartOptions {
  ghost?: boolean;
  /** Material con reflejos (calidad media/alta). */
  reflective?: boolean;
  livery?: LiveryStyle;
  helmet?: HelmetStyle;
  /** Nombre en los pontones y la nuca (solo el jugador). */
  name?: string;
  /** Patrocinador de risa para las pegatinas laterales. */
  sponsor?: number;
  accent?: string;
}

export function buildKart(colorIn: string, number: number, opts: KartOptions = {}): KartMesh {
  const livery = opts.livery ?? 'basica';
  const color = livery === 'oro' ? '#d4a017' : colorIn;
  const accent = opts.accent ?? accentFor(color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats: THREE.Material[] = [];
  let mat: THREE.Material = bodyMaterial(!!opts.reflective && !opts.ghost, livery);
  let wmat: THREE.Material = wheelMat;
  if (opts.ghost) {
    mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false });
    wmat = mat;
    mats.push(mat);
  }
  const suit = livery === 'ale' ? '#1b1b22' : darker(color, 0.55).getStyle();
  const bodyMesh = new THREE.Mesh(buildKartBody(color, suit, livery, accent), mat);
  bodyMesh.castShadow = !opts.ghost;
  body.add(bodyMesh);

  // Casco con textura
  const helmetStyle: HelmetStyle = opts.helmet ?? 'clasico';
  const helmetColor = color.toLowerCase() === '#ffffff' ? '#D7261E' : livery === 'ale' ? color : '#ffffff';
  let helmetMat: THREE.Material;
  if (opts.ghost) helmetMat = mat;
  else {
    const map = helmetTex(helmetStyle, helmetColor, accent, opts.name ?? '');
    helmetMat = opts.reflective ? new THREE.MeshStandardMaterial({ map, metalness: 0.2, roughness: 0.22 }) : new THREE.MeshLambertMaterial({ map });
    mats.push(helmetMat);
  }
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), helmetMat);
  helmet.position.set(0, 1.0, -0.14);
  helmet.castShadow = !opts.ghost;
  body.add(helmet);
  if (helmetStyle === 'corona' && !opts.ghost) {
    const gold = new THREE.MeshStandardMaterial({ color: '#f2c230', metalness: 0.9, roughness: 0.2 });
    mats.push(gold);
    const crown = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 10, 1, true), gold);
    crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), gold);
      spike.position.set(Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1);
      crown.add(spike);
    }
    crown.position.set(0, 1.21, -0.14);
    body.add(crown);
  }

  if (!opts.ghost) {
    // Dorsal en el morro
    const nm = new THREE.MeshLambertMaterial({ map: numberTex(number, color) });
    mats.push(nm);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), nm);
    plate.position.set(0, 0.362, 0.86);
    plate.rotation.x = -1.32;
    body.add(plate);
    // Pontones: nombre (jugador) o patrocinador de risa (rivales)
    const sideMap = opts.name ? namePlateTex(opts.name, number, color, accent) : stickerTex(opts.sponsor ?? number);
    const sm = new THREE.MeshLambertMaterial({ map: sideMap, transparent: true });
    mats.push(sm);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), sm);
      p.position.set(s * 0.692, 0.23, 0.02);
      p.rotation.y = (s * Math.PI) / 2;
      body.add(p);
    }
    // Decoración extra según el estilo
    if (livery === 'llamas' || livery === 'cuadros') {
      const dm = new THREE.MeshLambertMaterial({ map: livery === 'llamas' ? flameDecalTex() : checkerDecalTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      mats.push(dm);
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.8, livery === 'llamas' ? 0.2 : 0.06), dm);
        d.rotation.x = -Math.PI / 2;
        d.position.set(s * 0.56, 0.372, 0.02);
        d.rotation.z = Math.PI / 2;
        body.add(d);
      }
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.9, livery === 'llamas' ? 0.3 : 0.08), dm);
      n.position.set(0, 0.32, 0.67);
      n.rotation.x = -1.32;
      body.add(n);
    }
  }
  let pennant: THREE.Mesh | null = null;
  if (livery === 'ale' && !opts.ghost) {
    const pm = new THREE.MeshLambertMaterial({ map: pennantTex(number, accent), transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 });
    mats.push(pm);
    const g = new THREE.PlaneGeometry(0.34, 0.17, 6, 1);
    g.translate(0.17, 0, 0);
    pennant = new THREE.Mesh(g, pm);
    pennant.position.set(-0.55, 1.32, -0.95);
    pennant.rotation.y = Math.PI / 2;
    body.add(pennant);
  }

  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const hubColor = livery === 'ale' || livery === 'oro' ? '#e8b923' : '#c9ccd2';
  const wpos: [number, number, number, boolean][] = [
    [-0.6, 0.15, 0.6, false],
    [0.6, 0.15, 0.6, false],
    [-0.64, 0.17, -0.62, true],
    [0.64, 0.17, -0.62, true],
  ];
  for (const [x, y, z, rear] of wpos) {
    const w = new THREE.Mesh(wheelGeo(rear, hubColor), wmat);
    w.castShadow = !opts.ghost;
    if (rear) {
      w.position.set(x, y, z);
      body.add(w);
    } else {
      const piv = new THREE.Group();
      piv.position.set(x, y, z);
      piv.add(w);
      body.add(piv);
      frontPivots.push(piv);
    }
    wheels.push(w);
  }
  // Llama del turbo
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  mats.push(flameMat);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 6), flameMat);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0.34, 0.34, -1.2);
  flame.visible = false;
  body.add(flame);
  // Sombra suave
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: opts.ghost ? 0.3 : 1, depthWrite: false });
  mats.push(blobMat);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.3), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04;
  blob.renderOrder = 1;
  root.add(blob);
  return { root, body, wheels, frontPivots, flame, blob, pennant, materials: mats };
}

/** Ondea el banderín de la antena (si lo hay). */
export function wavePennant(k: KartMesh, t: number, speed: number): void {
  const p = k.pennant;
  if (!p) return;
  const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
  const amp = 0.02 + Math.min(1, speed / 25) * 0.05;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(t * (10 + speed * 0.4) - x * 18) * amp * (x / 0.34));
  }
  pos.needsUpdate = true;
}
