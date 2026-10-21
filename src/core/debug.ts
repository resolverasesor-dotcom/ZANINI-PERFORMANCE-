// Parámetros de depuración por URL (no afectan al juego normal):
//   ?autopilot      la IA conduce el kart del jugador
//   ?speed=4        acelera la simulación (pruebas automáticas)
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

export const DEBUG = {
  autopilot: q.has('autopilot'),
  timeScale: Math.max(0.1, Math.min(20, Number(q.get('speed') ?? 1) || 1)),
};
