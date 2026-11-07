// Modèle de données Kontrol (stocké dans IndexedDB via Dexie).
// Dates : chaînes ISO « AAAA-MM-JJ » ; horodatages : ISO complet.

export type PhaseControle = 'preparation' | 'execution' | 'reception' | 'cloture';
export type TypeControle = 'document' | 'agrement' | 'point_arret' | 'controle' | 'essai' | 'prescription';
export type Responsable = 'entreprise' | 'moe' | 'controleur_technique' | 'csps';

/** États d'un point de contrôle (cahier des charges). */
export type EtatPoint = 'a_faire' | 'en_cours' | 'conforme' | 'non_conforme' | 'sans_objet';

/** Statuts enregistrés d'une réserve. « En retard » est calculé (échéance dépassée, non levée). */
export type StatutReserve = 'ouvert' | 'relance' | 'levee_a_verifier' | 'leve';
export type StatutReserveAffiche = StatutReserve | 'en_retard';
export type Gravite = 'bloquante' | 'majeure' | 'mineure';
export type Origine = 'visite' | 'opr' | 'cr' | 'controle';

export type PhaseChantier = 'preparation' | 'execution' | 'opr' | 'gpa' | 'clos';

export type CategorieJalon = 'delai' | 'documentaire' | 'reception' | 'garantie' | 'paiement';
export type RefJalon = 'OS_demarrage' | 'reception' | 'autre';

export interface Chantier {
  id?: number;
  nom: string;
  operation: string;
  site: string;
  phase: PhaseChantier;
  avancementTravaux: number; // %
  dateOS?: string; // OS de démarrage général (par défaut pour tous les lots)
  dateReceptionReelle?: string; // réception de l'ensemble
  compteurReserve: number; // pour numéroter R-01, R-02…
  creeLe: string;
  majLe: string;
}

/** Un lot = un marché (son propre n° de marché, son titulaire, son OS, sa réception). */
export interface Lot {
  id?: number;
  chantierId: number;
  code: string;
  intitule: string;
  numeroMarche: string;
  dateOS?: string; // vide = OS générale du chantier
  dateReceptionReelle?: string; // vide = réception de l'ensemble (ou OS du lot + délai propre)
  ordre: number;
}

export type RoleIntervenant = 'titulaire' | 'sous_traitant' | 'moa' | 'controleur_technique' | 'csps' | 'autre';

export interface Intervenant {
  id?: number;
  chantierId: number;
  lotCode?: string;
  role: RoleIntervenant;
  raisonSociale: string;
  contact: string;
  tel: string;
  email: string;
  notes: string;
}

export interface EcheancePoint {
  type: 'relative' | 'evenement' | 'date';
  valeur: string;
}

export interface PointControle {
  uid?: number;
  id: string; // identifiant issu du JSON (ex. GO-3.2-01), unique par chantier
  chantierId: number;
  lot: string;
  articleCctp: string;
  phase: PhaseControle;
  type: TypeControle;
  intitule: string;
  critere: string;
  reference: string;
  responsable: Responsable;
  echeance: EcheancePoint;
  bloquant: boolean;
  ordre: number;
  etat: EtatPoint;
  dateEtat?: string;
  commentaire: string;
  photoIds: number[];
}

export interface EvenementReserve {
  date: string; // horodatage ISO
  type: 'creation' | 'relance' | 'levee_a_verifier' | 'levee' | 'refus' | 'modification';
  texte: string;
}

export interface Reserve {
  id?: number;
  chantierId: number;
  numero: number; // affiché R-01
  lotCode: string;
  entreprise: string;
  localisation: string;
  description: string;
  gravite: Gravite;
  echeance?: string;
  origine: Origine;
  pointId?: string;
  statut: StatutReserve;
  photoIds: number[];
  levee?: { date: string; photoIds: number[] };
  historique: EvenementReserve[];
  creeLe: string;
}

export interface Jalon {
  uid?: number;
  id: string;
  chantierId: number;
  lotCode?: string; // absent = jalon commun à tous les lots
  categorie: CategorieJalon;
  intitule: string;
  articleCcap: string;
  reference: RefJalon;
  jours: number;
  dateFixe?: string; // saisie manuelle pour la référence « autre »
  dateRealisee?: string;
  ordre: number;
}

export interface Penalite {
  id?: number;
  chantierId: number;
  lotCode?: string; // absent = commune à tous les lots
  motif: string;
  montantOuTaux: string;
  articleCcap: string;
}

export interface Photo {
  id?: number;
  chantierId: number;
  blob: Blob;
  vignette: Blob;
  prisLe: string;
}

export interface Reglage {
  cle: string;
  valeur: unknown;
}
