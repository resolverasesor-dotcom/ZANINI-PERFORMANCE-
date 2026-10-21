import * as THREE from 'three';
import { mod, rng } from '../core/math';
import type { Quality } from '../core/Settings';
import { KERB_WIDTH, type Track } from '../track/Track';
import type { DecorType, ThemeId } from '../track/TrackData';
import { makeProto } from './decor';
import { adTex, ADS } from './ads';
import {
  asphaltTex,
  bannerTex,
  checkerTex,
  embankTex,
  garageTex,
  glowTex,
  grassTex,
  gravelTex,
  groundTex,
  kerbTex,
  promenadeTex,
  sandTex,
  wallTex,
  waterTex,
} from './textures';

interface ThemeLook {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  sunDir: [number, number, number];
}

export const THEMES: Record<ThemeId, ThemeLook> = {
  ring: { skyTop: '#2f7fd8', skyHorizon: '#cfe9ff', fog: '#d4eafb', fogNear: 160, fogFar: 750, hemiSky: '#ffffff', hemiGround: '#5d7a4a', hemi: 1.6, sun: '#fff3dc', sunI: 2.6, sunDir: [0.5, 1, 0.35] },
  coast: { skyTop: '#1f86e6', skyHorizon: '#dff3ff', fog: '#dcf0fb', fogNear: 180, fogFar: 850, hemiSky: '#ffffff', hemiGround: '#a89a70', hemi: 1.6, sun: '#fff0d0', sunI: 2.8, sunDir: [-0.4, 1, 0.5] },
  mountain: { skyTop: '#4f86c4', skyHorizon: '#e1ebf3', fog: '#c8d7e3', fogNear: 120, fogFar: 650, hemiSky: '#f0f6ff', hemiGround: '#4a5e40', hemi: 1.5, sun: '#fff7e8', sunI: 2.4, sunDir: [0.3, 1, -0.5] },
  night: { skyTop: '#03050c', skyHorizon: '#1c2440', fog: '#0c1124', fogNear: 60, fogFar: 420, hemiSky: '#7c8fd0', hemiGround: '#1a1a28', hemi: 0.9, sun: '#9fb0ff', sunI: 0.5, sunDir: [0.3, 1, 0.2] },
  quarry: { skyTop: '#6aa6dc', skyHorizon: '#f6e2bf', fog: '#ecd8b4', fogNear: 150, fogFar: 750, hemiSky: '#fff8ea', hemiGround: '#9c7c52', hemi: 1.6, sun: '#ffe4b8', sunI: 2.7, sunDir: [-0.5, 1, -0.3] },
  gp: { skyTop: '#3e74c8', skyHorizon: '#ffd9ab', fog: '#f4dcc0', fogNear: 170, fogFar: 850, hemiSky: '#fff1e0', hemiGround: '#5f6f42', hemi: 1.5, sun: '#ffd49c', sunI: 2.8, sunDir: [0.8, 0.7, 0.2] },
};

const QUALITY_DECOR: Record<Quality, number> = { bajo: 0.45, medio: 0.8, alto: 1 };

/** Construye toda la escena estática del circuito a partir de los datos. */
export class TrackScene {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly look: ThemeLook;
  readonly groundY: number;
  private lightPods: THREE.Mesh[] = [];
  private lightMatOn: THREE.MeshBasicMaterial;
  private lightMatOff: THREE.MeshBasicMaterial;
  private lightMatGreen: THREE.MeshBasicMaterial;
  private water: THREE.Texture | null = null;
  private disposables: { dispose(): void }[] = [];
  private grid: Map<string, number[]> = new Map();
  private readonly cell = 24;

  constructor(
    readonly track: Track,
    readonly quality: Quality,
    scene: THREE.Scene,
  ) {
    const def = track.def;
    this.look = THEMES[def.theme];
    this.groundY = track.bounds.minY - 0.08;
    scene.add(this.group);
    this.buildGrid();

    // Cielo y niebla
    scene.background = new THREE.Color(this.look.skyHorizon);
    scene.fog = new THREE.Fog(this.look.fog, this.look.fogNear * (quality === 'bajo' ? 0.7 : 1), this.look.fogFar * (quality === 'bajo' ? 0.6 : 1));
    this.group.add(this.buildSky());

    // Luces
    this.hemi = new THREE.HemisphereLight(this.look.hemiSky, this.look.hemiGround, this.look.hemi);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.look.sun, this.look.sunI);
    const sd = new THREE.Vector3(...this.look.sunDir).normalize();
    this.sun.position.copy(sd.multiplyScalar(80));
    this.sun.userData.dir = sd.clone().normalize();
    if (quality !== 'bajo') {
      this.sun.castShadow = true;
      const size = quality === 'alto' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -45;
      cam.right = cam.top = 45;
      cam.near = 1;
      cam.far = 220;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.lightMatOff = new THREE.MeshBasicMaterial({ color: '#2a0505' });
    this.lightMatOn = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
    this.lightMatGreen = new THREE.MeshBasicMaterial({ color: '#2aff4a' });
    this.disposables.push(this.lightMatOff, this.lightMatOn, this.lightMatGreen);

    this.buildGround();
    this.buildRoad();
    this.buildStart();
    this.buildPits();
    this.buildDecor();
    this.buildBackdrop();
  }

  // ---------- utilidades ----------

  private buildGrid(): void {
    const t = this.track;
    for (let i = 0; i < t.n; i += 2) {
      const k = `${Math.floor(t.px[i] / this.cell)},${Math.floor(t.pz[i] / this.cell)}`;
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(i);
    }
  }

  /** Distancia horizontal al borde exterior (muro) más cercano de la pista. */
  private clearance(x: number, z: number): number {
    const t = this.track;
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best = Infinity;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const arr = this.grid.get(`${cx + a},${cz + b}`);
        if (!arr) continue;
        for (const i of arr) {
          const d = Math.hypot(x - t.px[i], z - t.pz[i]) - (t.hw[i] + Math.max(t.runL[i], t.runR[i]));
          if (d < best) best = d;
        }
      }
    return best;
  }

  private inSea(x: number, z: number): boolean {
    const sea = this.track.def.sea;
    if (!sea) return false;
    const v = sea.axis === 'x' ? x : z;
    return sea.dir > 0 ? v > sea.value : v < sea.value;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private buildSky(): THREE.Mesh {
    const geo = this.geo(new THREE.SphereGeometry(1500, 24, 12));
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(this.look.skyTop) }, horizon: { value: new THREE.Color(this.look.skyHorizon) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }',
    });
    this.mat(mat);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    m.userData.followCamera = true;
    if (this.track.def.theme === 'night') {
      // Estrellas
      const r = rng(77);
      const pts: number[] = [];
      for (let i = 0; i < 700; i++) {
        const u = r() * Math.PI * 2;
        const v = 0.08 + r() * 0.9;
        const rr = 1400;
        pts.push(Math.cos(u) * Math.cos(v) * rr, Math.sin(v) * rr, Math.sin(u) * Math.cos(v) * rr);
      }
      const sg = this.geo(new THREE.BufferGeometry());
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const stars = new THREE.Points(sg, this.mat(new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false })));
      m.add(stars);
    }
    return m;
  }

  /** Cinta a lo largo de la pista entre dos desplazamientos laterales. */
  private ribbon(
    latA: (i: number) => number,
    latB: (i: number) => number,
    yOff: number,
    mat: THREE.Material,
    opts: { vScale?: number; uMode?: 'across' | 'lat'; uScale?: number; include?: (i: number) => boolean; receive?: boolean } = {},
  ): THREE.Mesh | null {
    const t = this.track;
    const n = t.n;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const vScale = opts.vScale ?? 10;
    const uScale = opts.uScale ?? 6;
    let vi = 0;
    let prevIncluded = false;
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const inc = opts.include ? opts.include(k) : true;
      const rx = -t.tz[k];
      const rz = t.tx[k];
      const a = latA(k);
      const b = latB(k);
      const y = t.py[k] + yOff;
      pos.push(t.px[k] + rx * a, y, t.pz[k] + rz * a, t.px[k] + rx * b, y, t.pz[k] + rz * b);
      const v = (i * t.ds) / vScale;
      if (opts.uMode === 'lat') uv.push(a / uScale, v, b / uScale, v);
      else uv.push(0, v, 1, v);
      if (i > 0 && inc && prevIncluded) {
        const p = vi - 2;
        idx.push(p, p + 1, vi, p + 1, vi + 1, vi);
      }
      prevIncluded = inc;
      vi += 2;
    }
    if (idx.length === 0) return null;
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = opts.receive ?? true;
    this.group.add(m);
    return m;
  }

  /** Pared vertical a lo largo de la pista. */
  private wallStrip(lat: (i: number) => number, y0: (i: number) => number, y1: (i: number) => number, mat: THREE.Material, include?: (i: number) => boolean, uScale = 4, uSign = 1): THREE.Mesh | null {
    const t = this.track;
    const n = t.n;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let vi = 0;
    let prevInc = false;
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const inc = include ? include(k) : true;
      const l = lat(k);
      const x = t.px[k] - t.tz[k] * l;
      const z = t.pz[k] + t.tx[k] * l;
      pos.push(x, y0(k), z, x, y1(k), z);
      const u = (uSign * i * t.ds) / uScale;
      uv.push(u, 0, u, 1);
      if (i > 0 && inc && prevInc) {
        const p = vi - 2;
        idx.push(p, vi, p + 1, p + 1, vi, vi + 1);
      }
      prevInc = inc;
      vi += 2;
    }
    if (!idx.length) return null;
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = false;
    this.group.add(m);
    return m;
  }

  // ---------- construcción ----------

  private buildGround(): void {
    const b = this.track.bounds;
    const theme = this.track.def.theme;
    const margin = 900;
    let minX = b.minX - margin;
    let maxX = b.maxX + margin;
    let minZ = b.minZ - margin;
    let maxZ = b.maxZ + margin;
    const sea = this.track.def.sea;
    if (sea) {
      if (sea.axis === 'z') {
        if (sea.dir < 0) minZ = sea.value;
        else maxZ = sea.value;
      } else {
        if (sea.dir < 0) minX = sea.value;
        else maxX = sea.value;
      }
    }
    const w = maxX - minX;
    const h = maxZ - minZ;
    const tex = groundTex(theme).clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 16, h / 16);
    this.disposables.push(tex);
    const ground = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(w, h)), this.mat(new THREE.MeshLambertMaterial({ map: tex })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((minX + maxX) / 2, this.groundY, (minZ + maxZ) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    if (sea) {
      // Playa y mar
      const water = waterTex().clone();
      water.needsUpdate = true;
      this.water = water;
      this.disposables.push(water);
      const sw = 3000;
      water.repeat.set(sw / 24, sw / 24);
      const seaMesh = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(sw, sw)), this.mat(new THREE.MeshLambertMaterial({ map: water, color: '#9fd6ff' })));
      seaMesh.rotation.x = -Math.PI / 2;
      const cx = sea.axis === 'x' ? sea.value + (sea.dir * sw) / 2 : (b.minX + b.maxX) / 2;
      const cz = sea.axis === 'z' ? sea.value + (sea.dir * sw) / 2 : (b.minZ + b.maxZ) / 2;
      seaMesh.position.set(cx, this.groundY - 0.35, cz);
      this.group.add(seaMesh);
      const sand = sandTex().clone();
      sand.needsUpdate = true;
      sand.repeat.set(3000 / 12, 1);
      this.disposables.push(sand);
      const beach = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(3000, 12)), this.mat(new THREE.MeshLambertMaterial({ map: sand })));
      beach.rotation.x = -Math.PI / 2;
      if (sea.axis === 'z') beach.position.set((b.minX + b.maxX) / 2, this.groundY - 0.15, sea.value + sea.dir * 3);
      else {
        beach.rotation.z = Math.PI / 2;
        beach.position.set(sea.value + sea.dir * 3, this.groundY - 0.15, (b.minZ + b.maxZ) / 2);
      }
      this.group.add(beach);
    }
  }

  private buildRoad(): void {
    const t = this.track;
    const theme = t.def.theme;
    const asphalt = this.mat(new THREE.MeshLambertMaterial({ map: asphaltTex(theme === 'night') }));
    // Escapatorias
    const surfTex = t.surface === 'grass' ? grassTex() : t.surface === 'gravel' ? gravelTex() : t.surface === 'sand' ? sandTex() : asphaltTex(true);
    const runMat = this.mat(new THREE.MeshLambertMaterial({ map: surfTex, color: t.surface === 'asphalt' ? '#9a9aa4' : '#ffffff' }));
    this.ribbon((i) => -(t.hw[i] + t.runL[i]), (i) => -t.hw[i] + 0.05, 0.0, runMat, { uMode: 'lat', vScale: 6, uScale: 6 });
    this.ribbon((i) => t.hw[i] - 0.05, (i) => t.hw[i] + t.runR[i], 0.0, runMat, { uMode: 'lat', vScale: 6, uScale: 6 });
    // Asfalto
    this.ribbon((i) => -t.hw[i], (i) => t.hw[i], 0.03, asphalt, { vScale: 12 });
    // Líneas blancas de borde
    const white = this.mat(new THREE.MeshLambertMaterial({ color: '#f0f0f0' }));
    this.ribbon((i) => -t.hw[i] + 0.25, (i) => -t.hw[i] + 0.45, 0.04, white, { receive: true });
    this.ribbon((i) => t.hw[i] - 0.45, (i) => t.hw[i] - 0.25, 0.04, white, { receive: true });
    // Pianos
    const kerb = this.mat(new THREE.MeshLambertMaterial({ map: kerbTex() }));
    const kerbOn = (i: number) => t.kerb[i] === 1;
    this.ribbon((i) => -t.hw[i] - KERB_WIDTH, (i) => -t.hw[i], 0.045, kerb, { vScale: 2.4, include: kerbOn });
    this.ribbon((i) => t.hw[i], (i) => t.hw[i] + KERB_WIDTH, 0.045, kerb, { vScale: 2.4, include: kerbOn });
    // Muros
    const wh = theme === 'night' ? 1.5 : 1.1;
    const wtex = wallTex(theme);
    const wallMat = this.mat(new THREE.MeshLambertMaterial({ map: wtex, side: THREE.DoubleSide }));
    const yb = (i: number) => t.py[i] - 0.1;
    const yt = (i: number) => t.py[i] + wh;
    this.wallStrip((i) => -(t.hw[i] + t.runL[i]), yb, yt, wallMat, undefined, 6);
    this.wallStrip((i) => t.hw[i] + t.runR[i], yb, yt, wallMat, undefined, 6, -1);
    this.buildWallAds(wh);
    // Terraplenes bajo tramos elevados y puentes
    const raised = (i: number) => t.py[i] - this.groundY > 0.25 && !t.bridge[i];
    if (t.bounds.maxY - t.bounds.minY > 0.5) {
      const emb = this.mat(new THREE.MeshLambertMaterial({ map: embankTex(theme), side: THREE.DoubleSide }));
      const gy = () => this.groundY;
      this.wallStrip((i) => -(t.hw[i] + t.runL[i]), gy, yb, emb, raised, 8);
      this.wallStrip((i) => t.hw[i] + t.runR[i], gy, yb, emb, raised, 8);
      // Losa inferior del puente
      const concrete = this.mat(new THREE.MeshLambertMaterial({ color: '#9b9ea6', side: THREE.DoubleSide }));
      const isBridge = (i: number) => t.bridge[i] === 1;
      this.ribbon((i) => -(t.hw[i] + t.runL[i]), (i) => t.hw[i] + t.runR[i], -0.9, concrete, { include: isBridge });
      this.wallStrip((i) => -(t.hw[i] + t.runL[i]), (i) => t.py[i] - 0.9, yb, concrete, isBridge);
      this.wallStrip((i) => t.hw[i] + t.runR[i], (i) => t.py[i] - 0.9, yb, concrete, isBridge);
      // Pilares en los extremos del puente
      const pillarGeo = this.geo(new THREE.BoxGeometry(1.4, 1, 1.4));
      for (let i = 0; i < t.n; i++) {
        const a = t.bridge[i];
        const b = t.bridge[(i + 1) % t.n];
        if (a === b) continue;
        const k = a ? i : (i + 1) % t.n;
        for (const side of [-1, 1]) {
          const lat = side * (t.hw[k] + 0.4);
          const x = t.px[k] - t.tz[k] * lat;
          const z = t.pz[k] + t.tx[k] * lat;
          const h = t.py[k] - 0.9 - this.groundY;
          const p = new THREE.Mesh(pillarGeo, concrete);
          p.scale.y = h;
          p.position.set(x, this.groundY + h / 2, z);
          p.castShadow = true;
          this.group.add(p);
        }
      }
    }
  }

  private buildStart(): void {
    const t = this.track;
    const hw = t.hw[0];
    // Línea de meta a cuadros
    const chk = this.mat(new THREE.MeshLambertMaterial({ map: checkerTex() }));
    const line = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(hw * 2, 1.4)), chk);
    const lp = { x: 0, y: 0, z: 0 };
    t.pointAt(0, 0, lp);
    line.position.set(lp.x, lp.y + 0.05, lp.z);
    line.rotation.set(-Math.PI / 2, 0, t.headingAt(0));
    line.receiveShadow = true;
    this.group.add(line);
    // Marcas de parrilla
    const white = this.mat(new THREE.MeshLambertMaterial({ color: '#f2f2f2' }));
    const gg = this.geo(new THREE.PlaneGeometry(2.2, 0.25));
    for (let i = 0; i < 12; i++) {
      const sl = t.gridSlot(i);
      t.pointAt(sl.s + 1.3, sl.lat, lp);
      const m = new THREE.Mesh(gg, white);
      m.rotation.set(-Math.PI / 2, 0, t.headingAt(sl.s));
      m.position.set(lp.x, lp.y + 0.05, lp.z);
      this.group.add(m);
    }
    // Pórtico con semáforo
    const g = new THREE.Group();
    t.pointAt(1.2, 0, lp);
    g.position.set(lp.x, lp.y, lp.z);
    g.rotation.y = t.headingAt(0);
    const dark = this.mat(new THREE.MeshLambertMaterial({ color: '#202228' }));
    const span = hw + 1.6;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.5, 6.6, 0.5)), dark);
      post.position.set(s * span, 3.3, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(this.geo(new THREE.BoxGeometry(span * 2 + 0.5, 1.3, 0.6)), dark);
    beam.position.set(0, 6.2, 0);
    beam.castShadow = true;
    g.add(beam);
    const bannerBack = new THREE.Mesh(this.geo(new THREE.BoxGeometry(span * 1.6, 1.0, 0.1)), dark);
    bannerBack.position.set(0, 7.4, 0);
    g.add(bannerBack);
    for (const face of [-1, 1]) {
      const bt = this.mat(new THREE.MeshBasicMaterial({ map: face < 0 ? bannerTex(0) : adTex(t.def.id.length) }));
      const banner = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(span * 1.6, 1.0)), bt);
      banner.position.set(0, 7.4, face * 0.07);
      banner.rotation.y = face < 0 ? Math.PI : 0;
      g.add(banner);
    }
    const podGeo = this.geo(new THREE.CircleGeometry(0.3, 12));
    for (let i = 0; i < 5; i++) {
      for (const face of [-1, 1]) {
        const pod = new THREE.Mesh(podGeo, this.lightMatOff);
        pod.position.set((i - 2) * 0.9, 6.2, face * 0.31);
        pod.rotation.y = face > 0 ? 0 : Math.PI;
        g.add(pod);
        this.lightPods.push(pod);
      }
    }
    this.group.add(g);
  }

  /** Vallas publicitarias pegadas a la cara interior de los muros. */
  private buildWallAds(wallH: number): void {
    const t = this.track;
    const L = t.length;
    const r = rng(t.def.id.length * 17 + 3);
    const groups = new Map<number, THREE.Matrix4[]>();
    const step = this.quality === 'bajo' ? 70 : 42;
    const h = Math.min(0.9, wallH - 0.2);
    let k = 0;
    for (let s = 25; s < L - 15; s += step) {
      const side = k++ % 2 === 0 ? 1 : -1;
      const i = t.index(s);
      if (t.bridge[i]) continue;
      const lim = t.hw[i] + (side > 0 ? t.runR[i] : t.runL[i]);
      // solo en tramos rectos (las vallas planas no siguen la curva)
      if (Math.abs(t.curv[i]) > 1 / 60) continue;
      const p = { x: 0, y: 0, z: 0 };
      t.pointAt(s, side * (lim - 0.06), p);
      const nx = side * t.tz[i];
      const nz = -side * t.tx[i];
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y + 0.1 + h / 2, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(nx, nz)),
        new THREE.Vector3(1, 1, 1),
      );
      const ad = Math.floor(r() * ADS.length);
      let arr = groups.get(ad);
      if (!arr) groups.set(ad, (arr = []));
      arr.push(m);
    }
    const geo = this.geo(new THREE.PlaneGeometry(h * 4, h));
    for (const [ad, mats] of groups) {
      const mesh = new THREE.InstancedMesh(geo, this.mat(new THREE.MeshLambertMaterial({ map: adTex(ad) })), mats.length);
      mats.forEach((m, j) => mesh.setMatrixAt(j, m));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** n luces rojas encendidas; green=true para el verde de entrenamientos. */
  setStartLights(n: number, green = false): void {
    this.lightPods.forEach((p, k) => {
      const i = Math.floor(k / 2);
      p.material = green ? this.lightMatGreen : i < n ? this.lightMatOn : this.lightMatOff;
    });
  }

  private buildPits(): void {
    const t = this.track;
    const side = 1;
    const s0 = -100;
    const s1 = -18;
    const mid = (s0 + s1) / 2;
    const len = s1 - s0;
    const k = t.index(mid);
    const lat = side * (t.hw[k] + t.runR[k] + 7);
    const p = { x: 0, y: 0, z: 0 };
    t.pointAt(mid, lat, p);
    const g = new THREE.Group();
    g.position.set(p.x, this.groundY, p.z);
    g.rotation.y = t.headingAt(mid);
    const body = new THREE.Mesh(this.geo(new THREE.BoxGeometry(10, 4.4, len)), this.mat(new THREE.MeshLambertMaterial({ color: '#d8dade' })));
    body.position.set(-side * 5, 2.2 + (t.py[k] - this.groundY), 0);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const gt = garageTex().clone();
    gt.needsUpdate = true;
    gt.repeat.set(len / 26, 1);
    this.disposables.push(gt);
    const front = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(len, 4.4)), this.mat(new THREE.MeshLambertMaterial({ map: gt })));
    front.position.set(side * 0.02, 2.2 + (t.py[k] - this.groundY), 0);
    front.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(front);
    const roof = new THREE.Mesh(this.geo(new THREE.BoxGeometry(12, 0.4, len + 2)), this.mat(new THREE.MeshLambertMaterial({ color: '#D7261E' })));
    roof.position.set(-side * 5, 4.6 + (t.py[k] - this.groundY), 0);
    roof.castShadow = true;
    g.add(roof);
    // Asfalto del pit lane
    const lane = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(6, len)), this.mat(new THREE.MeshLambertMaterial({ map: asphaltTex(true) })));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(side * 3.6, t.py[k] - this.groundY + 0.02, 0);
    lane.receiveShadow = true;
    g.add(lane);
    this.group.add(g);
    this.pitZone = { s0: s0 - 6, s1: s1 + 6, side };
  }

  private pitZone = { s0: 0, s1: 0, side: 1 };

  private inPitZone(s: number, side: number): boolean {
    const L = this.track.length;
    let ss = mod(s, L);
    if (ss > L / 2) ss -= L;
    return side === this.pitZone.side && ss >= this.pitZone.s0 && ss <= this.pitZone.s1;
  }

  private buildDecor(): void {
    const t = this.track;
    const def = t.def;
    const L = t.length;
    const r = rng(def.id.length * 131 + 7);
    const density = QUALITY_DECOR[this.quality];
    const night = def.theme === 'night';
    type Item = { x: number; y: number; z: number; yaw: number; s: number };
    const items = new Map<string, Item[]>();
    const push = (key: string, it: Item) => {
      let a = items.get(key);
      if (!a) items.set(key, (a = []));
      a.push(it);
    };
    const promenades: { from: number; to: number; side: number }[] = [];
    const lampHeads: { x: number; y: number; z: number; px: number; pz: number; py: number }[] = [];

    for (const rule of def.decor) {
      const from = (rule.from ?? 0) * L;
      let to = (rule.to ?? 1) * L;
      if (to <= from) to += L;
      if (rule.type === 'promenade') {
        promenades.push({ from, to, side: rule.side || -1 });
        continue;
      }
      const sides = rule.side === 0 ? [-1, 1] : [rule.side];
      const step = rule.every / (rule.type === 'tyres' || rule.type === 'lamp' || rule.type === 'banner' || rule.type === 'grandstand' ? 1 : density);
      for (let s = from; s < to; s += step) {
        for (const side of sides) {
          if (this.inPitZone(s, side)) continue;
          if (rule.type === 'grandstand' && Math.abs(mod(s + 10, L) - 10) < 8) continue;
          const k = t.index(s);
          if (t.bridge[k] && rule.type !== 'lamp') continue;
          const run = side < 0 ? t.runL[k] : t.runR[k];
          const j = (rule.jitter ?? 0) * r();
          const extra = rule.type === 'tyres' ? 0.6 : rule.type === 'lamp' ? 0.5 : rule.type === 'banner' ? 0.5 : 1.5;
          const lat = side * (t.hw[k] + run + extra + (rule.offset ?? 0) + j);
          const p = { x: 0, y: 0, z: 0 };
          t.pointAt(s + (r() - 0.5) * (rule.jitter ?? 0), lat, p);
          // No invadir otra parte del circuito
          const big = rule.type === 'grandstand' || rule.type === 'building' ? 12 : rule.type === 'tree' || rule.type === 'pine' || rule.type === 'palm' ? 3 : 0.3;
          if (this.clearance(p.x, p.z) < big) continue;
          if (this.inSea(p.x, p.z)) continue;
          // Orientado hacia la pista
          const dx = side * t.tz[k];
          const dz = -side * t.tx[k];
          const yaw = Math.atan2(dx, dz);
          const free = rule.type === 'tree' || rule.type === 'pine' || rule.type === 'rock' || rule.type === 'palm' || rule.type === 'crate';
          const variant = rule.type === 'building' ? Math.floor(r() * 3) : rule.type === 'banner' ? Math.floor(r() * ADS.length) : 0;
          push(`${rule.type}:${variant}`, { x: p.x, y: p.y, z: p.z, yaw: free ? r() * Math.PI * 2 : yaw, s });
          if (rule.type === 'lamp') {
            const hp = { x: 0, y: 0, z: 0 };
            t.pointAt(s, lat - side * 1.55, hp);
            const pp = { x: 0, y: 0, z: 0 };
            t.pointAt(s, side * Math.max(0, t.hw[k] - 2.5), pp);
            lampHeads.push({ x: hp.x, y: p.y + 5.9, z: hp.z, px: pp.x, pz: pp.z, py: pp.y });
          }
        }
      }
    }

    // Dispersión libre por el paisaje
    const b = t.bounds;
    for (const sc of def.scatter) {
      const count = Math.floor(sc.count * density);
      let placed = 0;
      for (let tries = 0; tries < count * 12 && placed < count; tries++) {
        const x = b.minX - sc.maxDist + r() * (b.maxX - b.minX + sc.maxDist * 2);
        const z = b.minZ - sc.maxDist + r() * (b.maxZ - b.minZ + sc.maxDist * 2);
        const c = this.clearance(x, z);
        if (c < sc.minDist || (c > sc.maxDist && c !== Infinity)) continue;
        if (this.inSea(x, z)) continue;
        if (c === Infinity) {
          // celda lejana: aceptar si está dentro del rango por bounding box
          const ddx = Math.max(b.minX - x, 0, x - b.maxX);
          const ddz = Math.max(b.minZ - z, 0, z - b.maxZ);
          if (Math.hypot(ddx, ddz) > sc.maxDist) continue;
        }
        const variant = sc.type === 'building' ? Math.floor(r() * 3) : 0;
        push(`${sc.type}:${variant}`, { x, y: this.groundY, z, yaw: r() * Math.PI * 2, s: 0 });
        placed++;
      }
    }

    // Crear InstancedMesh por tipo
    const dummy = new THREE.Object3D();
    for (const [key, list] of items) {
      const [type, v] = key.split(':') as [DecorType, string];
      const proto = makeProto(type, def.theme, Number(v));
      if (!proto) continue;
      this.disposables.push(proto.geo, proto.mat);
      const mesh = new THREE.InstancedMesh(proto.geo, proto.mat, list.length);
      list.forEach((it, i) => {
        const free = type === 'tree' || type === 'pine' || type === 'rock' || type === 'palm' || type === 'crate';
        const sc = free ? 0.75 + r() * 0.6 : 1;
        dummy.position.set(it.x, proto.onTrack ? it.y : this.groundY, it.z);
        dummy.rotation.set(0, it.yaw, 0);
        dummy.scale.set(sc, sc * (type === 'rock' ? 0.6 + r() * 0.8 : 1), sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = proto.shadow && this.quality === 'alto';
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }

    // Paseo marítimo
    for (const pr of promenades) {
      const promMat = this.mat(new THREE.MeshLambertMaterial({ map: promenadeTex() }));
      const inRange = (i: number) => {
        let s = i * t.ds;
        if (s < pr.from) s += L;
        return s >= pr.from && s <= pr.to;
      };
      const side = pr.side;
      this.ribbon(
        (i) => side * (t.hw[i] + (side < 0 ? t.runL[i] : t.runR[i]) + 0.2),
        (i) => side * (t.hw[i] + (side < 0 ? t.runL[i] : t.runR[i]) + 16),
        this.groundY - t.py[0] + 0.03,
        promMat,
        { include: inRange, uMode: 'lat', uScale: 4, vScale: 4 },
      );
    }

    // Brillos de farolas (de noche y en la costa)
    if (lampHeads.length) {
      const glowMat = this.mat(
        new THREE.SpriteMaterial({ map: glowTex(), color: night ? '#ffd890' : '#fff6d8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: night ? 0.95 : 0.0 }),
      );
      const poolMat = this.mat(
        new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ffc870', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32 }),
      );
      const headMat = this.mat(new THREE.MeshBasicMaterial({ color: night ? '#fff2c8' : '#d9d9d9' }));
      const headGeo = this.geo(new THREE.BoxGeometry(0.5, 0.18, 0.7));
      const heads = new THREE.InstancedMesh(headGeo, headMat, lampHeads.length);
      const poolGeo = this.geo(new THREE.PlaneGeometry(14, 14));
      const pools = night ? new THREE.InstancedMesh(poolGeo, poolMat, lampHeads.length) : null;
      lampHeads.forEach((h, i) => {
        dummy.position.set(h.x, h.y, h.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
        if (night) {
          const sp = new THREE.Sprite(glowMat);
          sp.position.set(h.x, h.y - 0.2, h.z);
          sp.scale.set(4, 4, 1);
          this.group.add(sp);
          dummy.position.set(h.px, h.py + 0.06, h.pz);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.updateMatrix();
          pools!.setMatrixAt(i, dummy.matrix);
        }
      });
      this.group.add(heads);
      if (pools) {
        pools.renderOrder = 2;
        this.group.add(pools);
      }
    }
  }

  /** Fondo: montañas, acantilados de cantera o skyline. */
  private buildBackdrop(): void {
    const theme = this.track.def.theme;
    const b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const rad = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    const r = rng(5);
    if (theme === 'mountain' || theme === 'ring' || theme === 'gp' || theme === 'quarry') {
      const rock = this.mat(new THREE.MeshLambertMaterial({ color: theme === 'quarry' ? '#c49a6a' : theme === 'mountain' ? '#7b8794' : '#7f9a7a', flatShading: true }));
      const snow = this.mat(new THREE.MeshLambertMaterial({ color: '#f4f7fb', flatShading: true }));
      const count = theme === 'mountain' ? 26 : theme === 'quarry' ? 22 : 14;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r() * 0.2;
        const d = rad + (theme === 'quarry' ? 260 : 380) + r() * 200;
        const h = theme === 'mountain' ? 120 + r() * 160 : theme === 'quarry' ? 60 + r() * 50 : 50 + r() * 60;
        const w = h * (theme === 'quarry' ? 2.4 : 1.4) + r() * 60;
        const geo = this.geo(theme === 'quarry' ? new THREE.CylinderGeometry(w * 0.7, w, h, 6, 3) : new THREE.ConeGeometry(w, h, 6 + Math.floor(r() * 3), 2));
        const m = new THREE.Mesh(geo, rock);
        m.position.set(cx + Math.cos(a) * d, this.groundY + h / 2 - 2, cz + Math.sin(a) * d);
        m.rotation.y = r() * Math.PI;
        this.group.add(m);
        if (theme === 'mountain' && h > 170) {
          const cap = new THREE.Mesh(this.geo(new THREE.ConeGeometry(w * 0.32, h * 0.32, 7)), snow);
          cap.position.set(m.position.x, m.position.y + h * 0.34 + 1, m.position.z);
          cap.rotation.y = m.rotation.y;
          this.group.add(cap);
        }
      }
    }
    if (theme === 'night') {
      const mats = [
        this.mat(new THREE.MeshLambertMaterial({ map: (makeProto('building', 'night', 0)!.mat as THREE.MeshLambertMaterial).map, emissiveMap: (makeProto('building', 'night', 0)!.mat as THREE.MeshLambertMaterial).emissiveMap, emissive: new THREE.Color('#ffffff') })),
      ];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const d = rad + 260 + r() * 140;
        const h = 40 + r() * 90;
        const geo = this.geo(new THREE.BoxGeometry(30, h, 30));
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 4, uv.getY(k) * (h / 10));
        const m = new THREE.Mesh(geo, mats[0]);
        m.position.set(cx + Math.cos(a) * d, this.groundY + h / 2, cz + Math.sin(a) * d);
        this.group.add(m);
      }
    }
  }

  update(dt: number, focus: THREE.Vector3): void {
    if (this.sun.castShadow) {
      const d = this.sun.userData.dir as THREE.Vector3;
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(d, 100);
      this.sun.target.updateMatrixWorld();
    }
    if (this.water) this.water.offset.x = (this.water.offset.x + dt * 0.01) % 1;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
