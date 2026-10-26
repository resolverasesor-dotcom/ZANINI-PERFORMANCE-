import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import { DRIVERS } from '../ai/Drivers';
import { DEDICATION } from '../config';
import { clamp } from '../core/math';
import { DEBUG } from '../core/debug';
import { buildKart, wavePennant, type KartLook, type KartMesh } from '../engine/KartModel';
import { glowTex } from '../engine/textures';
import { CIRCUITS } from '../track/circuits/index';
import { el, esc, logoHTML } from '../ui/dom';

// Intro cinemática: un cortometraje hecho con el propio motor del juego.
// Garaje de madrugada, un padre, un kart bajo una sábana, un motor que no quiere
// arrancar… y la verdad sobre cómo se conduce este juego. Termina con la dedicatoria.

interface Caption {
  t: number;
  text: string;
  dur: number;
  cls?: string;
}

interface Cue {
  t: number;
  fn: () => void;
  done?: boolean;
}

/** Duración total (s). */
const END = 50;

const ease = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

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

export class Intro {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
  private t = 0;
  private kart: KartMesh;
  private sheet: THREE.Mesh;
  private door: THREE.Mesh;
  private bulb: THREE.PointLight;
  private bulbSpot: THREE.SpotLight;
  private bulbMesh: THREE.Mesh;
  private tubes: THREE.Mesh[] = [];
  private tubeLight: THREE.HemisphereLight;
  private rim: THREE.SpotLight;
  private sun: THREE.DirectionalLight;
  private puffs: { m: THREE.Sprite; v: THREE.Vector3; life: number }[] = [];
  private puffMat: THREE.SpriteMaterial;
  private overlay: HTMLDivElement;
  private capEl: HTMLDivElement;
  private fade: HTMLDivElement;
  private finale: HTMLDivElement;
  private captions: Caption[];
  private cues: Cue[];
  private curCap: Caption | null = null;
  private shake = 0;
  private engineOn = false;
  private rev = 0;
  private drive = { on: false, z: 0, v: 0 };
  private hopT = -1;
  private disposables: { dispose(): void }[] = [];
  private finished = false;
  private bulbFlicker = -1;
  private tubesOn = -1;

  constructor(
    ui: HTMLElement,
    private audio: AudioEngine,
    look: KartLook,
    reflective: boolean,
    private onDone: () => void,
  ) {
    const sc = this.scene;
    sc.background = new THREE.Color('#050507');
    sc.fog = new THREE.Fog('#050507', 9, 40);

    // ---------- Garaje ----------
    const concrete = canvasTex(512, 512, (g) => {
      g.fillStyle = '#5a5853';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) {
        const v = 70 + Math.random() * 40;
        g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      // mancha de aceite y juntas de dilatación
      const oil = g.createRadialGradient(300, 260, 5, 300, 260, 90);
      oil.addColorStop(0, 'rgba(10,10,12,0.75)');
      oil.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = oil;
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = 'rgba(30,30,30,0.6)';
      g.fillRect(0, 255, 512, 3);
      g.fillRect(255, 0, 3, 512);
    });
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    concrete.repeat.set(2, 2);
    const wallTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#7d7a72';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) g.fillRect(x, y, 62, 30);
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(3, 1.2);
    this.disposables.push(concrete, wallTex);
    const mat = (o: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, ...o });
      this.disposables.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.disposables.push(g);
      const b = new THREE.Mesh(g, m);
      b.position.set(x, y, z);
      b.rotation.y = ry;
      b.castShadow = b.receiveShadow = true;
      sc.add(b);
      return b;
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), mat({ map: concrete }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    sc.add(floor);
    const wm = mat({ map: wallTex, side: THREE.DoubleSide });
    box(9, 3.2, 0.2, wm, 0, 1.6, -5.5);
    box(0.2, 3.2, 11, wm, -4.5, 1.6, 0);
    box(0.2, 3.2, 11, wm, 4.5, 1.6, 0);
    box(9, 0.2, 11, mat({ color: '#3a3936' }), 0, 3.3, 0);
    // Fachada de la puerta (dintel y laterales)
    box(9, 0.6, 0.2, wm, 0, 3.0, 5.5);
    // Persiana metálica
    const doorTex = canvasTex(64, 256, (g) => {
      g.fillStyle = '#9aa0a6';
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = '#6d737a';
      for (let y = 0; y < 256; y += 10) g.fillRect(0, y, 64, 3);
    });
    doorTex.wrapS = doorTex.wrapT = THREE.RepeatWrapping;
    doorTex.repeat.set(6, 1);
    this.disposables.push(doorTex);
    this.door = box(8.6, 2.7, 0.08, mat({ map: doorTex, metalness: 0.5, roughness: 0.5 }), 0, 1.35, 5.45);

    // Banco de trabajo con cafés
    const wood = mat({ color: '#7a5532' });
    box(1.0, 0.08, 4.2, wood, -3.9, 0.95, -1.4);
    for (const z of [-3.3, 0.5]) for (const x of [-4.3, -3.5]) box(0.08, 0.95, 0.08, wood, x, 0.47, z);
    const mugCols = ['#ffffff', '#D7261E', '#FFC300', '#1E6FE0', '#43A047'];
    const mugG = new THREE.CylinderGeometry(0.06, 0.055, 0.12, 10);
    this.disposables.push(mugG);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(mugG, mat({ color: mugCols[i % mugCols.length] }));
      const stackH = i >= 10 ? (i - 9) * 0.125 : 0;
      m.position.set(-3.75 - (i % 3) * 0.12 + (i >= 10 ? 0.12 : 0), 1.05 + stackH, -2.9 + (i % 10) * 0.2 * (i >= 10 ? 0 : 1) + (i >= 10 ? -0.4 : 0));
      m.castShadow = true;
      sc.add(m);
    }
    // Panel de herramientas
    const peg = canvasTex(512, 256, (g) => {
      g.fillStyle = '#c9a66b';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = 'rgba(60,40,20,0.55)';
      for (let y = 10; y < 256; y += 20) for (let x = 10; x < 512; x += 20) g.fillRect(x, y, 3, 3);
      g.strokeStyle = '#2d2f35';
      g.lineCap = 'round';
      // llaves, martillo, destornilladores
      for (let i = 0; i < 6; i++) {
        g.lineWidth = 9 - i;
        g.beginPath();
        g.moveTo(40 + i * 34, 40);
        g.lineTo(40 + i * 34, 140 + i * 8);
        g.stroke();
        g.beginPath();
        g.arc(40 + i * 34, 32, 12 - i, 0.6, Math.PI * 2 - 0.6);
        g.stroke();
      }
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(300, 60);
      g.lineTo(300, 200);
      g.stroke();
      g.fillStyle = '#2d2f35';
      g.fillRect(270, 40, 60, 28);
      const cols = ['#D7261E', '#FFC300', '#1E6FE0'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = cols[i];
        g.fillRect(370 + i * 40, 50, 16, 60);
        g.fillStyle = '#999';
        g.fillRect(376 + i * 40, 110, 4, 70);
      }
    });
    this.disposables.push(peg);
    const pegM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), mat({ map: peg }));
    pegM.position.set(-4.38, 1.85, -1.6);
    pegM.rotation.y = Math.PI / 2;
    sc.add(pegM);
    // Plano del "proyecto"
    const blue = canvasTex(512, 360, (g) => {
      g.fillStyle = '#1d4e9e';
      g.fillRect(0, 0, 512, 360);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      for (let x = 0; x < 512; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 360);
        g.stroke();
      }
      for (let y = 0; y < 360; y += 16) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(512, y);
        g.stroke();
      }
      g.strokeStyle = '#fff';
      g.lineWidth = 4;
      // kart visto desde arriba
      g.strokeRect(170, 90, 170, 220);
      for (const [x, y] of [
        [140, 110],
        [340, 110],
        [130, 250],
        [350, 250],
      ])
        g.strokeRect(x, y, 34, 50);
      g.beginPath();
      g.arc(255, 200, 30, 0, Math.PI * 2);
      g.stroke();
      g.font = 'bold 34px Arial';
      g.fillStyle = '#fff';
      g.fillText('PROYECTO ALE', 140, 55);
      g.font = 'italic 20px Arial';
      g.fillText('v.47 (esta sí)', 360, 340);
      g.fillText('¿turbo? NO', 18, 330);
      g.strokeStyle = '#ffd43b';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(255, 200, 70, 0.3, 2.4);
      g.stroke();
    });
    this.disposables.push(blue);
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), mat({ map: blue, roughness: 0.95 }));
    bp.position.set(-1.2, 1.9, -5.38);
    sc.add(bp);
    // Lavadora "donante" (sin puerta: ya sabemos dónde acabó)
    box(0.7, 0.85, 0.65, mat({ color: '#eceff1' }), -3.9, 0.43, 2.1);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), mat({ color: '#111' }));
    hole.position.set(-3.54, 0.48, 2.1);
    hole.rotation.y = Math.PI / 2;
    sc.add(hole);
    // Neumáticos apilados y bidones
    const tyreG = new THREE.TorusGeometry(0.22, 0.1, 8, 16);
    this.disposables.push(tyreG);
    const rub = mat({ color: '#161616', roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const ty = new THREE.Mesh(tyreG, rub);
      ty.rotation.x = Math.PI / 2;
      ty.position.set(3.6, 0.1 + i * 0.2, -4.4);
      ty.castShadow = true;
      sc.add(ty);
    }
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14), mat({ color: i === 1 ? '#D7261E' : '#2b5fb4', metalness: 0.4 }));
      c.position.set(3.7 - i * 0.48, 0.3, 3.9);
      c.castShadow = true;
      sc.add(c);
    }
    // Calendario de pared
    const cal = canvasTex(128, 160, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#D7261E';
      g.fillRect(0, 0, 128, 36);
      g.fillStyle = '#fff';
      g.font = 'bold 20px Arial';
      g.fillText('CARRERA', 14, 26);
      g.fillStyle = '#222';
      for (let i = 0; i < 30; i++) g.fillText(i === 13 ? '♥' : '·', 10 + (i % 6) * 19, 60 + Math.floor(i / 6) * 22);
    });
    this.disposables.push(cal);
    const calM = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), mat({ map: cal }));
    calM.position.set(1.4, 1.8, -5.38);
    sc.add(calM);

    // ---------- Luces ----------
    this.bulb = new THREE.PointLight('#ffd9a0', 0, 9, 1.6);
    this.bulb.position.set(0, 2.6, 0.2);
    sc.add(this.bulb);
    // La sombra la proyecta un foco desde la bombilla (una sola pasada, barato en móvil)
    this.bulbSpot = new THREE.SpotLight('#ffd9a0', 0, 8, 1.1, 0.8, 1.4);
    this.bulbSpot.position.copy(this.bulb.position);
    this.bulbSpot.target.position.set(0, 0, 0);
    this.bulbSpot.castShadow = reflective;
    this.bulbSpot.shadow.mapSize.set(1024, 1024);
    sc.add(this.bulbSpot, this.bulbSpot.target);
    const bm = new THREE.MeshBasicMaterial({ color: '#332a1a' });
    this.disposables.push(bm);
    this.bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bm);
    this.bulbMesh.position.copy(this.bulb.position);
    sc.add(this.bulbMesh);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), mat({ color: '#111' }));
    cord.position.set(0, 2.95, 0.2);
    sc.add(cord);
    this.tubeLight = new THREE.HemisphereLight('#e6f0ff', '#3a3630', 0);
    sc.add(this.tubeLight);
    for (const x of [-2, 2]) {
      const tm = new THREE.MeshBasicMaterial({ color: '#222' });
      this.disposables.push(tm);
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 2.4), tm);
      tb.position.set(x, 3.17, 0);
      sc.add(tb);
      this.tubes.push(tb);
    }
    this.rim = new THREE.SpotLight('#ff3020', 0, 14, 0.6, 0.5, 1);
    this.rim.position.set(-2.5, 2.8, -4.5);
    this.rim.target.position.set(0, 0.3, 0);
    sc.add(this.rim, this.rim.target);
    this.sun = new THREE.DirectionalLight('#fff4e0', 0);
    this.sun.position.set(3, 10, 20);
    sc.add(this.sun);
    sc.add(new THREE.AmbientLight('#6a6070', 0.35));

    // ---------- Exterior (se ve al subir la persiana) ----------
    const outside = new THREE.Group();
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), mat({ color: '#5e9b3c' }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.01, 46);
    outside.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 80), mat({ color: '#38393d' }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.0, 46);
    outside.add(road);
    for (let i = 0; i < 16; i++) {
      for (const s of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.2), mat({ color: i % 2 ? '#D7261E' : '#ffffff' }));
        k.position.set(s * 3.7, 0.02, 7 + i * 1.2);
        outside.add(k);
      }
    }
    for (let i = 0; i < 10; i++) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4, 6), mat({ color: '#8a6a45' }));
      trunk.position.y = 2;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.9, 7), mat({ color: '#2f7d32' }));
      top.position.y = 4.1;
      palm.add(trunk, top);
      palm.position.set((i % 2 ? 1 : -1) * (7 + (i % 3)), 0, 12 + i * 5);
      outside.add(palm);
    }
    outside.visible = false;
    sc.add(outside);

    // ---------- El kart ----------
    this.kart = buildKart(look.color, look.number, { ...look, reflective });
    sc.add(this.kart.root);
    // Sábana: un bulto blanco que cubre el kart
    const sg = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = sg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // arrugas de tela
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r2 = Math.min(1, x * x + z * z);
      pos.setY(i, Math.pow(Math.max(0, 1 - r2 * r2), 0.25) * (1 + 0.06 * Math.sin(x * 9) * Math.cos(z * 7)));
    }
    sg.computeVertexNormals();
    this.sheet = new THREE.Mesh(sg, mat({ color: '#bdb6a6', roughness: 1, side: THREE.DoubleSide }));
    this.sheet.scale.set(0.95, 1.3, 1.3);
    this.sheet.castShadow = true;
    sc.add(this.sheet);
    this.disposables.push(sg);
    this.puffMat = new THREE.SpriteMaterial({ map: glowTex(), color: '#9a9a9a', transparent: true, opacity: 0.6, depthWrite: false });
    this.disposables.push(this.puffMat);

    // ---------- Capa de texto ----------
    this.overlay = el('div', 'intro');
    this.overlay.innerHTML = `<div class="intro-bar top"></div><div class="intro-bar bottom"></div>
      <div class="intro-cap"></div><div class="intro-fade"></div><div class="intro-finale"></div>
      <button class="btn intro-skip" data-skip>Saltar ⏭</button>`;
    ui.appendChild(this.overlay);
    this.capEl = this.overlay.querySelector('.intro-cap')!;
    this.fade = this.overlay.querySelector('.intro-fade')!;
    this.finale = this.overlay.querySelector('.intro-finale')!;
    const skip = this.overlay.querySelector<HTMLButtonElement>('[data-skip]')!;
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.end();
    });
    this.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (this.t > END - 3.5 && (e.key === 'Enter' || e.key === ' '))) this.end();
    };
    window.addEventListener('keydown', this.onKey);
    this.overlay.addEventListener('pointerdown', () => {
      if (this.t > END - 3.5) this.end();
    });

    const nC = CIRCUITS.length;
    const nR = DRIVERS.length;
    this.captions = [
      { t: 0.4, text: 'Alicante. Un garaje cualquiera.<br><small>03:47 de la madrugada.</small>', dur: 3.6, cls: 'place' },
      { t: 4.3, text: 'Un padre. Una llave inglesa.<br>Y un plan que no cabía en el garaje.', dur: 3.8 },
      { t: 8.4, text: 'Presupuesto: <b>0 €</b>.', dur: 1.9 },
      { t: 10.3, text: 'Piezas: una lavadora, dos sillas de oficina<br>y muchísima fe.', dur: 3.1 },
      { t: 13.6, text: 'Cuarenta y siete cafés después…', dur: 2.2 },
      { t: 16.3, text: '…nació el <b class="red">ZANINI PERFORMANCE</b>.', dur: 3.2, cls: 'big' },
      { t: 19.8, text: 'Primer intento.', dur: 1.6 },
      { t: 21.6, text: 'Segundo intento.', dur: 1.4 },
      { t: 23.4, text: '<small>(Eso no era la bocina.)</small>', dur: 1.6 },
      { t: 25.1, text: 'Tercer intento…', dur: 1.5 },
      { t: 28.0, text: 'Aquí no hay turbos. Ni misiles. Ni plátanos.', dur: 2.6 },
      { t: 30.7, text: 'Física de verdad: si entras pasado,<br>la zaga te pasa factura.', dur: 2.7 },
      { t: 33.5, text: 'Se derrapa como en los karts de verdad:<br>gas, volante… y valor.', dur: 2.8 },
      { t: 36.4, text: '¿Y el botón <b class="yellow">SALTITO</b>? Ciencia pura.<br><small>(Bueno… casi.)</small>', dur: 2.6 },
      { t: 40.2, text: `${nR} rivales. ${nC} circuitos. Cero piedad.`, dur: 2.6, cls: 'big' },
      { t: 43.0, text: 'Pero este kart lo conduce alguien muy especial…', dur: 2.6 },
    ];
    const a = this.audio;
    this.cues = [
      { t: 1.4, fn: () => (a.lampOn(), (this.bulbFlicker = 0)) },
      { t: 15.4, fn: () => a.whoosh() },
      { t: 15.9, fn: () => ((this.rim.intensity = 60), a.stinger()) },
      { t: 20.2, fn: () => (a.crankCough(), this.smoke(4)) },
      { t: 22.0, fn: () => (a.crankCough(), this.smoke(3)) },
      { t: 22.9, fn: () => (a.backfire(), this.backfire()) },
      { t: 23.5, fn: () => a.sadTrombone() },
      { t: 25.9, fn: () => (a.crankCough(), this.smoke(3)) },
      { t: 26.6, fn: () => ((this.engineOn = true), (this.rev = 1), (this.shake = 0.6), this.smoke(8)) },
      { t: 27.1, fn: () => (a.fluoro(), (this.tubesOn = 0)) },
      { t: 37.1, fn: () => this.hop() },
      { t: 37.7, fn: () => this.hop() },
      { t: 38.6, fn: () => (a.rollerDoor(2.3), (outside.visible = true)) },
      { t: 41.0, fn: () => ((this.drive.on = true), (this.rev = 1)) },
      { t: 45.6, fn: () => this.showFinale(1) },
      { t: 47.6, fn: () => this.showFinale(2) },
      { t: 48.6, fn: () => this.showFinale(3) },
    ];
    this.audio.setMusicEnabled(false, true);
  }

  private onKey: (e: KeyboardEvent) => void;

  private smoke(n: number): void {
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.puffMat.clone());
      this.kart.flame.getWorldPosition(p);
      s.position.copy(p);
      s.scale.setScalar(0.25);
      this.scene.add(s);
      this.puffs.push({ m: s, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, -0.8 - Math.random()), life: 0 });
    }
  }

  private backfire(): void {
    this.kart.flame.visible = true;
    this.kart.flame.scale.setScalar(2.2);
    this.shake = 1;
    this.smoke(10);
    setTimeout(() => (this.kart.flame.visible = false), 180);
  }

  private hop(): void {
    this.hopT = 0;
    this.audio.hop();
  }

  private showFinale(stage: number): void {
    if (stage === 1) {
      this.fade.style.opacity = '1';
      this.audio.sweetChord();
      this.finale.innerHTML = `<div class="if-ded">${esc(DEDICATION)} <span class="heart">♥</span></div>`;
      this.finale.classList.add('on');
    } else if (stage === 2) {
      this.finale.insertAdjacentHTML('beforeend', `<div class="if-logo">${logoHTML('big')}</div>`);
      this.audio.goBeep();
    } else {
      this.finale.insertAdjacentHTML('beforeend', `<div class="if-press">Toca para arrancar ▶</div>`);
    }
  }

  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.audio.updateEngines(null, []);
    this.onDone();
  }

  /** Avanza la intro y coloca la cámara. */
  update(dtIn: number, aspect: number): void {
    const dt = dtIn * DEBUG.timeScale;
    const t = (this.t += dt);
    if (t > END + 6) this.end();
    this.overlay.dataset.t = t.toFixed(2);
    for (const c of this.cues) {
      if (!c.done && t >= c.t) {
        c.done = true;
        c.fn();
      }
    }
    // Subtítulos con efecto de máquina de escribir
    const cap = this.captions.find((c) => t >= c.t && t < c.t + c.dur) ?? null;
    if (cap !== this.curCap) {
      this.curCap = cap;
      this.capEl.className = 'intro-cap ' + (cap?.cls ?? '');
      this.capEl.innerHTML = cap ? `<span>${cap.text}</span>` : '';
      this.capEl.style.opacity = cap ? '1' : '0';
    }
    if (cap) {
      const k = clamp((t - cap.t) / 0.25, 0, 1);
      const out = clamp((cap.t + cap.dur - t) / 0.3, 0, 1);
      this.capEl.style.opacity = String(Math.min(k, out));
      (this.capEl.firstElementChild as HTMLElement).style.transform = `translateY(${(1 - k) * 10}px)`;
    }
    // Fundido de entrada
    if (t < 1.2) this.fade.style.opacity = String(1 - t / 1.2);
    else if (t < 45) this.fade.style.opacity = '0';

    // Bombilla con parpadeo al encenderse
    if (this.bulbFlicker >= 0) {
      this.bulbFlicker += dt;
      const f = this.bulbFlicker;
      const on = f > 0.5 || (f > 0.08 && f < 0.14) || (f > 0.26 && f < 0.36);
      const lvl = on ? (this.tubesOn >= 0 ? 0.5 : 1) : 0;
      this.bulb.intensity = 6 * lvl * (1 + Math.sin(t * 37) * 0.03);
      this.bulbSpot.intensity = 7 * lvl;
      (this.bulbMesh.material as THREE.MeshBasicMaterial).color.set(on ? '#fff3d0' : '#332a1a');
    }
    // Fluorescentes
    if (this.tubesOn >= 0) {
      this.tubesOn += dt;
      const f = this.tubesOn;
      const on = f > 0.6 || (f > 0.05 && f < 0.1) || (f > 0.2 && f < 0.24) || (f > 0.45 && f < 0.5);
      this.tubeLight.intensity = on ? 1.6 : 0;
      for (const tb of this.tubes) (tb.material as THREE.MeshBasicMaterial).color.set(on ? '#f4fbff' : '#222');
      this.rim.intensity = Math.max(12, this.rim.intensity - dt * 30);
    }
    // Persiana: sube y entra el día
    const door = ease((t - 38.6) / 2.3);
    this.door.position.y = 1.35 + door * 2.7;
    this.sun.intensity = door * 2.4;
    if (door > 0) {
      (this.scene.background as THREE.Color).set('#050507').lerp(new THREE.Color('#8ec8f0'), door);
      (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
      (this.scene.fog as THREE.Fog).far = 40 + door * 80;
    }

    // Sábana: sale volando
    const sh = clamp((t - 15.3) / 1.1, 0, 1);
    this.sheet.position.set(sh * -1.2, 0.0 + sh * sh * 4.5, sh * -2.4);
    this.sheet.rotation.set(sh * -1.2, sh * 2.2, sh * 0.6);
    this.sheet.visible = sh < 1;
    if (this.kart.pennant) this.kart.pennant.visible = sh > 0.3;

    // Kart: motor al ralentí (vibración), saltitos y salida del garaje
    const k = this.kart;
    if (this.drive.on) {
      this.drive.v = Math.min(14, this.drive.v + dt * 6.5);
      this.drive.z += this.drive.v * dt;
    }
    k.root.position.z = this.drive.z;
    for (const w of k.wheels) w.rotation.x += (this.drive.v / 0.16) * dt;
    const idle = this.engineOn ? 0.006 : 0;
    k.body.position.y = idle * Math.sin(t * 90);
    k.body.rotation.z = idle * 0.6 * Math.sin(t * 73);
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / 0.3;
      k.body.position.y += u < 1 ? Math.sin(u * Math.PI) * 0.12 : 0;
      k.helmet.position.y = 1.0 + (u < 1 ? Math.sin(u * Math.PI) * 0.08 : 0);
      if (u >= 1) this.hopT = -1;
    }
    wavePennant(k, t, this.drive.v);
    if (k.brakeMat) k.brakeMat.color.set(this.engineOn && !this.drive.on && t > 26.6 && t < 27.4 ? '#ff2a10' : '#3a0505');
    // Sonido del motor
    if (this.engineOn && !this.finished) {
      this.rev = Math.max(0, this.rev - dt * (this.drive.on ? 0.15 : 1.4));
      const rpm = this.drive.on ? 0.35 + (this.drive.v / 14) * 0.6 : 0.08 + this.rev * 0.55;
      const fadeOut = t > 45.6 ? clamp(1 - (t - 45.6) / 1.5, 0, 1) : 1;
      this.audio.updateEngines({ rpm: rpm * fadeOut, load: this.drive.on || this.rev > 0.3 ? 1 : 0.2 }, []);
    }
    // Humo
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(0.25 + p.life * 1.4);
      (p.m.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.55 - p.life * 0.35);
      if (p.life > 1.6) {
        this.scene.remove(p.m);
        (p.m.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    this.placeCamera(t, aspect);
  }

  private placeCamera(t: number, aspect: number): void {
    const cam = this.camera;
    cam.aspect = aspect;
    // En vertical se abre el plano para que quepa el kart
    const wide = aspect < 1 ? 1.5 : 1;
    cam.fov = aspect < 1 ? 62 : 42;
    cam.updateProjectionMatrix();
    const P = new THREE.Vector3();
    const L = new THREE.Vector3();
    const kz = this.kart.root.position.z;
    if (t < 8.2) {
      // A: entrando en el garaje en penumbra hacia el banco
      const u = ease(t / 8.2);
      P.set(lerp(2.6, 0.8, u), lerp(2.4, 1.7, u), lerp(4.6, 2.2, u));
      L.set(lerp(-1, -3.2, u), lerp(1.2, 1.3, u), lerp(-2, -1.6, u));
    } else if (t < 13.4) {
      // B: travelling por el banco: cafés, plano, lavadora
      const u = ease((t - 8.2) / 5.2);
      P.set(-1.9, 1.85, lerp(-3.8, 1.6, u));
      L.set(-4.0, lerp(1.25, 0.6, u), lerp(-2.6, 2.3, u));
    } else if (t < 19.6) {
      // C/D: giro alrededor del bulto; la sábana sale volando y se revela el kart
      const u = (t - 13.4) / 6.2;
      const ang = lerp(-0.9, 0.55, ease(u));
      const r = lerp(3.4, 2.6, ease(u)) * wide;
      P.set(Math.sin(ang) * r, lerp(1.6, 0.55, ease(u)), Math.cos(ang) * r);
      L.set(0, lerp(0.5, 0.6, ease(u)), 0);
    } else if (t < 27.6) {
      // E: tres cuartos trasero, junto al motor
      const u = ease((t - 19.6) / 8);
      P.set(lerp(2.5, 2.2, u) * wide, lerp(1.05, 1.2, u), lerp(-2.9, -3.2, u) * wide);
      L.set(0.15, 0.45, -0.2);
    } else if (t < 38.4) {
      // F: plano bajo, girando lentamente alrededor del kart
      const u = (t - 27.6) / 10.8;
      const ang = 0.5 + u * 2.2;
      const r = 2.7 * wide;
      P.set(Math.sin(ang) * r, 0.5 + Math.sin(u * 3) * 0.1, Math.cos(ang) * r);
      L.set(0, 0.55, 0);
    } else {
      // G: desde el fondo del garaje mirando la puerta; luego sigue al kart
      const u = ease((t - 38.4) / 2.6);
      P.set(lerp(1.2, 0.6, u), lerp(1.3, 1.15, u), lerp(-3.6, -3.0, u) + Math.max(0, kz - 6) * 0.9);
      L.set(0, 0.7, Math.max(3, kz + 2));
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 0.016 * 1.6);
      P.x += (Math.random() - 0.5) * this.shake * 0.08;
      P.y += (Math.random() - 0.5) * this.shake * 0.08;
    }
    cam.position.copy(P);
    cam.lookAt(L);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.overlay.remove();
    for (const p of this.puffs) (p.m.material as THREE.Material).dispose();
    for (const m of this.kart.materials) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    });
  }
}
