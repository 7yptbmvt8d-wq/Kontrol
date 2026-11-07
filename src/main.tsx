import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { getReglage, setReglage } from './db/schema';
import { appliquerTheme, type Theme } from './theme';

getReglage<Theme>('theme', 'sombre').then(appliquerTheme);

// Premier lancement : demander un stockage persistant (évite l'effacement automatique par iOS).
getReglage<boolean>('persistDemande', false).then(async (deja) => {
  if (deja || !navigator.storage?.persist) return;
  await navigator.storage.persist().catch(() => false);
  await setReglage('persistDemande', true);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
