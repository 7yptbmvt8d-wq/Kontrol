// Mise à jour de l'app : détection d'une nouvelle version en ligne et rechargement forcé (sans cache).
// GitHub Pages autorise le navigateur à garder index.html 10 min en cache : on interroge le serveur sans cache.

import { activerDerniereVersion, swActif } from './sw';

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

/**
 * Passe à la dernière version et recharge.
 * - Avec le service worker (cas normal) : il télécharge la nouvelle version, l'active, puis recharge ;
 *   hors ligne ou déjà à jour : rechargement depuis le cache.
 * - Sans service worker (première ouverture) : la page gardée en cache HTTP est remplacée par celle du serveur.
 */
export async function rafraichir(): Promise<void> {
  if (swActif()) {
    if ((await activerDerniereVersion()) === 'maj') {
      setTimeout(() => location.reload(), 4000); // filet : rechargement normalement fait par le service worker
      return;
    }
  } else {
    try { await fetch(racine(), { cache: 'reload' }); } catch { /* hors ligne */ }
  }
  location.reload();
}
