// Validation et import du fichier JSON d'extraction (format défini dans CLAUDE.md).
// Un lot = un marché : n° de marché et titulaire par lot ; jalons et pénalités communs ou propres à un lot.
import { db } from '../db/schema';
import { lireDate, lireRelatif } from './dates';
import type { CategorieJalon, Intervenant, Jalon, Lot, PhaseControle, PointControle, RefJalon, Responsable, TypeControle } from './types';

export interface Probleme { chemin: string; message: string }

export interface LotImport { code: string; intitule: string; numero_marche: string; titulaire: string; sous_traitants: string[] }

export interface DonneesImport {
  chantier: { nom: string; operation: string; site: string; lots: LotImport[] };
  points_controle: {
    id: string; lot: string; article_cctp: string; phase: PhaseControle; type: TypeControle; intitule: string;
    critere_acceptation: string; reference: string; responsable: Responsable;
    echeance: { type: 'relative' | 'evenement' | 'date'; valeur: string }; bloquant: boolean;
  }[];
  jalons: { id: string; lot?: string; categorie: CategorieJalon; intitule: string; article_ccap: string; echeance: { reference: RefJalon; jours: number } }[];
  penalites: { lot?: string; motif: string; montant_ou_taux: string; article_ccap: string }[];
}

export interface ResultatValidation {
  erreurs: Probleme[];
  avertissements: Probleme[];
  donnees?: DonneesImport;
}

const PHASES = ['preparation', 'execution', 'reception', 'cloture'];
const TYPES = ['document', 'agrement', 'point_arret', 'controle', 'essai', 'prescription'];
const RESPONSABLES = ['entreprise', 'moe', 'controleur_technique', 'csps'];
const TYPES_ECHEANCE = ['relative', 'evenement', 'date'];
const CATEGORIES = ['delai', 'documentaire', 'reception', 'garantie', 'paiement'];
const REFS = ['OS_demarrage', 'reception', 'autre'];

type Obj = Record<string, unknown>;
const estObjet = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const liste = (vals: Iterable<string>) => [...vals].join(', ');

export function validerImport(texte: string): ResultatValidation {
  const erreurs: Probleme[] = [];
  const avertissements: Probleme[] = [];
  const err = (chemin: string, message: string) => erreurs.push({ chemin, message });
  const avert = (chemin: string, message: string) => avertissements.push({ chemin, message });

  let brut: unknown;
  try {
    brut = JSON.parse(texte.replace(/^﻿/, '')); // BOM éventuel (fichiers enregistrés sous Windows)
  } catch (e) {
    return { erreurs: [{ chemin: 'fichier', message: `JSON illisible : ${(e as Error).message}` }], avertissements };
  }
  if (!estObjet(brut)) return { erreurs: [{ chemin: 'fichier', message: 'Le fichier doit contenir un objet JSON { … }.' }], avertissements };

  // Lecture typée, tolérante : un nombre est accepté là où un texte est attendu.
  const txt = (o: Obj, cle: string, chemin: string, obligatoire = true): string => {
    const v = o[cle];
    if (typeof v === 'number') return String(v);
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
      if (obligatoire) err(`${chemin}.${cle}`, 'Champ obligatoire manquant ou vide.');
      return '';
    }
    if (typeof v !== 'string') { err(`${chemin}.${cle}`, `Doit être un texte (reçu : ${Array.isArray(v) ? 'liste' : typeof v}).`); return ''; }
    return v.trim();
  };
  const enumeration = <T extends string>(o: Obj, cle: string, chemin: string, vals: string[]): T => {
    const v = o[cle];
    if (typeof v !== 'string' || !vals.includes(v)) {
      err(`${chemin}.${cle}`, v === undefined ? `Champ obligatoire manquant (valeurs : ${liste(vals)}).` : `Valeur « ${String(v)} » non autorisée (valeurs : ${liste(vals)}).`);
      return vals[0] as T;
    }
    return v as T;
  };
  const codesLots = new Set<string>();
  /** Lot facultatif (jalons, pénalités) : absent = commun à tous les lots. */
  const lotFacultatif = (o: Obj, chemin: string): string | undefined => {
    const code = txt(o, 'lot', chemin, false);
    if (!code) return undefined;
    if (codesLots.size && !codesLots.has(code)) err(`${chemin}.lot`, `Lot « ${code} » absent de chantier.lots (${liste(codesLots)}).`);
    return code;
  };

  // ---- chantier et lots (un lot = un marché) ----
  const ch = brut.chantier;
  const chantier: DonneesImport['chantier'] = { nom: '', operation: '', site: '', lots: [] };
  if (!estObjet(ch)) {
    err('chantier', 'Bloc « chantier » manquant ou invalide.');
  } else {
    chantier.nom = txt(ch, 'nom', 'chantier');
    chantier.operation = txt(ch, 'operation', 'chantier', false);
    chantier.site = txt(ch, 'site', 'chantier', false);
    if (!chantier.site) avert('chantier.site', 'Site non renseigné.');
    const ancienNumero = txt(ch, 'numero_marche', 'chantier', false);
    if (!Array.isArray(ch.lots) || ch.lots.length === 0) {
      err('chantier.lots', 'Au moins un lot est requis.');
    } else {
      const numeros = new Map<string, string>();
      const nbLots = ch.lots.length;
      ch.lots.forEach((l, i) => {
        const c = `chantier.lots[${i}]`;
        if (!estObjet(l)) { err(c, 'Lot invalide.'); return; }
        const code = txt(l, 'code', c);
        const cc = code ? `${c} (${code})` : c;
        if (code && codesLots.has(code)) err(`${cc}.code`, `Code lot « ${code} » en double.`);
        if (code) codesLots.add(code);
        let numero = txt(l, 'numero_marche', cc, false);
        if (!numero && ancienNumero && nbLots === 1) numero = ancienNumero; // ancien format, lot unique
        if (!numero) avert(`${cc}.numero_marche`, 'N° de marché non renseigné (modifiable dans les paramètres du chantier).');
        else if (numeros.has(numero)) avert(`${cc}.numero_marche`, `N° de marché « ${numero} » identique au lot ${numeros.get(numero)} : un lot = un marché.`);
        else numeros.set(numero, code);
        const titulaire = txt(l, 'titulaire', cc, false);
        if (!titulaire) avert(`${cc}.titulaire`, 'Titulaire non renseigné.');
        const st = l.sous_traitants;
        let sous: string[] = [];
        if (st !== undefined && st !== null && !(Array.isArray(st) && st.every((s) => typeof s === 'string'))) err(`${cc}.sous_traitants`, 'Doit être une liste de textes.');
        else sous = ((st as string[] | null | undefined) ?? []).map((s) => s.trim()).filter(Boolean);
        chantier.lots.push({ code, intitule: txt(l, 'intitule', cc, false), numero_marche: numero, titulaire, sous_traitants: sous });
      });
    }
    if (ancienNumero && chantier.lots.length > 1) {
      avert('chantier.numero_marche', 'Ignoré : un lot = un marché, le n° se renseigne dans chaque lot (lots[].numero_marche).');
    }
  }

  // ---- points de contrôle ----
  const points: DonneesImport['points_controle'] = [];
  const idsPoints = new Set<string>();
  if (!Array.isArray(brut.points_controle)) {
    err('points_controle', 'Liste « points_controle » manquante.');
  } else {
    if (brut.points_controle.length === 0) avert('points_controle', 'Aucun point de contrôle.');
    brut.points_controle.forEach((p, i) => {
      const c = `points_controle[${i}]`;
      if (!estObjet(p)) { err(c, 'Point invalide.'); return; }
      const id = txt(p, 'id', c);
      const cc = id ? `${c} (${id})` : c;
      if (id && idsPoints.has(id)) err(`${cc}.id`, `Identifiant « ${id} » en double.`);
      if (id) idsPoints.add(id);
      const lot = txt(p, 'lot', cc);
      if (lot && codesLots.size && !codesLots.has(lot)) err(`${cc}.lot`, `Lot « ${lot} » absent de chantier.lots (${liste(codesLots)}).`);
      const article_cctp = txt(p, 'article_cctp', cc, false);
      const phase = enumeration<PhaseControle>(p, 'phase', cc, PHASES);
      const type = enumeration<TypeControle>(p, 'type', cc, TYPES);
      const intitule = txt(p, 'intitule', cc);
      const critere_acceptation = txt(p, 'critere_acceptation', cc, false);
      const reference = txt(p, 'reference', cc, false);
      const responsable = enumeration<Responsable>(p, 'responsable', cc, RESPONSABLES);
      let echeance: DonneesImport['points_controle'][number]['echeance'] = { type: 'evenement', valeur: '' };
      if (p.echeance === undefined || p.echeance === null) {
        avert(`${cc}.echeance`, 'Pas d’échéance.');
      } else if (!estObjet(p.echeance)) {
        err(`${cc}.echeance`, 'Doit être un objet { type, valeur }.');
      } else {
        const t = enumeration<'relative' | 'evenement' | 'date'>(p.echeance, 'type', `${cc}.echeance`, TYPES_ECHEANCE);
        const valeur = txt(p.echeance, 'valeur', `${cc}.echeance`, false);
        if (t === 'relative' && lireRelatif(valeur) === undefined) err(`${cc}.echeance.valeur`, `« ${valeur} » : attendu un nombre de jours après l’OS (ex. 30, J+30, OS-15).`);
        if (t === 'date' && !lireDate(valeur)) err(`${cc}.echeance.valeur`, `« ${valeur} » : date attendue JJ/MM/AAAA ou AAAA-MM-JJ.`);
        if (t === 'evenement' && !valeur) avert(`${cc}.echeance.valeur`, 'Événement non décrit.');
        echeance = { type: t, valeur };
      }
      let bloquant = false;
      if (p.bloquant === undefined || p.bloquant === null) avert(`${cc}.bloquant`, 'Non renseigné : considéré comme non bloquant.');
      else if (typeof p.bloquant !== 'boolean') err(`${cc}.bloquant`, 'Doit valoir true ou false.');
      else bloquant = p.bloquant;
      points.push({ id, lot, article_cctp, phase, type, intitule, critere_acceptation, reference, responsable, echeance, bloquant });
    });
  }

  // ---- jalons ----
  const jalons: DonneesImport['jalons'] = [];
  const idsJalons = new Set<string>();
  if (brut.jalons !== undefined && !Array.isArray(brut.jalons)) err('jalons', 'Doit être une liste.');
  (Array.isArray(brut.jalons) ? brut.jalons : []).forEach((j, i) => {
    const c = `jalons[${i}]`;
    if (!estObjet(j)) { err(c, 'Jalon invalide.'); return; }
    const id = txt(j, 'id', c);
    const cc = id ? `${c} (${id})` : c;
    if (id && idsJalons.has(id)) err(`${cc}.id`, `Identifiant « ${id} » en double.`);
    if (id) idsJalons.add(id);
    const lot = lotFacultatif(j, cc);
    const categorie = enumeration<CategorieJalon>(j, 'categorie', cc, CATEGORIES);
    const intitule = txt(j, 'intitule', cc);
    const article_ccap = txt(j, 'article_ccap', cc, false);
    let reference: RefJalon = 'autre';
    let jours = 0;
    if (!estObjet(j.echeance)) err(`${cc}.echeance`, 'Doit être un objet { reference, jours }.');
    else {
      reference = enumeration<RefJalon>(j.echeance, 'reference', `${cc}.echeance`, REFS);
      const v = j.echeance.jours;
      if (reference !== 'autre' && (typeof v !== 'number' || !Number.isInteger(v))) err(`${cc}.echeance.jours`, 'Doit être un nombre entier de jours.');
      else if (typeof v === 'number') jours = Math.round(v);
      if (reference === 'autre') avert(`${cc}.echeance`, 'Référence « autre » : la date sera à saisir dans l’app.');
    }
    jalons.push({ id, lot, categorie, intitule, article_ccap, echeance: { reference, jours } });
  });
  if (!jalons.some((j) => j.categorie === 'delai' && j.echeance.reference === 'OS_demarrage')) {
    avert('jalons', 'Aucun jalon « delai » rapporté à l’OS de démarrage : la date de réception prévisionnelle ne pourra pas être calculée.');
  }

  // ---- pénalités ----
  const penalites: DonneesImport['penalites'] = [];
  if (brut.penalites !== undefined && !Array.isArray(brut.penalites)) err('penalites', 'Doit être une liste.');
  (Array.isArray(brut.penalites) ? brut.penalites : []).forEach((p, i) => {
    const c = `penalites[${i}]`;
    if (!estObjet(p)) { err(c, 'Pénalité invalide.'); return; }
    const lot = lotFacultatif(p, c);
    penalites.push({ lot, motif: txt(p, 'motif', c), montant_ou_taux: txt(p, 'montant_ou_taux', c), article_ccap: txt(p, 'article_ccap', c, false) });
  });

  return { erreurs, avertissements, donnees: erreurs.length ? undefined : { chantier, points_controle: points, jalons, penalites } };
}

/** Crée le chantier en base (transaction unique). Retourne son identifiant. */
export async function importerChantier(d: DonneesImport, dateOS?: string): Promise<number> {
  const now = new Date().toISOString();
  return db.transaction('rw', [db.chantiers, db.lots, db.intervenants, db.points, db.jalons, db.penalites], async () => {
    const chantierId = (await db.chantiers.add({
      nom: d.chantier.nom, operation: d.chantier.operation, site: d.chantier.site,
      phase: dateOS ? 'execution' : 'preparation', avancementTravaux: 0, dateOS, compteurReserve: 0, creeLe: now, majLe: now,
    })) as number;

    const lots: Lot[] = d.chantier.lots.map((l, i) => ({ chantierId, code: l.code, intitule: l.intitule, numeroMarche: l.numero_marche, ordre: i }));
    await db.lots.bulkAdd(lots);

    const vide = { contact: '', tel: '', email: '', notes: '' };
    const intervenants: Intervenant[] = d.chantier.lots.flatMap((l) => [
      ...(l.titulaire ? [{ chantierId, lotCode: l.code, role: 'titulaire' as const, raisonSociale: l.titulaire, ...vide }] : []),
      ...l.sous_traitants.map((s) => ({ chantierId, lotCode: l.code, role: 'sous_traitant' as const, raisonSociale: s, ...vide })),
    ]);
    await db.intervenants.bulkAdd(intervenants);

    const points: PointControle[] = d.points_controle.map((p, i) => ({
      id: p.id, chantierId, lot: p.lot, articleCctp: p.article_cctp, phase: p.phase, type: p.type, intitule: p.intitule,
      critere: p.critere_acceptation, reference: p.reference, responsable: p.responsable, echeance: p.echeance,
      bloquant: p.bloquant, ordre: i, etat: 'a_faire', commentaire: '', photoIds: [],
    }));
    await db.points.bulkAdd(points);

    const jalons: Jalon[] = d.jalons.map((j, i) => ({
      id: j.id, chantierId, lotCode: j.lot, categorie: j.categorie, intitule: j.intitule, articleCcap: j.article_ccap,
      reference: j.echeance.reference, jours: j.echeance.jours, ordre: i,
    }));
    await db.jalons.bulkAdd(jalons);

    await db.penalites.bulkAdd(d.penalites.map((p) => ({ chantierId, lotCode: p.lot, motif: p.motif, montantOuTaux: p.montant_ou_taux, articleCcap: p.article_ccap })));
    return chantierId;
  });
}
