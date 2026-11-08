// Sauvegarde Google Drive, dans le dossier « Kontrol » :
// - Sauvegardes / : même archive ZIP que la sauvegarde locale (restauration), 5 dernières conservées ;
// - <chantier> / : rapport PDF, classeur Excel et Photos / à jour (dossiersChantiers.ts).
// Automatique à l'ouverture si la dernière a plus de 24 h (et que des données ont changé).
import { useSyncExternalStore } from 'react';
import { connecter, jetonValide, oublierJeton, retourOAuth } from './oauth';
import { ErreurDrive, compte, dossier, dossierSauvegardes, lister, supprimer, telecharger, televerser, type FichierDrive } from './api';
import { derniereModification } from '../db/suivi';
import { nomSauvegarde } from './nommage';

export const CONSERVER = 5;
const DELAI_AUTO = 24 * 3600_000;
const CLE = 'kontrol-drive';

export interface ConfigDrive {
  auto: boolean;
  email?: string;
  dossierId?: string;
  derniere?: { date: string; nom: string; taille: number; chantiers: number; photos: number };
  reconnexion?: boolean; // Google demande une nouvelle connexion manuelle
  tentativeSilencieuse?: number;
  intention?: 'sauvegarder' | 'lister';
  /** Dossiers chantiers (PDF, Excel, photos) : dernière mise à jour réussie, ou erreur de la dernière tentative. */
  documents?: { date?: string; erreur?: string };
}

export interface EtatDrive { phase: 'repos' | 'sauvegarde' | 'erreur'; progres: number; message?: string }

// ---------- Petit magasin d'état partagé ----------
let config: ConfigDrive = (() => { try { return { auto: true, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') }; } catch { return { auto: true }; } })();
let etat: EtatDrive = { phase: 'repos', progres: 0 };
let instantane = { config, etat };
const abonnes = new Set<() => void>();
const publier = () => { instantane = { config, etat }; abonnes.forEach((f) => f()); };
const majConfig = (patch: Partial<ConfigDrive>) => {
  config = { ...config, ...patch };
  try { localStorage.setItem(CLE, JSON.stringify(config)); } catch { /* stockage indisponible */ }
  publier();
};
const majEtat = (e: Partial<EtatDrive>) => { etat = { ...etat, ...e }; publier(); };

export function useDrive() {
  return useSyncExternalStore((f) => { abonnes.add(f); return () => abonnes.delete(f); }, () => instantane);
}
export const lireConfig = () => config;
export const reglerAuto = (auto: boolean) => majConfig({ auto });

/** Des données ont changé depuis la dernière sauvegarde Drive. */
export const enAttente = (c = config) => !c.derniere || derniereModification() > Date.parse(c.derniere.date);
export const connecte = (c = config) => !!c.email;

// ---------- Opérations ----------

/** Obtient un jeton : celui en cours, sinon redirection vers Google (l'action reprend au retour). */
function jetonOuConnexion(intention: ConfigDrive['intention']): string | null {
  const j = jetonValide();
  if (j) return j;
  majConfig({ intention });
  connecter({ email: config.email });
  return null;
}

async function avecJeton<T>(intention: ConfigDrive['intention'], f: (jeton: string) => Promise<T>): Promise<T | undefined> {
  const j = jetonOuConnexion(intention);
  if (!j) return undefined;
  try {
    return await f(j);
  } catch (e) {
    if (e instanceof ErreurDrive && e.authentification) { oublierJeton(); majConfig({ intention }); connecter({ email: config.email }); return undefined; }
    throw e;
  }
}

let enCours: Promise<void> | null = null;

/** Sauvegarde maintenant (manuelle ou automatique). */
export function sauvegarderMaintenant(): Promise<void> {
  if (enCours) return enCours;
  enCours = (async () => {
    majEtat({ phase: 'sauvegarde', progres: 0, message: undefined });
    try {
      await avecJeton('sauvegarder', async (jeton) => {
        if (!config.email) majConfig({ email: (await compte(jeton)).email });
        const idDossier = await dossier(jeton, config.dossierId);
        if (idDossier !== config.dossierId) majConfig({ dossierId: idDossier });
        const idSauvegardes = await dossierSauvegardes(jeton, idDossier);
        const { creerSauvegarde } = await import('../services/sauvegarde');
        const debut = new Date();
        const { blob, resume } = await creerSauvegarde((x) => majEtat({ progres: x * 0.25 }));
        const nom = nomSauvegarde(debut);
        await televerser(jeton, idSauvegardes, nom, blob, (x) => majEtat({ progres: 0.25 + x * 0.35 }));
        // Conservation des 5 dernières (les plus anciennes sont supprimées)
        const fichiers = await lister(jeton, idSauvegardes);
        for (const f of fichiers.slice(CONSERVER)) await supprimer(jeton, f.id).catch(() => {});
        majConfig({
          intention: undefined, reconnexion: false,
          derniere: { date: debut.toISOString(), nom, taille: blob.size, chantiers: resume.chantiers, photos: resume.photos },
        });
        // Dossiers chantiers : un échec n'annule pas la sauvegarde (réessayé à la prochaine)
        try {
          const { synchroniserChantiers } = await import('./dossiersChantiers');
          await synchroniserChantiers(jeton, idDossier, (x) => majEtat({ progres: 0.6 + x * 0.4 }));
          majConfig({ documents: { date: new Date().toISOString() } });
        } catch (e) {
          if (e instanceof ErreurDrive && e.authentification) throw e;
          majConfig({ documents: { ...config.documents, erreur: (e as Error).message } });
        }
      });
      majEtat({ phase: 'repos', progres: 1 });
    } catch (e) {
      majEtat({ phase: 'erreur', message: (e as Error).message });
      throw e;
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

export async function listerSauvegardes(): Promise<FichierDrive[] | undefined> {
  return avecJeton('lister', async (jeton) => {
    const idDossier = await dossier(jeton, config.dossierId);
    if (idDossier !== config.dossierId) majConfig({ dossierId: idDossier });
    majConfig({ intention: undefined });
    return lister(jeton, await dossierSauvegardes(jeton, idDossier));
  });
}

export async function telechargerSauvegarde(id: string): Promise<Blob | undefined> {
  return avecJeton('lister', (jeton) => telecharger(jeton, id));
}

export function connecterDrive() {
  majConfig({ intention: 'sauvegarder', reconnexion: false });
  connecter({ email: config.email });
}

export function deconnecter() {
  oublierJeton();
  majConfig({ email: undefined, dossierId: undefined, derniere: undefined, documents: undefined, reconnexion: false, intention: undefined, tentativeSilencieuse: undefined });
}

/**
 * Au démarrage : traite le retour de Google, reprend l'action demandée avant la connexion,
 * et lance la sauvegarde automatique si elle est due. Renvoie l'intention à afficher (ex. liste des sauvegardes).
 */
export async function demarrage(): Promise<ConfigDrive['intention']> {
  const r = retourOAuth;
  if (r?.type === 'erreur') {
    const intention = config.intention;
    majConfig({ intention: undefined, reconnexion: true });
    // Échec silencieux (ex. session Google expirée) : pastille « Reconnecter », sans message intrusif
    if (!r.silencieux || intention === 'lister') {
      majEtat({ phase: 'erreur', message: r.code === 'access_denied' ? 'Connexion Google refusée' : `Connexion Google impossible (${r.code})` });
    }
    return undefined;
  }
  if (r?.type === 'ok') {
    const intention = config.intention;
    majConfig({ reconnexion: false });
    if (intention === 'lister') return 'lister';
    if (intention === 'sauvegarder' || !config.email) { void sauvegarderMaintenant().catch(() => {}); return undefined; }
  }
  lancerSiDue(true);
  return undefined;
}

/**
 * Sauvegarde automatique si elle est due (> 24 h et données modifiées).
 * `redirection` : autorise la reconnexion silencieuse par Google (seulement à l'ouverture de l'app,
 * jamais en cours d'utilisation pour ne pas interrompre une saisie).
 */
export function lancerSiDue(redirection: boolean) {
  if (!connecte() || !config.auto || !navigator.onLine || enCours) return;
  const due = !config.derniere || Date.now() - Date.parse(config.derniere.date) > DELAI_AUTO;
  if (!due || !enAttente()) return;
  if (jetonValide()) { void sauvegarderMaintenant().catch(() => {}); return; }
  // Jeton expiré : reconnexion silencieuse (au plus une tentative toutes les 6 h)
  if (redirection && !config.reconnexion && (!config.tentativeSilencieuse || Date.now() - config.tentativeSilencieuse > 6 * 3600_000)) {
    majConfig({ tentativeSilencieuse: Date.now(), intention: 'sauvegarder' });
    connecter({ silencieux: true, email: config.email });
  }
}

// Retour du réseau (saisie faite hors ligne) : envoi de la sauvegarde due, sans redirection
window.addEventListener('online', () => lancerSiDue(false));

/** État de la connexion réseau (pour l'affichage). */
export function useEnLigne() {
  return useSyncExternalStore((f) => {
    window.addEventListener('online', f); window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, () => navigator.onLine);
}
