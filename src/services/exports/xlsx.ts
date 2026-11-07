// Exports Excel (SheetJS) : réserves (liste ou par entreprise), jalons, points non soldés.
import * as XLSX from 'xlsx';
import type { Reserve } from '../../domain/types';
import { aujourdHui, datePoint, ecartJours } from '../../domain/dates';
import { ETAT_POINT, GRAVITE, PHASE_CONTROLE, RESPONSABLE, TYPE_CONTROLE, refReserve, statutAffiche, STATUT_RESERVE } from '../../domain/statuts';
import { derniereAction, lignesJalons, origineTexte, parEntreprise, type DonneesChantier } from './donnees';
import { STATUT_PENALITE } from '../../domain/penalites';
import { TYPES, type FichierPret } from './partage';

type Cellule = string | number | Date | undefined;
type Ligne = Record<string, Cellule>;

/** Date ISO « AAAA-MM-JJ » → vraie date Excel (triable, filtrable). */
const dateXl = (iso?: string) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

function feuille(lignes: Ligne[], largeurs: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(lignes, { cellDates: true, dateNF: 'dd/mm/yyyy', UTC: true });
  ws['!cols'] = largeurs.map((wch) => ({ wch }));
  if (lignes.length) ws['!autofilter'] = { ref: ws['!ref']! };
  return ws;
}

const nomFeuille = (nom: string, pris: Set<string>) => {
  let base = nom.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Feuille';
  let n = base;
  for (let i = 2; pris.has(n); i++) n = `${base.slice(0, 26)} ${i}`;
  pris.add(n);
  return n;
};

const blob = (wb: XLSX.WorkBook) =>
  new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true })], { type: TYPES.xlsx });

function lignesReserves(d: DonneesChantier, reserves: Reserve[], ref: string): Ligne[] {
  const marche = new Map(d.lots.map((l) => [l.code, l.numeroMarche]));
  return reserves.map((r) => {
    const st = statutAffiche(r, ref);
    return {
      'N°': refReserve(r.numero),
      Lot: r.lotCode,
      'N° marché': marche.get(r.lotCode) ?? '',
      Entreprise: r.entreprise,
      Localisation: r.localisation,
      Description: r.description,
      Gravité: GRAVITE[r.gravite],
      Statut: STATUT_RESERVE[st].libelle,
      Échéance: dateXl(r.echeance),
      'Retard (j)': st === 'en_retard' && r.echeance ? ecartJours(r.echeance, ref) : undefined,
      'Levée le': dateXl(r.levee?.date),
      Origine: origineTexte(r),
      'Créée le': dateXl(r.creeLe),
      Photos: r.photoIds.length + (r.levee?.photoIds.length ?? 0),
      'Dernière action': derniereAction(r),
    };
  });
}
const LARG_RESERVES = [7, 7, 16, 28, 22, 50, 10, 16, 11, 9, 11, 20, 11, 7, 45];

/** Réserves : une feuille (liste) ou une feuille par entreprise. */
export function xlsxReserves(d: DonneesChantier, reserves: Reserve[], decoupage: 'liste' | 'entreprise', nom: string): FichierPret {
  const ref = aujourdHui();
  const wb = XLSX.utils.book_new();
  const pris = new Set<string>();
  if (decoupage === 'liste') {
    XLSX.utils.book_append_sheet(wb, feuille(lignesReserves(d, reserves, ref), LARG_RESERVES), nomFeuille('Réserves', pris));
  } else {
    const groupes = parEntreprise(reserves);
    const synthese = groupes.map(([e, rs]) => ({
      Entreprise: e,
      Total: rs.length,
      'Non levées': rs.filter((r) => r.statut !== 'leve').length,
      'En retard': rs.filter((r) => statutAffiche(r, ref) === 'en_retard').length,
      'Levées': rs.filter((r) => r.statut === 'leve').length,
    }));
    XLSX.utils.book_append_sheet(wb, feuille(synthese, [36, 8, 11, 10, 8]), nomFeuille('Synthèse', pris));
    for (const [e, rs] of groupes) XLSX.utils.book_append_sheet(wb, feuille(lignesReserves(d, rs, ref), LARG_RESERVES), nomFeuille(e, pris));
  }
  wb.Props = { Title: nom, Subject: d.ch.nom };
  return { nom, blob: blob(wb) };
}

export function xlsxJalons(d: DonneesChantier, nom: string): FichierPret {
  const wb = XLSX.utils.book_new();
  const lignes = lignesJalons(d).map((x) => ({
    Date: dateXl(x.date),
    Jalon: x.j.intitule,
    Marché: x.j.lotCode ?? 'Commun',
    Catégorie: x.j.categorie,
    Calcul: x.calcul,
    Statut: x.statut,
    'Retard (j)': x.retard || undefined,
    'Réalisé le': dateXl(x.j.dateRealisee),
    'Article CCAP': x.j.articleCcap,
  }));
  XLSX.utils.book_append_sheet(wb, feuille(lignes, [11, 55, 10, 13, 18, 18, 9, 11, 16]), 'Jalons');
  const pen = d.penalites.map((p) => ({ Marché: p.lotCode ?? 'Commun', Motif: p.motif, 'Montant ou taux': p.montantOuTaux, 'Article CCAP': p.articleCcap }));
  if (pen.length) XLSX.utils.book_append_sheet(wb, feuille(pen, [10, 60, 40, 16]), 'Pénalités');
  return { nom, blob: blob(wb) };
}

/** Points non soldés (tout point ni conforme ni sans objet) + réserves non levées. */
export function xlsxNonSoldes(d: DonneesChantier, nom: string): FichierPret {
  const ref = aujourdHui();
  const wb = XLSX.utils.book_new();
  const pts = d.points.filter((p) => p.etat !== 'conforme' && p.etat !== 'sans_objet').map((p) => {
    const date = datePoint(p, d.ch, d.lots);
    return {
      Lot: p.lot,
      Article: p.articleCctp,
      Intitulé: p.intitule,
      Phase: PHASE_CONTROLE[p.phase],
      Type: TYPE_CONTROLE[p.type],
      Bloquant: p.bloquant ? 'Oui' : '',
      État: ETAT_POINT[p.etat].libelle,
      Échéance: date ? dateXl(date) : p.echeance.valeur,
      'Retard (j)': date && ecartJours(date, ref) > 0 ? ecartJours(date, ref) : undefined,
      Responsable: RESPONSABLE[p.responsable],
      Critère: p.critere,
      Référentiel: p.reference,
      Commentaire: p.commentaire,
    };
  });
  XLSX.utils.book_append_sheet(wb, feuille(pts, [7, 12, 50, 12, 13, 9, 13, 14, 9, 14, 45, 22, 40]), 'Points non soldés');
  const res = d.reserves.filter((r) => r.statut !== 'leve');
  XLSX.utils.book_append_sheet(wb, feuille(lignesReserves(d, res, ref), LARG_RESERVES), 'Réserves non levées');
  return { nom, blob: blob(wb) };
}

/** Registre des pénalités appliquées : synthèse par marché, détail, barème du CCAP. */
export function xlsxPenalites(d: DonneesChantier, nom: string): FichierPret {
  const wb = XLSX.utils.book_new();
  const synthese = d.lots.map((l) => {
    const ps = d.appliquees.filter((p) => p.lotCode === l.code);
    const total = ps.reduce((t, p) => t + p.montant, 0);
    return {
      Marché: l.code, 'N° marché': l.numeroMarche, 'Montant marché (€ HT)': l.montantHT,
      Pénalités: ps.length, 'Total (€ HT)': total,
      'Constatées (€ HT)': ps.filter((p) => p.statut === 'constatee').reduce((t, p) => t + p.montant, 0),
      'Notifiées (€ HT)': ps.filter((p) => p.statut === 'notifiee').reduce((t, p) => t + p.montant, 0),
      'Retenues (€ HT)': ps.filter((p) => p.statut === 'retenue').reduce((t, p) => t + p.montant, 0),
      '% du marché': l.montantHT ? Math.round((total / l.montantHT) * 10000) / 100 : undefined,
    };
  });
  XLSX.utils.book_append_sheet(wb, feuille(synthese, [8, 16, 18, 11, 13, 16, 15, 15, 11]), 'Synthèse');
  const detail = d.appliquees.map((p) => ({
    Date: dateXl(p.date), Marché: p.lotCode, Entreprise: p.entreprise, Motif: p.motif, 'Article CCAP': p.articleCcap,
    Quantité: p.quantite, Unité: p.unite, 'Montant unitaire (€ HT)': p.montantUnitaire, 'Montant (€ HT)': p.montant,
    Statut: STATUT_PENALITE[p.statut].libelle, 'Notifiée le': dateXl(p.dateNotification), Note: p.note,
  }));
  XLSX.utils.book_append_sheet(wb, feuille(detail, [11, 8, 30, 50, 12, 9, 11, 14, 13, 18, 11, 40]), 'Pénalités appliquées');
  const bareme = d.penalites.map((p) => ({ Marché: p.lotCode ?? 'Commun', Motif: p.motif, 'Montant ou taux': p.montantOuTaux, 'Article CCAP': p.articleCcap }));
  XLSX.utils.book_append_sheet(wb, feuille(bareme, [10, 60, 40, 16]), 'Barème CCAP');
  return { nom, blob: blob(wb) };
}
