// Tests de parcours (Playwright) : l'app construite (vite preview) sur un iPhone simulé, avant chaque mise en ligne.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts', // distinct des tests Vitest (tests/*.test.ts)
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173/Kontrol/',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block', // pas de cache hors ligne entre deux tests
    trace: 'off',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/Kontrol/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
