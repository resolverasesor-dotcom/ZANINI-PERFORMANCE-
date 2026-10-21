import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Quality } from '../core/Settings';

/**
 * Gradación final: viñeta, contraste/saturación, aberración cromática y un leve
 * desenfoque radial con la velocidad (más fuerte con el turbo).
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSpeed: { value: 0 },
    uVignette: { value: 0.32 },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSpeed;
    uniform float uVignette;
    uniform float uSat;
    uniform float uContrast;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      // Aberración cromática y desenfoque radial en los bordes, según la velocidad
      float ca = uSpeed * 0.006 * r;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca).b;
      if (uSpeed > 0.01) {
        vec3 acc = col;
        for (int i = 1; i <= 4; i++) {
          float k = float(i) * 0.012 * uSpeed * smoothstep(0.15, 0.7, r);
          acc += texture2D(tDiffuse, vUv - c * k).rgb;
        }
        col = acc / 5.0;
      }
      // Contraste y saturación
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat) * uTint;
      // Viñeta
      col *= 1.0 - uVignette * smoothstep(0.35, 0.85, r);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** Cadena de postproducción (solo en calidad media/alta). */
export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private speed = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    quality: Quality,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: quality === 'alto' ? 4 : 2,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** 0..1 sensación de velocidad (líneas, aberración y desenfoque). */
  setSpeed(v: number): void {
    this.speed += (v - this.speed) * 0.15;
    this.grade.uniforms.uSpeed.value = this.speed;
  }

  /** Ajustes por ambiente (de noche más bloom, al atardecer tinte cálido...). */
  setLook(look: { bloom?: number; threshold?: number; vignette?: number; sat?: number; tint?: string }): void {
    this.bloom.strength = look.bloom ?? 0.55;
    this.bloom.threshold = look.threshold ?? 0.82;
    this.grade.uniforms.uVignette.value = look.vignette ?? 0.32;
    this.grade.uniforms.uSat.value = look.sat ?? 1.12;
    (this.grade.uniforms.uTint.value as THREE.Color).set(look.tint ?? '#ffffff');
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
