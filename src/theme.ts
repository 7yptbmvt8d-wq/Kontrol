export type Theme = 'sombre' | 'clair' | 'systeme';

export const CLE_THEME = 'kontrol-theme';

/** Sombre par défaut ; « systeme » laisse tokens.css suivre prefers-color-scheme. */
export function appliquerTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'systeme') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t === 'clair' ? 'light' : 'dark');
  // Copie locale lue par index.html au démarrage (évite un flash de thème) ; la source reste IndexedDB.
  try { localStorage.setItem(CLE_THEME, t); } catch { /* navigation privée : sans effet */ }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0B1220');
}
