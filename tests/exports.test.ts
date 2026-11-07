import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { db } from '../src/db/schema';
import { importerChantier, validerImport } from '../src/domain/import';
import { chargerChantier, nomFichier } from '../src/services/exports/donnees';
import { pointsNonSoldes } from '../src/services/exports/texte';
import { xlsxJalons, xlsxReserves } from '../src/services/exports/xlsx';
import { creerReserve, lever } from '../src/services/reserves';
import { creerSauvegarde, lireSauvegarde, restaurer } from '../src/services/sauvegarde';
import { pdfTexte } from '../src/services/exports/pdf';

const exemple = readFileSync(new URL('../exemples/chantier-exemple.json', import.meta.url), 'utf8');

async function preparer() {
  const id = await importerChantier(validerImport(exemple).donnees!, '2026-08-03');
  const pts = await db.points.where('chantierId').equals(id).sortBy('ordre');
  await db.points.update(pts[0].uid!, { etat: 'conforme' });
  await db.points.update(pts[3].uid!, { etat: 'non_conforme', commentaire: 'Enrobage 15 mm mesuré' });
  const base = { chantierId: id, lotCode: 'GO', localisation: 'R+1', gravite: 'majeure' as const, origine: 'visite' as const, photoIds: [] };
  await creerReserve({ ...base, entreprise: 'Moretti GO', description: 'Fissure enduit', echeance: '2026-11-01' });
  const r2 = await creerReserve({ ...base, entreprise: 'CVC Lanterna', lotCode: 'CVC', description: 'Calorifuge manquant', echeance: '2026-12-01' });
  const photo = (await db.photos.add({ chantierId: id, blob: new Blob(['jpeg-a'], { type: 'image/jpeg' }), vignette: new Blob(['v'], { type: 'image/jpeg' }), prisLe: '2026-11-07T10:00:00Z' })) as number;
  await lever(r2.id!, '2026-11-06', [photo]);
  return id;
}

describe('exports', () => {
  it('texte des points non soldés : sections, marchés, réserves par entreprise', async () => {
    const id = await preparer();
    const t = pointsNonSoldes(await chargerChantier(id), '2026-11-07', new Date('2026-11-07T15:30:00'));
    expect(t).toContain('POINTS NON SOLDÉS — Réhabilitation bâtiment 12 – Camp Nord');
    expect(t).toContain('- GO (Gros œuvre – maçonnerie – étanchéité) · marché 2026-SID-SE-0412-L01 · titulaire : Moretti GO');
    expect(t).toMatch(/1\. POINTS BLOQUANTS NON VALIDÉS \(\d+\)/);
    expect(t).toContain('Commentaire : Enrobage 15 mm mesuré');
    expect(t).toContain('5. RÉSERVES NON LEVÉES (1)');
    expect(t).toContain('R-01 [GO] Fissure enduit · R+1');
    expect(t).toContain('En retard (+6 j)');
    expect(t).not.toContain('Calorifuge manquant'); // levée
  });

  it('Excel : réserves par entreprise (synthèse + 1 feuille par entreprise), vraies dates', async () => {
    const d = await chargerChantier(1);
    const f = xlsxReserves(d, d.reserves, 'entreprise', 'r.xlsx');
    const wb = XLSX.read(new Uint8Array(await f.blob.arrayBuffer()), { cellDates: true });
    expect(wb.SheetNames).toEqual(['Synthèse', 'CVC Lanterna', 'Moretti GO']);
    const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Moretti GO']);
    expect(lignes[0]).toMatchObject({ 'N°': 'R-01', Lot: 'GO', 'N° marché': '2026-SID-SE-0412-L01', Statut: 'En retard' });
    const ech = lignes[0]['Échéance'] as Date;
    expect([ech.getUTCFullYear(), ech.getUTCMonth() + 1, ech.getUTCDate()]).toEqual([2026, 11, 1]);
    const j = XLSX.read(new Uint8Array(await xlsxJalons(d, 'j.xlsx').blob.arrayBuffer()));
    expect(j.SheetNames).toEqual(['Jalons', 'Pénalités']);
  });

  it('sauvegarde ZIP puis restauration à l’identique (photos comprises)', async () => {
    const avant = { ch: await db.chantiers.toArray(), pts: await db.points.toArray(), res: await db.reserves.toArray() };
    const { blob, resume } = await creerSauvegarde();
    expect(resume).toMatchObject({ chantiers: 1, reserves: 2, photos: 1 });
    await db.points.clear(); await db.reserves.update(1, { description: 'modifiée' }); // altérations
    const lu = await lireSauvegarde(blob);
    await restaurer(lu.zip, lu.contenu);
    expect(await db.chantiers.toArray()).toEqual(avant.ch);
    expect(await db.points.toArray()).toEqual(avant.pts);
    expect(await db.reserves.toArray()).toEqual(avant.res);
    const p = (await db.photos.toArray())[0];
    expect(await p.blob.text()).toBe('jpeg-a');
  });

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(lireSauvegarde(new Blob(['pas un zip']))).rejects.toThrow('archive ZIP');
  });

  it('noms de fichiers et texte PDF', () => {
    expect(nomFichier('Réserves', 'METALCO - 42 ZI', '20261107-1530')).toBe('Reserves-METALCO-42-ZI-20261107-1530');
    expect(pdfTexte('Relevé ≥ 15 cm · œuvre € ’')).toBe('Relevé >= 15 cm · œuvre € ’');
  });
});
