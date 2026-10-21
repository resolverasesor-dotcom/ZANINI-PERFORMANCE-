import type { Difficulty } from '../ai/Drivers';
import { POINTS } from '../config';
import { load, remove, save } from '../core/Storage';
import { SERIES, type SeriesKey } from '../track/circuits/index';
import type { RaceResultRow } from './RaceSim';

export interface GPResult {
  trackId: string;
  order: string[];
  fastest: string | null;
  points: Record<string, number>;
}

export interface ChampState {
  version: 1;
  difficulty: Difficulty;
  /** 0 = vueltas por defecto de cada circuito. */
  laps: number;
  round: number;
  stage: 'quali' | 'race' | 'done';
  grid: string[] | null;
  points: Record<string, number>;
  results: GPResult[];
  /** Calendario (las partidas antiguas no lo tienen: Campeonato Zanini). */
  series?: SeriesKey;
}

const KEY = 'championship';

export function rounds(s?: ChampState | null): string[] {
  return [...SERIES[s?.series ?? 'zanini'].tracks];
}

export function seriesName(s?: ChampState | null): string {
  return SERIES[s?.series ?? 'zanini'].name;
}

export function newChampionship(difficulty: Difficulty, laps: number, series: SeriesKey = 'zanini'): ChampState {
  const s: ChampState = { version: 1, difficulty, laps, round: 0, stage: 'quali', grid: null, points: {}, results: [], series };
  saveChampionship(s);
  return s;
}

export function loadChampionship(): ChampState | null {
  const s = load<ChampState | null>(KEY, null);
  if (!s || s.version !== 1) return null;
  return s;
}

export function saveChampionship(s: ChampState): void {
  save(KEY, s);
}

export function clearChampionship(): void {
  remove(KEY);
}

/** Puntos de una carrera: 25-18-15-12-10-8-6-4-2-1 y +1 por vuelta rápida si acabas top 10. */
export function racePoints(results: RaceResultRow[]): { points: Record<string, number>; fastest: string | null } {
  const points: Record<string, number> = {};
  const fastest = results.find((r) => r.fastestLap)?.id ?? null;
  results.forEach((r, i) => {
    let p = POINTS[i] ?? 0;
    if (r.id === fastest && i < 10) p += 1;
    points[r.id] = p;
  });
  return { points, fastest };
}

export function applyRace(s: ChampState, results: RaceResultRow[]): GPResult {
  const { points, fastest } = racePoints(results);
  for (const [id, p] of Object.entries(points)) s.points[id] = (s.points[id] ?? 0) + p;
  const gp: GPResult = { trackId: rounds(s)[s.round], order: results.map((r) => r.id), fastest, points };
  s.results.push(gp);
  s.round++;
  s.grid = null;
  s.stage = s.round >= rounds(s).length ? 'done' : 'quali';
  saveChampionship(s);
  return gp;
}

export interface StandingRow {
  id: string;
  points: number;
  wins: number;
  podiums: number;
}

/** Clasificación general (desempate por victorias y podios). */
export function standings(s: ChampState, ids: string[]): StandingRow[] {
  const rows = ids.map((id) => {
    let wins = 0;
    let podiums = 0;
    for (const r of s.results) {
      const pos = r.order.indexOf(id);
      if (pos === 0) wins++;
      if (pos >= 0 && pos < 3) podiums++;
    }
    return { id, points: s.points[id] ?? 0, wins, podiums };
  });
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums);
  return rows;
}

// ---- Palmarés del jugador ----
export interface Trophies {
  titles: number;
  wins: number;
  podiums: number;
}

export function loadTrophies(): Trophies {
  return load<Trophies>('trophies', { titles: 0, wins: 0, podiums: 0 });
}

export function saveTrophies(t: Trophies): void {
  save('trophies', t);
}
