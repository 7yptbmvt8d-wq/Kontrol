import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// Numéro de build = nombre de commits (augmente à chaque mise en ligne) ; date de build à l'heure de Paris.
const build = (() => {
  try { return execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return '0'; }
})();
const date = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date()).replace(' ', ' · ');

// GitHub Pages : l'app est servie sous /Kontrol/
export default defineConfig({
  base: '/Kontrol/',
  plugins: [
    react(),
    // Hors ligne : l'app entière (y compris les modules PDF / Excel chargés à la demande, polices, icônes) est
    // mise en cache par le service worker. Mise à jour « à la demande » : bandeau + rechargement.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // enregistrement dans src/pwa/sw.ts
      manifest: false, // public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_DATE__: JSON.stringify(date),
  },
});
