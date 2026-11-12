import { expect, test } from '@playwright/test';
import { importerExemple } from './outils';
import { simulerGoogle } from './googleSimule';

test('Google Drive (simulé) : connexion, sauvegarde, dossier du chantier, restauration proposée', async ({ page, context }) => {
  const drive = await simulerGoogle(context);
  await importerExemple(page);

  await page.goto('#/reglages');
  await page.fill('#gd-client', '123456-abc.apps.googleusercontent.com');
  await page.getByRole('region', { name: 'Google Drive' }).getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Connecter Google Drive' }).click();

  // Retour de Google → sauvegarde automatique, puis dossier du chantier (rapport PDF et Excel)
  await expect.poll(() => drive.chemins(), { timeout: 30_000 }).toEqual(expect.arrayContaining([
    expect.stringMatching(/^Kontrol\/Sauvegardes\/Kontrol – sauvegarde du .+\.zip$/),
    'Kontrol/Réhabilitation bâtiment 12 – Camp Nord/Rapport – Réhabilitation bâtiment 12 – Camp Nord.pdf',
    'Kontrol/Réhabilitation bâtiment 12 – Camp Nord/Suivi – Réhabilitation bâtiment 12 – Camp Nord.xlsx',
  ]));

  await page.goto('#/reglages');
  await page.getByRole('button', { name: 'Restaurer depuis Google Drive' }).click();
  await expect(page.locator('.sheet li')).toHaveCount(1);
});
