import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobTex, numberTex } from './textures';

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

export function buildKartBody(color: string, helmet: string, suit: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const carbon = '#16171b';
  const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
  // Chasis
  parts.push(colored(box(0.95, 0.07, 1.7), carbon, M(0, 0.13, 0)));
  // Morro y spoiler delantero
  parts.push(colored(box(0.92, 0.2, 0.36), color, M(0, 0.24, 0.84, -0.25)));
  parts.push(colored(box(1.12, 0.08, 0.16), carbon, M(0, 0.15, 1.02)));
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
  // Piloto: torso, piernas, brazos
  parts.push(colored(box(0.42, 0.46, 0.28), suit, M(0, 0.66, -0.24, -0.25)));
  parts.push(colored(box(0.36, 0.16, 0.62), suit, M(0, 0.32, 0.2)));
  for (const s of [-1, 1]) parts.push(colored(box(0.1, 0.1, 0.42), suit, M(s * 0.2, 0.68, 0.0, 0.35, 0, 0)));
  // Casco con visera
  parts.push(colored(new THREE.IcosahedronGeometry(0.2, 1), helmet, M(0, 1.0, -0.14)));
  parts.push(colored(box(0.28, 0.08, 0.1), '#0d1a26', M(0, 1.02, 0.03)));
  parts.push(colored(box(0.06, 0.04, 0.34), '#ffffff', M(0, 1.2, -0.14)));
  // Volante
  parts.push(colored(new THREE.TorusGeometry(0.14, 0.025, 4, 10), carbon, M(0, 0.66, 0.24, -1.0)));
  // Ejes
  parts.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), '#555', M(0, 0.17, -0.62, 0, 0, Math.PI / 2)));
  return mergeGeometries(parts)!;
}

let wheelGeoF: THREE.BufferGeometry | null = null;
let wheelGeoR: THREE.BufferGeometry | null = null;
function wheelGeo(rear: boolean): THREE.BufferGeometry {
  if (rear && wheelGeoR) return wheelGeoR;
  if (!rear && wheelGeoF) return wheelGeoF;
  const r = rear ? 0.17 : 0.15;
  const w = rear ? 0.24 : 0.18;
  const tyre = colored(new THREE.CylinderGeometry(r, r, w, 10), '#18181b', M(0, 0, 0, 0, 0, Math.PI / 2));
  const hub = colored(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 6), '#c9ccd2', M(0, 0, 0, 0, 0, Math.PI / 2));
  const g = mergeGeometries([tyre, hub])!;
  if (rear) wheelGeoR = g;
  else wheelGeoF = g;
  return g;
}

const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

export interface KartMesh {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  frontPivots: THREE.Group[];
  flame: THREE.Mesh;
  blob: THREE.Mesh;
  materials: THREE.Material[];
}

export function buildKart(color: string, number: number, opts: { ghost?: boolean; helmet?: string; suit?: string } = {}): KartMesh {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats: THREE.Material[] = [];
  let mat: THREE.Material = bodyMat;
  if (opts.ghost) {
    mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false });
    mats.push(mat);
  }
  const helmet = opts.helmet ?? (color.toLowerCase() === '#ffffff' ? '#D7261E' : '#ffffff');
  const suit = opts.suit ?? darker(color, 0.55).getStyle();
  const bodyMesh = new THREE.Mesh(buildKartBody(color, helmet, suit), mat);
  bodyMesh.castShadow = !opts.ghost;
  body.add(bodyMesh);
  // Dorsal en el morro y laterales
  if (!opts.ghost) {
    const nm = new THREE.MeshLambertMaterial({ map: numberTex(number, color) });
    mats.push(nm);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), nm);
    plate.position.set(0, 0.36, 0.86);
    plate.rotation.x = -1.32;
    body.add(plate);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), nm);
      p.position.set(s * 0.695, 0.23, 0.02);
      p.rotation.y = (s * Math.PI) / 2;
      body.add(p);
    }
  }
  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const wpos: [number, number, number, boolean][] = [
    [-0.6, 0.15, 0.6, false],
    [0.6, 0.15, 0.6, false],
    [-0.64, 0.17, -0.62, true],
    [0.64, 0.17, -0.62, true],
  ];
  for (const [x, y, z, rear] of wpos) {
    const w = new THREE.Mesh(wheelGeo(rear), mat);
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
  return { root, body, wheels, frontPivots, flame, blob, materials: mats };
}
