import type { TrackDef } from '../track/TrackData';

// Medallas de contrarreloj: el oro es el récord del circuito.

export type Medal = 'oro' | 'plata' | 'bronce';

export const MEDAL_ICON: Record<Medal, string> = { oro: '🥇', plata: '🥈', bronce: '🥉' };

export function medalTimes(def: TrackDef): Record<Medal, number> {
  const r = def.record.time;
  return { oro: r, plata: r * 1.05, bronce: r * 1.1 };
}

export function medalFor(def: TrackDef, time: number | null): Medal | null {
  if (time == null) return null;
  const m = medalTimes(def);
  if (time <= m.oro) return 'oro';
  if (time <= m.plata) return 'plata';
  if (time <= m.bronce) return 'bronce';
  return null;
}
