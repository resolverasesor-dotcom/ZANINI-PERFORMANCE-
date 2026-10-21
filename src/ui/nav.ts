import type { ControlState } from '../core/Input';

/** Navegación por menús con mando o flechas: mueve el foco entre botones visibles. */
export function navigate(container: HTMLElement | null, nav: ControlState['nav'], onBack?: () => void): void {
  if (!container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [data-focus]')).filter(
    (e) => e.offsetParent !== null,
  );
  if (!items.length) return;
  const active = document.activeElement as HTMLElement | null;
  let idx = active ? items.indexOf(active) : -1;
  const isRange = active instanceof HTMLInputElement && active.type === 'range';
  const isText = active instanceof HTMLInputElement && active.type === 'text';
  if (nav.up || nav.down || ((nav.left || nav.right) && !isRange && !isText)) {
    if (idx < 0) {
      items[0].focus();
      return;
    }
    const cur = items[idx].getBoundingClientRect();
    const cx = cur.left + cur.width / 2;
    const cy = cur.top + cur.height / 2;
    let best = -1;
    let bestScore = Infinity;
    items.forEach((e, i) => {
      if (i === idx) return;
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      let ok = false;
      if (nav.up) ok = dy < -4;
      else if (nav.down) ok = dy > 4;
      else if (nav.left) ok = dx < -4;
      else if (nav.right) ok = dx > 4;
      if (!ok) return;
      const primary = nav.up || nav.down ? Math.abs(dy) : Math.abs(dx);
      const secondary = nav.up || nav.down ? Math.abs(dx) : Math.abs(dy);
      const score = primary + secondary * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 && (nav.up || nav.down)) best = nav.down ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    if (best >= 0) {
      idx = best;
      items[idx].focus();
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  } else if ((nav.left || nav.right) && isRange) {
    const r = active as HTMLInputElement;
    const step = Number(r.step || 1);
    r.value = String(Number(r.value) + (nav.right ? step : -step));
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (nav.confirm) {
    if (idx < 0) items[0].focus();
    else items[idx].click();
  }
  if (nav.back) {
    const back = container.querySelector<HTMLElement>('[data-back]');
    if (back) back.click();
    else onBack?.();
  }
}
