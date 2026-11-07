// Validation et import du fichier JSON d'extraction (format défini dans CLAUDE.md).
import { db } from '../db/schema';
import { lireDate, lireRelatif } from './dates';
import type { CategorieJalon, Intervenant, Jalon, Lot, PhaseControle, PointControle, RefJalon, Responsable, TypeControle } from './types';

export interface Probleme { chemin: string; message: string }

export interface DonneesImport {
  chantier: { nom: string; operation: string; site: string; numero_marche: string; lots: { code: string; intitule: string; titulaire: string; sous_traitants: string[] }[] };
  points_controle: {
    id: string; lot: string; article_cctp: string; phase: PhaseControle; type: TypeControle; intitule: string;
    critere_acceptation: string; reference: string; responsable: Responsable;
    echeance: { type: 'relative' | 'evenement' | 'date'; valeur: string }; bloquant: boolean;
  }[];
  jalons: { id: string; categorie: CategorieJalon; intitule: string; article_ccap: string; echeance: { reference: RefJalon; jours: number } }[];
  penalites: { motif: string; montant_ou_taux: string; article_ccap: string }[];
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

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const liste = (vals: string[]) => vals.join(', ');

export function validerImport(texte: string): ResultatValidation {
  const erreurs: Probleme[] = [];
  const avertissements: Probleme[] = [];
  const err = (chemin: string, message: string) => erreurs.push({ chemin, message });
  const avert = (chemin: string, message: string) => avertissements.push({ chemin, message });

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (e) {
    return { erreurs: [{ chemin: 'fichier', message: `JSON illisible : ${(e as Error).message}` }], avertissements };
  }
  if (!estObjet(brut)) return { erreurs: [{ chemin: 'fichier', message: 'Le fichier doit contenir un objet JSON { … }.' }], avertissements };

  // Helpers de lecture typée
  const texteReq = (o: Record<string, unknown>, cle: string, chemin: string, obligatoire = true): string => {
    const v = o[cle];
    if (v === undefined || v === null || v === '') {
      if (obligatoire) err(`${chemin}.${cle}`, 'Champ obligatoire manquant ou vide.');
      return '';
    }
    if (typeof v !== 'string') { err(`${chemin}.${cle}`, `Doit être un texte (reçu : ${typeof v}).`); return ''; }
    return v.trim();
  };
  const enumReq = <T extends string>(o: Record<string, unknown>, cle: string, chemin: string, vals: string[]): T => {
    const v = o[cle];
    if (typeof v !== 'string' || !vals.includes(v)) {
      err(`${chemin}.${cle}`, v === undefined ? `Champ obligatoire manquant (valeurs : ${liste(vals)}).` : `Valeur « ${String(v)} » non autorisée (valeurs : ${liste(vals)}).`);
      return vals[0] as T;
    }
    return v as T;
  };

  // ---- chantier ----
  const ch = brut.chantier;
  const lotsCodes = new Set<string>();
  let chantier: DonneesImport['chantier'] = { nom: '', operation: '', site: '', numero_marche: '', lots: [] };
  if (!estObjet(ch)) {
    err('chantier', 'Bloc « chantier » manquant ou invalide.');
  } else {
    chantier = {
      nom: texteReq(ch, 'nom', 'chantier'),
      operation: texteReq(ch, 'operation', 'chantier', false),
      site: texteReq(ch, 'site', 'chantier', false),
      numero_marche: texteReq(ch, 'numero_marche', 'chantier', false),
      lots: [],
    };
    if (!chantier.site) avert('chantier.site', 'Site non renseigné.');
    if (!chantier.numero_marche) avert('chantier.numero_marche', 'Numéro de marché non renseigné.');
    if (!Array.isArray(ch.lots) || ch.lots.length === 0) {
      err('chantier.lots', 'Au moins un lot est requis.');
    } else {
      ch.lots.forEach((l, i) => {
        const c = `chantier.lots[${i}]`;
        if (!estObjet(l)) { err(c, 'Lot invalide.'); return; }
        const code = texteReq(l, 'code', c);
        if (code && lotsCodes.has(code)) err(`${c}.code`, `Code lot « ${code} » en double.`);
        if (code) lotsCodes.add(code);
        const st = l.sous_traitants;
        let sous: string[] = [];
        if (st !== undefined && !(Array.isArray(st) && st.every((s) => typeof s === 'string'))) err(`${c}.sous_traitants`, 'Doit être une liste de textes.');
        else sous = ((st as string[] | undefined) ?? []).map((s) => s.trim()).filter(Boolean);
        const titulaire = texteReq(l, 'titulaire', c, false);
        if (!titulaire) avert(`${c}.titulaire`, `Lot ${code || i} : titulaire non renseigné.`);
        chantier.lots.push({ code, intitule: texteReq(l, 'intitule', c, false), titulaire, sous_traitants: sous });
      });
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
      const id = texteReq(p, 'id', c);
      const cc = id ? `${c} (${id})` : c;
      if (id && idsPoints.has(id)) err(`${cc}.id`, `Identifiant « ${id} » en double.`);
      if (id) idsPoints.add(id);
      const lot = texteReq(p, 'lot', cc);
      if (lot && lotsCodes.size && !lotsCodes.has(lot)) err(`${cc}.lot`, `Lot « ${lot} » absent de chantier.lots (${liste([...lotsCodes])}).`);
      let echeance: { type: 'relative' | 'evenement' | 'date'; valeur: string } = { type: 'evenement', valeur: '' };
      if (p.echeance === undefined || p.echeance === null) {
        avert(`${cc}.echeance`, 'Pas d’échéance.');
      } else if (!estObjet(p.echeance)) {
        err(`${cc}.echeance`, 'Doit être un objet { type, valeur }.');
      } else {
        const type = enumReq<'relative' | 'evenement' | 'date'>(p.echeance, 'type', `${cc}.echeance`, TYPES_ECHEANCE);
        const brutVal = p.echeance.valeur;
        const valeur = typeof brutVal === 'number' ? String(brutVal) : typeof brutVal === 'string' ? brutVal.trim() : '';
        if (type === 'relative' && lireRelatif(valeur) === undefined) err(`${cc}.echeance.valeur`, `« ${valeur} » : attendu un nombre de jours après l’OS (ex. 30, J+30, OS-15).`);
        if (type === 'date' && !lireDate(valeur)) err(`${cc}.echeance.valeur`, `« ${valeur} » : date attendue JJ/MM/AAAA ou AAAA-MM-JJ.`);
        if (type === 'evenement' && !valeur) avert(`${cc}.echeance.valeur`, 'Événement non décrit.');
        echeance = { type, valeur };
      }
      let bloquant = false;
      if (p.bloquant === undefined) avert(`${cc}.bloquant`, 'Non renseigné : considéré comme non bloquant.');
      else if (typeof p.bloquant !== 'boolean') err(`${cc}.bloquant`, 'Doit valoir true ou false.');
      else bloquant = p.bloquant;
      points.push({
        id, lot,
        article_cctp: texteReq(p, 'article_cctp', cc, false),
        phase: enumReq(p, 'phase', cc, PHASES),
        type: enumReq(p, 'type', cc, TYPES),
        intitule: texteReq(p, 'intitule', cc),
        critere_acceptation: texteReq(p, 'critere_acceptation', cc, false),
        reference: texteReq(p, 'reference', cc, false),
        responsable: enumReq(p, 'responsable', cc, RESPONSABLES),
        echeance, bloquant,
      });
    });
  }

  // ---- jalons ----
  const jalons: DonneesImport['jalons'] = [];
  const idsJalons = new Set<string>();
  if (brut.jalons !== undefined && !Array.isArray(brut.jalons)) err('jalons', 'Doit être une liste.');
  (Array.isArray(brut.jalons) ? brut.jalons : []).forEach((j, i) => {
    const c = `jalons[${i}]`;
    if (!estObjet(j)) { err(c, 'Jalon invalide.'); return; }
    const id = texteReq(j, 'id', c);
    const cc = id ? `${c} (${id})` : c;
    if (id && idsJalons.has(id)) err(`${cc}.id`, `Identifiant « ${id} » en double.`);
    if (id) idsJalons.add(id);
    let reference: RefJalon = 'autre';
    let jours = 0;
    if (!estObjet(j.echeance)) err(`${cc}.echeance`, 'Doit être un objet { reference, jours }.');
    else {
      reference = enumReq<RefJalon>(j.echeance, 'reference', `${cc}.echeance`, REFS);
      const v = j.echeance.jours;
      if (typeof v !== 'number' || !Number.isInteger(v)) err(`${cc}.echeance.jours`, 'Doit être un nombre entier de jours.');
      else jours = v;
      if (reference === 'autre') avert(`${cc}.echeance`, 'Référence « autre » : la date sera à saisir dans l’app.');
    }
    jalons.push({
      id, categorie: enumReq(j, 'categorie', cc, CATEGORIES), intitule: texteReq(j, 'intitule', cc),
      article_ccap: texteReq(j, 'article_ccap', cc, false), echeance: { reference, jours },
    });
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
    penalites.push({ motif: texteReq(p, 'motif', c), montant_ou_taux: texteReq(p, 'montant_ou_taux', c), article_ccap: texteReq(p, 'article_ccap', c, false) });
  });

  return { erreurs, avertissements, donnees: erreurs.length ? undefined : { chantier, points_controle: points, jalons, penalites } };
}

/** Crée le chantier en base. Retourne son identifiant. */
export async function importerChantier(d: DonneesImport, dateOS?: string): Promise<number> {
  const now = new Date().toISOString();
  return db.transaction('rw', [db.chantiers, db.lots, db.intervenants, db.points, db.jalons, db.penalites], async () => {
    const chantierId = (await db.chantiers.add({
      nom: d.chantier.nom, operation: d.chantier.operation, site: d.chantier.site, numeroMarche: d.chantier.numero_marche,
      phase: dateOS ? 'execution' : 'preparation', avancementTravaux: 0, dateOS, compteurReserve: 0, creeLe: now, majLe: now,
    })) as number;

    const lots: Lot[] = d.chantier.lots.map((l, i) => ({ chantierId, code: l.code, intitule: l.intitule, ordre: i }));
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
      id: j.id, chantierId, categorie: j.categorie, intitule: j.intitule, articleCcap: j.article_ccap,
      reference: j.echeance.reference, jours: j.echeance.jours, ordre: i,
    }));
    await db.jalons.bulkAdd(jalons);

    await db.penalites.bulkAdd(d.penalites.map((p) => ({ chantierId, motif: p.motif, montantOuTaux: p.montant_ou_taux, articleCcap: p.article_ccap })));
    return chantierId;
  });
}
