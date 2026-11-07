// Calcul et formatage des dates. Format interne : « AAAA-MM-JJ » (date locale, sans heure).
import type { Chantier, Jalon, PointControle } from './types';

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

/** HH:MM (24 h) depuis un horodatage ISO complet. */
export function fmtHeure(ts: string): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtJourLong(d = new Date()): string {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « +N j » si la date est dépassée, sinon chaîne vide. */
export function retard(iso: string | undefined, ref = aujourdHui()): number {
  if (!iso) return 0;
  const e = ecartJours(iso, ref);
  return e > 0 ? e : 0;
}

// ---------- Jalons ----------

/** Délai d'exécution (jours) : le plus long jalon de catégorie « delai » rapporté à l'OS de démarrage. */
export function delaiExecution(jalons: Jalon[]): number | undefined {
  const d = jalons.filter((j) => j.categorie === 'delai' && j.reference === 'OS_demarrage');
  if (!d.length) return undefined;
  return Math.max(...d.map((j) => j.jours));
}

/** Date de réception : réelle si saisie, sinon prévisionnelle (OS + délai d'exécution). */
export function dateReception(ch: Chantier, jalons: Jalon[]): string | undefined {
  if (ch.dateReceptionReelle) return ch.dateReceptionReelle;
  const delai = delaiExecution(jalons);
  if (!ch.dateOS || delai === undefined) return undefined;
  return ajouterJours(ch.dateOS, delai);
}

export function dateJalon(j: Jalon, ch: Chantier, jalons: Jalon[]): string | undefined {
  switch (j.reference) {
    case 'OS_demarrage':
      return ch.dateOS ? ajouterJours(ch.dateOS, j.jours) : undefined;
    case 'reception': {
      const r = dateReception(ch, jalons);
      return r ? ajouterJours(r, j.jours) : undefined;
    }
    default:
      return j.dateFixe;
  }
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

export function datePoint(p: PointControle, ch: Chantier): string | undefined {
  if (p.echeance.type === 'date') return lireDate(p.echeance.valeur);
  if (p.echeance.type === 'relative') {
    const n = lireRelatif(p.echeance.valeur);
    return n !== undefined && ch.dateOS ? ajouterJours(ch.dateOS, n) : undefined;
  }
  return undefined; // « evenement » : texte libre
}
