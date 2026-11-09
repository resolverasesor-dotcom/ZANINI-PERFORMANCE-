import * as THREE from 'three';
import { rng } from '../core/math';
import type { Quality } from '../core/Settings';
import type { Track } from '../track/Track';
import { Gulls } from './ambient';
import { glowTex } from './textures';

// Vida del circuito: lo que se mueve y lo que da escala y velocidad.
// - Carteles de frenada 150/100/50 antes de cada curva fuerte (referencias reales y
//   parallax que multiplica la sensación de velocidad).
// - Torres de TV con su cámara siguiendo al kart, fotógrafos con flash en las curvas.
// - Polvo/polen (o luciérnagas de noche) flotando en el aire alrededor de la cámara.
// - Dirigible publicitario dando vueltas y bandadas de pájaros.

interface Tower {
  pivot: THREE.Group;
  x: number;
  z: number;
}

interface Photo {
  flash: THREE.Sprite;
  x: number;
  z: number;
  t: number;
  next: number;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class TrackLife {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private towers: Tower[] = [];
  private photos: Photo[] = [];
  private dust: THREE.Points | null = null;
  private dustVel: Float32Array | null = null;
  private blimp: THREE.Group | null = null;
  private birds: Gulls | null = null;
  private center = new THREE.Vector3();
  private radius = 100;
  private rand = rng(77);

  constructor(
    private track: Track,
    private groundY: number,
    private theme: string,
    quality: Quality,
    hasSeaBirds: boolean,
  ) {
    const b = track.bounds;
    this.center.set((b.minX + b.maxX) / 2, groundY, (b.minZ + b.maxZ) / 2);
    this.radius = Math.max(60, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * 0.42);
    this.buildBrakingBoards();
    this.buildTowers(quality === 'bajo' ? 3 : 6);
    this.buildPhotographers(quality === 'bajo' ? 2 : 5);
    if (quality !== 'bajo') this.buildDust(quality === 'alto' ? 260 : 150);
    this.buildBlimp();
    if (!hasSeaBirds && theme !== 'night') {
      this.birds = new Gulls(this.center.x, this.center.z, groundY, quality === 'bajo' ? 4 : 9, 11);
      this.group.add(this.birds.group);
    }
  }

  private keep<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  /** Curvas fuertes precedidas de recta: s de entrada, sentido (1 = derecha) y radio mínimo. */
  private corners(minStraight = 40): { s: number; dir: number; R: number }[] {
    const t = this.track;
    const out: { s: number; dir: number; R: number }[] = [];
    // Arrancar en un punto de recta para no partir una curva por la mitad
    let i0 = 0;
    for (let i = 0; i < t.n; i++) if (Math.abs(t.curv[i]) < Math.abs(t.curv[i0])) i0 = i;
    let straight = 0;
    let i = 0;
    while (i < t.n) {
      const j = (i0 + i) % t.n;
      const k = Math.abs(t.curv[j]);
      if (k < 1 / 60) {
        straight += t.ds;
        i++;
        continue;
      }
      // Entrada de curva: buscar el vértice (curvatura máxima) mientras dure
      let peak = k;
      let n = 0;
      while (n < t.n && Math.abs(t.curv[(j + n) % t.n]) >= 1 / 60) {
        peak = Math.max(peak, Math.abs(t.curv[(j + n) % t.n]));
        n++;
      }
      if (peak > 1 / 40 && straight >= minStraight) out.push({ s: j * t.ds, dir: Math.sign(t.curv[j]), R: 1 / peak });
      straight = 0;
      i += Math.max(1, n);
    }
    return out;
  }

  private buildBrakingBoards(): void {
    const t = this.track;
    const nums = [150, 100, 50];
    const tex = nums.map((n) =>
      this.keep(
        canvasTex(128, 96, (g) => {
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, 128, 96);
          g.fillStyle = '#111';
          g.fillRect(0, 0, 128, 10);
          g.fillRect(0, 86, 128, 10);
          g.font = 'bold 58px Arial';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(n), 64, 50);
        }),
      ),
    );
    const panelGeo = this.keep(new THREE.BoxGeometry(1.1, 0.8, 0.06));
    const postGeo = this.keep(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6));
    postGeo.translate(0, 0.65, 0);
    const postMat = this.keep(new THREE.MeshLambertMaterial({ color: '#b9bec7' }));
    const corners = this.corners();
    const per: THREE.Matrix4[][] = [[], [], []];
    const posts: THREE.Matrix4[] = [];
    const p = { x: 0, y: 0, z: 0 };
    for (const c of corners) {
      nums.forEach((d, j) => {
        const s = c.s - d;
        const i = t.index(s);
        if (Math.abs(t.curv[i]) > 1 / 60) return;
        // Por fuera de la curva, en la escapatoria (antes de la barrera)
        const side = -c.dir;
        const run = side > 0 ? t.runR[i] : t.runL[i];
        const lat = side * (t.hw[i] + Math.min(2.2, Math.max(1.0, run - 0.8)));
        t.pointAt(s, lat, p);
        const yaw = t.headingAt(s) + Math.PI;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        posts.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1)));
        per[j].push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + 1.55, p.z), q, new THREE.Vector3(1, 1, 1)));
      });
    }
    if (posts.length) {
      const pm = new THREE.InstancedMesh(postGeo, postMat, posts.length);
      posts.forEach((m, i) => pm.setMatrixAt(i, m));
      this.group.add(this.keep(pm));
    }
    per.forEach((list, j) => {
      if (!list.length) return;
      const mats = [
        this.keep(new THREE.MeshLambertMaterial({ color: '#dddddd' })),
        this.keep(new THREE.MeshLambertMaterial({ color: '#dddddd' })),
        this.keep(new THREE.MeshLambertMaterial({ color: '#dddddd' })),
        this.keep(new THREE.MeshLambertMaterial({ color: '#dddddd' })),
        this.keep(new THREE.MeshLambertMaterial({ map: tex[j] })),
        this.keep(new THREE.MeshLambertMaterial({ map: tex[j] })),
      ];
      const im = new THREE.InstancedMesh(panelGeo, mats, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      this.group.add(this.keep(im));
    });
  }

  /** Torres de TV en las curvas, con operador y cámara que sigue al kart. */
  private buildTowers(max: number): void {
    const t = this.track;
    const corners = this.corners();
    if (!corners.length) return;
    const step = Math.max(1, Math.floor(corners.length / max));
    const steel = this.keep(new THREE.MeshLambertMaterial({ color: '#8d939c' }));
    const dark = this.keep(new THREE.MeshLambertMaterial({ color: '#25272c' }));
    const shirt = this.keep(new THREE.MeshLambertMaterial({ color: '#1e6fe0' }));
    const skin = this.keep(new THREE.MeshLambertMaterial({ color: '#e0b48c' }));
    const leg = this.keep(new THREE.BoxGeometry(0.08, 3, 0.08));
    const deck = this.keep(new THREE.BoxGeometry(1.6, 0.1, 1.6));
    const rail = this.keep(new THREE.BoxGeometry(1.6, 0.05, 0.05));
    const body = this.keep(new THREE.BoxGeometry(0.42, 0.62, 0.28));
    const head = this.keep(new THREE.SphereGeometry(0.13, 10, 8));
    const camBox = this.keep(new THREE.BoxGeometry(0.26, 0.26, 0.5));
    const lens = this.keep(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 10));
    lens.rotateX(Math.PI / 2);
    const p = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < corners.length && this.towers.length < max; n += step) {
      const c = corners[n];
      const s = c.s + Math.min(25, c.R * 0.8);
      const i = t.index(s);
      const side = -c.dir;
      const run = side > 0 ? t.runR[i] : t.runL[i];
      t.pointAt(s, side * (t.hw[i] + run + 4.5), p);
      const g = new THREE.Group();
      g.position.set(p.x, this.groundY, p.z);
      for (const [dx, dz] of [
        [-0.7, -0.7],
        [0.7, -0.7],
        [-0.7, 0.7],
        [0.7, 0.7],
      ]) {
        const l = new THREE.Mesh(leg, steel);
        l.position.set(dx, 1.5, dz);
        g.add(l);
      }
      const d = new THREE.Mesh(deck, steel);
      d.position.y = 3.05;
      g.add(d);
      for (const dz of [-0.78, 0.78]) {
        const r = new THREE.Mesh(rail, steel);
        r.position.set(0, 3.6, dz);
        g.add(r);
      }
      const pivot = new THREE.Group();
      pivot.position.y = 3.1;
      const b = new THREE.Mesh(body, shirt);
      b.position.set(0, 0.42, -0.25);
      const h = new THREE.Mesh(head, skin);
      h.position.set(0, 0.86, -0.22);
      const cb = new THREE.Mesh(camBox, dark);
      cb.position.set(0.15, 0.78, 0.12);
      const ln = new THREE.Mesh(lens, dark);
      ln.position.set(0.15, 0.78, 0.48);
      pivot.add(b, h, cb, ln);
      g.add(pivot);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.group.add(g);
      this.towers.push({ pivot, x: p.x, z: p.z });
    }
  }

  /** Fotógrafos agachados en las curvas: disparan el flash al pasar los karts. */
  private buildPhotographers(max: number): void {
    const t = this.track;
    const corners = this.corners().filter((c) => c.R < 22);
    const vest = this.keep(new THREE.MeshLambertMaterial({ color: '#ff8a00' }));
    const dark = this.keep(new THREE.MeshLambertMaterial({ color: '#202226' }));
    const skin = this.keep(new THREE.MeshLambertMaterial({ color: '#c99a72' }));
    const body = this.keep(new THREE.BoxGeometry(0.4, 0.5, 0.3));
    const head = this.keep(new THREE.SphereGeometry(0.12, 10, 8));
    const cam = this.keep(new THREE.BoxGeometry(0.18, 0.14, 0.22));
    const legs = this.keep(new THREE.BoxGeometry(0.36, 0.3, 0.4));
    const flashMat = this.keep(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const p = { x: 0, y: 0, z: 0 };
    const step = Math.max(1, Math.floor(corners.length / max));
    for (let n = 0; n < corners.length && this.photos.length < max; n += step) {
      const c = corners[n];
      const s = c.s + c.R * 0.6;
      const i = t.index(s);
      const side = -c.dir;
      const run = side > 0 ? t.runR[i] : t.runL[i];
      t.pointAt(s, side * (t.hw[i] + run + 1.8), p);
      const g = new THREE.Group();
      g.position.set(p.x, this.groundY, p.z);
      // mira hacia la pista
      const q = { x: 0, y: 0, z: 0 };
      t.pointAt(s, 0, q);
      g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      const l = new THREE.Mesh(legs, dark);
      l.position.y = 0.15;
      const b = new THREE.Mesh(body, vest);
      b.position.y = 0.55;
      b.rotation.x = 0.3;
      const h = new THREE.Mesh(head, skin);
      h.position.set(0, 0.92, 0.08);
      const cm = new THREE.Mesh(cam, dark);
      cm.position.set(0, 0.9, 0.24);
      g.add(l, b, h, cm);
      const flash = new THREE.Sprite(flashMat.clone());
      this.keep(flash.material);
      flash.position.set(0, 0.92, 0.4);
      flash.scale.setScalar(2.2);
      g.add(flash);
      this.group.add(g);
      this.photos.push({ flash, x: p.x, z: p.z, t: 0, next: 0 });
    }
  }

  /** Motas en el aire que rodean a la cámara (polen, polvo; de noche, luciérnagas). */
  private buildDust(n: number): void {
    const pos = new Float32Array(n * 3);
    this.dustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (this.rand() - 0.5) * 50;
      pos[i * 3 + 1] = this.rand() * 5 + 0.2;
      pos[i * 3 + 2] = (this.rand() - 0.5) * 50;
      this.dustVel[i * 3] = 0.6 + this.rand() * 0.6;
      this.dustVel[i * 3 + 1] = (this.rand() - 0.5) * 0.2;
      this.dustVel[i * 3 + 2] = (this.rand() - 0.5) * 0.4;
    }
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const night = this.theme === 'night';
    const color = night ? '#ffe680' : this.theme === 'quarry' ? '#e8d2a8' : this.theme === 'coast' ? '#fff8e8' : '#fffbe6';
    const mat = this.keep(
      new THREE.PointsMaterial({ map: glowTex(), color, size: night ? 0.16 : 0.09, transparent: true, opacity: night ? 0.95 : 0.7, depthWrite: false, blending: night ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }),
    );
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** Dirigible publicitario dando vueltas alrededor del circuito. */
  private buildBlimp(): void {
    const g = new THREE.Group();
    const night = this.theme === 'night';
    const skinTex = this.keep(
      canvasTex(512, 128, (c) => {
        c.fillStyle = '#f4f4f4';
        c.fillRect(0, 0, 512, 128);
        c.fillStyle = '#D7261E';
        c.fillRect(0, 44, 512, 40);
        c.font = 'italic 900 34px Arial Black, Arial';
        c.fillStyle = '#ffffff';
        c.textAlign = 'center';
        c.fillText('ZANINI PERFORMANCE', 256, 77);
        c.fillStyle = '#FFC300';
        c.fillRect(0, 84, 512, 8);
      }),
    );
    const hull = new THREE.Mesh(
      this.keep(new THREE.SphereGeometry(1, 28, 16)),
      this.keep(night ? new THREE.MeshBasicMaterial({ map: skinTex }) : new THREE.MeshLambertMaterial({ map: skinTex })),
    );
    // Eje largo en X (morro hacia +X): el letrero rodea el costado
    hull.scale.set(13, 4.2, 4.2);
    g.add(hull);
    const finMat = this.keep(new THREE.MeshLambertMaterial({ color: '#D7261E' }));
    const finGeo = this.keep(new THREE.BoxGeometry(0.2, 3.2, 3));
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(finGeo, finMat);
      f.position.x = -11.5;
      f.rotation.x = (i * Math.PI) / 2;
      f.position.y = Math.cos((i * Math.PI) / 2) * 2.4;
      f.position.z = Math.sin((i * Math.PI) / 2) * 2.4;
      g.add(f);
    }
    const gond = new THREE.Mesh(this.keep(new THREE.BoxGeometry(3.4, 1.1, 1.3)), this.keep(new THREE.MeshLambertMaterial({ color: '#2b2d33' })));
    gond.position.y = -4.4;
    g.add(gond);
    this.blimp = g;
    this.group.add(g);
  }

  update(t: number, dt: number, focus: THREE.Vector3, camera: THREE.Camera | null): void {
    // Cámaras de TV: el operador sigue al kart
    for (const tw of this.towers) {
      const want = Math.atan2(focus.x - tw.x, focus.z - tw.z);
      let d = want - tw.pivot.rotation.y;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      tw.pivot.rotation.y += d * Math.min(1, dt * 3);
    }
    // Fotógrafos: ráfagas de flash cuando el kart pasa cerca
    for (const ph of this.photos) {
      const near = Math.hypot(focus.x - ph.x, focus.z - ph.z) < 28;
      ph.t -= dt;
      ph.next -= dt;
      if (near && ph.next <= 0) {
        ph.t = 0.09;
        ph.next = 0.25 + this.rand() * 0.5;
      }
      (ph.flash.material as THREE.SpriteMaterial).opacity = ph.t > 0 ? 1 : 0;
    }
    // Motas: viajan con el viento y se reciclan alrededor de la cámara
    if (this.dust && this.dustVel && camera) {
      const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      const v = this.dustVel;
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      const night = this.theme === 'night';
      for (let i = 0; i < a.length; i += 3) {
        a[i] += v[i] * dt;
        a[i + 1] += (v[i + 1] + (night ? Math.sin(t * 2 + i) * 0.3 : 0)) * dt;
        a[i + 2] += v[i + 2] * dt;
        // envolver en una caja de 50 × 6 × 50 m centrada en la cámara
        if (a[i] - cx > 25) a[i] -= 50;
        else if (a[i] - cx < -25) a[i] += 50;
        if (a[i + 2] - cz > 25) a[i + 2] -= 50;
        else if (a[i + 2] - cz < -25) a[i + 2] += 50;
        const gy = this.groundY;
        if (a[i + 1] < gy + 0.1 || a[i + 1] > cy + 4) a[i + 1] = gy + 0.3 + this.rand() * Math.max(1, cy - gy + 2);
      }
      pos.needsUpdate = true;
    }
    // Dirigible
    if (this.blimp) {
      const ang = t * 0.018;
      const r = this.radius * 1.15;
      this.blimp.position.set(this.center.x + Math.cos(ang) * r, this.groundY + 48 + Math.sin(t * 0.2) * 1.5, this.center.z + Math.sin(ang) * r);
      this.blimp.rotation.y = -ang - Math.PI / 2;
    }
    this.birds?.update(t);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
