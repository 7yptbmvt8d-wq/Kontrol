// Mise à jour de l'app : détection d'une nouvelle version en ligne et rechargement forcé (sans cache).
// GitHub Pages autorise le navigateur à garder index.html 10 min en cache : on interroge le serveur sans cache.

const MOTIF = /assets\/index-[\w-]+\.js/;

/** Identifiant de la version chargée (nom haché du script principal), ou null en développement. */
export function versionChargee(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return s ? MOTIF.exec(s.src)?.[0] ?? null : null;
}

const racine = () => new URL(import.meta.env.BASE_URL, location.origin).href;

/** Version actuellement en ligne (null si hors ligne ou en développement). */
export async function versionEnLigne(): Promise<string | null> {
  try {
    const r = await fetch(`${racine()}?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return MOTIF.exec(await r.text())?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function nouvelleVersionDisponible(): Promise<boolean> {
  const locale = versionChargee();
  if (!locale) return false;
  const distante = await versionEnLigne();
  return !!distante && distante !== locale;
}

/** Recharge l'app en remplaçant la page gardée en cache par celle du serveur. */
export async function rafraichir(): Promise<void> {
  try {
    await fetch(racine(), { cache: 'reload' }); // met à jour le cache HTTP de index.html
  } catch { /* hors ligne : simple rechargement */ }
  location.reload();
}
