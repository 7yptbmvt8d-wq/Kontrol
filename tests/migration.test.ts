import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import Dexie from 'dexie';

it('v1 → v3 : n° de marché reporté sur les lots ; barème des pénalités conservé ; registre créé', async () => {
  const v1 = new Dexie('kontrol');
  v1.version(1).stores({
    chantiers: '++id, nom', lots: '++id, chantierId, [chantierId+code]', intervenants: '++id, chantierId',
    points: '++uid, chantierId, [chantierId+id], [chantierId+lot], etat', reserves: '++id, chantierId, [chantierId+numero], statut, echeance',
    jalons: '++uid, chantierId', penalites: '++id, chantierId', photos: '++id, chantierId', reglages: 'cle',
  });
  const id = await v1.table('chantiers').add({ nom: 'A', numeroMarche: 'M-1' });
  await v1.table('lots').bulkAdd([{ chantierId: id, code: 'GO' }, { chantierId: id, code: 'CVC' }]);
  await v1.table('penalites').add({ chantierId: id, lotCode: 'CVC', motif: 'Absence réunion lot 2', montantOuTaux: '200 € HT', articleCcap: '' });
  v1.close();

  const { db } = await import('../src/db/schema');
  const lots = await db.lots.toArray();
  expect(lots.map((l) => l.numeroMarche)).toEqual(['M-1', 'M-1']);
  expect('numeroMarche' in (await db.chantiers.get(id as number))!).toBe(false);
  expect((await db.penalites.toArray()).map((p) => p.motif)).toEqual(['Absence réunion lot 2']);
  expect(await db.penalitesAppliquees.count()).toBe(0);
  expect(db.verno).toBe(3);
});
