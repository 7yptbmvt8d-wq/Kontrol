// Export texte « points non soldés » (checklist + réserves + jalons), à coller dans Claude
// pour préparer le CR et la feuille de route de la réunion suivante.
import { aujourdHui, contexte, datePoint, ecartJours, fmtDate, fmtHeure, texteProlongations } from '../../domain/dates';
import { ETAT_POINT, GRAVITE, PHASE_CHANTIER, RESPONSABLE, TYPE_CONTROLE, bloquantNonValide, refReserve } from '../../domain/statuts';
import { pourcentage, statistiques } from '../../domain/checklist';
import type { PointControle } from '../../domain/types';
import { STATUT_PENALITE, euros, pluriel } from '../../domain/penalites';
import { derniereAction, lignesJalons, origineTexte, parEntreprise, statutTexte, type DonneesChantier } from './donnees';

const HORIZON = 15; // jours : points « à faire » dont l'échéance approche

export function pointsNonSoldes(d: DonneesChantier, ref = aujourdHui(), maintenant = new Date()): string {
  const { ch, lots, points, reserves, intervenants, jalons } = d;
  const L: string[] = [];
  const titre = (t: string) => { L.push('', t, '-'.repeat(Math.min(t.length, 60))); };

  L.push(`POINTS NON SOLDÉS — ${ch.nom}`);
  if (ch.operation) L.push(`Opération : ${ch.operation}`);
  if (ch.site) L.push(`Site : ${ch.site}`);
  L.push(`Édité le ${fmtDate(ref)} à ${fmtHeure(maintenant.toISOString())} · phase : ${PHASE_CHANTIER[ch.phase]}` +
    `${ch.dateOS ? ` · OS de démarrage : ${fmtDate(ch.dateOS)}` : ''} · checklist : ${pourcentage(statistiques(points))} % validée`);
  const ctx = contexte(ch, lots, jalons);
  if (ch.dureePreparation || ctx.reception) {
    L.push([
      ch.dureePreparation && `Période de préparation : ${ch.dureePreparation} j${ch.preparationComprise === false ? ' (non comprise dans le délai)' : ''}${ctx.finPreparation ? `, fin le ${fmtDate(ctx.finPreparation)}` : ''}`,
      ctx.delai !== undefined && `délai d’exécution : ${ctx.delai} j${ctx.debutDelai ? ` à compter du ${fmtDate(ctx.debutDelai)}` : ''}`,
      ctx.reception && `réception ${ctx.receptionReelle ? '' : 'prévisionnelle '}: ${fmtDate(ctx.reception)}`,
    ].filter(Boolean).join(' · '));
  }
  if (texteProlongations(ch)) L.push(`Prolongations de délai : ${texteProlongations(ch)}`);

  titre('MARCHÉS (1 lot = 1 marché)');
  for (const l of lots) {
    const tit = intervenants.filter((i) => i.lotCode === l.code && i.role === 'titulaire').map((i) => i.raisonSociale).join(', ');
    const st = intervenants.filter((i) => i.lotCode === l.code && i.role === 'sous_traitant').map((i) => i.raisonSociale);
    L.push(`- ${l.code} ${l.intitule ? `(${l.intitule}) ` : ''}· marché ${l.numeroMarche || 'n° non renseigné'} · titulaire : ${tit || '—'}` +
      `${st.length ? ` · sous-traitants : ${st.join(', ')}` : ''}${l.dateOS ? ` · OS du lot : ${fmtDate(l.dateOS)}` : ''}`);
  }

  const ligne = (p: PointControle) => {
    const date = datePoint(p, ch, lots, jalons);
    const ech = date ? `${fmtDate(date)}${ecartJours(date, ref) > 0 ? ` (dépassée de ${ecartJours(date, ref)} j)` : ''}` : p.echeance.valeur || '—';
    const morceaux = [
      `[${p.lot}] ${p.articleCctp || p.id} — ${p.intitule}`,
      `  État : ${ETAT_POINT[p.etat].libelle}${p.dateEtat && p.etat !== 'a_faire' ? ` (${fmtDate(p.dateEtat)})` : ''} · ${TYPE_CONTROLE[p.type]} · responsable : ${RESPONSABLE[p.responsable]} · échéance : ${ech}`,
    ];
    if (p.critere) morceaux.push(`  Critère : ${p.critere}${p.reference ? ` (${p.reference})` : ''}`);
    if (p.commentaire) morceaux.push(`  Commentaire : ${p.commentaire}`);
    const liees = reserves.filter((r) => r.pointId === p.id && r.statut !== 'leve');
    if (liees.length) morceaux.push(`  Réserves liées : ${liees.map((r) => refReserve(r.numero)).join(', ')}`);
    return morceaux.join('\n');
  };
  const section = (t: string, liste: PointControle[]) => {
    titre(`${t} (${liste.length})`);
    if (!liste.length) L.push('Aucun.');
    for (const p of liste) L.push(ligne(p));
  };

  const ouverts = points.filter((p) => p.etat !== 'conforme' && p.etat !== 'sans_objet');
  const bloquants = ouverts.filter(bloquantNonValide);
  const nonConformes = ouverts.filter((p) => p.etat === 'non_conforme' && !p.bloquant);
  const enCours = ouverts.filter((p) => p.etat === 'en_cours' && !p.bloquant);
  const urgents = ouverts.filter((p) => {
    if (p.bloquant || p.etat !== 'a_faire') return false;
    const date = datePoint(p, ch, lots, jalons);
    return !!date && ecartJours(ref, date) <= HORIZON;
  });

  section('1. POINTS BLOQUANTS NON VALIDÉS', bloquants);
  section('2. POINTS NON CONFORMES', nonConformes);
  section('3. POINTS EN COURS', enCours);
  section(`4. POINTS À FAIRE — ÉCHÉANCE DÉPASSÉE OU DANS LES ${HORIZON} JOURS`, urgents);

  const reste = ouverts.length - bloquants.length - nonConformes.length - enCours.length - urgents.length;
  if (reste > 0) {
    const parLot = lots.map((l) => `${l.code} : ${ouverts.filter((p) => p.lot === l.code && !bloquants.includes(p) && !nonConformes.includes(p) && !enCours.includes(p) && !urgents.includes(p)).length}`);
    L.push('', `Autres points à faire sans urgence : ${reste} (${parLot.join(' · ')}).`);
  }

  const nonLevees = reserves.filter((r) => r.statut !== 'leve');
  titre(`5. RÉSERVES NON LEVÉES (${nonLevees.length})`);
  if (!nonLevees.length) L.push('Aucune.');
  for (const [ent, rs] of parEntreprise(nonLevees)) {
    L.push(`${ent} — ${rs.length} réserve${rs.length > 1 ? 's' : ''}`);
    for (const r of rs) {
      L.push(`- ${refReserve(r.numero)} [${r.lotCode}] ${r.description}${r.localisation ? ` · ${r.localisation}` : ''}`);
      L.push(`  ${GRAVITE[r.gravite]} · ${statutTexte(r, ref)} · échéance ${fmtDate(r.echeance)} · origine : ${origineTexte(r)} · créée le ${fmtDate(r.creeLe.slice(0, 10))}`);
      const der = derniereAction(r);
      if (der && r.historique.length > 1) L.push(`  Dernière action : ${der}`);
    }
  }

  const jal = lignesJalons(d, ref).filter((x) => !x.j.dateRealisee && x.date && ecartJours(ref, x.date) <= 30);
  titre(`6. JALONS EN RETARD OU DANS LES 30 JOURS (${jal.length})`);
  if (!jal.length) L.push('Aucun.');
  for (const x of jal) L.push(`- ${fmtDate(x.date)} · ${x.j.lotCode ? `[${x.j.lotCode}] ` : ''}${x.j.intitule} · ${x.statut}${x.j.articleCcap ? ` · CCAP ${x.j.articleCcap}` : ''}`);

  const pens = d.appliquees;
  const totalPen = pens.reduce((t, p) => t + p.montant, 0);
  titre(`7. PÉNALITÉS APPLIQUÉES (${pens.length}${pens.length ? ` · ${euros(totalPen)}` : ''})`);
  if (!pens.length) L.push('Aucune.');
  for (const l of lots) {
    const duLot = pens.filter((p) => p.lotCode === l.code);
    if (!duLot.length) continue;
    L.push(`${l.code} · marché ${l.numeroMarche || 'n° non renseigné'} — ${euros(duLot.reduce((t, p) => t + p.montant, 0))}${l.montantHT ? ` (${((duLot.reduce((t, p) => t + p.montant, 0) / l.montantHT) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % du marché)` : ''}`);
    for (const p of duLot) {
      L.push(`- ${fmtDate(p.date)} · ${p.motif}${p.articleCcap ? ` (CCAP ${p.articleCcap})` : ''} · ${pluriel(p.quantite, p.unite)}${p.montantUnitaire !== undefined ? ` × ${euros(p.montantUnitaire)}` : ''} = ${euros(p.montant)} · ${STATUT_PENALITE[p.statut].libelle}${p.note ? ` · ${p.note}` : ''}`);
    }
  }

  return L.join('\n') + '\n';
}
