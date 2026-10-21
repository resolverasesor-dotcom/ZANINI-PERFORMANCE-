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

/** Letras de ZANINI dibujadas como polígonos (no dependen de ninguna fuente instalada). */
const LETTERS = `
  <path d="M0,0 H80 V20 L28,80 H80 V100 H0 V80 L52,20 H0 Z"/>
  <path fill-rule="evenodd" d="M90,100 L122,0 H148 L180,100 H156 L150,80 H120 L114,100 Z M126,60 H144 L135,30 Z"/>
  <path d="M190,100 V0 H212 L248,60 V0 H270 V100 H248 L212,40 V100 Z"/>
  <path d="M280,0 H302 V100 H280 Z"/>
  <path d="M312,100 V0 H334 L370,60 V0 H392 V100 H370 L334,40 V100 Z"/>
  <path d="M402,0 H424 V100 H402 Z"/>`;

/** Logotipo ZANINI PERFORMANCE estilo motorsport (SVG vectorial). */
export function logoHTML(size: 'big' | 'small' = 'big'): string {
  return `<div class="logo logo-${size}" role="img" aria-label="Zanini Performance">
    <svg viewBox="-170 -14 640 170" xmlns="http://www.w3.org/2000/svg">
      <g class="logo-speed">
        <rect x="-160" y="18" width="120" height="9" rx="4" fill="#FFC300"/>
        <rect x="-128" y="38" width="96" height="9" rx="4" fill="#D7261E"/>
        <rect x="-100" y="58" width="74" height="9" rx="4" fill="#FFC300"/>
        <rect x="-70" y="78" width="50" height="9" rx="4" fill="#D7261E"/>
      </g>
      <g transform="skewX(-14)">
        <g transform="translate(9,9)" fill="rgba(0,0,0,0.55)">${LETTERS}</g>
        <g transform="translate(5,5)" fill="#D7261E">${LETTERS}</g>
        <g fill="#FFFFFF">${LETTERS}</g>
      </g>
      <g transform="translate(0,114)">
        <polygon points="40,0 470,0 462,30 32,30" fill="#FFC300"/>
        <polygon points="370,0 470,0 462,30 362,30" fill="#D7261E"/>
        <text x="62" y="23" textLength="380" lengthAdjust="spacingAndGlyphs" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="22" fill="#111111">PERFORMANCE</text>
      </g>
    </svg>
  </div>`;
}

export function flagHTML(nat: string): string {
  return `<span class="nat">${esc(nat)}</span>`;
}
