import * as THREE from 'three';
import { rng } from '../core/math';
import type { Landmark } from '../track/TrackData';
import { glowTex, windowsTex } from './textures';

// Monumentos de la Costa Blanca construidos con primitivas low-poly.

export interface LandmarkObj {
  object: THREE.Object3D;
  update?: (t: number) => void;
}

const lam = (color: string, flat = true) => new THREE.MeshLambertMaterial({ color, flatShading: flat });
const std = (color: string, rough = 0.4, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });

function windowsMat(h: number, w: number, tint = '#ffffff', glossy = false): THREE.Material {
  const map = windowsTex(false).clone();
  map.needsUpdate = true;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(w / 8, h / 10);
  return glossy ? new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.25, metalness: 0.35 }) : new THREE.MeshLambertMaterial({ map, color: tint });
}

export function buildLandmark(lm: Landmark, groundY: number, seaY: number): LandmarkObj {
  const g = new THREE.Group();
  g.position.set(lm.x, groundY, lm.z);
  g.rotation.y = lm.rot ?? 0;
  const sc = lm.scale ?? 1;
  g.scale.setScalar(sc);
  const r = rng(Math.floor(lm.x * 7 + lm.z * 13));
  let update: ((t: number) => void) | undefined;

  switch (lm.type) {
    case 'penon': {
      // El Peñón de Ifach: gran mole de roca saliendo del mar
      g.position.y = seaY;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), lam('#b5a58c'));
      rock.scale.set(150, 230, 120);
      rock.position.y = 40;
      g.add(rock);
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), lam('#9a8a72'));
      cap.scale.set(70, 70, 60);
      cap.position.set(-30, 230, 10);
      g.add(cap);
      const green = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), lam('#6f8a4a'));
      green.scale.set(110, 40, 100);
      green.position.set(20, 30, 30);
      g.add(green);
      break;
    }
    case 'intempo': {
      // Dos torres que se inclinan y se unen arriba en un arco dorado
      const h = 190;
      for (const s of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(26, h, 26), windowsMat(h, 26, '#ffffff', true));
        tower.position.set(s * 26, h / 2, 0);
        tower.rotation.z = -s * 0.06;
        g.add(tower);
      }
      const crown = new THREE.Mesh(new THREE.BoxGeometry(70, 22, 30), std('#d9b04a', 0.25, 0.8));
      crown.position.set(0, h + 4, 0);
      g.add(crown);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(22, 4, 6, 16, Math.PI), std('#d9b04a', 0.25, 0.8));
      arch.position.set(0, h - 30, 0);
      g.add(arch);
      break;
    }
    case 'skyline': {
      // Rascacielos de Benidorm
      for (let i = 0; i < 16; i++) {
        const h = 50 + r() * 120;
        const w = 18 + r() * 14;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + r() * 0.5)), windowsMat(h, w, ['#ffffff', '#e8f3ff', '#fff2e0'][i % 3], i % 4 === 0));
        b.position.set((r() - 0.5) * 360, h / 2, (r() - 0.2) * 120);
        g.add(b);
      }
      break;
    }
    case 'church': {
      // Iglesia de Altea: cúpula azul sobre la colina
      const hill = new THREE.Mesh(new THREE.ConeGeometry(120, 45, 10, 2), lam('#8a8a5c'));
      hill.position.y = 20;
      g.add(hill);
      const base = new THREE.Group();
      base.position.y = 42;
      const nave = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 32), lam('#f6f3ea'));
      nave.position.y = 7;
      base.add(nave);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 8, 16), lam('#f6f3ea'));
      drum.position.set(0, 18, 4);
      base.add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(8.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#1f5fb0', 0.2, 0.4));
      dome.position.set(0, 22, 4);
      base.add(dome);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 8), lam('#f6f3ea'));
      lantern.position.set(0, 32, 4);
      base.add(lantern);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 30, 7), lam('#f6f3ea'));
      tower.position.set(8, 15, -14);
      base.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.5, 6, 4), std('#1f5fb0', 0.2, 0.4));
      roof.position.set(8, 33, -14);
      roof.rotation.y = Math.PI / 4;
      base.add(roof);
      g.add(base);
      break;
    }
    case 'whitehouses': {
      const white = lam('#f7f5ef');
      const roofs = lam('#c7633d');
      const blue = lam('#2e6db4');
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2;
        const d = 25 + r() * 85;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const y = Math.max(0, 42 - d * 0.42);
        const w = 6 + r() * 6;
        const h = 4 + r() * 5;
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), white);
        house.position.set(x, y + h / 2, z);
        house.rotation.y = r() * Math.PI;
        g.add(house);
        if (i % 3 === 0) {
          const rf = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.6, w * 0.8 + 0.4), i % 2 ? roofs : blue);
          rf.position.set(x, y + h + 0.3, z);
          rf.rotation.y = house.rotation.y;
          g.add(rf);
        }
      }
      break;
    }
    case 'castle': {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(110, 55, 9, 2), lam('#8d8463'));
      hill.position.y = 25;
      g.add(hill);
      const stone = lam('#c9b48e');
      const top = 50;
      const merlon = new THREE.BoxGeometry(2, 2.2, 2);
      const wall = (x: number, z: number, w: number, d: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 10, d), stone);
        m.position.set(x, top + 5, z);
        g.add(m);
        const along = Math.max(w, d);
        for (let k = -along / 2 + 1.5; k < along / 2; k += 4) {
          const c = new THREE.Mesh(merlon, stone);
          c.position.set(x + (w > d ? k : 0), top + 11, z + (w > d ? 0 : k));
          g.add(c);
        }
      };
      wall(0, -24, 60, 3);
      wall(0, 24, 60, 3);
      wall(-30, 0, 3, 48);
      wall(30, 0, 3, 48);
      for (const [x, z] of [[-30, -24], [30, -24], [-30, 24], [30, 24]]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 20, 8), stone);
        t.position.set(x, top + 10, z);
        g.add(t);
      }
      const keep = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 16), stone);
      keep.position.set(0, top + 11, 0);
      g.add(keep);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshLambertMaterial({ color: '#FFC300', side: THREE.DoubleSide }));
      flag.position.set(3, top + 30, 0);
      g.add(flag);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 4), lam('#333'));
      pole.position.set(0, top + 27, 0);
      g.add(pole);
      update = (t) => {
        flag.rotation.y = Math.sin(t * 2) * 0.3;
      };
      break;
    }
    case 'lighthouse': {
      g.position.y = Math.min(groundY, seaY) + 0.1;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 0), lam('#8f8778'));
      rock.scale.y = 0.5;
      g.add(rock);
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.25, 3.6 - i * 0.25, 5, 12), lam(i % 2 ? '#D7261E' : '#f5f5f5', false));
        seg.position.y = 6 + i * 5;
        g.add(seg);
      }
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 10), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
      lamp.position.y = 37;
      g.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 10), lam('#222'));
      cap.position.y = 40;
      g.add(cap);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(6, 60, 12, 1, true),
        new THREE.MeshBasicMaterial({ map: glowTex(), color: '#fff2b0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.x = 30;
      const pivot = new THREE.Group();
      pivot.position.y = 37;
      pivot.add(beam);
      g.add(pivot);
      update = (t) => {
        pivot.rotation.y = t * 0.8;
      };
      break;
    }
    case 'boats': {
      g.position.y = seaY;
      const boats: THREE.Group[] = [];
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 10), lam(i % 3 === 0 ? '#1E6FE0' : '#f5f5f5'));
        hull.position.y = 0.6;
        b.add(hull);
        const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.5, 4), hull.material);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.scale.set(1, 1, 0.5);
        bow.position.set(0, 0.6, 6.6);
        b.add(bow);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 3.4), lam('#e8e8e8'));
        cabin.position.set(0, 2, -0.5);
        b.add(cabin);
        if (i % 2 === 0) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 4), lam('#ddd'));
          mast.position.set(0, 7, 1);
          b.add(mast);
          const sailGeo = new THREE.BufferGeometry();
          sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.5, 1.4, 0, 12.5, 1.2, 0, 1.5, 5.8], 3));
          sailGeo.computeVertexNormals();
          const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: i % 4 === 0 ? '#FFC300' : '#ffffff', side: THREE.DoubleSide }));
          b.add(sail);
        }
        b.position.set((i % 5) * 9 - 18 + (r() - 0.5) * 3, 0, Math.floor(i / 5) * 18 + (r() - 0.5) * 4);
        b.rotation.y = (r() - 0.5) * 0.4;
        b.userData.phase = r() * 6;
        boats.push(b);
        g.add(b);
      }
      // Pantalán
      const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 0.8, 4), lam('#8a6a45'));
      pier.position.set(0, 0.6, 9);
      g.add(pier);
      update = (t) => {
        for (const b of boats) {
          const ph = b.userData.phase as number;
          b.position.y = Math.sin(t * 1.3 + ph) * 0.25;
          b.rotation.z = Math.sin(t * 1.1 + ph) * 0.04;
        }
      };
      break;
    }
    case 'saltlake': {
      const lake = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40),
        new THREE.MeshStandardMaterial({ color: '#f29bbf', roughness: 0.15, metalness: 0.05 }),
      );
      lake.rotation.x = -Math.PI / 2;
      lake.scale.set(lm.rx ?? 60, lm.rz ?? 30, 1);
      lake.position.y = 0.05;
      g.add(lake);
      const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.08, 40), lam('#f6f0e6'));
      shore.rotation.x = -Math.PI / 2;
      shore.scale.set(lm.rx ?? 60, lm.rz ?? 30, 1);
      shore.position.y = 0.06;
      g.add(shore);
      break;
    }
    case 'saltpiles': {
      const salt = lam('#fbfbf7');
      for (let i = 0; i < 9; i++) {
        const h = 12 + r() * 16;
        const c = new THREE.Mesh(new THREE.ConeGeometry(h * 1.4, h, 7), salt);
        c.position.set((r() - 0.5) * 220, h / 2, (r() - 0.5) * 60);
        g.add(c);
      }
      break;
    }
  }
  return { object: g, update };
}
