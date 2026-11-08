// Mode réunion : participants, actions reprises, changements depuis la réunion précédente, compte rendu (texte pour Claude).
import type { Intervenant, Lot, Observation, Participant, PointControle, Reunion, TypeReunion, Chantier } from './types';
import { ROLE_INTERVENANT, ETAT_POINT, GRAVITE, bloquantNonValide, refReserve, statutAffiche, STATUT_RESERVE } from './statuts';
import { aujourdHui, datePoint, ecartJours, fmtDate, jourLocal, fmtHeure } from './dates';
import { pourcentage, statistiques } from './checklist';
import { STATUT_PENALITE, euros, pluriel } from './penalites';
import type { DonneesChantier } from '../services/exports/donnees';

export const TYPE_REUNION: Record<TypeReunion, string> = {
  chantier: 'Réunion de chantier', preparation: 'Réunion de préparation', opr: 'OPR', autre: 'Réunion',
};
export const PRESENCE = { present: 'Présent', excuse: 'Excusé', absent: 'Absent' } as const;
export const RESPONSABLES = ['Entreprise', 'MOE', 'MOA', 'Contrôleur technique', 'CSPS'];

const ORDRE_ROLE = ['titulaire', 'sous_traitant', 'moa', 'controleur_technique', 'csps', 'autre'];
export const nouvelId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 12);

/** Participants : maîtrise d'œuvre, intervenants du chantier (par lot), participants libres de la réunion précédente. */
export function participantsInitiaux(intervenants: Intervenant[], lots: Lot[], precedente?: Reunion): Participant[] {
  const ordreLot = new Map(lots.map((l, i) => [l.code, i]));
  const tries = [...intervenants].sort((a, b) =>
    (ordreLot.get(a.lotCode ?? '') ?? 99) - (ordreLot.get(b.lotCode ?? '') ?? 99) || ORDRE_ROLE.indexOf(a.role) - ORDRE_ROLE.indexOf(b.role));
  const liste: Participant[] = [
    { cle: 'moe', nom: 'Maîtrise d’œuvre', role: 'MOE', presence: 'present' },
    ...tries.map((i) => ({ cle: `i${i.id}`, nom: i.raisonSociale, role: ROLE_INTERVENANT[i.role], lotCode: i.lotCode || undefined, intervenantId: i.id })),
  ];
  for (const p of precedente?.participants ?? []) {
    if (!p.intervenantId && p.cle !== 'moe' && !liste.some((x) => x.nom === p.nom)) liste.push({ ...p, presence: undefined });
  }
  return liste;
}

/** Actions (observations avec échéance) non soldées de la réunion précédente, reprises avec le n° de la réunion d'origine. */
export function actionsReprises(precedente?: Reunion): Observation[] {
  return (precedente?.observations ?? [])
    .filter((o) => !o.faite && !!o.echeance)
    .map((o) => ({ ...o, id: nouvelId(), reprise: o.reprise ?? precedente!.numero }));
}

export function nouvelleReunion(chantierId: number, numero: number, intervenants: Intervenant[], lots: Lot[], precedente?: Reunion,
  maintenant = new Date()): Reunion {
  return {
    chantierId, numero, date: jourLocal(maintenant.toISOString()), heure: fmtHeure(maintenant.toISOString()),
    type: 'chantier', lieu: precedente?.lieu ?? '', participants: participantsInitiaux(intervenants, lots, precedente),
    observations: actionsReprises(precedente), cloturee: false, creeLe: maintenant.toISOString(),
  };
}

/**
 * Points à suivre en réunion.
 * - prioritaires : non conformes, en cours, échéance dépassée ou à 15 j (triés : non conformes, retards, en cours) ;
 * - autresBloquants : points bloquants encore à faire, sans échéance proche (résumés, détail sur demande).
 */
export function pointsASuivre(points: PointControle[], ch: Chantier, lots: Lot[], ref = aujourdHui()) {
  const prioritaires: { p: PointControle; rang: number }[] = [];
  const autresBloquants: PointControle[] = [];
  for (const p of points) {
    if (p.etat === 'conforme' || p.etat === 'sans_objet') continue;
    const d = datePoint(p, ch, lots);
    const ecart = d ? ecartJours(ref, d) : undefined; // < 0 : dépassée
    if (p.etat === 'non_conforme') prioritaires.push({ p, rang: 0 });
    else if (ecart !== undefined && ecart < 0) prioritaires.push({ p, rang: 1 });
    else if (p.etat === 'en_cours') prioritaires.push({ p, rang: 2 });
    else if (ecart !== undefined && ecart <= 15) prioritaires.push({ p, rang: 3 });
    else if (bloquantNonValide(p)) autresBloquants.push(p);
  }
  return { prioritaires: prioritaires.sort((a, b) => a.rang - b.rang || a.p.ordre - b.p.ordre).map((x) => x.p), autresBloquants };
}

export interface Changements {
  reservesCreees: string[]; reservesLevees: string[]; reservesRelancees: string[]; leveesSignalees: string[];
  pointsValides: string[]; pointsNonConformes: string[]; penalites: string[]; jalonsFaits: string[];
}

/** Ce qui a changé depuis un instant (début de la réunion précédente). */
export function changementsDepuis(depuis: string, d: DonneesChantier, jusqua = new Date().toISOString()): Changements {
  const dans = (ts?: string) => !!ts && ts >= depuis && ts <= jusqua;
  const jourDepuis = jourLocal(depuis);
  const evt = (type: string) => d.reserves.filter((r) => r.historique.some((h) => h.type === type && dans(h.date)))
    .map((r) => `${refReserve(r.numero)} [${r.lotCode}] ${r.description}`);
  return {
    reservesCreees: d.reserves.filter((r) => dans(r.creeLe)).map((r) => `${refReserve(r.numero)} [${r.lotCode}] ${r.description}`),
    reservesLevees: evt('levee'),
    reservesRelancees: evt('relance'),
    leveesSignalees: evt('levee_a_verifier'),
    pointsValides: d.points.filter((p) => (p.etat === 'conforme' || p.etat === 'sans_objet') && p.dateEtat && p.dateEtat >= jourDepuis)
      .map((p) => `[${p.lot}] ${p.intitule} (${ETAT_POINT[p.etat].libelle.toLowerCase()})`),
    pointsNonConformes: d.points.filter((p) => p.etat === 'non_conforme' && p.dateEtat && p.dateEtat >= jourDepuis).map((p) => `[${p.lot}] ${p.intitule}`),
    penalites: d.appliquees.filter((p) => dans(p.creeLe)).map((p) => `[${p.lotCode}] ${p.motif} : ${euros(p.montant)} (${STATUT_PENALITE[p.statut].libelle.toLowerCase()})`),
    jalonsFaits: d.jalons.filter((j) => j.dateRealisee && j.dateRealisee >= jourDepuis).map((j) => `${j.intitule} (${fmtDate(j.dateRealisee)})`),
  };
}

const ligneObs = (o: Observation) =>
  `- ${o.texte}${o.responsable ? ` — ${o.responsable}` : ''}${o.echeance ? ` — échéance ${fmtDate(o.echeance)}` : ''}` +
  `${o.reprise ? ` (reprise CR n°${o.reprise})` : ''}${o.faite ? ' — SOLDÉE' : ''}`;

/** Compte rendu structuré (texte à coller dans Claude pour rédiger le CR définitif et la feuille de route). */
export function compteRendu(r: Reunion, d: DonneesChantier, precedente?: Reunion, ref = aujourdHui()): string {
  const L: string[] = [];
  const titre = (t: string) => { L.push('', t, '-'.repeat(Math.min(t.length, 60))); };
  L.push(`COMPTE RENDU — ${TYPE_REUNION[r.type].toUpperCase()} N°${r.numero} — ${fmtDate(r.date)} à ${r.heure}`);
  L.push(`Chantier : ${d.ch.nom}`);
  if (d.ch.operation) L.push(`Opération : ${d.ch.operation}`);
  if (d.ch.site) L.push(`Site : ${d.ch.site}`);
  if (r.lieu) L.push(`Lieu : ${r.lieu}`);
  L.push(`Avancement de la checklist : ${pourcentage(statistiques(d.points))} %`);

  titre('1. PRÉSENCES');
  const nom = (p: Participant) => `${p.nom} (${p.role}${p.lotCode ? ` ${p.lotCode}` : ''})`;
  for (const [cle, lib] of [['present', 'Présents'], ['excuse', 'Excusés'], ['absent', 'Absents']] as const) {
    const ps = r.participants.filter((p) => p.presence === cle);
    L.push(`${lib} : ${ps.length ? ps.map(nom).join(' ; ') : '—'}`);
  }
  const nonPointes = r.participants.filter((p) => !p.presence);
  if (nonPointes.length) L.push(`Non pointés : ${nonPointes.map(nom).join(' ; ')}`);

  if (precedente) {
    const c = changementsDepuis(precedente.creeLe, d, r.clotureLe ?? new Date().toISOString());
    titre(`2. DEPUIS LA RÉUNION N°${precedente.numero} DU ${fmtDate(precedente.date)}`);
    const bloc = (lib: string, xs: string[]) => { if (xs.length) { L.push(`${lib} (${xs.length}) :`); xs.forEach((x) => L.push(`  - ${x}`)); } };
    bloc('Réserves levées', c.reservesLevees);
    bloc('Levées signalées par les entreprises, à vérifier', c.leveesSignalees);
    bloc('Nouvelles réserves', c.reservesCreees);
    bloc('Réserves relancées', c.reservesRelancees);
    bloc('Points validés', c.pointsValides);
    bloc('Points constatés non conformes', c.pointsNonConformes);
    bloc('Pénalités appliquées', c.penalites);
    bloc('Jalons réalisés', c.jalonsFaits);
    if (Object.values(c).every((x) => !x.length)) L.push('Aucun changement enregistré.');
  }

  const n = precedente ? 3 : 2;
  titre(`${n}. GÉNÉRALITÉS`);
  const generales = r.observations.filter((o) => !o.lotCode);
  if (!generales.length) L.push('Néant.');
  generales.forEach((o) => L.push(ligneObs(o)));

  titre(`${n + 1}. POINTS PAR MARCHÉ`);
  for (const l of d.lots) {
    const tit = d.intervenants.filter((i) => i.lotCode === l.code && i.role === 'titulaire').map((i) => i.raisonSociale).join(', ');
    L.push('', `${l.code}${l.intitule ? ` — ${l.intitule}` : ''} · marché ${l.numeroMarche || 'n° non renseigné'}${tit ? ` · ${tit}` : ''}`);
    const obs = r.observations.filter((o) => o.lotCode === l.code);
    L.push(`  Observations et décisions (${obs.length}) :`);
    if (!obs.length) L.push('  - Néant.');
    obs.forEach((o) => L.push(`  ${ligneObs(o)}`));
    const res = d.reserves.filter((x) => x.lotCode === l.code && x.statut !== 'leve');
    if (res.length) {
      L.push(`  Réserves non levées (${res.length}) :`);
      res.forEach((x) => L.push(`  - ${refReserve(x.numero)} ${x.description}${x.localisation ? ` · ${x.localisation}` : ''} — ${GRAVITE[x.gravite]} — ${STATUT_RESERVE[statutAffiche(x, ref)].libelle} — échéance ${fmtDate(x.echeance)}`));
    }
    const { prioritaires: pts, autresBloquants } = pointsASuivre(d.points.filter((p) => p.lot === l.code), d.ch, d.lots, ref);
    if (autresBloquants.length) L.push(`  Points bloquants restant à faire : ${autresBloquants.length} (sans échéance proche, voir la checklist).`);
    if (pts.length) {
      L.push(`  Points de contrôle à suivre (${pts.length}) :`);
      pts.forEach((p) => {
        const date = datePoint(p, d.ch, d.lots);
        L.push(`  - ${p.articleCctp ? `${p.articleCctp} ` : ''}${p.intitule} — ${ETAT_POINT[p.etat].libelle}${p.bloquant ? ' — BLOQUANT' : ''}` +
          `${date ? ` — échéance ${fmtDate(date)}` : p.echeance.valeur ? ` — ${p.echeance.valeur}` : ''}${p.commentaire ? ` — ${p.commentaire}` : ''}`);
      });
    }
    const pens = d.appliquees.filter((p) => p.lotCode === l.code);
    if (pens.length) L.push(`  Pénalités : ${pluriel(pens.length, 'pénalité')} · ${euros(pens.reduce((t, p) => t + p.montant, 0))}`);
  }

  titre(`${n + 2}. PROCHAINE RÉUNION`);
  L.push(r.prochaine ? `${TYPE_REUNION[r.type]} le ${fmtDate(r.prochaine)}${r.lieu ? ` — ${r.lieu}` : ''}.` : 'Date à fixer.');
  return L.join('\n') + '\n';
}
