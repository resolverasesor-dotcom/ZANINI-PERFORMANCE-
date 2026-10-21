import * as THREE from 'three';
import { rng } from '../core/math';

// Vida en el circuito: público que hace la ola, banderas al viento, oleaje y gaviotas.
// Todo se anima en el shader con un uniforme de tiempo compartido (coste ~0 en CPU).

export type TimeUniform = { value: number };

/** Público: saltan y hacen "la ola" a lo largo de la grada. */
export function crowdMaterial(time: TimeUniform): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.04 + instanceMatrix[3].z * 0.04;
      #else
        float ph = 0.0;
      #endif
      float wave = sin(uTime * 2.0 - position.x * 0.3 - ph);
      float jump = max(0.0, sin(uTime * 9.0 + position.x * 3.1 + position.z * 5.0 + ph));
      transformed.y += max(0.0, wave) * 0.5 + jump * 0.07;`,
    );
  };
  m.customProgramCacheKey = () => 'crowd';
  return m;
}

/** Tela de bandera ondeando (la geometría va de x=0 en el mástil a x=ancho). */
export function flagMaterial(time: TimeUniform, width: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float fph = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
      #else
        float fph = 0.0;
      #endif
      float k = position.x / ${width.toFixed(2)};
      transformed.z += sin(uTime * 6.0 - position.x * 2.4 + fph) * 0.22 * k;
      transformed.y += sin(uTime * 4.0 - position.x * 1.7 + fph) * 0.06 * k;`,
    );
  };
  m.customProgramCacheKey = () => 'flag' + width;
  return m;
}

/** Mar con oleaje (desplazamiento + normales) y reflejos del cielo. */
export function seaMaterial(time: TimeUniform, map: THREE.Texture, reflective: boolean): THREE.Material {
  const m = reflective
    ? new THREE.MeshStandardMaterial({ map, color: '#8fd0ff', roughness: 0.12, metalness: 0.05 })
    : new THREE.MeshLambertMaterial({ map, color: '#9fd6ff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `float wx = position.x * 0.045 + uTime * 1.1;
        float wy = position.y * 0.06 + uTime * 0.8;
        float wz = (position.x + position.y) * 0.11 + uTime * 1.9;
        vec3 objectNormal = normalize(vec3(-cos(wx) * 0.045 * 0.5 - cos(wz) * 0.11 * 0.12, -cos(wy) * 0.06 * 0.4 - cos(wz) * 0.11 * 0.12, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += sin(wx) * 0.5 + sin(wy) * 0.4 + sin(wz) * 0.12;`,
      );
  };
  m.customProgramCacheKey = () => 'sea' + reflective;
  return m;
}

/** Bandada de gaviotas que planea en círculos y aletea de vez en cuando. */
export class Gulls {
  readonly group = new THREE.Group();
  private birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; cx: number; cz: number; r: number; h: number; sp: number; ph: number }[] = [];

  constructor(cx: number, cz: number, y: number, count: number, seed = 3) {
    const rand = rng(seed);
    const white = new THREE.MeshLambertMaterial({ color: '#f7f7f7', side: THREE.DoubleSide });
    const grey = new THREE.MeshLambertMaterial({ color: '#8e959c', side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.3, 0.05, -0.45], 3));
    wingGeo.computeVertexNormals();
    const bodyGeo = new THREE.ConeGeometry(0.16, 0.9, 5);
    bodyGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, white));
      const wl = new THREE.Mesh(wingGeo, grey);
      const wr = new THREE.Mesh(wingGeo, grey);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.scale.setScalar(1.6);
      this.group.add(g);
      this.birds.push({ g, wl, wr, cx: cx + (rand() - 0.5) * 120, cz: cz + (rand() - 0.5) * 60, r: 20 + rand() * 40, h: y + 18 + rand() * 20, sp: (0.15 + rand() * 0.15) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6.28 });
    }
  }

  update(t: number): void {
    for (const b of this.birds) {
      const a = t * b.sp + b.ph;
      b.g.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + b.ph) * 2, b.cz + Math.sin(a) * b.r);
      // mira en la dirección de vuelo
      b.g.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI);
      b.g.rotation.z = -Math.sign(b.sp) * 0.25;
      const flap = Math.sin(t * 2.3 + b.ph) > 0.4 ? Math.sin(t * 14 + b.ph) * 0.6 : 0.12;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
    }
  }
}
