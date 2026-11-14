import { expect, test } from '@playwright/test';
import { importerExemple } from './outils';

// iPad Air en paysage : consultation et réunion
test.use({ viewport: { width: 1180, height: 820 } });

test('iPad paysage : colonne centrée, barre du bas, bouton + et panneaux alignés, sans défilement horizontal', async ({ page }) => {
  const centre = 1180 / 2;
  await page.goto('#/');
  const ecran = (await page.locator('main.screen').boundingBox())!;
  expect(ecran.width).toBeLessThanOrEqual(760);
  expect(Math.abs(ecran.x + ecran.width / 2 - centre)).toBeLessThan(2);
  const barre = (await page.locator('.bottom-bar').boundingBox())!;
  expect(barre.width).toBeLessThanOrEqual(760);
  expect(Math.abs(barre.x + barre.width / 2 - centre)).toBeLessThan(2);

  await importerExemple(page);
  await page.goto('#/chantier/1/reserves');
  const fab = (await page.getByRole('button', { name: 'Nouvelle réserve' }).boundingBox())!;
  expect(fab.x + fab.width).toBeLessThanOrEqual(centre + 380);
  await page.getByRole('button', { name: 'Paramètres du chantier et des marchés' }).click();
  const panneau = (await page.getByRole('dialog').boundingBox())!;
  expect(panneau.width).toBeLessThanOrEqual(760);
  expect(Math.abs(panneau.x + panneau.width / 2 - centre)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
