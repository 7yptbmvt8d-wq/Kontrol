// Noms lisibles des dossiers et fichiers déposés dans Google Drive (logique pure, testée).
import type { Chantier, PointControle, Reserve } from '../domain/types';
import { refReserve } from '../domain/statuts';

/** Nom de fichier ou de dossier sans caractères gênants (Drive les accepte, mais pas Windows au téléchargement). */
export function nomPropre(s: string, max = 80): string {
  const t = s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const nomDossierChantier = (ch: Chantier) => nomPropre(ch.nom || ch.site || `Chantier ${ch.id}`, 100);

/** Photo attendue dans le dossier « Photos » d'un chantier. */
export interface PhotoAttendue { photoId: number; nom: string }

/**
 * Photos d'un chantier, nommées par réserve ou point :
 * « R-03 · constat 1 – Fissure enduit.jpg », « R-03 · levée 1 – … », « GO-3.2-01 · 1 – Intitulé du point.jpg ».
 */
export function photosAttendues(reserves: Reserve[], points: PointControle[]): PhotoAttendue[] {
  const sortie: PhotoAttendue[] = [];
  for (const r of [...reserves].sort((a, b) => a.numero - b.numero)) {
    const desc = nomPropre(r.description, 50);
    r.photoIds.forEach((photoId, i) => sortie.push({ photoId, nom: `${refReserve(r.numero)} · constat ${i + 1} – ${desc}.jpg` }));
    (r.levee?.photoIds ?? []).forEach((photoId, i) => sortie.push({ photoId, nom: `${refReserve(r.numero)} · levée ${i + 1} – ${desc}.jpg` }));
  }
  for (const p of points) {
    const ref = nomPropre(p.id || p.articleCctp, 30);
    const titre = nomPropre(p.intitule, 50);
    p.photoIds.forEach((photoId, i) => sortie.push({ photoId, nom: `${ref} · ${i + 1} – ${titre}.jpg` }));
  }
  return sortie;
}
