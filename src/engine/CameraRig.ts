import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { CameraMode } from '../core/Settings';

/** Cámara de persecución con FOV dinámico, retardo de giro y vibración. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'trasera';
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private fov = 70;
  private first = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 2400);
  }

  reset(): void {
    this.first = true;
  }

  addShake(a: number): void {
    this.shake = Math.min(1.2, this.shake + a);
  }

  /**
   * Sigue al objetivo. yaw = rumbo del kart, velYaw = rumbo de la velocidad
   * (al derrapar la cámara se queda entre ambos y se aprecia el ángulo).
   */
  follow(dt: number, x: number, y: number, z: number, yaw: number, velYaw: number, speedRatio: number, boost: boolean, slope: number): void {
    const cam = this.camera;
    const target = this.mode === 'capo' ? yaw : velYaw + clampAngle(yaw - velYaw, 0.35) * 0.6;
    if (this.first) {
      this.yaw = target;
    } else this.yaw = dampAngle(this.yaw, target, this.mode === 'capo' ? 30 : 7, dt);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let dist: number;
    let height: number;
    let lookAhead: number;
    let lookH: number;
    switch (this.mode) {
      case 'cercana':
        dist = 3.3 + speedRatio * 0.5;
        height = 1.45;
        lookAhead = 4;
        lookH = 0.75;
        break;
      case 'capo':
        dist = -0.15;
        height = 1.05;
        lookAhead = 10;
        lookH = 0.9;
        break;
      default:
        dist = 5.0 + speedRatio * 0.9;
        height = 2.05 + speedRatio * 0.1;
        lookAhead = 4.5;
        lookH = 0.9;
    }
    const tx = x - fx * dist;
    const tz = z - fz * dist;
    const ty = y + height - slope * dist * 0.5;
    if (this.first || this.mode === 'capo') {
      this.pos.set(tx, ty, tz);
      this.first = false;
    } else {
      this.pos.x = damp(this.pos.x, tx, 14, dt);
      this.pos.z = damp(this.pos.z, tz, 14, dt);
      this.pos.y = damp(this.pos.y, ty, 6, dt);
    }
    this.look.set(x + fx * lookAhead, y + lookH + slope * lookAhead * 0.5, z + fz * lookAhead);
    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 6, dt);
    }
    cam.lookAt(this.look);
    const baseFov = this.mode === 'capo' ? 74 : 66;
    const targetFov = baseFov + clamp(speedRatio, 0, 1.3) * 16 + (boost ? 8 : 0);
    this.fov = damp(this.fov, targetFov, 4, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  /** Cámara libre (orbital) para ceremonias y repeticiones. */
  orbit(t: number, cx: number, cy: number, cz: number, radius: number, height: number): void {
    const cam = this.camera;
    cam.position.set(cx + Math.cos(t) * radius, cy + height, cz + Math.sin(t) * radius);
    cam.lookAt(cx, cy + 1, cz);
    cam.fov = 55;
    cam.updateProjectionMatrix();
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}

function clampAngle(a: number, lim: number): number {
  a = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return clamp(a, -lim, lim);
}
