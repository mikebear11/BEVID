/** Vrai si la page est chargée dans un cadre d'une autre origine (anti-clickjacking de transition, M1-F). */
export function isFramed() {
  try { return window.self !== window.top; } catch { return true; }
}
