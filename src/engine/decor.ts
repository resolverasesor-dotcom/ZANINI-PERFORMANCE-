import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DecorType } from '../track/TrackData';
import { bannerTex, windowsTex } from './textures';

// Prototipos low-poly de la decoración (se dibujan con InstancedMesh).

function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4, keepUV = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  g.deleteAttribute('normal');
  if (!keepUV) g.deleteAttribute('uv');
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // ligera variación de tono por cara para el look low-poly
    const v = 0.92 + ((i / 3) % 3) * 0.04;
    arr[i * 3] = c.r * v;
    arr[i * 3 + 1] = c.g * v;
    arr[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.dispose();
  return g;
}

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export interface DecorProto {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  /** Proyecta sombra. */
  shadow: boolean;
  /** Se apoya en la cota de la pista (no en el suelo). */
  onTrack: boolean;
}

const vc = () => new THREE.MeshLambertMaterial({ vertexColors: true });

export function makeProto(type: DecorType, theme: string, variant = 0): DecorProto | null {
  const night = theme === 'night';
  switch (type) {
    case 'tree': {
      const g = mergeGeometries([
        part(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), '#6b4a2f', M(0, 1.2, 0)),
        part(new THREE.IcosahedronGeometry(2.2, 0), '#3f8a3a', M(0, 3.6, 0)),
        part(new THREE.IcosahedronGeometry(1.6, 0), '#4fa046', M(0.4, 5.0, 0.2)),
      ])!;
      return { geo: g, mat: vc(), shadow: true, onTrack: false };
    }
    case 'pine': {
      const g = mergeGeometries([
        part(new THREE.CylinderGeometry(0.22, 0.3, 2, 5), '#5a3d26', M(0, 1, 0)),
        part(new THREE.ConeGeometry(2.4, 3.6, 7), '#2f6b3a', M(0, 3.2, 0)),
        part(new THREE.ConeGeometry(1.9, 3.0, 7), '#367a42', M(0, 4.8, 0)),
        part(new THREE.ConeGeometry(1.3, 2.4, 7), '#3f8a4a', M(0, 6.2, 0)),
      ])!;
      return { geo: g, mat: vc(), shadow: true, onTrack: false };
    }
    case 'palm': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        parts.push(part(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 1.3, 6), '#8a6a45', M(i * 0.12, 0.65 + i * 1.2, 0, 0, 0, -0.1)));
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        parts.push(part(new THREE.ConeGeometry(0.45, 3.2, 4), k % 2 ? '#2f8f3f' : '#3aa24a', M(0.72 + Math.cos(a) * 1.3, 7.2, Math.sin(a) * 1.3, 0, -a, Math.PI / 2 - 0.35, 1, 1, 0.25)));
      }
      return { geo: mergeGeometries(parts)!, mat: vc(), shadow: true, onTrack: false };
    }
    case 'rock': {
      const g = part(new THREE.DodecahedronGeometry(1.4, 0), theme === 'quarry' ? '#b49a78' : '#8d8a86', M(0, 0.7, 0, 0.3, 0.5, 0.1, 1.2, 0.8, 1));
      return { geo: g, mat: vc(), shadow: true, onTrack: false };
    }
    case 'building': {
      const h = [12, 20, 30][variant % 3];
      const geo = new THREE.BoxGeometry(14, h, 12);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * (h / 10));
      geo.translate(0, h / 2, 0);
      const mat = night
        ? new THREE.MeshLambertMaterial({ map: windowsTex(true), emissiveMap: windowsTex(true, true), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 })
        : new THREE.MeshLambertMaterial({ map: windowsTex(false) });
      const tex = mat.map!;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return { geo, mat, shadow: false, onTrack: false };
    }
    case 'lamp': {
      const g = mergeGeometries([
        part(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), '#3a3d44', M(0, 3, 0)),
        part(new THREE.BoxGeometry(0.1, 0.1, 1.6), '#3a3d44', M(0, 6, 0.75)),
      ])!;
      return { geo: g, mat: vc(), shadow: false, onTrack: true };
    }
    case 'grandstand': {
      const parts: THREE.BufferGeometry[] = [];
      const crowd = ['#D7261E', '#FFC300', '#ffffff', '#1E6FE0', '#111111', '#43A047'];
      for (let r = 0; r < 5; r++) {
        parts.push(part(new THREE.BoxGeometry(30, 0.8, 1.6), '#9aa0a8', M(0, 0.4 + r * 0.8, -r * 1.6)));
        for (let k = 0; k < 14; k++) {
          parts.push(part(new THREE.BoxGeometry(1.2, 0.7, 0.6), crowd[(k * 7 + r * 3) % crowd.length], M(-13.5 + k * 2.08 + (r % 2) * 0.6, 1.1 + r * 0.8, -r * 1.6 - 0.2)));
        }
      }
      parts.push(part(new THREE.BoxGeometry(31, 0.3, 9.5), '#D7261E', M(0, 7.6, -3.6, -0.06)));
      for (const x of [-15, 15]) parts.push(part(new THREE.BoxGeometry(0.4, 7.5, 0.4), '#555', M(x, 3.75, -7.6)));
      return { geo: mergeGeometries(parts)!, mat: vc(), shadow: true, onTrack: false };
    }
    case 'tyres': {
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 3; k++) {
        parts.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8), k === 1 ? '#f2f2f2' : '#1b1b1f', M(0, 0.14 + k * 0.29, 0)));
      }
      return { geo: mergeGeometries(parts)!, mat: vc(), shadow: false, onTrack: true };
    }
    case 'banner': {
      const geo = new THREE.PlaneGeometry(6, 1.1);
      geo.translate(0, 1.0, 0);
      const mat = new THREE.MeshLambertMaterial({ map: bannerTex(variant), side: THREE.DoubleSide });
      return { geo, mat, shadow: false, onTrack: true };
    }
    case 'cone': {
      const g = mergeGeometries([
        part(new THREE.ConeGeometry(0.22, 0.6, 6), '#ff6d00', M(0, 0.3, 0)),
        part(new THREE.BoxGeometry(0.5, 0.05, 0.5), '#222', M(0, 0.025, 0)),
      ])!;
      return { geo: g, mat: vc(), shadow: false, onTrack: true };
    }
    case 'crate': {
      const g = mergeGeometries([
        part(new THREE.BoxGeometry(1.4, 1.4, 1.4), '#a8743f', M(0, 0.7, 0)),
        part(new THREE.BoxGeometry(1.2, 1.2, 1.2), '#c4955a', M(0.3, 2.0, 0.1, 0, 0.4)),
      ])!;
      return { geo: g, mat: vc(), shadow: true, onTrack: false };
    }
    case 'promenade':
      return null;
  }
}
