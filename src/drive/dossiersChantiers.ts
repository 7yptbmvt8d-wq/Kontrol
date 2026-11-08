// Dossiers chantiers dans Google Drive : Kontrol / <chantier> / rapport PDF, classeur Excel, Photos /.
// Mis à jour avec chaque sauvegarde Drive (automatique ou manuelle). Les fichiers sont repérés par des propriétés
// d'app (et non par leur nom) : un renommage du chantier ou d'une réserve renomme le fichier, sans doublon.
import { db } from '../db/schema';
import { chargerChantier } from '../services/exports/donnees';
import { TYPES } from '../services/exports/partage';
import { corbeille, envoyer, listerDossier, renommer, sousDossier } from './api';
import { nomDossierChantier, photosAttendues } from './nommage';

/** Met à jour les dossiers de tous les chantiers. `onProgres` : 0 → 1. */
export async function synchroniserChantiers(jeton: string, racine: string, onProgres?: (x: number) => void): Promise<void> {
  const chantiers = await db.chantiers.toArray();
  const [{ pdfRapport }, { xlsxSuivi }] = await Promise.all([import('../services/exports/pdf'), import('../services/exports/xlsx')]);
  for (let i = 0; i < chantiers.length; i++) {
    const avance = (x: number) => onProgres?.((i + x) / chantiers.length);
    const ch = chantiers[i];
    const d = await chargerChantier(ch.id!);
    const nom = nomDossierChantier(ch);
    const dossierCh = (await sousDossier(jeton, racine, nom, { kontrolChantier: String(ch.id) }))!;
    const contenu = await listerDossier(jeton, dossierCh);
    const existant = (cle: string) => contenu.find((f) => f.appProperties?.kontrol === cle)?.id;

    const pdf = await pdfRapport(d, `Rapport – ${nom}.pdf`);
    await envoyer(jeton, { id: existant('rapport'), parent: dossierCh, nom: pdf.nom, type: TYPES.pdf, blob: pdf.blob, proprietes: { kontrol: 'rapport' } });
    avance(0.15);
    const xlsx = xlsxSuivi(d, `Suivi – ${nom}.xlsx`);
    await envoyer(jeton, { id: existant('suivi'), parent: dossierCh, nom: xlsx.nom, type: TYPES.xlsx, blob: xlsx.blob, proprietes: { kontrol: 'suivi' } });
    avance(0.25);

    // Photos : seules les nouvelles sont envoyées ; renommées si la réserve ou le point a changé ;
    // mises à la corbeille du Drive si supprimées de l'app.
    const attendues = photosAttendues(d.reserves, d.points);
    const dossierPh = await sousDossier(jeton, dossierCh, 'Photos', { kontrol: 'photos' }, attendues.length > 0);
    if (!dossierPh) { avance(1); continue; }
    const presentes = new Map<string, { id: string; name: string }>();
    for (const f of await listerDossier(jeton, dossierPh)) {
      const pid = f.appProperties?.kontrolPhoto;
      if (pid && !presentes.has(pid)) presentes.set(pid, f);
    }
    const voulues = new Set(attendues.map((a) => String(a.photoId)));
    for (const [pid, f] of presentes) if (!voulues.has(pid)) await corbeille(jeton, f.id);
    for (let k = 0; k < attendues.length; k++) {
      const a = attendues[k];
      const f = presentes.get(String(a.photoId));
      if (f) {
        if (f.name !== a.nom) await renommer(jeton, f.id, a.nom);
      } else {
        const photo = await db.photos.get(a.photoId);
        if (photo) {
          await envoyer(jeton, { parent: dossierPh, nom: a.nom, type: photo.blob.type || 'image/jpeg', blob: photo.blob, proprietes: { kontrolPhoto: String(a.photoId) } });
        }
      }
      avance(0.25 + (0.75 * (k + 1)) / attendues.length);
    }
  }
}
