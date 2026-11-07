import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages : l'app est servie sous /Kontrol/
export default defineConfig({
  base: '/Kontrol/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
