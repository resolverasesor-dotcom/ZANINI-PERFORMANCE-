import * as THREE from 'three';

// Partículas con un pool fijo (sin asignaciones por frame): chispas aditivas y
// humo/polvo con mezcla normal.

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.1, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private gravity: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(
    readonly count: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, size: number, life: number, grow = 0, gravity = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
    this.alpha[i] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.gravity[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.vel[k] *= 0.96;
      this.vel[k + 2] *= 0.96;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class Effects {
  readonly group = new THREE.Group();
  private sparks: ParticlePool;
  private smoke: ParticlePool;
  private rate: number;

  constructor(lowQuality: boolean) {
    this.rate = lowQuality ? 0.5 : 1;
    this.sparks = new ParticlePool(lowQuality ? 300 : 700, true);
    this.smoke = new ParticlePool(lowQuality ? 200 : 500, false);
    this.group.add(this.smoke.points, this.sparks.points);
  }

  private chance(p: number): boolean {
    return Math.random() < p * this.rate;
  }

  /** Chispas de derrape en las ruedas traseras (nivel 0 blanco, 1 azul, 2 naranja). */
  driftSparks(x: number, y: number, z: number, yaw: number, level: number, dir: number): void {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    const colors: [number, number, number][] = [
      [1, 1, 0.8],
      [0.3, 0.6, 1],
      [1, 0.55, 0.1],
    ];
    const [r, g, b] = colors[level];
    const n = level === 0 ? 1 : 3;
    for (const side of [-1, 1]) {
      if (side === dir && level === 0) continue;
      for (let k = 0; k < n; k++) {
        if (!this.chance(0.9)) continue;
        const px = x - fx * 0.7 + rx * side * 0.62;
        const pz = z - fz * 0.7 + rz * side * 0.62;
        this.sparks.emit(
          px,
          y + 0.1,
          pz,
          -fx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3,
          1.5 + Math.random() * 2.5,
          -fz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3,
          r,
          g,
          b,
          level === 0 ? 0.12 : 0.22,
          0.25 + Math.random() * 0.2,
          0,
          9,
        );
      }
    }
  }

  /** Humo de neumáticos (derrape) o polvo (fuera de pista). */
  puff(x: number, y: number, z: number, color: [number, number, number], size = 0.6, life = 0.8, vy = 0.8): void {
    if (!this.chance(1)) return;
    this.smoke.emit(x + (Math.random() - 0.5) * 0.6, y + 0.2, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2, vy, (Math.random() - 0.5) * 1.2, color[0], color[1], color[2], size, life, size * 2.5, -0.2);
  }

  /** Chispas de impacto contra el muro. */
  impact(x: number, y: number, z: number, strength: number): void {
    const n = Math.min(24, 4 + strength * 2);
    for (let i = 0; i < n; i++) {
      this.sparks.emit(x, y + 0.4, z, (Math.random() - 0.5) * 9, 2 + Math.random() * 4, (Math.random() - 0.5) * 9, 1, 0.8, 0.3, 0.18, 0.3 + Math.random() * 0.3, 0, 12);
    }
  }

  /** Destello del turbo. */
  boostBurst(x: number, y: number, z: number, yaw: number, level: number): void {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (let i = 0; i < 18; i++) {
      const c: [number, number, number] = level === 2 ? [1, 0.6, 0.15] : [0.35, 0.65, 1];
      this.sparks.emit(x - fx, y + 0.4, z - fz, -fx * 6 + (Math.random() - 0.5) * 4, Math.random() * 2, -fz * 6 + (Math.random() - 0.5) * 4, c[0], c[1], c[2], 0.3, 0.35, 0.5, 0);
    }
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
  }

  dispose(): void {
    this.sparks.dispose();
    this.smoke.dispose();
  }
}

/** Marcas de neumático sobre el asfalto (búfer circular de quads instanciados). */
export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private dummy = new THREE.Object3D();
  private last = new Map<string, { x: number; z: number }>();

  constructor(private count: number) {
    const geo = new THREE.PlaneGeometry(0.22, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    // Fuera de la vista hasta que se usen
    this.dummy.position.set(0, -9999, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  /** Añade un tramo de marca para la rueda `key` si se ha movido lo suficiente. */
  mark(key: string, x: number, y: number, z: number): void {
    const prev = this.last.get(key);
    if (!prev) {
      this.last.set(key, { x, z });
      return;
    }
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.45) return;
    if (len > 3) {
      prev.x = x;
      prev.z = z;
      return;
    }
    const d = this.dummy;
    d.position.set((x + prev.x) / 2, y + 0.06, (z + prev.z) / 2);
    d.rotation.set(0, Math.atan2(dx, dz), 0);
    d.scale.set(1, 1, len + 0.05);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.next, d.matrix);
    this.next = (this.next + 1) % this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    prev.x = x;
    prev.z = z;
  }

  /** La rueda deja de marcar (la siguiente marca empieza de cero). */
  lift(key: string): void {
    this.last.delete(key);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
