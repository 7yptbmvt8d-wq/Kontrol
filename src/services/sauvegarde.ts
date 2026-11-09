// Sauvegarde complète en archive ZIP : donnees.json (toutes les tables) + photos/*.jpg.
// Même format pour la sauvegarde locale et la sauvegarde Google Drive (étape e).
import JSZip from 'jszip';
import { db } from '../db/schema';
import { marquerSynchronise } from '../db/suivi';
import type { Chantier, Jalon, Photo } from '../domain/types';
import { analyserPreparation } from '../domain/preparation';

export const FORMAT = 'kontrol-sauvegarde';
export const VERSION_FORMAT = 1;

const TABLES = ['chantiers', 'lots', 'intervenants', 'points', 'reserves', 'jalons', 'penalites', 'penalitesAppliquees', 'reunions', 'reglages'] as const;
/** Tables apparues après le format v1 : absentes des anciennes sauvegardes (vides à la restauration). */
const TABLES_RECENTES: readonly string[] = ['penalitesAppliquees', 'reunions'];
type NomTable = (typeof TABLES)[number];

interface PhotoMeta { id: number; chantierId: number; prisLe: string; fichier: string; vignette: string }

export interface Contenu {
  format: typeof FORMAT;
  version: number;
  schema: number;
  creeLe: string;
  tables: Record<NomTable, unknown[]>;
  photos: PhotoMeta[];
}

export interface Resume { chantiers: number; points: number; reserves: number; photos: number }

export async function creerSauvegarde(onProgres?: (x: number) => void): Promise<{ blob: Blob; resume: Resume }> {
  const zip = new JSZip();
  const tables = {} as Record<NomTable, unknown[]>;
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  // Photos une par une (mémoire maîtrisée sur iPhone)
  const ids = (await db.photos.toCollection().primaryKeys()) as number[];
  const photos: PhotoMeta[] = [];
  for (let i = 0; i < ids.length; i++) {
    const p = await db.photos.get(ids[i]);
    if (!p) continue;
    const meta = { id: p.id!, chantierId: p.chantierId, prisLe: p.prisLe, fichier: `photos/${p.id}.jpg`, vignette: `photos/${p.id}-v.jpg` };
    zip.file(meta.fichier, p.blob, { compression: 'STORE' }); // JPEG déjà compressé
    zip.file(meta.vignette, p.vignette, { compression: 'STORE' });
    photos.push(meta);
    onProgres?.(((i + 1) / Math.max(1, ids.length)) * 0.5);
  }
  const contenu: Contenu = { format: FORMAT, version: VERSION_FORMAT, schema: db.verno, creeLe: new Date().toISOString(), tables, photos };
  zip.file('donnees.json', JSON.stringify(contenu));
  zip.file('LISEZMOI.txt', 'Sauvegarde Kontrol. Restauration : app Kontrol › Réglages › Restaurer une sauvegarde.\n');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' },
    (m) => onProgres?.(0.5 + (m.percent / 100) * 0.5));
  return { blob, resume: { chantiers: tables.chantiers.length, points: tables.points.length, reserves: tables.reserves.length, photos: photos.length } };
}

/** Lit et vérifie une archive, sans rien modifier. */
export async function lireSauvegarde(fichier: Blob): Promise<{ zip: JSZip; contenu: Contenu; resume: Resume }> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(fichier); } catch { throw new Error('Ce fichier n’est pas une archive ZIP.'); }
  const f = zip.file('donnees.json');
  if (!f) throw new Error('Archive sans donnees.json : ce n’est pas une sauvegarde Kontrol.');
  let contenu: Contenu;
  try { contenu = JSON.parse(await f.async('string')); } catch { throw new Error('donnees.json illisible.'); }
  if (contenu.format !== FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde Kontrol.');
  if (contenu.version > VERSION_FORMAT || contenu.schema > db.verno) throw new Error('Sauvegarde créée par une version plus récente de Kontrol : mettez l’app à jour.');
  for (const t of TABLES) {
    if (Array.isArray(contenu.tables?.[t])) continue;
    if (TABLES_RECENTES.includes(t)) contenu.tables[t] = [];
    else throw new Error(`Table « ${t} » absente de la sauvegarde.`);
  }
  return {
    zip, contenu,
    resume: { chantiers: contenu.tables.chantiers.length, points: contenu.tables.points.length, reserves: contenu.tables.reserves.length, photos: contenu.photos.length },
  };
}

/** Mise au format du schéma courant d'une sauvegarde plus ancienne (mêmes règles que les migrations Dexie). */
function migrer(c: Contenu) {
  if (c.schema < 2) {
    // v2 : un lot = un marché → n° de marché du chantier reporté sur ses lots
    for (const ch of c.tables.chantiers as { id: number; numeroMarche?: string }[]) {
      for (const l of c.tables.lots as { chantierId: number; numeroMarche?: string }[]) {
        if (l.chantierId === ch.id && l.numeroMarche === undefined) l.numeroMarche = ch.numeroMarche ?? '';
      }
      delete ch.numeroMarche;
    }
  }
  if (c.schema < 5) {
    // v5 : période de préparation lue dans les jalons, jalons mal typés corrigés
    for (const ch of c.tables.chantiers as Chantier[]) {
      if (ch.dureePreparation !== undefined) continue;
      const jalons = (c.tables.jalons as Jalon[]).filter((j) => j.chantierId === ch.id).sort((a, b) => a.ordre - b.ordre);
      const a = analyserPreparation(jalons);
      if (a.duree !== undefined) { ch.dureePreparation = a.duree; ch.preparationComprise = a.comprise; }
      for (const k of a.corrections) Object.assign(jalons[k.i], { reference: k.reference, jours: k.jours });
    }
  }
}

/** Remplace TOUTES les données de l'appareil par celles de la sauvegarde (identifiants conservés). */
export async function restaurer(zip: JSZip, contenu: Contenu, onProgres?: (x: number) => void): Promise<void> {
  migrer(contenu);
  // Lecture des photos avant d'ouvrir la transaction (IndexedDB n'accepte pas d'attente externe dans une transaction)
  const photos: Photo[] = [];
  for (let i = 0; i < contenu.photos.length; i++) {
    const m = contenu.photos[i];
    const [b, v] = await Promise.all([zip.file(m.fichier)?.async('blob'), zip.file(m.vignette)?.async('blob')]);
    if (b) photos.push({ id: m.id, chantierId: m.chantierId, prisLe: m.prisLe, blob: new Blob([b], { type: 'image/jpeg' }), vignette: new Blob([v ?? b], { type: 'image/jpeg' }) });
    onProgres?.(((i + 1) / Math.max(1, contenu.photos.length)) * 0.8);
  }
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.photos], async () => {
    for (const t of TABLES) await db.table(t).clear();
    await db.photos.clear();
    for (const t of TABLES) await db.table(t).bulkAdd(contenu.tables[t]);
    await db.photos.bulkAdd(photos);
  });
  marquerSynchronise(0); // données identiques à une sauvegarde existante : rien à renvoyer
  onProgres?.(1);
}
