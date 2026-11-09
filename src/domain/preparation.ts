// Période de préparation lue dans les jalons extraits du CCAP, et correction des jalons mal typés à l'extraction
// (fin de période de préparation, « après l'OS de démarrage », garanties biennale et décennale).
// Utilisé à l'import, par la migration v5 (chantiers déjà importés) et à la restauration d'une ancienne sauvegarde.
import type { Jalon, RefJalon } from './types';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const PP = /periode de preparation/;
/** « non comprise dans le délai », « hors délai », « s'ajoute au délai »… */
const HORS_DELAI = /non (comprise|incluse)|hors (du )?delai|en sus du delai|s'ajoute|s’ajoute|ne (sont|est) pas compris/;

type JalonMin = Pick<Jalon, 'categorie' | 'intitule' | 'reference' | 'jours' | 'dateFixe' | 'lotCode'>;

export interface AnalysePreparation {
  duree?: number;
  comprise?: boolean;
  /** Corrections, par indice dans la liste des jalons. */
  corrections: { i: number; reference: RefJalon; jours: number }[];
}

export function analyserPreparation(jalons: JalonMin[]): AnalysePreparation {
  const r: AnalysePreparation = { corrections: [] };
  jalons.forEach((j, i) => {
    const t = norm(j.intitule);
    const libre = j.reference === 'autre' && !j.dateFixe;
    // 1. Le jalon qui définit la période de préparation (durée) : devient « fin de la période de préparation »
    if (r.duree === undefined && !j.lotCode && j.categorie === 'delai' && PP.test(t) && j.jours > 0 && (j.reference === 'OS_demarrage' || libre)) {
      r.duree = j.jours;
      r.comprise = !HORS_DELAI.test(t);
      r.corrections.push({ i, reference: 'fin_preparation', jours: 0 });
      return;
    }
    // 2. « … à l'expiration / à la fin de la période de préparation » rapporté à l'OS sans délai, ou sans date
    if (/(fin|expiration|terme|issue|cours) de la periode de preparation/.test(t) && ((j.reference === 'OS_demarrage' && j.jours === 0) || libre)) {
      r.corrections.push({ i, reference: 'fin_preparation', jours: 0 });
      return;
    }
    // 3. « … après l'OS de démarrage » saisi en date libre alors qu'un délai est donné
    if (libre && j.jours > 0 && /(os|ordre de service) de demarrage/.test(t)) {
      r.corrections.push({ i, reference: 'OS_demarrage', jours: j.jours });
      return;
    }
    // 4. Garanties légales sans durée : biennale (2 ans) et décennale (10 ans) à compter de la réception
    if (libre && !j.jours && j.categorie === 'garantie') {
      if (/biennale|bon fonctionnement/.test(t)) r.corrections.push({ i, reference: 'reception', jours: 730 });
      else if (/decennale/.test(t)) r.corrections.push({ i, reference: 'reception', jours: 3650 });
    }
  });
  return r;
}
