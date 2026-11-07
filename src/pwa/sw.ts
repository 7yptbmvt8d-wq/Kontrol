// Service worker (hors ligne) : enregistrement, détection d'une nouvelle version, activation à la demande.
import { registerSW } from 'virtual:pwa-register';

type Ecouteur = () => void;
const ecouteursMaj = new Set<Ecouteur>();
let majPrete = false;
let enregistrement: ServiceWorkerRegistration | undefined;
let activer: ((recharger?: boolean) => Promise<void>) | undefined;

export const surNouvelleVersion = (f: Ecouteur) => { ecouteursMaj.add(f); if (majPrete) f(); return () => { ecouteursMaj.delete(f); }; };
export const swActif = () => !!navigator.serviceWorker?.controller;

export function demarrerSW(onHorsLignePret?: () => void) {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  activer = registerSW({
    immediate: true,
    onNeedRefresh() { majPrete = true; ecouteursMaj.forEach((f) => f()); },
    onOfflineReady() { onHorsLignePret?.(); },
    onRegisteredSW(_url, r) {
      enregistrement = r;
      // Recherche de mise à jour au retour dans l'app et toutes les 30 min
      const verifier = () => { if (navigator.onLine && document.visibilityState === 'visible') void r?.update().catch(() => {}); };
      document.addEventListener('visibilitychange', verifier);
      setInterval(verifier, 30 * 60_000);
    },
  });
}

/** Attend qu'une nouvelle version téléchargée soit prête (ou rien à installer). */
async function attendreInstallation(r: ServiceWorkerRegistration, delai = 30_000): Promise<boolean> {
  if (r.waiting) return true;
  const sw = r.installing;
  if (!sw) return false;
  return new Promise((ok) => {
    const fin = setTimeout(() => ok(!!r.waiting), delai);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed') { clearTimeout(fin); ok(true); }
      if (sw.state === 'redundant') { clearTimeout(fin); ok(false); }
    });
  });
}

/**
 * Passe à la dernière version : télécharge la nouvelle version (si en ligne), l'active et recharge.
 * Sans nouvelle version (ou hors ligne) : simple rechargement depuis le cache.
 */
export async function activerDerniereVersion(): Promise<'maj' | 'rechargement'> {
  const r = enregistrement;
  if (r && activer) {
    try {
      if (navigator.onLine) await r.update();
      if (await attendreInstallation(r)) { await activer(true); return 'maj'; }
    } catch { /* hors ligne ou serveur indisponible */ }
  }
  return 'rechargement';
}
