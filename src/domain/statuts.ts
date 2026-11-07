// Libellés et couleurs des statuts (DESIGN.md §2). Le statut n'est jamais porté par la couleur seule.
import type { EtatPoint, Gravite, Origine, PhaseChantier, PhaseControle, PointControle, Reserve, StatutReserveAffiche, TypeControle, Responsable, RoleIntervenant } from './types';
import { aujourdHui, ecartJours } from './dates';

export type Ton = 'r' | 'o' | 'b' | 'g' | 'n';

export const ETAT_POINT: Record<EtatPoint, { libelle: string; court: string; ton: Ton }> = {
  a_faire: { libelle: 'À faire', court: 'À faire', ton: 'b' },
  en_cours: { libelle: 'En cours', court: 'En cours', ton: 'o' },
  conforme: { libelle: 'Conforme', court: 'Conforme', ton: 'g' },
  non_conforme: { libelle: 'Non conforme', court: 'Non conf.', ton: 'r' },
  sans_objet: { libelle: 'Sans objet', court: 'S.O.', ton: 'n' },
};

export const STATUT_RESERVE: Record<StatutReserveAffiche, { libelle: string; ton: Ton }> = {
  en_retard: { libelle: 'En retard', ton: 'r' },
  relance: { libelle: 'Relancée', ton: 'o' },
  levee_a_verifier: { libelle: 'Levée à vérifier', ton: 'o' },
  ouvert: { libelle: 'Ouverte', ton: 'b' },
  leve: { libelle: 'Levée', ton: 'g' },
};

export const GRAVITE: Record<Gravite, string> = { mineure: 'Mineure', majeure: 'Majeure', bloquante: 'Bloquante' };
export const ORIGINE: Record<Origine, string> = { visite: 'Visite', opr: 'OPR', cr: 'CR', controle: 'Contrôle' };

export const PHASE_CONTROLE: Record<PhaseControle, string> = {
  preparation: 'Préparation', execution: 'Exécution', reception: 'Réception', cloture: 'Clôture',
};
export const ORDRE_PHASES: PhaseControle[] = ['preparation', 'execution', 'reception', 'cloture'];

export const PHASE_CHANTIER: Record<PhaseChantier, string> = {
  preparation: 'Préparation', execution: 'Exécution', opr: 'OPR', gpa: 'GPA', clos: 'Clos',
};

export const TYPE_CONTROLE: Record<TypeControle, string> = {
  document: 'Document', agrement: 'Agrément', point_arret: "Point d'arrêt", controle: 'Contrôle', essai: 'Essai', prescription: 'Prescription',
};

export const RESPONSABLE: Record<Responsable, string> = {
  entreprise: 'Entreprise', moe: 'MOE', controleur_technique: 'Contrôleur technique', csps: 'CSPS',
};

export const ROLE_INTERVENANT: Record<RoleIntervenant, string> = {
  titulaire: 'Titulaire', sous_traitant: 'Sous-traitant', moa: "Maîtrise d'ouvrage", controleur_technique: 'Contrôleur technique', csps: 'CSPS', autre: 'Autre',
};

/** Statut affiché : « en retard » si échéance dépassée et réserve non levée. */
export function statutAffiche(r: Reserve, ref = aujourdHui()): StatutReserveAffiche {
  if (r.statut !== 'leve' && r.echeance && ecartJours(r.echeance, ref) > 0) return 'en_retard';
  return r.statut;
}

export const estOuverte = (r: Reserve) => r.statut !== 'leve';

/** Point bloquant non validé : bloquant et ni conforme ni sans objet. */
export const bloquantNonValide = (p: PointControle) => p.bloquant && p.etat !== 'conforme' && p.etat !== 'sans_objet';

export const refReserve = (n: number) => `R-${String(n).padStart(2, '0')}`;
