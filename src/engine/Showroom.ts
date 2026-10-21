import * as THREE from 'three';
import { buildKart, type KartMesh } from './KartModel';
import { bannerTex } from './textures';

/** Fondo 3D de los menús: el kart del jugador en una plataforma giratoria. */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private kart: KartMesh | null = null;
  private turntable = new THREE.Group();
  private t = 0;
  private key = '';

  constructor() {
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.scene.background = new THREE.Color('#0d0d10');
    this.scene.fog = new THREE.Fog('#0d0d10', 14, 40);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#30303a', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(4, 8, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#ff5040', 1.6);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffc300', 0.7);
    fill.position.set(6, 2, -3);
    this.scene.add(fill);

    // Suelo con anillos
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: '#16161b' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.16, 48), new THREE.MeshLambertMaterial({ color: '#25252c' }));
    disc.position.y = 0.08;
    this.turntable.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.04, 6, 64), new THREE.MeshBasicMaterial({ color: '#D7261E' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.17;
    this.turntable.add(ring);
    this.scene.add(this.turntable);
    // Paneles de fondo con el logo
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: bannerTex(i === 1 ? 0 : 1) }));
      p.position.set((i - 1) * 8.4, 3.2, -9);
      this.scene.add(p);
    }
    // Líneas de velocidad en el suelo
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(14 - i * 1.5, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? '#FFC300' : '#D7261E' }));
      s.rotation.x = -Math.PI / 2;
      s.position.set(-6 + i * 0.7, 0.01, -3.2 - i * 0.5);
      this.scene.add(s);
    }
  }

  setKart(color: string, number: number): void {
    const key = `${color}|${number}`;
    if (key === this.key) return;
    this.key = key;
    if (this.kart) {
      this.turntable.remove(this.kart.root);
      for (const m of this.kart.materials) m.dispose();
    }
    this.kart = buildKart(color, number);
    this.kart.root.scale.setScalar(1.7);
    this.kart.root.position.y = 0.16;
    this.turntable.add(this.kart.root);
  }

  update(dt: number, aspect: number, offsetX: number): void {
    this.t += dt;
    this.turntable.rotation.y = this.t * 0.45;
    this.camera.aspect = aspect;
    // En pantallas anchas desplazamos el kart para dejar sitio al menú
    this.camera.position.set(6.6 - offsetX, 3.0, 7.6);
    this.camera.lookAt(-offsetX * 0.9, 0.9, 0);
    this.camera.updateProjectionMatrix();
  }
}

/** Ceremonia de campeón: podio con los tres mejores y confeti. */
export class Podium {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  private t = 0;
  private confetti: THREE.Points;
  private vel: Float32Array;
  private karts: KartMesh[] = [];

  constructor(top3: { color: string; number: number }[]) {
    this.scene.background = new THREE.Color('#101018');
    this.scene.fog = new THREE.Fog('#101018', 20, 60);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#303040', 1.5));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(5, 12, 8);
    this.scene.add(sun);
    const spot = new THREE.DirectionalLight('#FFC300', 1.0);
    spot.position.set(-6, 5, 4);
    this.scene.add(spot);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#1c1c24' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const heights = [2.2, 1.5, 1.0];
    const xs = [0, -3.2, 3.2];
    const cols = ['#FFC300', '#C0C4CC', '#CD7F32'];
    top3.forEach((k, i) => {
      const h = heights[i];
      const block = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), new THREE.MeshLambertMaterial({ color: '#f2f2f2' }));
      block.position.set(xs[i], h / 2, 0);
      this.scene.add(block);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.35, 3.02), new THREE.MeshLambertMaterial({ color: cols[i] }));
      stripe.position.set(xs[i], h - 0.3, 0);
      this.scene.add(stripe);
      const num = makeNumberSprite(String(i + 1), cols[i]);
      num.position.set(xs[i], h * 0.45, 1.52);
      this.scene.add(num);
      const kart = buildKart(k.color, k.number);
      kart.root.position.set(xs[i], h, 0);
      kart.root.rotation.y = 0.35 * (i === 1 ? 1 : i === 2 ? -1 : 0);
      this.scene.add(kart.root);
      this.karts.push(kart);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: bannerTex(0) }));
    banner.position.set(0, 4.4, -9);
    this.scene.add(banner);

    const n = 900;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.vel = new Float32Array(n);
    const palette = [new THREE.Color('#D7261E'), new THREE.Color('#FFC300'), new THREE.Color('#ffffff'), new THREE.Color('#1E6FE0')];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
      this.vel[i] = 1 + Math.random() * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true }));
    this.scene.add(this.confetti);
  }

  update(dt: number, aspect: number): void {
    this.t += dt;
    const a = Math.sin(this.t * 0.25) * 0.6;
    this.camera.aspect = aspect;
    this.camera.position.set(Math.sin(a) * 13, 4.5, Math.cos(a) * 13);
    this.camera.lookAt(0, 2.2, 0);
    this.camera.updateProjectionMatrix();
    const p = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - this.vel[i] * dt;
      let x = p.getX(i) + Math.sin(this.t * 2 + i) * dt * 0.6;
      if (y < 0) {
        y = 16;
        x = (Math.random() - 0.5) * 22;
      }
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
    this.karts.forEach((k, i) => (k.body.position.y = Math.abs(Math.sin(this.t * 3 + i)) * 0.08));
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}

function makeNumberSprite(text: string, color: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'italic 900 100px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
}
