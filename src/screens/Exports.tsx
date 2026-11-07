import { useState } from 'react';
import { Archive, ClipboardCopy, Share2 } from 'lucide-react';
import { useLive } from '../db/live';
import { Header, Sheet, toast } from '../components/ui';
import { chargerChantier, horodatage, nomFichier, parEntreprise, lignesJalons, type DonneesChantier } from '../services/exports/donnees';
import { pointsNonSoldes } from '../services/exports/texte';
import { partager, taille, TYPES, type FichierPret } from '../services/exports/partage';
import { filtrerTrier, type FiltresReserves } from '../domain/reserves';
import { bloquantNonValide, STATUT_RESERVE } from '../domain/statuts';
import { filtresReserves } from './OngletReserves';
import { retour } from '../router';
import { CarteDrive } from '../components/Drive';

type Format = 'pdf' | 'xlsx';
interface Pret { titre: string; fichiers: FichierPret[] }

const resumeFiltres = (f: FiltresReserves) => {
  const morceaux = [f.statut === 'toutes' ? 'toutes' : f.statut === 'non_levees' ? 'non levées' : STATUT_RESERVE[f.statut].libelle.toLowerCase()];
  if (f.lot) morceaux.push(`lot ${f.lot}`);
  if (f.entreprise) morceaux.push(f.entreprise);
  return morceaux.join(' · ');
};

export function Exports({ chantierId }: { chantierId: number }) {
  const d = useLive(`exports:${chantierId}`, () => chargerChantier(chantierId).catch(() => null), [chantierId]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [progres, setProgres] = useState(0);
  const [pret, setPret] = useState<Pret | null>(null);
  const [levees, setLevees] = useState(false);
  const [texte, setTexte] = useState<string | null>(null);

  const retourChantier = () => retour('chantier', chantierId, 'checklist');
  if (d === undefined) return <main className="screen" />;
  if (d === null) return <main className="screen"><Header title="Chantier introuvable" onBack={retourChantier} /></main>;

  const base = nomFichier(d.ch.site.split(/[-·(]/)[0] || d.ch.nom);
  const f = filtresReserves(chantierId);
  const liste = filtrerTrier(d.reserves, f);
  const pourEntreprise = d.reserves.filter((r) => levees || r.statut !== 'leve');
  const entreprises = parEntreprise(pourEntreprise);
  const nonSoldes = d.points.filter((p) => p.etat !== 'conforme' && p.etat !== 'sans_objet');
  const jal = lignesJalons(d);

  const lancer = async (cle: string, titre: string, travail: (dd: DonneesChantier) => Promise<FichierPret[]>) => {
    if (enCours) return;
    setEnCours(cle); setProgres(0);
    try {
      const frais = await chargerChantier(chantierId);
      const fichiers = await travail(frais);
      setPret({ titre, fichiers });
    } catch (e) {
      toast(`Export impossible : ${(e as Error).message}`);
    } finally {
      setEnCours(null);
    }
  };

  const exporter = (quoi: 'liste' | 'entreprises' | 'jalons' | 'nonSoldes', fmt: Format) => {
    const cle = `${quoi}-${fmt}`;
    const h = horodatage();
    if (quoi === 'liste') {
      return lancer(cle, 'Liste des réserves', async (dd) => {
        const rs = filtrerTrier(dd.reserves, f);
        if (fmt === 'xlsx') return [(await import('../services/exports/xlsx')).xlsxReserves(dd, rs, 'liste', `${nomFichier('Reserves', base, h)}.xlsx`)];
        const { pdfReserves } = await import('../services/exports/pdf');
        return [await pdfReserves(dd, rs, `Liste des réserves (${resumeFiltres(f)})`, `${nomFichier('Reserves', base, h)}.pdf`, setProgres)];
      });
    }
    if (quoi === 'entreprises') {
      return lancer(cle, 'Réserves par entreprise', async (dd) => {
        const groupes = parEntreprise(dd.reserves.filter((r) => levees || r.statut !== 'leve'));
        if (fmt === 'xlsx') {
          return [(await import('../services/exports/xlsx')).xlsxReserves(dd, groupes.flatMap(([, rs]) => rs), 'entreprise', `${nomFichier('Reserves-par-entreprise', base, h)}.xlsx`)];
        }
        const { pdfReserves } = await import('../services/exports/pdf');
        const sortie: FichierPret[] = [];
        for (let i = 0; i < groupes.length; i++) {
          const [ent, rs] = groupes[i];
          sortie.push(await pdfReserves(dd, rs, `Réserves – ${ent}`, `${nomFichier('Reserves', ent, h)}.pdf`, (x) => setProgres((i + x) / groupes.length)));
        }
        return sortie;
      });
    }
    if (quoi === 'jalons') {
      return lancer(cle, 'État des jalons', async (dd) => fmt === 'xlsx'
        ? [(await import('../services/exports/xlsx')).xlsxJalons(dd, `${nomFichier('Jalons', base, h)}.xlsx`)]
        : [(await import('../services/exports/pdf')).pdfJalons(dd, `${nomFichier('Jalons', base, h)}.pdf`)]);
    }
    return lancer(cle, 'Points non soldés', async (dd) => [(await import('../services/exports/xlsx')).xlsxNonSoldes(dd, `${nomFichier('Points-non-soldes', base, h)}.xlsx`)]);
  };

  const copier = async () => {
    const t = pointsNonSoldes(d);
    try {
      await navigator.clipboard.writeText(t);
      toast('Copié : collez-le dans Claude');
    } catch {
      setTexte(t); // presse-papiers refusé : affichage pour copie manuelle ou partage
    }
  };

  const sauvegarder = () => lancer('zip', 'Sauvegarde complète', async () => {
    const { creerSauvegarde } = await import('../services/sauvegarde');
    const { blob } = await creerSauvegarde(setProgres);
    return [{ nom: `Kontrol-sauvegarde-${horodatage()}.zip`, blob }];
  });

  const Formats = ({ quoi, pdf = true }: { quoi: 'liste' | 'entreprises' | 'jalons' | 'nonSoldes'; pdf?: boolean }) => (
    <>
      {pdf && <BoutonFormat libelle="PDF" cle={`${quoi}-pdf`} enCours={enCours} progres={progres} onClick={() => exporter(quoi, 'pdf')} />}
      <BoutonFormat libelle="XLSX" cle={`${quoi}-xlsx`} enCours={enCours} progres={progres} onClick={() => exporter(quoi, 'xlsx')} />
    </>
  );

  const nb = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

  return (
    <main className="screen">
      <Header sub={d.ch.site || d.ch.nom} title="Exports et sauvegarde" onBack={retourChantier} backLabel="Retour au chantier" />

      <div className="pad" style={{ marginTop: 14 }}><CarteDrive /></div>

      <h2 className="sec-title pad" style={{ margin: '20px 0 8px' }}>Exporter</h2>
      <section className="card flush" style={{ margin: '0 16px' }} aria-label="Exports">
        <div className="ex">
          <div className="ex-txt">
            <div className="ex-titre">Points non soldés</div>
            <div className="ink2">{nb(nonSoldes.length, 'point')} dont {nonSoldes.filter(bloquantNonValide).length} bloquants · {nb(d.reserves.filter((r) => r.statut !== 'leve').length, 'réserve')}. Texte à coller dans Claude pour le CR.</div>
          </div>
        </div>
        <div className="ex-actions">
          <button type="button" className="btn sec-acc tap" style={{ flex: '1 1 auto', height: 48, fontSize: 17 }} onClick={copier}>
            <ClipboardCopy size={20} strokeWidth={2.2} aria-hidden />Copier le texte
          </button>
          <Formats quoi="nonSoldes" pdf={false} />
        </div>

        <div className="ex">
          <div className="ex-txt">
            <div className="ex-titre">Liste des réserves</div>
            <div className="ink2">{nb(liste.length, 'réserve')} · filtres de l’onglet Réserves : {resumeFiltres(f)}</div>
          </div>
          <Formats quoi="liste" />
        </div>

        <div className="ex">
          <div className="ex-txt">
            <div className="ex-titre">Réserves par entreprise</div>
            <div className="ink2">{nb(entreprises.length, 'entreprise')} · un PDF par entreprise, avec photos</div>
          </div>
          <Formats quoi="entreprises" />
        </div>
        <label className="row ex-option">
          <span>Inclure les réserves levées</span>
          <input type="checkbox" {...{ switch: '' }} className="switch" checked={levees} onChange={(e) => setLevees(e.target.checked)} />
        </label>

        <div className="ex">
          <div className="ex-txt">
            <div className="ex-titre">État des jalons</div>
            <div className="ink2">{nb(jal.length, 'jalon')} · {jal.filter((x) => x.retard).length} en retard · pénalités</div>
          </div>
          <Formats quoi="jalons" />
        </div>
      </section>

      <h2 className="sec-title pad" style={{ margin: '20px 0 8px' }}>Sauvegarde sur le téléphone</h2>
      <section className="card" style={{ margin: '0 16px' }} aria-label="Sauvegarde">
        <div className="ex-titre">Sauvegarde complète (ZIP)</div>
        <div className="ink2" style={{ marginTop: 2 }}>Tous les chantiers, photos comprises. À enregistrer dans Fichiers ou à envoyer. Restauration : Réglages.</div>
        <button type="button" className="btn sec-acc block tap" style={{ marginTop: 12 }} onClick={sauvegarder} disabled={!!enCours}>
          {enCours === 'zip' ? <><span className="spinner" aria-hidden />{Math.round(progres * 100)} %</> : <><Archive size={20} strokeWidth={2.2} aria-hidden />Créer la sauvegarde</>}
        </button>
      </section>
      <div style={{ height: 24 }} />

      {pret && (
        <Sheet titre="Fichier prêt" sousTitre={pret.titre} onClose={() => setPret(null)} auto
          pied={
            <button type="button" className="btn block tap" onClick={async () => {
              const r = await partager(pret.fichiers, pret.titre);
              if (r !== 'annule') setPret(null);
            }}>
              <Share2 size={22} strokeWidth={2.2} aria-hidden />{pret.fichiers.length > 1 ? `Partager les ${pret.fichiers.length} fichiers` : 'Partager / Enregistrer'}
            </button>
          }>
          <ul className="card flush" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pret.fichiers.map((x, i) => (
              <li key={x.nom} className="row" style={{ justifyContent: 'space-between', padding: '12px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                <span className="mono" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.nom}</span>
                <span className="mono ink2" style={{ flex: '0 0 auto' }}>{taille(x.blob.size)}</span>
              </li>
            ))}
          </ul>
          <div className="ink2" style={{ marginTop: 10 }}>« Enregistrer dans Fichiers », Mail, AirDrop… depuis la feuille de partage de l’iPhone.</div>
        </Sheet>
      )}

      {texte !== null && (
        <Sheet titre="Points non soldés" onClose={() => setTexte(null)}
          pied={
            <button type="button" className="btn block tap" onClick={() => partager([{ nom: `${nomFichier('Points-non-soldes', base, horodatage())}.txt`, blob: new Blob([texte], { type: TYPES.txt }) }])}>
              <Share2 size={22} strokeWidth={2.2} aria-hidden />Partager le texte
            </button>
          }>
          <div className="ink2" style={{ marginBottom: 8 }}>Copie automatique refusée : sélectionnez le texte, ou partagez-le.</div>
          <textarea className="textarea mono" readOnly value={texte} style={{ minHeight: '55dvh', fontSize: 16 }} onFocus={(e) => e.target.select()} />
        </Sheet>
      )}
    </main>
  );
}

function BoutonFormat({ libelle, cle, enCours, progres, onClick }: { libelle: string; cle: string; enCours: string | null; progres: number; onClick: () => void }) {
  const actif = enCours === cle;
  return (
    <button type="button" className="fmt tap" aria-label={`Exporter en ${libelle}`} onClick={onClick} disabled={!!enCours && !actif}>
      {actif ? (progres > 0 ? <span className="mono">{Math.round(progres * 100)}%</span> : <span className="spinner" aria-hidden />) : libelle}
    </button>
  );
}

