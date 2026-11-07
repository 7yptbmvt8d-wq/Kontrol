// Écritures sur les réserves. Chaque action met à jour le statut, l'historique et la date de modification
// du chantier dans une seule transaction.
import { db, getReglage, setReglage } from '../db/schema';
import type { EvenementReserve, Reserve } from '../domain/types';
import { fmtDate } from '../domain/dates';
import { refReserve } from '../domain/statuts';

export type NouvelleReserve = Omit<Reserve, 'id' | 'numero' | 'statut' | 'historique' | 'creeLe' | 'levee'>;

const evt = (type: EvenementReserve['type'], texte: string): EvenementReserve => ({ date: new Date().toISOString(), type, texte });

/** Dernières valeurs saisies (lot, entreprise par lot, localisation), mémorisées par chantier. */
export interface Memoire { lot?: string; entreprises: Record<string, string>; localisation?: string }
export const lireMemoire = (chantierId: number) => getReglage<Memoire>(`saisie:${chantierId}`, { entreprises: {} });

export async function creerReserve(r: NouvelleReserve): Promise<Reserve> {
  const now = new Date().toISOString();
  const cree = await db.transaction('rw', [db.chantiers, db.reserves], async () => {
    const ch = (await db.chantiers.get(r.chantierId))!;
    const numero = (ch.compteurReserve ?? 0) + 1;
    const origine = r.pointId ? `Créée depuis le point ${r.pointId}` : `Créée (${r.origine === 'opr' ? 'OPR' : r.origine === 'cr' ? 'CR' : r.origine === 'controle' ? 'contrôle' : 'visite'})`;
    const reserve: Reserve = { ...r, numero, statut: 'ouvert', historique: [evt('creation', origine)], creeLe: now };
    reserve.id = (await db.reserves.add(reserve)) as number;
    await db.chantiers.update(r.chantierId, { compteurReserve: numero, majLe: now });
    return reserve;
  });
  const m = await lireMemoire(r.chantierId);
  await setReglage(`saisie:${r.chantierId}`, {
    lot: r.lotCode, entreprises: { ...m.entreprises, [r.lotCode]: r.entreprise }, localisation: r.localisation,
  } satisfies Memoire);
  return cree;
}

async function appliquer(id: number, patch: (r: Reserve) => Partial<Reserve>, e: (r: Reserve) => EvenementReserve) {
  await db.transaction('rw', [db.chantiers, db.reserves], async () => {
    const r = await db.reserves.get(id);
    if (!r) throw new Error('Réserve introuvable');
    await db.reserves.update(id, { ...patch(r), historique: [...r.historique, e(r)] });
    await db.chantiers.update(r.chantierId, { majLe: new Date().toISOString() });
  });
}

const avecNote = (texte: string, note?: string) => (note?.trim() ? `${texte} : ${note.trim()}` : texte);
const nouvelleEcheance = (echeance?: string) => (echeance ? ` · nouvelle échéance ${fmtDate(echeance)}` : '');

export function relancer(id: number, echeance?: string, note?: string) {
  return appliquer(id, () => ({ statut: 'relance', ...(echeance ? { echeance } : {}) }), (r) => {
    const n = r.historique.filter((h) => h.type === 'relance').length + 1;
    return evt('relance', avecNote(`Relance n°${n}${nouvelleEcheance(echeance)}`, note));
  });
}

export function signalerLevee(id: number, note?: string) {
  return appliquer(id, () => ({ statut: 'levee_a_verifier' }), (r) => evt('levee_a_verifier', avecNote(`Travaux signalés terminés par ${r.entreprise || 'l’entreprise'}`, note)));
}

export function lever(id: number, date: string, photoIds: number[], note?: string) {
  return appliquer(id, () => ({ statut: 'leve', levee: { date, photoIds } }), () => evt('levee', avecNote(`Levée constatée le ${fmtDate(date)}`, note)));
}

export function refuserLevee(id: number, echeance?: string, note?: string) {
  return appliquer(id, () => ({ statut: 'relance', ...(echeance ? { echeance } : {}) }), () => evt('refus', avecNote(`Levée refusée${nouvelleEcheance(echeance)}`, note)));
}

export function rouvrir(id: number, note?: string) {
  return db.transaction('rw', [db.chantiers, db.reserves, db.photos], async () => {
    const r = await db.reserves.get(id);
    if (r?.levee) await db.photos.bulkDelete(r.levee.photoIds);
    await appliquer(id, () => ({ statut: 'ouvert', levee: undefined }), () => evt('reouverture', avecNote('Réserve rouverte', note)));
  });
}

export function modifier(id: number, champs: Partial<Reserve>) {
  return appliquer(id, () => champs, () => evt('modification', 'Réserve modifiée'));
}

export async function supprimer(r: Reserve) {
  await db.transaction('rw', [db.reserves, db.photos], async () => {
    await db.photos.bulkDelete([...r.photoIds, ...(r.levee?.photoIds ?? [])]);
    await db.reserves.delete(r.id!);
  });
}

export { refReserve };
