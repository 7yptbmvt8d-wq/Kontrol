// Profil de l'utilisateur (représentant du MOE) et organisme MOE : Réglages › Vous, ou directement depuis l'appel d'une réunion.
import { db, getReglage, setReglage } from '../db/schema';
import { PROFIL_DEFAUT, participantEntiteMoe, participantMoe, type Profil } from '../domain/reunion';

export async function lireProfil(): Promise<Profil> {
  return { ...PROFIL_DEFAUT, ...(await getReglage<Partial<Profil>>('profil', PROFIL_DEFAUT)) };
}

/** Enregistre le profil et met à jour les lignes MOE des réunions non clôturées (présences conservées). */
export async function enregistrerProfil(v: Profil): Promise<void> {
  await setReglage('profil', v);
  const moe = participantMoe(v);
  const entite = participantEntiteMoe(v);
  await db.reunions.filter((r) => !r.cloturee).modify((r) => {
    r.participants = r.participants.map((p) =>
      p.cle === 'moe' ? { ...moe, presence: p.presence } : p.cle === entite.cle ? { ...entite, presence: p.presence } : p);
  });
}
