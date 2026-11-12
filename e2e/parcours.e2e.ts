import { expect, test } from '@playwright/test';
import { enregistrerPanneau, importerExemple, jour } from './outils';

test('import du chantier d’exemple, point de contrôle validé', async ({ page }) => {
  await importerExemple(page);
  await expect(page.getByText('0/15', { exact: true })).toBeVisible();
  await page.locator('a.pt').first().click();
  await page.locator('.etats button', { hasText: /^Conforme$/ }).click();
  await page.goto('#/chantier/1/checklist');
  await expect(page.getByText('1/15', { exact: true })).toBeVisible();
  await page.goto('#/');
  await expect(page.getByRole('region', { name: 'Réhabilitation bâtiment 12 – Camp Nord' })).toBeVisible();
});

test('OS n° 1, alerte « OPR à programmer » et prolongation de délai', async ({ page }) => {
  await importerExemple(page);
  await page.goto('#/chantier/1/jalons');
  await page.getByRole('button', { name: 'Paramètres du chantier et des marchés' }).click();
  await page.fill('#p-os', jour(-90));
  await page.fill('#p-dt', jour(-30));
  await page.fill('#p-fin', jour(40));
  await enregistrerPanneau(page);
  const carte = page.getByRole('region', { name: 'Délai d’exécution' });
  await expect(carte.getByRole('status')).toContainText('OPR à programmer');
  await expect(carte.getByRole('status')).toContainText('dans 40 j');
  await page.goto('#/');
  await expect(page.getByRole('status').filter({ hasText: 'OPR à programmer' })).toBeVisible();

  // Avenant de 30 jours : fin d'exécution à J+70, plus d'alerte
  await page.goto('#/chantier/1/jalons');
  await carte.getByRole('button', { name: 'Prolongation de délai' }).click();
  await page.getByRole('button', { name: 'Ajouter une prolongation' }).click();
  await page.fill('#pr-acte', 'Avenant n° 1');
  await page.fill('#pr-j', '30');
  await page.fill('#pr-motif', 'Intempéries');
  await enregistrerPanneau(page);
  await expect(page.getByText('Avenant n° 1')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(carte).toContainText('+30 j');
  await expect(carte.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.tl li', { hasText: /Fin du délai d.exécution/ })).toContainText('de prolongation');
});

test('réserve avec photo prise dans la photothèque', async ({ page, browser }) => {
  await importerExemple(page);
  // Photo de test : capture d'un bloc de couleur
  const atelier = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await atelier.setContent('<div style="width:800px;height:600px;background:#a63"></div>');
  const photo = await atelier.screenshot({ type: 'jpeg' });
  await atelier.close();

  await page.goto('#/chantier/1/reserves');
  await page.getByRole('button', { name: 'Nouvelle réserve' }).click();
  await page.locator('.sheet input[type=file]').nth(1).setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.locator('.saisie-photo')).toHaveCount(1);
  await page.fill('#sr-desc', 'Fissure enduit façade nord');
  await enregistrerPanneau(page);
  await expect(page.locator('a.res', { hasText: 'Fissure enduit façade nord' })).toBeVisible();
  await page.goto('#/');
  await expect(page.getByRole('button', { name: '1 réserve ouverte' })).toBeVisible();
});

test('réunion : participant ajouté puis modifié, MOE nommé, compte rendu', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await importerExemple(page);
  await page.goto('#/chantier/1/reunions');
  await page.getByRole('button', { name: 'Démarrer une réunion' }).click();
  await expect(page).toHaveURL(/#\/chantier\/1\/reunion\/\d+/);

  await page.getByRole('button', { name: 'Participant' }).click();
  await page.fill('#ap-nom', 'M. Rosi');
  await page.locator('.sheet').getByRole('button', { name: 'Autre' }).click();
  await page.fill('[aria-label="Fonction ou organisme"]', 'BET structure');
  await page.locator('.sheet-foot button', { hasText: 'Ajouter' }).click();
  await page.getByRole('button', { name: 'Modifier M. Rosi' }).click();
  await page.fill('#ap-nom', 'M. Rossi');
  await enregistrerPanneau(page);
  await expect(page.getByRole('button', { name: 'Modifier M. Rossi' })).toContainText('BET structure');

  await page.getByRole('button', { name: 'Modifier Maîtrise d’œuvre' }).click();
  await page.fill('#pf-org', 'SID – USID de Corse');
  await page.fill('#pf-mnom', 'M. Martin');
  await page.fill('#pf-mfct', 'Chef de BMO');
  await enregistrerPanneau(page);
  await expect(page.getByRole('button', { name: 'Modifier M. Martin' })).toContainText('SID – USID de Corse (MOE)');

  // Titulaire absent : pénalité d'absence appliquée depuis l'appel, puis rouverte pour modification
  await page.getByRole('group', { name: 'Présence de Moretti GO' }).getByRole('button', { name: 'Absent' }).click();
  await page.getByRole('button', { name: /Appliquer la pénalité d’absence/ }).click();
  await page.locator('.sheet-foot button', { hasText: 'Appliquer' }).click();
  await page.getByRole('button', { name: /Pénalité d’absence appliquée/ }).click();
  await expect(page.getByRole('dialog', { name: 'Pénalité' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Compte rendu copié pour Claude : le participant ajouté (présent) y figure avec sa fonction
  await page.getByRole('button', { name: 'Compte rendu' }).click();
  await page.getByRole('button', { name: 'Copier pour Claude' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('M. Rossi (BET structure)');
});

test('écran de secours en cas d’erreur d’affichage, retour à l’accueil', async ({ page }) => {
  // Panne simulée à l'affichage de l'accueil (date du jour illisible) tant que le drapeau est posé
  await page.addInitScript(() => {
    const vrai = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function (...a: Parameters<typeof vrai>) {
      if (localStorage.getItem('e2e-panne') === '1') throw new Error('panne simulée');
      return vrai.apply(this, a);
    };
  });
  await page.goto('#/');
  await page.evaluate(() => localStorage.setItem('e2e-panne', '1'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Une erreur est survenue');
  await expect(page.getByRole('alert')).toContainText('panne simulée');
  await page.evaluate(() => localStorage.removeItem('e2e-panne'));
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  await expect(page.getByRole('heading', { name: 'Mes chantiers' })).toBeVisible();
});

test('prompt d’extraction copié depuis l’écran Nouveau chantier', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('#/import');
  await page.getByRole('button', { name: 'Copier le prompt d’extraction' }).click();
  const texte = await page.evaluate(() => navigator.clipboard.readText());
  expect(texte).toContain('Un lot = un marché');
  expect(texte).toContain('fin_preparation');
});

test('pénalité appliquée puis modifiée (quantité, statut)', async ({ page }) => {
  await importerExemple(page);
  await page.goto('#/chantier/1/penalites');
  await page.getByRole('button', { name: 'Appliquer une pénalité' }).click();
  await page.locator('.sheet [role=radio]', { hasText: /absence/i }).first().click(); // montant fixe (pas de % du marché)
  await page.locator('.sheet-foot button', { hasText: 'Appliquer' }).click();
  const carte = page.getByRole('button', { name: /^Modifier la pénalité/ });
  await expect(carte).toHaveCount(1);
  const avant = await carte.getAttribute('aria-label');

  await carte.click();
  await page.getByRole('button', { name: 'Augmenter' }).click();
  await page.getByRole('button', { name: 'Notifiée' }).click();
  await enregistrerPanneau(page);
  await expect(carte).toHaveCount(1);
  await expect(carte).not.toHaveAttribute('aria-label', avant!);
  await expect(carte).toContainText('Notifiée');
});
