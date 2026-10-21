import './ui/styles.css';
import { Game } from './game/Game';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;
if (!hasWebGL()) {
  app.innerHTML = '<div class="nowebgl">Tu navegador no soporta WebGL. Prueba con Chrome actualizado.</div>';
} else {
  const game = new Game(app);
  // Acceso para depuración desde la consola
  (window as unknown as { zanini: Game }).zanini = game;
}
