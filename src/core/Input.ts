import type { Action, Settings } from './Settings';

/** Estado unificado de controles (teclado + mando + táctil). */
export interface ControlState {
  steer: number;
  throttle: number;
  brake: number;
  drift: boolean;
  respawn: boolean;
  camera: boolean;
  pause: boolean;
  nav: { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean };
}

const DEADZONE = 0.15;

export class Input {
  private down = new Set<string>();
  private edges = new Set<string>();
  private padPrev: boolean[] = [];
  private padEdges = new Set<number>();
  private padAxisPrev = { x: 0, y: 0 };
  /** Estado táctil (lo rellena TouchControls). */
  touch = { left: false, right: false, accel: false, brake: false, drift: false, respawn: false, pause: false, steerAxis: 0 };
  private touchEdges = { respawn: false, pause: false };
  /** Si se asigna, la siguiente tecla pulsada se entrega aquí (reasignar controles). */
  captureNext: ((code: string) => void) | null = null;
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  /** Los controles táctiles están en pantalla (los activa TouchControls). */
  touchVisible = false;

  /** Aceleración automática activa (ajuste + controles táctiles visibles). */
  get autoAccelActive(): boolean {
    return this.settings.autoAccel && this.touchVisible;
  }
  readonly state: ControlState = {
    steer: 0,
    throttle: 0,
    brake: 0,
    drift: false,
    respawn: false,
    camera: false,
    pause: false,
    nav: { up: false, down: false, left: false, right: false, confirm: false, back: false },
  };

  constructor(private settings: Settings) {
    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (typing) return;
      if (!e.repeat) this.edges.add(e.code);
      this.down.add(e.code);
      this.lastDevice = 'keyboard';
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  setSettings(s: Settings): void {
    this.settings = s;
  }

  triggerTouchEdge(kind: 'respawn' | 'pause'): void {
    this.touchEdges[kind] = true;
    this.lastDevice = 'touch';
  }

  private key(action: Action): boolean {
    for (const k of this.settings.keys[action]) if (this.down.has(k)) return true;
    return false;
  }

  private keyEdge(action: Action): boolean {
    for (const k of this.settings.keys[action]) if (this.edges.has(k)) return true;
    return false;
  }

  /** Lee todos los dispositivos. Llamar una vez por frame. */
  poll(): ControlState {
    const s = this.state;
    // Teclado
    let steer = (this.key('right') ? 1 : 0) - (this.key('left') ? 1 : 0);
    let throttle = this.key('accel') ? 1 : 0;
    let brake = this.key('brake') ? 1 : 0;
    let drift = this.key('drift');
    let respawn = this.keyEdge('respawn');
    let camera = this.keyEdge('camera');
    let pause = this.keyEdge('pause');
    const nav = s.nav;
    nav.up = this.edges.has('ArrowUp');
    nav.down = this.edges.has('ArrowDown');
    nav.left = this.edges.has('ArrowLeft');
    nav.right = this.edges.has('ArrowRight');
    nav.confirm = false; // Enter/Espacio los gestiona el navegador sobre el botón enfocado
    nav.back = this.edges.has('Escape') || this.edges.has('Backspace');

    // Mando
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.padEdges.clear();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = (i: number) => (gp.buttons[i] ? gp.buttons[i].value > 0.4 || gp.buttons[i].pressed : false);
      const bv = (i: number) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      for (let i = 0; i < gp.buttons.length; i++) {
        const now = b(i);
        if (now && !this.padPrev[i]) {
          this.padEdges.add(i);
          this.lastDevice = 'gamepad';
        }
        this.padPrev[i] = now;
      }
      let ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.abs(ax) < DEADZONE) ax = 0;
      else ax = Math.sign(ax) * ((Math.abs(ax) - DEADZONE) / (1 - DEADZONE));
      if (ax !== 0) {
        steer = ax;
        this.lastDevice = 'gamepad';
      }
      if (b(14)) steer = -1;
      if (b(15)) steer = 1;
      throttle = Math.max(throttle, bv(7), b(0) ? 1 : 0);
      brake = Math.max(brake, bv(6), b(2) ? 1 : 0);
      drift = drift || b(5) || b(4) || b(1);
      respawn = respawn || this.padEdges.has(3);
      camera = camera || this.padEdges.has(8);
      pause = pause || this.padEdges.has(9);
      nav.up = nav.up || this.padEdges.has(12) || (ay < -0.6 && this.padAxisPrev.y >= -0.6);
      nav.down = nav.down || this.padEdges.has(13) || (ay > 0.6 && this.padAxisPrev.y <= 0.6);
      nav.left = nav.left || this.padEdges.has(14) || (gp.axes[0] < -0.6 && this.padAxisPrev.x >= -0.6);
      nav.right = nav.right || this.padEdges.has(15) || (gp.axes[0] > 0.6 && this.padAxisPrev.x <= 0.6);
      nav.confirm = nav.confirm || this.padEdges.has(0);
      nav.back = nav.back || this.padEdges.has(1);
      this.padAxisPrev.x = gp.axes[0] ?? 0;
      this.padAxisPrev.y = ay;
      break; // primer mando conectado
    }

    // Táctil
    const t = this.touch;
    if (t.left || t.right || t.accel || t.brake || t.drift || t.steerAxis !== 0) {
      if (t.steerAxis !== 0) steer = t.steerAxis;
      else if (t.left || t.right) steer = (t.right ? 1 : 0) - (t.left ? 1 : 0);
      if (t.accel) throttle = 1;
      if (t.brake) brake = 1;
      drift = drift || t.drift;
      // En táctil, derrapar también acelera: no hace falta soltar el gas con el pulgar
      if (t.drift && !t.brake) throttle = 1;
    }
    if (this.autoAccelActive && !t.brake) throttle = 1;
    respawn = respawn || this.touchEdges.respawn;
    pause = pause || this.touchEdges.pause;
    this.touchEdges.respawn = false;
    this.touchEdges.pause = false;

    s.steer = Math.max(-1, Math.min(1, steer));
    s.throttle = throttle;
    s.brake = brake;
    s.drift = drift;
    s.respawn = respawn;
    s.camera = camera;
    s.pause = pause;
    this.edges.clear();
    return s;
  }

  /** Vibración del mando (si está disponible y activada). */
  rumble(strength: number, ms: number): void {
    if (!this.settings.vibration) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      const act = (gp as unknown as { vibrationActuator?: { playEffect: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
      if (act) {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => undefined);
        break;
      }
    }
  }
}
