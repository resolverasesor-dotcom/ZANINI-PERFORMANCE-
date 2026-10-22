import { formatTime } from '../core/math';
import type { PlayerStats } from '../game/RaceView';
import type { RaceResultRow } from '../race/RaceSim';
import { esc } from './dom';

/** Gráfico SVG de posiciones vuelta a vuelta (el jugador resaltado). */
export function positionsChart(results: RaceResultRow[]): string {
  const n = results.length;
  const laps = Math.max(1, ...results.map((r) => r.posHistory.length - 1));
  const W = 560;
  const H = 230;
  const padL = 26;
  const padR = 46;
  const padT = 12;
  const padB = 22;
  const x = (lap: number) => padL + (lap / laps) * (W - padL - padR);
  const y = (pos: number) => padT + ((pos - 1) / Math.max(1, n - 1)) * (H - padT - padB);
  let grid = '';
  for (let p = 1; p <= n; p++) grid += `<text x="${padL - 8}" y="${y(p) + 4}" class="ch-ax" text-anchor="end">${p}</text>`;
  for (let l = 0; l <= laps; l++) {
    grid += `<line x1="${x(l)}" y1="${padT}" x2="${x(l)}" y2="${H - padB}" class="ch-grid"/>`;
    grid += `<text x="${x(l)}" y="${H - 6}" class="ch-ax" text-anchor="middle">${l === 0 ? 'Salida' : l}</text>`;
  }
  const lines = results
    .slice()
    .sort((a, b) => Number(a.entrant.isPlayer) - Number(b.entrant.isPlayer))
    .map((r) => {
      const pts = r.posHistory.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
      const me = r.entrant.isPlayer;
      const last = r.posHistory[r.posHistory.length - 1];
      return `${me ? `<polyline points="${pts}" class="ch-me-outline"/>` : ''}<polyline points="${pts}" fill="none" stroke="${r.entrant.color}" stroke-width="${me ? 4 : 2}" stroke-linejoin="round" opacity="${me ? 1 : 0.75}"/>
        <text x="${W - padR + 6}" y="${y(last) + 4}" class="ch-name${me ? ' me' : ''}" fill="${r.entrant.color}">${esc(r.entrant.short)}</text>`;
    })
    .join('');
  return `<svg class="pos-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}${lines}</svg>`;
}

/** Tarjetas con lo más destacado de la carrera. */
export function raceSummary(results: RaceResultRow[], stats: PlayerStats | null): string {
  const win = results[0];
  const fast = results.find((r) => r.fastestLap);
  const climb = results.slice().sort((a, b) => b.grid - b.position - (a.grid - a.position))[0];
  const over = results.slice().sort((a, b) => b.overtakes - a.overtakes)[0];
  const me = results.find((r) => r.entrant.isPlayer);
  const card = (icon: string, title: string, body: string, cls = '') => `<div class="sum-card ${cls}"><span class="sum-ico">${icon}</span><div><b>${title}</b><span>${body}</span></div></div>`;
  let html = card('🏆', 'Ganador', esc(win.entrant.name));
  if (fast) html += card('⚡', 'Vuelta rápida', `${esc(fast.entrant.name)} · ${formatTime(fast.bestLap)}`);
  if (climb && climb.grid - climb.position > 0) html += card('🚀', 'Mayor remontada', `${esc(climb.entrant.name)} · de P${climb.grid} a P${climb.position}`);
  if (over && over.overtakes > 0) html += card('⚔️', 'Más adelantamientos', `${esc(over.entrant.name)} · ${over.overtakes}`);
  if (me) {
    const gained = me.grid - me.position;
    const parts = [
      `Salida P${me.grid} → meta P${me.position}${gained > 0 ? ` (+${gained})` : ''}`,
      `${me.overtakes} adelantamientos`,
      stats ? `${stats.hops} saltitos` : '',
      stats ? `${stats.driftTime.toFixed(1)} s derrapando` : '',
      stats ? `punta ${Math.round(stats.topSpeed)} km/h` : '',
      stats ? (stats.wallHits === 0 ? 'cero besos al muro 😇' : `${stats.wallHits} ${stats.wallHits === 1 ? 'beso' : 'besos'} al muro 💋`) : '',
    ].filter(Boolean);
    html += card('👤', 'Tu carrera', parts.join(' · '), 'me');
  }
  return `<div class="sum-grid">${html}</div>`;
}
