import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import Dexie from 'dexie';

it('v1 → v5 : n° de marché reporté sur les lots ; barème conservé ; registre créé ; période de préparation lue', async () => {
  const v1 = new Dexie('kontrol');
  v1.version(1).stores({
    chantiers: '++id, nom', lots: '++id, chantierId, [chantierId+code]', intervenants: '++id, chantierId',
    points: '++uid, chantierId, [chantierId+id], [chantierId+lot], etat', reserves: '++id, chantierId, [chantierId+numero], statut, echeance',
    jalons: '++uid, chantierId', penalites: '++id, chantierId', photos: '++id, chantierId', reglages: 'cle',
  });
  const id = await v1.table('chantiers').add({ nom: 'A', numeroMarche: 'M-1' });
  await v1.table('lots').bulkAdd([{ chantierId: id, code: 'GO' }, { chantierId: id, code: 'CVC' }]);
  await v1.table('penalites').add({ chantierId: id, lotCode: 'CVC', motif: 'Absence réunion lot 2', montantOuTaux: '200 € HT', articleCcap: '' });
  const j = (o: object, ordre: number) => ({ chantierId: id, id: `J${ordre}`, articleCcap: '', ordre, ...o });
  await v1.table('jalons').bulkAdd([
    j({ categorie: 'delai', intitule: 'Période de préparation commune à tous les lots (2 mois, non comprise dans le délai d’exécution)', reference: 'autre', jours: 60 }, 0),
    j({ categorie: 'delai', intitule: 'Délai global d’exécution des travaux (16 mois)', reference: 'OS_demarrage', jours: 480 }, 1),
    j({ categorie: 'documentaire', intitule: 'Remise des documents de préparation — pénalité à l’expiration de la période de préparation', reference: 'OS_demarrage', jours: 0 }, 2),
    j({ categorie: 'paiement', intitule: 'Paiement de l’avance après l’OS de démarrage de la période de préparation', reference: 'autre', jours: 30 }, 3),
    j({ categorie: 'documentaire', intitule: 'Observations du titulaire sur un ordre de service', reference: 'autre', jours: 15 }, 4),
  ]);
  v1.close();

  const { db } = await import('../src/db/schema');
  const lots = await db.lots.toArray();
  expect(lots.map((l) => l.numeroMarche)).toEqual(['M-1', 'M-1']);
  expect('numeroMarche' in (await db.chantiers.get(id as number))!).toBe(false);
  expect((await db.penalites.toArray()).map((p) => p.motif)).toEqual(['Absence réunion lot 2']);
  expect(await db.penalitesAppliquees.count()).toBe(0);
  expect(db.verno).toBe(5);
  expect(await db.reunions.count()).toBe(0);
  const ch = (await db.chantiers.get(id as number))!;
  expect([ch.dureePreparation, ch.preparationComprise]).toEqual([60, false]);
  const js = await db.jalons.orderBy('uid').toArray();
  expect(js.map((x) => `${x.reference} ${x.jours}`)).toEqual(['fin_preparation 0', 'OS_demarrage 480', 'fin_preparation 0', 'OS_demarrage 30', 'autre 15']);
});
