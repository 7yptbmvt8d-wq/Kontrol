// Checklist : filtres, regroupement lot › phase, statistiques. Logique pure (sans React).
import type { Lot, PhaseControle, PointControle } from './types';
import { ORDRE_PHASES, bloquantNonValide } from './statuts';

export type FiltreEtat = 'tous' | 'bloquants' | 'a_faire' | 'en_cours' | 'non_conforme';

export interface Filtres { etat: FiltreEtat; lot: string; texte: string }

const norm = (s: string) => s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

export const estValide = (p: PointControle) => p.etat === 'conforme' || p.etat === 'sans_objet';

export function correspond(p: PointControle, f: Filtres): boolean {
  if (f.lot && p.lot !== f.lot) return false;
  if (f.etat === 'bloquants' && !bloquantNonValide(p)) return false;
  if (f.etat !== 'tous' && f.etat !== 'bloquants' && p.etat !== f.etat) return false;
  if (f.texte.trim()) {
    const cible = norm([p.intitule, p.articleCctp, p.reference, p.critere, p.id, p.commentaire].join(' '));
    if (!norm(f.texte).split(/\s+/).filter(Boolean).every((mot) => cible.includes(mot))) return false;
  }
  return true;
}

export interface Groupe { lot: string; phase: PhaseControle; points: PointControle[]; valides: number; total: number }

/** Groupes lot › phase (ordre des lots puis des phases), avec compteur validés/total calculé sur tout le groupe. */
export function grouper(points: PointControle[], lots: Lot[], f: Filtres): Groupe[] {
  const ordreLot = new Map(lots.map((l, i) => [l.code, i]));
  const tries = [...points].sort((a, b) =>
    (ordreLot.get(a.lot) ?? 999) - (ordreLot.get(b.lot) ?? 999)
    || ORDRE_PHASES.indexOf(a.phase) - ORDRE_PHASES.indexOf(b.phase)
    || a.ordre - b.ordre);
  const groupes: Groupe[] = [];
  for (const p of tries) {
    let g = groupes[groupes.length - 1];
    if (!g || g.lot !== p.lot || g.phase !== p.phase) groupes.push((g = { lot: p.lot, phase: p.phase, points: [], valides: 0, total: 0 }));
    g.total++;
    if (estValide(p)) g.valides++;
    if (correspond(p, f)) g.points.push(p);
  }
  return groupes.filter((g) => g.points.length);
}

export interface Stats {
  total: number; conformes: number; sansObjet: number; nonConformes: number; enCours: number; aFaire: number;
  bloquants: number; nonConformesBloquants: number;
}

export function statistiques(points: PointControle[]): Stats {
  const s: Stats = { total: points.length, conformes: 0, sansObjet: 0, nonConformes: 0, enCours: 0, aFaire: 0, bloquants: 0, nonConformesBloquants: 0 };
  for (const p of points) {
    if (p.etat === 'conforme') s.conformes++;
    else if (p.etat === 'sans_objet') s.sansObjet++;
    else if (p.etat === 'non_conforme') { s.nonConformes++; if (p.bloquant) s.nonConformesBloquants++; }
    else if (p.etat === 'en_cours') s.enCours++;
    else s.aFaire++;
    if (bloquantNonValide(p)) s.bloquants++;
  }
  return s;
}

/**
 * Ordre de parcours mémorisé (liste filtrée affichée) pour « point précédent / suivant » dans le détail.
 * Figé à l'ouverture d'un point : changer l'état d'un point ne fait pas sauter la navigation.
 */
const parcours = new Map<number, number[]>();
export const memoriserParcours = (chantierId: number, uids: number[]) => parcours.set(chantierId, uids);
export const lireParcours = (chantierId: number) => parcours.get(chantierId);
