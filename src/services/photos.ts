// Photos : compression à la prise (largeur max 1600 px, JPEG 0,7) + vignette, stockage dans la table `photos`.
import { db } from '../db/schema';

const LARGEUR_MAX = 1600;
const QUALITE = 0.7;
const VIGNETTE = 240; // côté max (tuiles 64–72 px affichées en 3x)

async function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // l'orientation EXIF est appliquée par le navigateur
    return img;
  } finally {
    // L'image décodée reste utilisable après révocation.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function redimensionner(img: HTMLImageElement, max: number, carre = false): Promise<Blob> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  // Photo : largeur max ; vignette : plus grand côté max.
  const echelle = carre ? Math.min(1, max / Math.max(w, h)) : Math.min(1, max / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * echelle));
  canvas.height = Math.max(1, Math.round(h * echelle));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Compression impossible'))), 'image/jpeg', QUALITE));
}

export async function compresser(fichier: Blob): Promise<{ blob: Blob; vignette: Blob }> {
  const img = await chargerImage(fichier);
  const [blob, vignette] = await Promise.all([redimensionner(img, LARGEUR_MAX), redimensionner(img, VIGNETTE, true)]);
  return { blob, vignette };
}

/** Compresse et enregistre les fichiers ; retourne les identifiants créés (dans l'ordre). */
export async function enregistrerPhotos(chantierId: number, fichiers: Iterable<File>): Promise<number[]> {
  const prets = [];
  for (const f of fichiers) prets.push(await compresser(f)); // séquentiel : mémoire maîtrisée sur iPhone
  const prisLe = new Date().toISOString();
  return (await db.photos.bulkAdd(prets.map((p) => ({ chantierId, ...p, prisLe })), { allKeys: true })) as number[];
}
