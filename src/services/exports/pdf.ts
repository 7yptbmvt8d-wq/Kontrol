// Exports PDF (jsPDF) : listes de réserves avec photos, état des jalons. Format A4 portrait.
import { jsPDF } from 'jspdf';
import { db } from '../../db/schema';
import type { Reserve } from '../../domain/types';
import { aujourdHui, contexte, datePoint, ecartJours, fmtCourt, fmtDate, fmtHeure } from '../../domain/dates';
import { ETAT_POINT, GRAVITE, PHASE_CHANTIER, PHASE_CONTROLE, bloquantNonValide, refReserve, statutAffiche, type Ton } from '../../domain/statuts';
import { estValide, grouper, statistiques } from '../../domain/checklist';
import { derniereAction, lignesJalons, origineTexte, statutTexte, type DonneesChantier } from './donnees';
import { STATUT_PENALITE, euros, pluriel } from '../../domain/penalites';
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
  nouvellePage() { this.doc.addPage(); this.enTete(); }
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

async function blocReserve(doc: DocPdf, r: Reserve, ref: string, avecPhotos = true) {
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
  const nbPhotos = r.photoIds.length + (r.levee?.photoIds.length ?? 0);
  if (!avecPhotos && nbPhotos) doc.texte(`${nbPhotos} photo${nbPhotos > 1 ? 's' : ''} : voir le dossier Photos`, { taille: 9, couleur: GRIS });
  if (avecPhotos && ids.length) {
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

const enTeteChantier = (d: DonneesChantier) => `${d.ch.nom}${d.ch.site ? ` — ${d.ch.site}` : ''}`;

async function sectionReserves(doc: DocPdf, d: DonneesChantier, reserves: Reserve[], titre: string, avecPhotos: boolean, onProgres?: (n: number) => void) {
  const ref = aujourdHui();
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
    await blocReserve(doc, reserves[i], ref, avecPhotos);
    onProgres?.((i + 1) / reserves.length);
  }
}

/** Liste de réserves (avec photos). `titre` : ex. « Réserves – METALCO ». */
export async function pdfReserves(d: DonneesChantier, reserves: Reserve[], titre: string, nom: string, onProgres?: (n: number) => void): Promise<FichierPret> {
  const doc = new DocPdf(enTeteChantier(d), edition());
  await sectionReserves(doc, d, reserves, titre, true, onProgres);
  return { nom, blob: doc.terminer() };
}

export function pdfJalons(d: DonneesChantier, nom: string): FichierPret {
  const doc = new DocPdf(enTeteChantier(d), edition());
  sectionJalons(doc, d);
  return { nom, blob: doc.terminer() };
}

function sectionJalons(doc: DocPdf, d: DonneesChantier) {
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
}

/** Registre des pénalités appliquées, par marché (pour notification ou décompte). */
export function pdfPenalites(d: DonneesChantier, nom: string): FichierPret {
  const doc = new DocPdf(enTeteChantier(d), edition());
  sectionPenalites(doc, d);
  return { nom, blob: doc.terminer() };
}

function sectionPenalites(doc: DocPdf, d: DonneesChantier) {
  doc.texte('Registre des pénalités', { taille: 16, gras: true, couleur: ACCENT });
  const total = d.appliquees.reduce((t, p) => t + p.montant, 0);
  doc.texte(`${d.appliquees.length} pénalité(s) · total ${euros(total)}`, { taille: 10, gras: true });
  doc.espace(2);
  doc.trait();
  if (!d.appliquees.length) doc.texte('Aucune pénalité appliquée.', { couleur: GRIS });
  for (const l of d.lots) {
    const ps = d.appliquees.filter((p) => p.lotCode === l.code);
    if (!ps.length) continue;
    const t = ps.reduce((s, p) => s + p.montant, 0);
    doc.place(24);
    doc.texte(`${l.code} · ${l.intitule || ''}`, { taille: 12, gras: true });
    doc.texte(`Marché ${l.numeroMarche || 'n° non renseigné'}${l.montantHT ? ` · montant ${euros(l.montantHT)}` : ''} · ${ps[0].entreprise}`, { taille: 9, couleur: GRIS });
    doc.espace(1);
    for (const p of ps) {
      doc.place(14);
      const y0 = doc.y;
      const pdf = doc.doc;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...ENCRE);
      pdf.text(fmtDate(p.date), MARGE, y0 + 4);
      pdf.text(pdfTexte(euros(p.montant)), 210 - MARGE, y0 + 4, { align: 'right' });
      doc.y = y0;
      doc.texte(p.motif, { x: MARGE + 24, largeur: LARGEUR - 24 - 34, gras: true, taille: 10 });
      doc.texte(`${pluriel(p.quantite, p.unite)}${p.montantUnitaire !== undefined ? ` × ${euros(p.montantUnitaire)}` : ''}${p.articleCcap ? ` · CCAP ${p.articleCcap}` : ''} · ${STATUT_PENALITE[p.statut].libelle}${p.dateNotification && p.statut !== 'constatee' ? ` le ${fmtDate(p.dateNotification)}` : ''}`,
        { x: MARGE + 24, largeur: LARGEUR - 24 - 34, taille: 9, couleur: GRIS });
      if (p.note) doc.texte(p.note, { x: MARGE + 24, largeur: LARGEUR - 24 - 34, taille: 9, couleur: GRIS });
      doc.espace(1.5);
    }
    doc.texte(`Total ${l.code} : ${euros(t)}${l.montantHT ? ` (${((t / l.montantHT) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % du marché)` : ''}`, { gras: true, taille: 10.5 });
    doc.espace(2);
    doc.trait();
  }
}

// ---------- Rapport de chantier (déposé dans le dossier Drive du chantier) ----------

function sectionSynthese(doc: DocPdf, d: DonneesChantier) {
  const ref = aujourdHui();
  doc.texte('Rapport de chantier', { taille: 18, gras: true, couleur: ACCENT });
  doc.texte(d.ch.nom, { taille: 13, gras: true });
  const infos = [d.ch.operation && `Opération : ${d.ch.operation}`, d.ch.site && `Site : ${d.ch.site}`, `Phase : ${PHASE_CHANTIER[d.ch.phase]}`,
    d.ch.dateOS && `OS générale : ${fmtDate(d.ch.dateOS)}`].filter(Boolean).join('   ·   ');
  const ctx = contexte(d.ch, d.lots, d.jalons);
  const delais = [
    d.ch.dureePreparation && `Période de préparation : ${d.ch.dureePreparation} j${d.ch.preparationComprise === false ? ' (non comprise dans le délai)' : ''}${ctx.finPreparation ? `, fin le ${fmtDate(ctx.finPreparation)}` : ''}`,
    ctx.delai !== undefined && `Délai d’exécution : ${ctx.delai} j${ctx.debutDelai ? ` à compter du ${fmtDate(ctx.debutDelai)}` : ''}`,
    ctx.reception && `Réception ${ctx.receptionReelle ? '' : 'prévisionnelle '}: ${fmtDate(ctx.reception)}`,
  ].filter(Boolean).join('   ·   ');
  doc.texte(infos, { taille: 9.5, couleur: GRIS });
  if (delais) doc.texte(delais, { taille: 9.5, couleur: GRIS });
  doc.espace(2);
  doc.texte('Marchés', { taille: 12, gras: true });
  for (const l of d.lots) {
    const titulaire = d.intervenants.find((i) => i.role === 'titulaire' && i.lotCode === l.code)?.raisonSociale;
    doc.texte(`${l.code}${l.intitule ? ` – ${l.intitule}` : ''} · marché ${l.numeroMarche || 'n° non renseigné'}${titulaire ? ` · ${titulaire}` : ''}${l.dateOS ? ` · OS ${fmtDate(l.dateOS)}` : ''}`, { taille: 9.5 });
  }
  doc.espace(2);
  doc.trait();

  const st = statistiques(d.points);
  const pc = st.total ? Math.round(((st.conformes + st.sansObjet) / st.total) * 100) : 0;
  doc.texte('Checklist', { taille: 12, gras: true });
  doc.texte(`${pc} % validés (${st.conformes + st.sansObjet}/${st.total}) · ${st.conformes} conforme(s) · ${st.sansObjet} sans objet · ${st.nonConformes} non conforme(s) · ${st.enCours} en cours · ${st.aFaire} à faire`, { taille: 10 });
  if (st.bloquants) doc.texte(`${st.bloquants} point(s) bloquant(s) non validé(s)`, { taille: 10, gras: true, couleur: TON.r });
  doc.espace(2);

  const rs = d.reserves;
  const retard = rs.filter((r) => statutAffiche(r, ref) === 'en_retard').length;
  doc.texte('Réserves', { taille: 12, gras: true });
  doc.texte(`${rs.length} réserve(s) · ${rs.filter((r) => r.statut !== 'leve').length} non levée(s) · ${rs.filter((r) => r.statut === 'leve').length} levée(s)`, { taille: 10 });
  if (retard) doc.texte(`${retard} réserve(s) en retard`, { taille: 10, gras: true, couleur: TON.r });
  doc.espace(2);

  const jal = lignesJalons(d);
  const jRetard = jal.filter((x) => x.retard).length;
  const prochain = jal.find((x) => !x.j.dateRealisee && x.date && x.date >= ref);
  doc.texte('Jalons', { taille: 12, gras: true });
  doc.texte(`${jal.length} jalon(s) · ${jal.filter((x) => x.j.dateRealisee).length} fait(s)${prochain ? ` · prochain : ${prochain.j.intitule} le ${fmtDate(prochain.date)}` : ''}`, { taille: 10 });
  if (jRetard) doc.texte(`${jRetard} jalon(s) en retard`, { taille: 10, gras: true, couleur: TON.r });
  doc.espace(2);

  const total = d.appliquees.reduce((t, p) => t + p.montant, 0);
  doc.texte('Pénalités appliquées', { taille: 12, gras: true });
  doc.texte(d.appliquees.length ? `${d.appliquees.length} pénalité(s) · total ${euros(total)}` : 'Aucune', { taille: 10 });
}

function sectionChecklist(doc: DocPdf, d: DonneesChantier) {
  const ref = aujourdHui();
  const pdf = doc.doc;
  doc.texte('Checklist de contrôle', { taille: 16, gras: true, couleur: ACCENT });
  doc.espace(1);
  if (!d.points.length) doc.texte('Aucun point de contrôle.', { couleur: GRIS });
  for (const g of grouper(d.points, d.lots, { etat: 'tous', lot: '', texte: '' })) {
    doc.place(20);
    doc.espace(2);
    doc.texte(`${g.lot} · ${PHASE_CONTROLE[g.phase]}   (${g.valides}/${g.total} validés)`, { taille: 11.5, gras: true });
    doc.trait();
    for (const p of g.points) {
      const e = ETAT_POINT[p.etat];
      doc.place(12);
      const y0 = doc.y;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(...TON[e.ton]);
      pdf.text(pdfTexte(e.libelle), 210 - MARGE, y0 + 3.6, { align: 'right' });
      doc.texte(p.articleCctp || p.id, { taille: 8.5, couleur: GRIS, largeur: LARGEUR - 34 });
      doc.texte(p.intitule, { taille: 10, gras: true, largeur: LARGEUR - 34 });
      const date = estValide(p) ? undefined : datePoint(p, d.ch, d.lots, d.jalons);
      const retard = date ? ecartJours(date, ref) : 0;
      const details = [
        bloquantNonValide(p) && 'Point bloquant',
        date && `Échéance ${fmtDate(date)}${retard > 0 ? ` (+${retard} j)` : ''}`,
        !date && !estValide(p) && p.echeance.type === 'evenement' && p.echeance.valeur && `Échéance : ${p.echeance.valeur}`,
        p.dateEtat && estValide(p) && `${e.libelle} le ${fmtDate(p.dateEtat.slice(0, 10))}`,
        p.photoIds.length && `${p.photoIds.length} photo(s)`,
      ].filter(Boolean).join('   ·   ');
      if (details) doc.texte(details, { taille: 8.5, couleur: bloquantNonValide(p) || retard > 0 ? TON.r : GRIS, largeur: LARGEUR - 34 });
      if (p.commentaire.trim()) doc.texte(`Commentaire : ${p.commentaire.trim()}`, { taille: 9, couleur: GRIS, largeur: LARGEUR - 34 });
      doc.espace(1);
    }
  }
}

/** Rapport complet du chantier : synthèse, checklist, réserves (sans photos), jalons, pénalités appliquées. */
export async function pdfRapport(d: DonneesChantier, nom: string): Promise<FichierPret> {
  const doc = new DocPdf(enTeteChantier(d), edition());
  sectionSynthese(doc, d);
  doc.nouvellePage();
  sectionChecklist(doc, d);
  doc.nouvellePage();
  await sectionReserves(doc, d, d.reserves, 'Réserves', false);
  doc.nouvellePage();
  sectionJalons(doc, d);
  if (d.appliquees.length) {
    doc.nouvellePage();
    sectionPenalites(doc, d);
  }
  return { nom, blob: doc.terminer() };
}
