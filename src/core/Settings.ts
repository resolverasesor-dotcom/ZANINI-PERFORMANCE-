import type { Difficulty } from '../ai/Drivers';
import { load, save } from './Storage';

export type Quality = 'bajo' | 'medio' | 'alto';
export type CameraMode = 'trasera' | 'cercana' | 'capo';
export type Action = 'accel' | 'brake' | 'left' | 'right' | 'drift' | 'respawn' | 'camera' | 'pause';

export const ACTION_LABELS: Record<Action, string> = {
  accel: 'Acelerar',
  brake: 'Frenar / marcha atrás',
  left: 'Girar a la izquierda',
  right: 'Girar a la derecha',
  drift: 'Derrapar',
  respawn: 'Reaparecer',
  camera: 'Cambiar cámara',
  pause: 'Pausa',
};

export const DEFAULT_KEYS: Record<Action, string[]> = {
  accel: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftLeft'],
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
  speedLines: boolean;
  ghost: boolean;
  vibration: boolean;
}

export interface Profile {
  name: string;
  number: number;
  color: string;
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
    speedLines: true,
    ghost: true,
    vibration: true,
  };
}

export function loadSettings(): Settings {
  const s = { ...defaultSettings(), ...load<Partial<Settings>>('settings', {}) };
  s.keys = { ...DEFAULT_KEYS, ...s.keys };
  return s;
}

export function saveSettings(s: Settings): void {
  save('settings', s);
}

export function loadProfile(): Profile {
  return { name: 'ALE', number: 7, color: '#D7261E', ...load<Partial<Profile>>('profile', {}) };
}

export function saveProfile(p: Profile): void {
  save('profile', p);
}

export { isMobile };
