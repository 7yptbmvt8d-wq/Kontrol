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
  montantHT?: number; // montant du marché (€ HT) : pénalités en taux (1/1000…) et plafond
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
  type: 'creation' | 'relance' | 'levee_a_verifier' | 'levee' | 'refus' | 'reouverture' | 'modification';
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

/** Pénalité appliquée (constatée) à un marché — distincte du barème du CCAP (`Penalite`). */
export type StatutPenalite = 'constatee' | 'notifiee' | 'retenue';
export interface PenaliteAppliquee {
  id?: number;
  chantierId: number;
  lotCode: string;
  entreprise: string;
  baremeId?: number; // article du barème utilisé
  motif: string;
  articleCcap: string;
  date: string; // date du constat
  quantite: number;
  unite: string; // « jour », « absence »…
  montantUnitaire?: number; // € HT par unité (calculé depuis le barème, modifiable)
  montant: number; // € HT
  statut: StatutPenalite;
  dateNotification?: string;
  note: string;
  creeLe: string;
}

/** Réunion de chantier (mode réunion). */
export type TypeReunion = 'chantier' | 'preparation' | 'opr' | 'autre';
export type Presence = 'present' | 'excuse' | 'absent';
export interface Participant {
  cle: string; // identifiant stable dans la réunion
  nom: string;
  role: string; // « Titulaire », « Sous-traitant », « Maîtrise d'œuvre »…
  lotCode?: string;
  intervenantId?: number;
  presence?: Presence; // vide = non pointé
}
/** Observation, décision ou action (responsable + échéance), générale ou propre à un lot. */
export interface Observation {
  id: string;
  lotCode?: string; // absent = généralités
  texte: string;
  responsable: string;
  echeance?: string;
  faite: boolean;
  reprise?: number; // n° de la réunion d'origine (action reprise, non soldée)
}
export interface Reunion {
  id?: number;
  chantierId: number;
  numero: number;
  date: string;
  heure: string;
  type: TypeReunion;
  lieu: string;
  participants: Participant[];
  observations: Observation[];
  prochaine?: string; // date de la prochaine réunion
  cloturee: boolean;
  creeLe: string; // début de la réunion : référence des « changements depuis la réunion précédente »
  clotureLe?: string;
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
