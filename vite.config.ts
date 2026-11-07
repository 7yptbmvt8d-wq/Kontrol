import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_DATE__: JSON.stringify(date),
  },
});
