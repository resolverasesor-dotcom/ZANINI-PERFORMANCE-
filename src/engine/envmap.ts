import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Mapas de entorno generados por código para los reflejos (sin imágenes HDR).

const cache = new Map<string, THREE.Texture>();

/** Cielo con degradado, suelo y un sol brillante, prefiltrado con PMREM. */
export function skyEnvironment(renderer: THREE.WebGLRenderer, top: string, horizon: string, ground: string, sun: string, sunDir: [number, number, number]): THREE.Texture {
  const key = [top, horizon, ground, sun, ...sunDir].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      ground: { value: new THREE.Color(ground) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, ground, min(1.0, -h * 4.0));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(sun).multiplyScalar(6) }));
  sunMesh.position.set(...sunDir).normalize().multiplyScalar(40);
  scene.add(sunMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  cache.set(key, rt.texture);
  return rt.texture;
}

/** Estudio con luces de techo (menús y podio). */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const hit = cache.get('studio');
  if (hit) return hit;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
  pmrem.dispose();
  cache.set('studio', rt.texture);
  return rt.texture;
}
