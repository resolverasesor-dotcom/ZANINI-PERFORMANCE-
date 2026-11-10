import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { CameraMode } from '../core/Settings';

/** Dinámica del kart que la cámara "siente" (m/s²; ay > 0 = hacia la izquierda). */
export interface CamDynamics {
  ax: number;
  ay: number;
  /** Ruedas sobre el piano 0…1 y fuera de pista 0…1 (hierba, grava, arena). */
  kerb: number;
  off: number;
  /** Velocidad (m/s): marca el ritmo de los resaltes del piano. */
  speed: number;
}

const NO_DYN: CamDynamics = { ax: 0, ay: 0, kerb: 0, off: 0, speed: 0 };

/**
 * Cámara de persecución cinematográfica:
 * - muelle con inercia: se queda atrás al acelerar y se acerca al frenar;
 * - se abre hacia fuera en las curvas y se inclina con la fuerza lateral;
 * - baja y se acerca con la velocidad, el FOV se abre (sensación de velocidad);
 * - vibración de alta frecuencia que crece con la velocidad y en pianos/hierba;
 * - modo TV (cámaras a pie de pista) y barrido de parrilla antes de la salida.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'trasera';
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private fov = 70;
  private first = true;
  /** Estado suavizado de la dinámica (la cámara tiene "masa"). */
  private sAx = 0;
  private sAy = 0;
  private roll = 0;
  private t = 0;
  private punch = 0;
  private kerbPh = 0;
  private jolt = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 2400);
  }

  reset(): void {
    this.first = true;
    this.sAx = this.sAy = this.roll = 0;
  }

  addShake(a: number): void {
    this.shake = Math.min(1.2, this.shake + a);
  }

  /** Golpe de FOV (saltito, rebufo, salida): la imagen "empuja" un instante. */
  fovPunch(a: number): void {
    this.punch = Math.max(-8, Math.min(8, this.punch + a));
  }

  /**
   * Sigue al objetivo. yaw = rumbo del kart, velYaw = rumbo de la velocidad
   * (al deslizar la cámara se queda entre ambos y se aprecia el ángulo).
   */
  follow(dt: number, x: number, y: number, z: number, yaw: number, velYaw: number, speedRatio: number, boost: boolean, slope: number, dyn: CamDynamics = NO_DYN): void {
    const cam = this.camera;
    this.t += dt;
    const onboard = this.mode === 'capo';
    // Dinámica con inercia (muelle crítico): suaviza y retrasa como un brazo de grúa
    this.sAx = damp(this.sAx, clamp(dyn.ax, -16, 8), 3.2, dt);
    this.sAy = damp(this.sAy, clamp(dyn.ay, -20, 20), 3.6, dt);
    const sr = clamp(speedRatio, 0, 1.3);
    const target = onboard ? yaw : velYaw + clampAngle(yaw - velYaw, 0.35) * 0.6;
    if (this.first) this.yaw = target;
    else this.yaw = dampAngle(this.yaw, target, onboard ? 30 : 6.5, dt);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // izquierda del rumbo de la cámara
    const lx = Math.cos(this.yaw);
    const lz = -Math.sin(this.yaw);
    let dist: number;
    let height: number;
    let lookAhead: number;
    let lookH: number;
    switch (this.mode) {
      case 'cercana':
        dist = 3.2 + sr * 0.35;
        height = 1.35 - sr * 0.15;
        lookAhead = 4;
        lookH = 0.7;
        break;
      case 'capo':
        dist = -0.15;
        height = 1.05;
        lookAhead = 10;
        lookH = 0.9;
        break;
      default:
        // Más baja y algo más cerca con la velocidad: el suelo pasa más rápido
        dist = 4.5 + sr * 0.2;
        height = 1.9 - sr * 0.3;
        lookAhead = 4.8 + sr * 1.5;
        lookH = 0.85;
    }
    if (!onboard) {
      // Acelerar: la cámara se queda atrás; frenar: se echa encima y mira algo más abajo
      dist += clamp(this.sAx * 0.05, -0.55, 0.35);
      lookH -= clamp(-this.sAx * 0.012, 0, 0.18);
    }
    // En vertical (móvil) alejamos y subimos la cámara para ver más pista
    const narrow = Math.max(0, 1 - cam.aspect);
    if (!onboard) {
      dist *= 1 + narrow * 0.55;
      height += narrow * 1.6;
    }
    // En curva la cámara se abre hacia fuera (ay > 0 = curva a izquierdas → fuera es la derecha)
    const side = onboard ? 0 : clamp(-this.sAy * 0.03, -0.6, 0.6);
    const tx = x - fx * dist + lx * side;
    const tz = z - fz * dist + lz * side;
    const ty = y + height - slope * dist * 0.5;
    if (this.first || onboard) {
      this.pos.set(tx, ty, tz);
      this.first = false;
    } else {
      this.pos.x = damp(this.pos.x, tx, 12, dt);
      this.pos.z = damp(this.pos.z, tz, 12, dt);
      this.pos.y = damp(this.pos.y, ty, 6, dt);
    }
    this.look.set(x + fx * lookAhead - lx * side * 0.4, y + lookH + slope * lookAhead * 0.5, z + fz * lookAhead - lz * side * 0.4);
    cam.position.copy(this.pos);
    // Sin zumbido de fondo: en asfalto la imagen va limpia, así cada superficie se nota.
    // Piano: traqueteo rítmico, un golpe por resalte (más rápido cuanto más corres)
    if (dyn.kerb > 0.01) {
      this.kerbPh += dt * Math.min(34, Math.max(9, dyn.speed / 0.55)) * Math.PI * 2;
      const tooth = Math.sin(this.kerbPh) > 0 ? 1 : -1;
      const a = (onboard ? 0.03 : 0.045) * Math.min(1, dyn.kerb * 1.5) * Math.min(1, 0.4 + dyn.speed / 20);
      cam.position.y += tooth * a;
      this.jolt = tooth * a * 0.22;
    } else if (dyn.off > 0.01) {
      // Fuera de pista: botes irregulares y graves, la cámara cabecea y se ladea
      const b = Math.sin(this.t * 23) * 0.5 + Math.sin(this.t * 37 + 1.1) * 0.3 + Math.sin(this.t * 11 + 2.3) * 0.4;
      const a = (onboard ? 0.05 : 0.075) * dyn.off;
      cam.position.y += b * a;
      cam.position.x += Math.sin(this.t * 17 + 0.5) * a * 0.5;
      this.jolt = Math.sin(this.t * 13 + 0.9) * dyn.off * 0.018;
    } else this.jolt = 0;
    if (this.shake > 0.001) {
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 6, dt);
    }
    cam.lookAt(this.look);
    // Inclinación con la fuerza lateral (como la cabeza del piloto): ~2° por g, más a bordo
    const rollTarget = clamp(this.sAy / 9.81, -1.7, 1.7) * (onboard ? 0.06 : 0.032);
    this.roll = damp(this.roll, rollTarget, 5, dt);
    cam.rotateZ(this.roll + this.jolt);
    // FOV: se abre con la velocidad (curva progresiva) y con la aceleración
    const baseFov = onboard ? 72 : 62;
    const narrowF = Math.max(0, 1 - cam.aspect);
    this.punch = damp(this.punch, 0, 3, dt);
    const targetFov = baseFov + narrowF * 26 + Math.pow(Math.min(1.2, sr), 1.6) * 14 + clamp(this.sAx, 0, 6) * 0.5 + this.punch + (boost ? 8 : 0);
    this.fov = damp(this.fov, targetFov, 3.5, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  /**
   * Barrido cinematográfico de la parrilla (antes del semáforo): grúa que baja desde
   * delante de la parrilla y termina detrás del kart, donde empieza la persecución.
   * u = 0…1 del recorrido; from/to en coordenadas del mundo.
   */
  crane(u: number, gridCenter: THREE.Vector3, gridYaw: number, kart: THREE.Vector3, kartYaw: number): void {
    const cam = this.camera;
    const e = u * u * (3 - 2 * u);
    const fx = Math.sin(gridYaw);
    const fz = Math.cos(gridYaw);
    // Inicio: alto, delante de la parrilla y a un lado, mirando hacia ella
    const a = new THREE.Vector3(gridCenter.x + fx * 16 + fz * 9, gridCenter.y + 9, gridCenter.z + fz * 16 - fx * 9);
    // Final: posición de persecución detrás del kart del jugador
    const kx = Math.sin(kartYaw);
    const kz = Math.cos(kartYaw);
    const b = new THREE.Vector3(kart.x - kx * 4.9, kart.y + 1.95, kart.z - kz * 4.9);
    // Curva: pasa por un lateral bajo (efecto travelling)
    const mid = new THREE.Vector3((a.x + b.x) / 2 - fz * 8, Math.max(a.y, b.y) * 0.5 + 1.2, (a.z + b.z) / 2 + fx * 8);
    const p = a.clone().multiplyScalar((1 - e) * (1 - e)).addScaledVector(mid, 2 * e * (1 - e)).addScaledVector(b, e * e);
    cam.position.copy(p);
    const look = gridCenter.clone().lerp(new THREE.Vector3(kart.x + kx * 4.8, kart.y + 0.85, kart.z + kz * 4.8), e);
    cam.lookAt(look);
    cam.fov = 50 + e * 12;
    this.fov = cam.fov;
    cam.updateProjectionMatrix();
    // Al terminar, la persecución arranca desde aquí sin salto
    this.pos.copy(p);
    this.yaw = kartYaw;
    this.first = false;
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
