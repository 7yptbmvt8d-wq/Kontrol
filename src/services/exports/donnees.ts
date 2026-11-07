// Chargement de toutes les données d'un chantier pour les exports, et valeurs calculées communes.
import { db } from '../../db/schema';
import type { Chantier, Intervenant, Jalon, Lot, Penalite, PenaliteAppliquee, PointControle, Reserve } from '../../domain/types';
import { aujourdHui, contexte, dateJalon, ecartJours, fmtDate, statutJalon } from '../../domain/dates';
import { GRAVITE, ORIGINE, STATUT_RESERVE, refReserve, statutAffiche } from '../../domain/statuts';

export interface DonneesChantier {
  ch: Chantier; lots: Lot[]; intervenants: Intervenant[]; points: PointControle[];
  reserves: Reserve[]; jalons: Jalon[]; penalites: Penalite[]; appliquees: PenaliteAppliquee[];
}

export async function chargerChantier(id: number): Promise<DonneesChantier> {
  const [ch, lots, intervenants, points, reserves, jalons, penalites, appliquees] = await Promise.all([
    db.chantiers.get(id),
    db.lots.where('chantierId').equals(id).sortBy('ordre'),
    db.intervenants.where('chantierId').equals(id).toArray(),
    db.points.where('chantierId').equals(id).sortBy('ordre'),
    db.reserves.where('chantierId').equals(id).sortBy('numero'),
    db.jalons.where('chantierId').equals(id).sortBy('ordre'),
    db.penalites.where('chantierId').equals(id).toArray(),
    db.penalitesAppliquees.where('chantierId').equals(id).sortBy('date'),
  ]);
  if (!ch) throw new Error('Chantier introuvable');
  return { ch, lots, intervenants, points, reserves, jalons, penalites, appliquees };
}

/** Libellé de statut d'une réserve pour les documents (avec retard). */
export function statutTexte(r: Reserve, ref = aujourdHui()): string {
  const st = statutAffiche(r, ref);
  if (st === 'en_retard') return `${STATUT_RESERVE.en_retard.libelle} (+${ecartJours(r.echeance!, ref)} j)`;
  if (r.statut === 'leve' && r.levee) return `Levée le ${fmtDate(r.levee.date)}`;
  return STATUT_RESERVE[st].libelle;
}

export const libelleReserve = (r: Reserve) => `${refReserve(r.numero)} · ${r.lotCode} · ${GRAVITE[r.gravite]}`;
export const origineTexte = (r: Reserve) => (r.pointId ? `Contrôle (point ${r.pointId})` : ORIGINE[r.origine]);
export const derniereAction = (r: Reserve) => {
  const h = r.historique.at(-1);
  return h ? `${h.texte} (${fmtDate(h.date.slice(0, 10))})` : '';
};

export interface LigneJalon { j: Jalon; date?: string; statut: string; retard: number; calcul: string }

export function lignesJalons(d: DonneesChantier, ref = aujourdHui()): LigneJalon[] {
  return d.jalons.map((j) => {
    const ctx = contexte(d.ch, d.lots, d.jalons, j.lotCode);
    const date = dateJalon(j, ctx);
    const st = statutJalon(j, date, ref);
    const retard = st === 'en_retard' ? ecartJours(date!, ref) : 0;
    const statut = st === 'fait' ? `Fait le ${fmtDate(j.dateRealisee)}` : st === 'en_retard' ? `En retard (+${retard} j)` : st === 'a_venir' ? 'À venir' : 'Non daté';
    const calcul = j.reference === 'autre' ? 'Date saisie' : `${j.reference === 'OS_demarrage' ? 'OS' : 'Réception'} ${j.jours < 0 ? '-' : '+'} ${Math.abs(j.jours)} j`;
    return { j, date, statut, retard, calcul };
  }).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.j.ordre - b.j.ordre);
}

/** Entreprise → réserves (ordre alphabétique des entreprises, puis numéro). */
export function parEntreprise(reserves: Reserve[]): [string, Reserve[]][] {
  const m = new Map<string, Reserve[]>();
  for (const r of reserves) {
    const e = r.entreprise || 'Entreprise non renseignée';
    m.set(e, [...(m.get(e) ?? []), r]);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([e, rs]) => [e, rs.sort((a, b) => a.numero - b.numero)]);
}

/** Nom de fichier sûr : « Réserves – METALCO » → « Reserves-METALCO ». */
export function nomFichier(...parties: string[]): string {
  return parties.join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export const horodatage = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
