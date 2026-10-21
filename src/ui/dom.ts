// Mini-utilidades de DOM sin dependencias.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Logotipo tipográfico ZANINI PERFORMANCE (solo CSS). */
export function logoHTML(size: 'big' | 'small' = 'big'): string {
  return `<div class="logo logo-${size}" aria-label="Zanini Performance">
    <div class="logo-lines"><i></i><i></i><i></i><i></i></div>
    <div class="logo-text">
      <div class="logo-main">ZANINI</div>
      <div class="logo-sub"><span>PERFORMANCE</span></div>
    </div>
  </div>`;
}

export function flagHTML(nat: string): string {
  return `<span class="nat">${esc(nat)}</span>`;
}
