import Dexie, { type EntityTable } from 'dexie';
import type {
  Chantier, Lot, Intervenant, PointControle, Reserve, Jalon, Penalite, PenaliteAppliquee, Reunion, Photo, Reglage,
} from '../domain/types';

export class KontrolDB extends Dexie {
  chantiers!: EntityTable<Chantier, 'id'>;
  lots!: EntityTable<Lot, 'id'>;
  intervenants!: EntityTable<Intervenant, 'id'>;
  points!: EntityTable<PointControle, 'uid'>;
  reserves!: EntityTable<Reserve, 'id'>;
  jalons!: EntityTable<Jalon, 'uid'>;
  penalites!: EntityTable<Penalite, 'id'>;
  penalitesAppliquees!: EntityTable<PenaliteAppliquee, 'id'>;
  reunions!: EntityTable<Reunion, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  reglages!: EntityTable<Reglage, 'cle'>;

  constructor() {
    super('kontrol');
    this.version(1).stores({
      chantiers: '++id, nom',
      lots: '++id, chantierId, [chantierId+code]',
      intervenants: '++id, chantierId',
      points: '++uid, chantierId, [chantierId+id], [chantierId+lot], etat',
      reserves: '++id, chantierId, [chantierId+numero], statut, echeance',
      jalons: '++uid, chantierId',
      penalites: '++id, chantierId',
      photos: '++id, chantierId',
      reglages: 'cle',
    });
    // v2 : un lot = un marché → le n° de marché passe du chantier aux lots.
    this.version(2).stores({}).upgrade(async (tx) => {
      const chantiers = await tx.table('chantiers').toArray();
      for (const c of chantiers) {
        const ancien = (c as { numeroMarche?: string }).numeroMarche ?? '';
        await tx.table('lots').where('chantierId').equals(c.id).modify((l: { numeroMarche?: string }) => {
          if (l.numeroMarche === undefined) l.numeroMarche = ancien;
        });
        await tx.table('chantiers').update(c.id, { numeroMarche: undefined });
      }
    });
    // v3 : registre des pénalités appliquées (distinct du barème du CCAP)
    this.version(3).stores({ penalitesAppliquees: '++id, chantierId, [chantierId+lotCode]' });
    // v4 : réunions de chantier (présences, observations et décisions)
    this.version(4).stores({ reunions: '++id, chantierId, [chantierId+numero]' });
  }
}

export const db = new KontrolDB();

export async function getReglage<T>(cle: string, defaut: T): Promise<T> {
  const r = await db.reglages.get(cle);
  return r ? (r.valeur as T) : defaut;
}

export async function setReglage(cle: string, valeur: unknown): Promise<void> {
  await db.reglages.put({ cle, valeur });
}

/** Supprime un chantier et toutes ses données. */
export async function supprimerChantier(chantierId: number): Promise<void> {
  await db.transaction('rw', [db.chantiers, db.lots, db.intervenants, db.points, db.reserves, db.jalons, db.penalites, db.penalitesAppliquees, db.reunions, db.photos], async () => {
    for (const t of [db.lots, db.intervenants, db.points, db.reserves, db.jalons, db.penalites, db.penalitesAppliquees, db.reunions, db.photos]) {
      await t.where('chantierId').equals(chantierId).delete();
    }
    await db.chantiers.delete(chantierId);
  });
}
