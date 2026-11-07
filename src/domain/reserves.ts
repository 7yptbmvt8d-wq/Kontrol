// Réserves : filtres, tri, compteurs. Logique pure (sans React).
import type { Gravite, Reserve, StatutReserveAffiche } from './types';
import { statutAffiche } from './statuts';
import { aujourdHui } from './dates';

export type FiltreStatut = 'toutes' | 'non_levees' | StatutReserveAffiche;
export type Tri = 'echeance' | 'numero' | 'gravite';
export interface FiltresReserves { statut: FiltreStatut; lot: string; entreprise: string; tri: Tri }

const ORDRE_GRAVITE: Record<Gravite, number> = { bloquante: 0, majeure: 1, mineure: 2 };
/** Priorité d'affichage : à traiter d'abord, levées en dernier. */
const ORDRE_STATUT: Record<StatutReserveAffiche, number> = { en_retard: 0, levee_a_verifier: 1, relance: 2, ouvert: 3, leve: 4 };

export function compter(reserves: Reserve[], ref = aujourdHui()): Record<FiltreStatut, number> {
  const c: Record<FiltreStatut, number> = { toutes: reserves.length, non_levees: 0, en_retard: 0, relance: 0, ouvert: 0, levee_a_verifier: 0, leve: 0 };
  for (const r of reserves) {
    c[statutAffiche(r, ref)]++;
    if (r.statut !== 'leve') c.non_levees++;
  }
  return c;
}

export function filtrerTrier(reserves: Reserve[], f: FiltresReserves, ref = aujourdHui()): Reserve[] {
  const liste = reserves.filter((r) => {
    const st = statutAffiche(r, ref);
    if (f.statut === 'non_levees' ? r.statut === 'leve' : f.statut !== 'toutes' && st !== f.statut) return false;
    if (f.lot && r.lotCode !== f.lot) return false;
    if (f.entreprise && r.entreprise !== f.entreprise) return false;
    return true;
  });
  const parEcheance = (a: Reserve, b: Reserve) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
  return liste.sort((a, b) => {
    if (f.tri === 'numero') return b.numero - a.numero; // plus récentes d'abord
    if (f.tri === 'gravite') return ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite] || parEcheance(a, b) || a.numero - b.numero;
    return ORDRE_STATUT[statutAffiche(a, ref)] - ORDRE_STATUT[statutAffiche(b, ref)] || parEcheance(a, b) || a.numero - b.numero;
  });
}

/** Entreprises distinctes présentes dans les réserves (pour le filtre). */
export const entreprises = (reserves: Reserve[]) => [...new Set(reserves.map((r) => r.entreprise).filter(Boolean))].sort((a, b) => a.localeCompare(b));
