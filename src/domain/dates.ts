// Calcul et formatage des dates. Format interne : « AAAA-MM-JJ » (date locale, sans heure).
import type { Chantier, Jalon, Lot, PointControle } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function aujourdHui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // midi : évite les effets de changement d'heure
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ajouterJours(iso: string, jours: number): string {
  const d = toDate(iso);
  d.setDate(d.getDate() + jours);
  return toIso(d);
}

/** Nombre de jours de a vers b (b − a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

export function estDateIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toDate(s);
  return toIso(d) === s;
}

/** Accepte « JJ/MM/AAAA » ou « AAAA-MM-JJ ». Retourne l'ISO ou undefined. */
export function lireDate(s: string): string | undefined {
  const t = s.trim();
  if (estDateIso(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    return estDateIso(iso) ? iso : undefined;
  }
  return undefined;
}

/** JJ/MM/AAAA */
export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** JJ/MM (listes) */
export function fmtCourt(iso?: string): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Jour local « AAAA-MM-JJ » d'un horodatage ISO complet (et non le jour UTC). */
export function jourLocal(ts: string): string {
  return toIso(new Date(ts));
}

/** HH:MM (24 h) depuis un horodatage ISO complet. */
export function fmtHeure(ts: string): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtJourLong(d = new Date()): string {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Nombre de jours de retard (0 si la date n’est pas dépassée). */
export function retard(iso: string | undefined, ref = aujourdHui()): number {
  if (!iso) return 0;
  const e = ecartJours(iso, ref);
  return e > 0 ? e : 0;
}

// ---------- Jalons (un lot = un marché) ----------

/** Contexte de calcul d'un marché (ou de l'ensemble si lotCode absent). */
export interface Contexte {
  dateOS?: string; // OS de démarrage (début de la période de préparation le cas échéant)
  finPreparation?: string; // fin de la période de préparation = début des travaux
  debutDelai?: string; // départ du délai d'exécution : OS, ou début des travaux si la préparation n'y est pas comprise
  delai?: number; // jours
  reception?: string; // réelle si saisie, sinon prévisionnelle
  receptionReelle: boolean;
}

/** Délai d'exécution (jours) : le plus long jalon « delai » rapporté à l'OS, pour le périmètre donné. */
function delaiDe(jalons: Jalon[], lotCode: string | undefined): number | undefined {
  const d = jalons.filter((j) => j.categorie === 'delai' && j.reference === 'OS_demarrage' && (j.lotCode || undefined) === lotCode);
  return d.length ? Math.max(...d.map((j) => j.jours)) : undefined;
}

/**
 * Fin de la période de préparation et départ du délai d'exécution, à partir d'une OS.
 * La date de début des travaux saisie (OS n° 2) vaut pour l'ensemble ; un lot avec sa propre OS la recalcule.
 */
function bornes(ch: Chantier, os: string | undefined, osPropre: boolean) {
  const finPreparation = (!osPropre && ch.dateDebutTravaux) || (os && ch.dureePreparation ? ajouterJours(os, ch.dureePreparation) : undefined);
  const debutDelai = ch.preparationComprise === false ? (finPreparation ?? os) : os;
  return { finPreparation, debutDelai };
}

/**
 * - Ensemble : OS générale ; délai = jalons « delai » communs ; réception = réelle, sinon départ du délai + délai.
 * - Lot (marché) : OS du lot (sinon OS générale) ; délai propre au lot (sinon délai commun) ;
 *   réception = réelle du lot ; sinon, si le lot n'a ni OS ni délai propres, celle de l'ensemble ;
 *   sinon départ du délai du lot + délai (toutes les dates d'un même marché partent de la même OS).
 * - Départ du délai : l'OS, ou la fin de la période de préparation si elle n'est pas comprise dans le délai (CCAP).
 */
export function contexte(ch: Chantier, lots: Lot[], jalons: Jalon[], lotCode?: string): Contexte {
  const delaiCommun = delaiDe(jalons, undefined);
  const commun = bornes(ch, ch.dateOS, false);
  const recCommune = ch.dateReceptionReelle ?? (commun.debutDelai && delaiCommun !== undefined ? ajouterJours(commun.debutDelai, delaiCommun) : undefined);
  const lot = lotCode ? lots.find((l) => l.code === lotCode) : undefined;
  if (!lot) return { dateOS: ch.dateOS, ...commun, delai: delaiCommun, reception: recCommune, receptionReelle: !!ch.dateReceptionReelle };
  const dateOS = lot.dateOS || ch.dateOS;
  const b = bornes(ch, dateOS, !!lot.dateOS);
  const delaiPropre = delaiDe(jalons, lot.code);
  const delai = delaiPropre ?? delaiCommun;
  const base = { dateOS, ...b, delai };
  if (lot.dateReceptionReelle) return { ...base, reception: lot.dateReceptionReelle, receptionReelle: true };
  if (!lot.dateOS && delaiPropre === undefined) return { ...base, reception: recCommune, receptionReelle: !!ch.dateReceptionReelle };
  return { ...base, reception: b.debutDelai && delai !== undefined ? ajouterJours(b.debutDelai, delai) : undefined, receptionReelle: false };
}

/** Date de départ d'un jalon : les jalons « délai » rapportés à l'OS comptent à partir du départ du délai d'exécution. */
function departJalon(j: Jalon, ctx: Contexte): string | undefined {
  switch (j.reference) {
    case 'OS_demarrage': return j.categorie === 'delai' ? ctx.debutDelai : ctx.dateOS;
    case 'fin_preparation': return ctx.finPreparation;
    case 'reception': return ctx.reception;
    default: return undefined;
  }
}

export function dateJalon(j: Jalon, ctx: Contexte): string | undefined {
  if (j.reference === 'autre') return j.dateFixe;
  const d = departJalon(j, ctx);
  return d ? ajouterJours(d, j.jours) : undefined;
}

/** Libellé du calcul d'un jalon : « OS + 30 j », « Début des travaux + 480 j », « Fin de préparation », « Date saisie ». */
export function calculJalon(j: Jalon, ctx: Contexte): string {
  if (j.reference === 'autre') return 'Date saisie';
  const base = j.reference === 'reception' ? 'Réception'
    : j.reference === 'fin_preparation' ? 'Fin de préparation'
    : j.categorie === 'delai' && ctx.debutDelai && ctx.debutDelai !== ctx.dateOS ? 'Début des travaux' : 'OS';
  return j.jours ? `${base} ${j.jours < 0 ? '−' : '+'} ${Math.abs(j.jours)} j` : base;
}

export type StatutJalon = 'fait' | 'en_retard' | 'a_venir' | 'non_date';

export function statutJalon(j: Jalon, date: string | undefined, ref = aujourdHui()): StatutJalon {
  if (j.dateRealisee) return 'fait';
  if (!date) return 'non_date';
  return ecartJours(date, ref) > 0 ? 'en_retard' : 'a_venir';
}

// ---------- Échéance des points de contrôle ----------

/** Lit une échéance relative : « 30 », « J+30 », « OS+30 », « OS-15 » → nombre de jours après l'OS. */
export function lireRelatif(v: string): number | undefined {
  const m = /^\s*(?:(?:OS|J)\s*)?([+-]?)\s*(\d+)\s*(?:j|jours?)?\s*$/i.exec(v);
  if (!m) return undefined;
  return (m[1] === '-' ? -1 : 1) * Number(m[2]);
}

/**
 * Échéance « événement » (texte du CCTP / CCAP) rattachée à une date connue du chantier :
 * période de préparation, début des travaux, réception (ou sa demande, OPR), GPA, OS / notification ;
 * avec un éventuel décalage (« 15 jours avant… », « dans le mois suivant… »).
 * Les événements liés au déroulement du chantier (commande, pose, coulage…) restent sans date.
 */
export function echeanceEvenement(texte: string, ctx: Contexte): { date: string; base: string } | undefined {
  const t = texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  let date: string | undefined;
  let base: string;
  if (/\bgpa\b|parfait achevement/.test(t)) { date = ctx.reception && ajouterJours(ctx.reception, 365); base = 'fin de la GPA'; }
  else if (/periode de preparation|phase de preparation|\bpp\b/.test(t)) { date = ctx.finPreparation; base = 'fin de la période de préparation'; }
  else if (/(demande de reception|operations prealables a la reception|\bopr\b|reception des travaux)|(^|\b(avant|a|lors de|pour|des|apres) (la )?)reception$/.test(t)) {
    date = ctx.reception; base = ctx.receptionReelle ? 'réception' : 'réception prévisionnelle';
  } else if (/(debut|demarrage|commencement) (des )?travaux$|^avant (les )?travaux$/.test(t)) { date = ctx.finPreparation ?? ctx.debutDelai; base = 'début des travaux'; }
  else if (/notification du marche|os de demarrage|^(des|a|apres) (l')?os$/.test(t)) { date = ctx.dateOS; base = 'OS de démarrage'; }
  else return undefined;
  if (!date) return undefined;
  // Décalage éventuel : « 15 jours avant », « 2 mois après », « dans le mois suivant »
  const m = /(\d+)\s*(jours?|j|semaines?|mois)\s+(avant|apres|suivant)/.exec(t);
  if (m) {
    const n = Number(m[1]) * (m[2].startsWith('mois') ? 30 : m[2].startsWith('semaine') ? 7 : 1);
    date = ajouterJours(date, m[3] === 'avant' ? -n : n);
  } else if (/dans le mois (qui )?suiv/.test(t)) date = ajouterJours(date, 30);
  return { date, base };
}

/**
 * Échéance d'un point : date saisie ; relative à l'OS de son lot (marché), sinon à l'OS générale ;
 * événement rattaché à une date du chantier quand c'est possible (période de préparation, réception…).
 */
export function datePoint(p: PointControle, ch: Chantier, lots: Lot[], jalons: Jalon[] = []): string | undefined {
  if (p.echeance.type === 'date') return lireDate(p.echeance.valeur);
  if (p.echeance.type === 'relative') {
    const n = lireRelatif(p.echeance.valeur);
    const os = lots.find((l) => l.code === p.lot)?.dateOS || ch.dateOS;
    return n !== undefined && os ? ajouterJours(os, n) : undefined;
  }
  return echeanceEvenement(p.echeance.valeur, contexte(ch, lots, jalons, p.lot))?.date;
}
