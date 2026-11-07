// Connexion Google (OAuth 2.0, flux « jeton » par redirection, sans serveur).
// Sur iPhone en mode app installée, les fenêtres pop-up de connexion ne reviennent pas à l'app :
// on redirige la page entière vers Google, qui revient sur l'app avec le jeton dans le fragment d'URL.
// Portée unique : drive.file (accès aux seuls fichiers créés par l'app).
//
// IMPORTANT : ce module est importé en tout premier (main.tsx) : il retire le jeton de l'URL
// avant que le routeur (routage par hash) ne lise l'adresse.

export const PORTEE = 'https://www.googleapis.com/auth/drive.file';
export const URL_RETOUR = new URL(import.meta.env.BASE_URL, location.origin).href; // ex. https://…github.io/Kontrol/

const CLE_JETON = 'kontrol-drive-jeton';
const CLE_ETAT = 'kontrol-drive-etat';
const CLE_ID_CLIENT = 'kontrol-drive-client';

export interface Jeton { valeur: string; expire: number }
export type RetourOAuth = { type: 'ok' } | { type: 'erreur'; code: string; silencieux: boolean } | null;

const lire = <T>(cle: string): T | null => {
  try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const ecrire = (cle: string, v: unknown) => {
  try { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage indisponible */ }
};

/** Identifiant client OAuth (public, saisi une fois dans les Réglages ; copie synchrone pour le démarrage). */
export const idClient = () => lire<string>(CLE_ID_CLIENT) ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const enregistrerIdClient = (id: string) => ecrire(CLE_ID_CLIENT, id.trim() || null);

/** Jeton d'accès encore valable (marge de 2 min), sinon null. */
export function jetonValide(): string | null {
  const j = lire<Jeton>(CLE_JETON);
  return j && j.expire - 120_000 > Date.now() ? j.valeur : null;
}
export const oublierJeton = () => ecrire(CLE_JETON, null);

/**
 * Part vers Google. `silencieux` : sans écran si l'utilisateur a déjà autorisé l'app (prompt=none) ;
 * Google revient alors avec un jeton, ou avec l'erreur « interaction_required ».
 */
export function connecter(options: { silencieux?: boolean; email?: string } = {}) {
  const client = idClient();
  if (!client) throw new Error('Identifiant client Google non configuré (Réglages › Google Drive).');
  const nonce = crypto.randomUUID();
  ecrire(CLE_ETAT, { nonce, retour: location.hash || '#/', silencieux: !!options.silencieux, le: Date.now() });
  const p = new URLSearchParams({
    client_id: client,
    redirect_uri: URL_RETOUR,
    response_type: 'token',
    scope: PORTEE,
    include_granted_scopes: 'true',
    state: nonce,
  });
  if (options.silencieux) p.set('prompt', 'none');
  if (options.email) p.set('login_hint', options.email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

/** Traite un retour de Google présent dans l'URL (exécuté une fois, au chargement du module). */
function traiterRetour(): RetourOAuth {
  const h = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  const etat = lire<{ nonce: string; retour: string; silencieux: boolean; le: number }>(CLE_ETAT);
  ecrire(CLE_ETAT, null);
  // Rétablit l'adresse de l'écran de départ, sans le jeton (ni dans l'historique)
  history.replaceState(null, '', `${location.pathname}${etat?.retour ?? '#/'}`);
  if (!etat || p.get('state') !== etat.nonce || Date.now() - etat.le > 15 * 60_000) {
    return { type: 'erreur', code: 'etat_invalide', silencieux: false };
  }
  const erreur = p.get('error');
  if (erreur) return { type: 'erreur', code: erreur, silencieux: etat.silencieux };
  const jeton = p.get('access_token');
  const duree = Number(p.get('expires_in') ?? '3600');
  if (!jeton || !(p.get('scope') ?? '').includes('drive.file')) return { type: 'erreur', code: 'portee_refusee', silencieux: etat.silencieux };
  ecrire(CLE_JETON, { valeur: jeton, expire: Date.now() + duree * 1000 } satisfies Jeton);
  return { type: 'ok' };
}

export const retourOAuth: RetourOAuth = traiterRetour();
