export type Theme = 'sombre' | 'clair' | 'systeme';

/** Sombre par défaut ; « systeme » laisse tokens.css suivre prefers-color-scheme. */
export function appliquerTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'systeme') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t === 'clair' ? 'light' : 'dark');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0B1220');
}
