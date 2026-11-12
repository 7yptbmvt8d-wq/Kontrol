import { expect, type Page } from '@playwright/test';

/** Date du jour décalée de n jours, au format AAAA-MM-JJ (saisie des champs date). */
export function jour(n = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Importe le chantier d'exemple (2 lots, 15 points, 6 jalons) et attend la checklist. */
export async function importerExemple(page: Page) {
  await page.goto('#/import');
  await page.getByRole('button', { name: 'Charger le chantier d’exemple' }).click();
  await page.getByRole('button', { name: 'Créer le chantier' }).click();
  await expect(page).toHaveURL(/#\/chantier\/1\/checklist/);
}

/** Bouton « Enregistrer » du panneau du bas ouvert. */
export const enregistrerPanneau = (page: Page) => page.locator('.sheet-foot button', { hasText: 'Enregistrer' }).click();
