import { load, save } from '../core/Storage';
import type { HelmetStyle, LiveryStyle } from '../engine/livery';
import { CIRCUITS } from '../track/circuits/index';
import { loadTrophies } from './Championship';
import { loadLegacyBest, loadRecord } from './Ghost';
import { medalFor } from './medals';

// Desbloqueables: colores, cascos y decoraciones del kart que se ganan jugando.

export interface Progress {
  titles: number;
  titlesHard: number;
  wins: number;
  podiums: number;
  /** Circuitos con récord personal. */
  records: number;
  golds: number;
  /** Medallas de plata o mejores. */
  silvers: number;
  tutorial: boolean;
}

export function getProgress(): Progress {
  const t = loadTrophies();
  let records = 0;
  let golds = 0;
  let silvers = 0;
  for (const c of CIRCUITS) {
    const best = loadRecord(c.id).best ?? loadLegacyBest(c.id);
    if (best == null) continue;
    records++;
    const m = medalFor(c, best);
    if (m === 'oro') golds++;
    if (m === 'oro' || m === 'plata') silvers++;
  }
  return { titles: t.titles, titlesHard: t.titlesHard ?? 0, wins: t.wins, podiums: t.podiums, records, golds, silvers, tutorial: !!t.tutorial };
}

export interface Unlockable {
  kind: 'color' | 'helmet' | 'livery' | 'chassis';
  id: string;
  label: string;
  req: string;
  ok: (p: Progress) => boolean;
}

const free = () => true;

export const UNLOCKS: Unlockable[] = [
  // Colores
  { kind: 'color', id: '#D7261E', label: 'Rojo competición', req: '', ok: free },
  { kind: 'color', id: '#FFC300', label: 'Amarillo', req: '', ok: free },
  { kind: 'color', id: '#111111', label: 'Negro carbono', req: '', ok: free },
  { kind: 'color', id: '#FFFFFF', label: 'Blanco', req: '', ok: free },
  { kind: 'color', id: '#1E6FE0', label: 'Azul', req: '', ok: free },
  { kind: 'color', id: '#43A047', label: 'Verde', req: '', ok: free },
  { kind: 'color', id: '#EC407A', label: 'Rosa chicle', req: 'Completa el tutorial', ok: (p) => p.tutorial },
  { kind: 'color', id: '#FF6D00', label: 'Naranja', req: 'Consigue un podio', ok: (p) => p.podiums >= 1 },
  { kind: 'color', id: '#8E24AA', label: 'Morado', req: 'Gana una carrera', ok: (p) => p.wins >= 1 },
  { kind: 'color', id: '#00BCD4', label: 'Cian', req: 'Marca récord personal en 3 circuitos', ok: (p) => p.records >= 3 },
  // Cascos
  { kind: 'helmet', id: 'clasico', label: 'Clásico', req: '', ok: free },
  { kind: 'helmet', id: 'estrellas', label: 'Estrellas', req: '', ok: free },
  { kind: 'helmet', id: 'rayo', label: 'Rayo', req: 'Gana una carrera', ok: (p) => p.wins >= 1 },
  { kind: 'helmet', id: 'llamas', label: 'Llamas', req: 'Consigue 5 podios', ok: (p) => p.podiums >= 5 },
  { kind: 'helmet', id: 'corona', label: 'Corona de campeón', req: 'Gana un campeonato', ok: (p) => p.titles >= 1 },
  // Decoraciones
  { kind: 'livery', id: 'ale', label: 'Edición Ale', req: '', ok: free },
  { kind: 'livery', id: 'basica', label: 'Básica', req: '', ok: free },
  { kind: 'livery', id: 'cuadros', label: 'Bandera a cuadros', req: 'Gana 3 carreras', ok: (p) => p.wins >= 3 },
  { kind: 'livery', id: 'llamas', label: 'Llamas', req: 'Medalla de plata (o mejor) en 3 contrarrelojes', ok: (p) => p.silvers >= 3 },
  { kind: 'livery', id: 'oro', label: 'Oro cromado', req: 'Gana un campeonato en Difícil o Pro', ok: (p) => p.titlesHard >= 1 },
  // Modelos de kart
  { kind: 'chassis', id: 'r1', label: 'Zanini R1', req: '', ok: free },
  { kind: 'chassis', id: 'saeta', label: 'Saeta S7', req: '', ok: free },
  { kind: 'chassis', id: 'toro', label: 'Toro V12*', req: '', ok: free },
  { kind: 'chassis', id: 'lapa', label: 'Lapa GT', req: '', ok: free },
  { kind: 'chassis', id: 'tostadora', label: 'La Tostadora 1978', req: 'Consigue un podio', ok: (p) => p.podiums >= 1 },
  { kind: 'chassis', id: 'ale', label: 'Bólido de Ale', req: 'Gana una carrera', ok: (p) => p.wins >= 1 },
];

export function isUnlocked(kind: Unlockable['kind'], id: string, p = getProgress()): boolean {
  const u = UNLOCKS.find((x) => x.kind === kind && x.id.toLowerCase() === id.toLowerCase());
  return !u || u.ok(p);
}

/** Devuelve los desbloqueos nuevos desde la última comprobación (y los memoriza). */
export function newUnlocks(): Unlockable[] {
  const p = getProgress();
  const seen = new Set(load<string[]>('unlocked', []));
  const fresh: Unlockable[] = [];
  for (const u of UNLOCKS) {
    const key = `${u.kind}:${u.id}`;
    if (u.ok(p) && !seen.has(key)) {
      seen.add(key);
      if (u.req) fresh.push(u);
    }
  }
  save('unlocked', [...seen]);
  return fresh;
}

export type { HelmetStyle, LiveryStyle };
