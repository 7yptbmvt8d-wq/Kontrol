// Exports PDF (jsPDF) : listes de réserves avec photos, état des jalons. Format A4 portrait.
import { jsPDF } from 'jspdf';
import { db } from '../../db/schema';
import type { Reserve } from '../../domain/types';
import { aujourdHui, fmtCourt, fmtDate, fmtHeure } from '../../domain/dates';
import { GRAVITE, refReserve, statutAffiche, type Ton } from '../../domain/statuts';
import { derniereAction, lignesJalons, origineTexte, statutTexte, type DonneesChantier } from './donnees';
import { TYPES, type FichierPret } from './partage';

// Couleurs d'impression (document papier, indépendantes du thème de l'app) — reprennent les tons du mode clair.
const ENCRE: [number, number, number] = [11, 18, 32];
const GRIS: [number, number, number] = [74, 85, 104];
const TRAIT: [number, number, number] = [213, 219, 229];
const ACCENT: [number, number, number] = [91, 71, 224];
const TON: Record<Ton, [number, number, number]> = { r: [185, 28, 28], o: [180, 83, 9], b: [29, 78, 216], g: [21, 128, 61], n: [75, 85, 99] };

const MARGE = 15;
const LARGEUR = 210 - 2 * MARGE;
const BAS = 297 - 18;

/** Les polices PDF standard ne couvrent que le jeu Windows-1252 : remplacement des rares caractères hors jeu. */
export function pdfTexte(s: string): string {
  return s
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/±/g, '+/-').replace(/→/g, '->')
    .replace(/[   ]/g, ' ').replace(/[‐‑]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
}

interface Image { data: Uint8Array; w: number; h: number }

/** Photo réduite pour le PDF (1000 px, JPEG 0,6) : document léger, envoyable par mail. */
async function imagePdf(id: number): Promise<Image | null> {
  const p = await db.photos.get(id);
  if (!p) return null;
  const url = URL.createObjectURL(p.blob);
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.6));
    return b ? { data: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

class DocPdf {
  doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  y = MARGE;
  constructor(private entete: string, private piedGauche: string) {
    this.doc.setFont('helvetica');
    this.enTete();
  }
  enTete() {
    const d = this.doc;
    d.setFontSize(8.5); d.setFont('helvetica', 'normal'); d.setTextColor(...GRIS);
    d.text(pdfTexte(this.entete), MARGE, 10, { maxWidth: LARGEUR });
    d.setDrawColor(...TRAIT); d.line(MARGE, 12, 210 - MARGE, 12);
    this.y = 18;
  }
  place(h: number) {
    if (this.y + h > BAS) { this.doc.addPage(); this.enTete(); }
  }
  texte(t: string, o: { taille?: number; gras?: boolean; couleur?: [number, number, number]; x?: number; largeur?: number; interligne?: number } = {}) {
    const d = this.doc;
    const taille = o.taille ?? 10;
    d.setFontSize(taille); d.setFont('helvetica', o.gras ? 'bold' : 'normal'); d.setTextColor(...(o.couleur ?? ENCRE));
    const lignes = d.splitTextToSize(pdfTexte(t), o.largeur ?? LARGEUR) as string[];
    const h = taille * 0.3528 * (o.interligne ?? 1.3);
    for (const l of lignes) {
      this.place(h);
      d.text(l, o.x ?? MARGE, this.y + h * 0.75);
      this.y += h;
    }
  }
  espace(mm: number) { this.y += mm; }
  trait() { this.place(3); this.doc.setDrawColor(...TRAIT); this.doc.line(MARGE, this.y, 210 - MARGE, this.y); this.y += 3; }
  terminer(): Blob {
    const d = this.doc;
    const n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setFontSize(8); d.setFont('helvetica', 'normal'); d.setTextColor(...GRIS);
      d.text(pdfTexte(this.piedGauche), MARGE, 297 - 8);
      d.text(`${i} / ${n}`, 210 - MARGE, 297 - 8, { align: 'right' });
    }
    return new Blob([d.output('arraybuffer')], { type: TYPES.pdf });
  }
}

const edition = () => `Édité le ${fmtDate(aujourdHui())} à ${fmtHeure(new Date().toISOString())} · Kontrol`;

async function blocReserve(doc: DocPdf, r: Reserve, ref: string) {
  const d = doc.doc;
  const st = statutAffiche(r, ref);
  const ton = st === 'en_retard' ? 'r' : st === 'leve' ? 'g' : st === 'ouvert' ? 'b' : 'o';
  doc.place(30);
  const y0 = doc.y;
  d.setFont('helvetica', 'bold'); d.setFontSize(11); d.setTextColor(...ENCRE);
  d.text(pdfTexte(`${refReserve(r.numero)} · ${r.lotCode} · ${GRAVITE[r.gravite]}`), MARGE, y0 + 4);
  d.setTextColor(...TON[ton]);
  d.text(pdfTexte(statutTexte(r, ref)), 210 - MARGE, y0 + 4, { align: 'right' });
  doc.y = y0 + 6.5;
  doc.texte(r.description, { taille: 10.5, gras: true });
  const meta = [
    r.localisation && `Localisation : ${r.localisation}`,
    `Échéance : ${fmtDate(r.echeance)}`,
    `Origine : ${origineTexte(r)}`,
    `Créée le ${fmtDate(r.creeLe.slice(0, 10))}`,
  ].filter(Boolean).join('   ·   ');
  doc.texte(meta, { taille: 9, couleur: GRIS });

  // Photos : jusqu'à 3 « avant » + 2 « après »
  const ids: { id: number; etiquette: string; ton: Ton }[] = [
    ...r.photoIds.slice(0, 3).map((id) => ({ id, etiquette: `Avant · ${fmtCourt(r.creeLe.slice(0, 10))}`, ton: 'r' as Ton })),
    ...(r.levee?.photoIds ?? []).slice(0, 2).map((id) => ({ id, etiquette: `Après · ${fmtCourt(r.levee!.date)}`, ton: 'g' as Ton })),
  ];
  if (ids.length) {
    const images = (await Promise.all(ids.map(async (x) => ({ ...x, img: await imagePdf(x.id) })))).filter((x) => x.img);
    const parLigne = 3;
    const l = (LARGEUR - (parLigne - 1) * 4) / parLigne;
    const hMax = l * 0.75;
    for (let i = 0; i < images.length; i += parLigne) {
      doc.place(hMax + 8);
      doc.espace(2);
      const yy = doc.y;
      images.slice(i, i + parLigne).forEach((x, k) => {
        const img = x.img!;
        const kx = Math.min(l / img.w, hMax / img.h);
        const w = img.w * kx, h = img.h * kx;
        const xx = MARGE + k * (l + 4);
        d.addImage(img.data, 'JPEG', xx, yy, w, h, undefined, 'FAST');
        d.setFontSize(8); d.setFont('helvetica', 'bold'); d.setTextColor(...TON[x.ton]);
        d.text(pdfTexte(x.etiquette), xx, yy + h + 3.5);
      });
      doc.y = yy + hMax + 5;
    }
  }
  if (r.historique.length > 1) doc.texte(`Dernière action : ${derniereAction(r)}`, { taille: 9, couleur: GRIS });
  doc.espace(2);
  doc.trait();
}

/**
 * Liste de réserves (avec photos). `titre` : ex. « Réserves – METALCO ».
 * `marches` : n° de marché concernés (affichés en tête).
 */
export async function pdfReserves(d: DonneesChantier, reserves: Reserve[], titre: string, nom: string, onProgres?: (n: number) => void): Promise<FichierPret> {
  const ref = aujourdHui();
  const doc = new DocPdf(`${d.ch.nom}${d.ch.site ? ` — ${d.ch.site}` : ''}`, edition());
  doc.texte(titre, { taille: 16, gras: true, couleur: ACCENT });
  doc.espace(1);
  const lots = [...new Set(reserves.map((r) => r.lotCode))];
  const marches = d.lots.filter((l) => lots.includes(l.code)).map((l) => `${l.code} : marché ${l.numeroMarche || 'n° non renseigné'}`);
  if (d.ch.operation) doc.texte(`Opération : ${d.ch.operation}`, { taille: 9.5, couleur: GRIS });
  if (marches.length) doc.texte(marches.join('   ·   '), { taille: 9.5, couleur: GRIS });
  const n = (f: (r: Reserve) => boolean) => reserves.filter(f).length;
  doc.texte(
    `${reserves.length} réserve${reserves.length > 1 ? 's' : ''} · ${n((r) => r.statut !== 'leve')} non levée(s) · ` +
    `${n((r) => statutAffiche(r, ref) === 'en_retard')} en retard · ${n((r) => r.statut === 'leve')} levée(s)`,
    { taille: 10, gras: true },
  );
  doc.espace(2);
  doc.trait();
  if (!reserves.length) doc.texte('Aucune réserve.', { couleur: GRIS });
  for (let i = 0; i < reserves.length; i++) {
    await blocReserve(doc, reserves[i], ref);
    onProgres?.((i + 1) / reserves.length);
  }
  return { nom, blob: doc.terminer() };
}

export function pdfJalons(d: DonneesChantier, nom: string): FichierPret {
  const doc = new DocPdf(`${d.ch.nom}${d.ch.site ? ` — ${d.ch.site}` : ''}`, edition());
  doc.texte('État des jalons', { taille: 16, gras: true, couleur: ACCENT });
  doc.espace(1);
  if (d.ch.dateOS) doc.texte(`OS générale : ${fmtDate(d.ch.dateOS)}`, { taille: 9.5, couleur: GRIS });
  for (const l of d.lots) doc.texte(`${l.code} : marché ${l.numeroMarche || 'n° non renseigné'}${l.dateOS ? ` · OS du lot ${fmtDate(l.dateOS)}` : ''}`, { taille: 9.5, couleur: GRIS });
  doc.espace(2);
  doc.trait();
  for (const x of lignesJalons(d)) {
    doc.place(14);
    const y0 = doc.y;
    const pdf = doc.doc;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5);
    pdf.setTextColor(...(x.retard ? TON.r : x.j.dateRealisee ? TON.g : ENCRE));
    pdf.text(x.date ? fmtDate(x.date) : '—', MARGE, y0 + 4);
    pdf.text(pdfTexte(x.statut), 210 - MARGE, y0 + 4, { align: 'right' });
    doc.y = y0;
    doc.texte(`${x.j.lotCode ? `[${x.j.lotCode}] ` : ''}${x.j.intitule}`, { x: MARGE + 26, largeur: LARGEUR - 26 - 38, gras: true, taille: 10 });
    doc.texte(`${x.calcul}${x.j.articleCcap ? ` · CCAP ${x.j.articleCcap}` : ''}`, { x: MARGE + 26, largeur: LARGEUR - 26 - 38, taille: 9, couleur: GRIS });
    doc.espace(1.5);
    doc.trait();
  }
  if (d.penalites.length) {
    doc.espace(3);
    doc.texte('Pénalités', { taille: 13, gras: true, couleur: ACCENT });
    doc.espace(1);
    for (const p of d.penalites) {
      doc.texte(`${p.lotCode ? `[${p.lotCode}] ` : ''}${p.motif}`, { gras: true, taille: 10 });
      doc.texte(`${p.montantOuTaux}${p.articleCcap ? ` · CCAP ${p.articleCcap}` : ''}`, { taille: 9, couleur: GRIS });
      doc.espace(1.5);
    }
  }
  return { nom, blob: doc.terminer() };
}
