// En premier : retire le jeton Google de l'URL avant que le routeur ne lise l'adresse.
import './drive/oauth';
// Masque les barres fixées en bas tant que la hauteur de l'écran se stabilise (ouverture de l'app installée).
import './pwa/demarrage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Polices embarquées, jeu latin uniquement (français) : allège le chargement et le cache hors ligne.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './db/suivi';
import { App } from './App';
import { getReglage } from './db/schema';
import { appliquerTheme, type Theme } from './theme';
import { demarrerSW } from './pwa/sw';
import { toast } from './components/ui';

// iOS n'applique :active (retour visuel au toucher) que si un écouteur touchstart existe.
document.addEventListener('touchstart', () => {}, { passive: true });

getReglage<Theme>('theme', 'sombre').then(appliquerTheme).catch(() => {});

// Stockage persistant demandé dès le premier lancement, et redemandé tant qu'il n'est pas accordé
// (iOS ne l'accorde en général qu'une fois l'app ajoutée à l'écran d'accueil).
(async () => {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* non pris en charge */ }
})();

// Hors ligne : mise en cache de l'app par le service worker
demarrerSW(() => toast('App prête pour une utilisation hors ligne'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
