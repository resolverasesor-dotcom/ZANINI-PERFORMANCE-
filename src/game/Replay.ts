import * as THREE from 'three';
import type { Track } from '../track/Track';

/** Valores guardados por kart y fotograma. */
const F = 6; // x, y, z, yaw, driftVisual, steer

/** Búfer circular con los últimos segundos de carrera de todos los karts. */
export class ReplayBuffer {
  readonly rate = 30;
  private frames: Float32Array[];
  private head = 0;
  private count = 0;
  private acc = 0;

  constructor(
    readonly karts: number,
    seconds: number,
  ) {
    const n = Math.round(seconds * this.rate);
    this.frames = Array.from({ length: n }, () => new Float32Array(karts * F));
  }

  get length(): number {
    return this.count;
  }

  /** Avanza el reloj de grabación; devuelve true si toca guardar fotograma. */
  tick(dt: number): boolean {
    this.acc += dt;
    if (this.acc >= 1 / this.rate) {
      this.acc -= 1 / this.rate;
      return true;
    }
    return false;
  }

  /** Reserva el siguiente fotograma y lo devuelve para rellenarlo. */
  push(): Float32Array {
    const f = this.frames[this.head];
    this.head = (this.head + 1) % this.frames.length;
    this.count = Math.min(this.count + 1, this.frames.length);
    return f;
  }

  static write(f: Float32Array, i: number, x: number, y: number, z: number, yaw: number, drift: number, steer: number): void {
    const k = i * F;
    f[k] = x;
    f[k + 1] = y;
    f[k + 2] = z;
    f[k + 3] = yaw;
    f[k + 4] = drift;
    f[k + 5] = steer;
  }

  /** Pose interpolada del kart i en el instante t (0 = fotograma más antiguo). */
  sample(t: number, i: number, out: { x: number; y: number; z: number; yaw: number; drift: number; steer: number }): void {
    const n = this.frames.length;
    const pos = Math.max(0, Math.min(this.count - 1.001, t * this.rate));
    const a = Math.floor(pos);
    const u = pos - a;
    const start = (this.head - this.count + n) % n;
    const fa = this.frames[(start + a) % n];
    const fb = this.frames[(start + a + 1) % n];
    const k = i * F;
    out.x = fa[k] + (fb[k] - fa[k]) * u;
    out.y = fa[k + 1] + (fb[k + 1] - fa[k + 1]) * u;
    out.z = fa[k + 2] + (fb[k + 2] - fa[k + 2]) * u;
    let dy = fb[k + 3] - fa[k + 3];
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    out.yaw = fa[k + 3] + dy * u;
    out.drift = fa[k + 4] + (fb[k + 4] - fa[k + 4]) * u;
    out.steer = fa[k + 5];
  }

  get duration(): number {
    return this.count / this.rate;
  }
}

/** Realizador de TV: cámaras a pie de pista que siguen al kart con teleobjetivo. */
export class TVDirector {
  private spots: { s: number; x: number; y: number; z: number }[] = [];
  private current = -1;
  private fov = 30;

  constructor(private track: Track) {
    const t = track;
    let side = 1;
    for (let s = 0; s < t.length; s += 55) {
      const i = t.index(s);
      const lim = t.hw[i] + (side > 0 ? t.runR[i] : t.runL[i]);
      const p = { x: 0, y: 0, z: 0 };
      t.pointAt(s, side * (lim + 6), p);
      this.spots.push({ s, x: p.x, y: p.y + 4 + ((s / 55) % 3) * 1.5, z: p.z });
      side = -side;
    }
  }

  reset(): void {
    this.current = -1;
  }

  /** Coloca la cámara para seguir al objetivo situado en la distancia s. */
  frame(cam: THREE.PerspectiveCamera, target: THREE.Vector3, s: number, dt: number): void {
    const L = this.track.length;
    const ahead = (sp: { s: number }) => {
      let d = sp.s - s;
      if (d < -L / 2) d += L;
      if (d > L / 2) d -= L;
      return d;
    };
    const cur = this.spots[this.current];
    // Cambiar de cámara cuando el kart la ha dejado atrás
    if (!cur || ahead(cur) < -18) {
      let best = 0;
      let bestD = Infinity;
      this.spots.forEach((sp, k) => {
        const d = ahead(sp);
        if (d > 8 && d < bestD) {
          bestD = d;
          best = k;
        }
      });
      this.current = best;
    }
    const sp = this.spots[this.current];
    cam.position.set(sp.x, sp.y, sp.z);
    cam.lookAt(target.x, target.y + 0.6, target.z);
    const dist = cam.position.distanceTo(target);
    const want = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(4.5 / dist)), 10, 55);
    this.fov += (want - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
