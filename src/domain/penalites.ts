// Pénalités : lecture du barème du CCAP (montant fixe ou taux du marché), totaux par marché. Logique pure.
import type { PenaliteAppliquee, StatutPenalite } from './types';
import type { Ton } from './statuts';

export const STATUT_PENALITE: Record<StatutPenalite, { libelle: string; ton: Ton }> = {
  constatee: { libelle: 'Constatée', ton: 'o' },
  notifiee: { libelle: 'Notifiée', ton: 'b' },
  retenue: { libelle: 'Retenue au décompte', ton: 'n' },
};

export interface LectureBareme {
  mode: 'fixe' | 'taux' | 'inconnu';
  unitaire?: number; // € HT par unité (fixe, ou calculé depuis le montant du marché)
  taux?: number; // ex. 1/1000
  unite: string; // « jour », « absence », « manquement », « forfait »
}

const nombre = (s: string) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));

/**
 * « 200 € HT par absence » → fixe 200 / absence ; « 1/1000 du montant HT du marché par jour » → taux (× montant du marché) ;
 * « 2 000 € HT » → fixe 2 000 / forfait.
 */
export function lireBareme(texte: string, montantMarche?: number): LectureBareme {
  const t = texte.toLowerCase();
  const par = /par\s+(?:jour|journée)/.test(t) ? 'jour' : /\bpar\s+([a-zà-ÿ]+)/.exec(t)?.[1] ?? 'forfait';
  const unite = par.replace(/s$/, '');
  const taux = /(\d+)\s*\/\s*(\d[\d\s]*)/.exec(t);
  if (taux && /montant/.test(t)) {
    const k = Number(taux[1]) / nombre(taux[2]);
    return { mode: 'taux', taux: k, unitaire: montantMarche ? Math.round(montantMarche * k * 100) / 100 : undefined, unite };
  }
  const fixe = /(\d[\d\s  ]*(?:[.,]\d+)?)\s*(?:€|euros?)/.exec(t);
  if (fixe) return { mode: 'fixe', unitaire: nombre(fixe[1]), unite };
  return { mode: 'inconnu', unite };
}

export const euros = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).replace(/ /g, ' ')} € HT`;

export const pluriel = (n: number, unite: string) => `${n} ${unite}${n > 1 && !/[sx]$/.test(unite) ? 's' : ''}`;

export interface TotalMarche { lotCode: string; nombre: number; total: number; constatee: number; notifiee: number; retenue: number }

export function totauxParMarche(ps: PenaliteAppliquee[]): Map<string, TotalMarche> {
  const m = new Map<string, TotalMarche>();
  for (const p of ps) {
    const t = m.get(p.lotCode) ?? { lotCode: p.lotCode, nombre: 0, total: 0, constatee: 0, notifiee: 0, retenue: 0 };
    t.nombre++;
    t.total += p.montant;
    t[p.statut] += p.montant;
    m.set(p.lotCode, t);
  }
  return m;
}
