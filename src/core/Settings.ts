import type { Difficulty } from '../ai/Drivers';
import { load, save } from './Storage';
import type { HelmetStyle, LiveryStyle } from '../engine/livery';

export type Quality = 'bajo' | 'medio' | 'alto';
export type CameraMode = 'trasera' | 'cercana' | 'capo';
export type SpeedClass = '50' | '100' | '150';
export type AssistLevel = 'ninguna' | 'media' | 'maxima';

/** Factor de velocidad punta / aceleración por cilindrada. */
export const SPEED_CLASS: Record<SpeedClass, { label: string; vmax: number; accel: number }> = {
  '50': { label: '50cc · tranquilo', vmax: 0.68, accel: 0.8 },
  '100': { label: '100cc · normal', vmax: 0.84, accel: 0.9 },
  '150': { label: '150cc · rápido', vmax: 1, accel: 1 },
};

export const ASSIST_LABELS: Record<AssistLevel, string> = {
  ninguna: 'Sin ayudas',
  media: 'Ayuda media',
  maxima: 'Ayuda máxima',
};

export type Action = 'accel' | 'brake' | 'left' | 'right' | 'hop' | 'respawn' | 'camera' | 'pause';

export const ACTION_LABELS: Record<Action, string> = {
  accel: 'Acelerar',
  brake: 'Frenar / marcha atrás',
  left: 'Girar a la izquierda',
  right: 'Girar a la derecha',
  hop: 'Saltito (descargar peso)',
  respawn: 'Reaparecer',
  camera: 'Cambiar cámara',
  pause: 'Pausa',
};

export const DEFAULT_KEYS: Record<Action, string[]> = {
  accel: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  hop: ['Space', 'ShiftLeft'],
  respawn: ['KeyR'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
};

export interface Settings {
  difficulty: Difficulty;
  /** Vueltas en carrera rápida (0 = las del circuito). */
  laps: number;
  rivals: number;
  quality: Quality;
  volume: number;
  sfx: number;
  musicVolume: number;
  music: boolean;
  camera: CameraMode;
  keys: Record<Action, string[]>;
  touch: 'auto' | 'on' | 'off';
  autoAccel: boolean;
  /** Filtro de entrada: el volante a tope se adapta a la velocidad (para teclado y táctil). */
  steerFilter: boolean;
  /** Dirección táctil: barra deslizante analógica, flechas o inclinando el móvil. */
  touchSteer: 'pad' | 'botones' | 'inclinar';
  /** Cilindrada: velocidad punta del kart (y de los rivales). */
  speedClass: SpeedClass;
  /** Ayudas a la conducción del jugador. */
  assist: AssistLevel;
  /** Versión de los ajustes táctiles (para migrar valores por defecto). */
  touchV?: number;
  speedLines: boolean;
  ghost: boolean;
  vibration: boolean;
}

export interface Profile {
  name: string;
  number: number;
  color: string;
  /** Decoración del kart (ver engine/livery.ts). */
  livery: LiveryStyle;
  helmet: HelmetStyle;
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));
}

export function defaultSettings(): Settings {
  const mobile = isMobile();
  return {
    difficulty: 'normal',
    laps: 0,
    rivals: 11,
    quality: mobile ? 'bajo' : 'alto',
    volume: 0.8,
    sfx: 0.9,
    musicVolume: 0.5,
    music: true,
    camera: 'trasera',
    keys: structuredClone(DEFAULT_KEYS),
    touch: 'auto',
    autoAccel: false,
    steerFilter: true,
    touchSteer: 'pad',
    speedClass: mobile ? '100' : '150',
    assist: mobile ? 'media' : 'ninguna',
    touchV: 3,
    speedLines: true,
    ghost: true,
    vibration: true,
  };
}

export function loadSettings(): Settings {
  const s = { ...defaultSettings(), ...load<Partial<Settings>>('settings', {}) };
  // El antiguo botón de derrape pasa a ser el saltito (mismas teclas)
  const old = s.keys as Partial<Record<string, string[]>> | undefined;
  if (old?.drift && !old.hop) old.hop = old.drift;
  if (old) delete old.drift;
  s.keys = { ...DEFAULT_KEYS, ...s.keys };
  // Migración: nuevos controles táctiles (dirección analógica y aceleración automática en móvil)
  // Migración v3: la aceleración automática vuelve a ser opcional (desactivada) y en
  // móvil se activan 100cc y ayudas medias, que hacen el juego manejable con el pulgar.
  if ((s.touchV ?? 1) < 3) {
    s.touchV = 3;
    s.autoAccel = false;
    if (s.touchSteer !== 'botones') s.touchSteer = 'pad';
    if (isMobile()) {
      s.speedClass = '100';
      s.assist = 'media';
    }
  }
  return s;
}

export function saveSettings(s: Settings): void {
  save('settings', s);
}

export function loadProfile(): Profile {
  return { name: 'ALE', number: 7, color: '#D7261E', livery: 'ale', helmet: 'estrellas', ...load<Partial<Profile>>('profile', {}) };
}

export function saveProfile(p: Profile): void {
  save('profile', p);
}

export { isMobile };
