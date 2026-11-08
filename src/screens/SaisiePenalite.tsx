import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import type { Intervenant, Lot, Penalite, PenaliteAppliquee, StatutPenalite } from '../domain/types';
import { STATUT_PENALITE, euros, lireBareme, pluriel } from '../domain/penalites';
import { aujourdHui } from '../domain/dates';
import { CodeLot, Segment, Sheet, toast } from '../components/ui';

const AUTRE = -1;

/** Appliquer (ou modifier) une pénalité : marché, article du barème, quantité → montant calculé. */
export function SaisiePenalite({ chantierId, penalite, depuis, lotParDefaut, datePre, notePre, lots, bareme, intervenants, onClose }: {
  chantierId: number; penalite?: PenaliteAppliquee; depuis?: Penalite; lotParDefaut?: string; datePre?: string; notePre?: string;
  lots: Lot[]; bareme: Penalite[]; intervenants: Intervenant[]; onClose: () => void;
}) {
  const titulaire = (code: string) => intervenants.find((i) => i.lotCode === code && i.role === 'titulaire')?.raisonSociale ?? '';
  const lotInitial = penalite?.lotCode ?? depuis?.lotCode ?? lotParDefaut ?? lots[0]?.code ?? '';
  const [lotCode, setLotCode] = useState(lotInitial);
  const [entreprise, setEntreprise] = useState(penalite?.entreprise ?? titulaire(lotInitial));
  const [baremeId, setBaremeId] = useState<number | null>(penalite ? penalite.baremeId ?? AUTRE : depuis?.id ?? null);
  const [choixMotif, setChoixMotif] = useState(baremeId === null);
  const [motifLibre, setMotifLibre] = useState(penalite && penalite.baremeId === undefined ? penalite.motif : '');
  const [date, setDate] = useState(penalite?.date ?? datePre ?? aujourdHui());
  const [quantite, setQuantite] = useState(penalite?.quantite ?? 1);
  const [unitaireSaisi, setUnitaireSaisi] = useState<string>(penalite?.montantUnitaire !== undefined ? String(penalite.montantUnitaire) : '');
  const [statut, setStatut] = useState<StatutPenalite>(penalite?.statut ?? 'constatee');
  const [note, setNote] = useState(penalite?.note ?? notePre ?? '');

  const lot = lots.find((l) => l.code === lotCode);
  const articles = bareme.filter((b) => !b.lotCode || b.lotCode === lotCode);
  const article = articles.find((b) => b.id === baremeId);
  const lecture = useMemo(() => (article ? lireBareme(article.montantOuTaux, lot?.montantHT) : undefined), [article, lot?.montantHT]);
  // Montant unitaire : saisi à la main s'il a été modifié, sinon calculé depuis le barème
  const unitaire = unitaireSaisi !== '' ? Number(unitaireSaisi.replace(',', '.')) : lecture?.unitaire;
  const unite = article ? lecture!.unite : penalite?.unite ?? 'forfait';
  const montant = unitaire !== undefined && !Number.isNaN(unitaire) ? Math.round(unitaire * quantite * 100) / 100 : undefined;

  const choisirArticle = (idArticle: number) => { setBaremeId(idArticle); setUnitaireSaisi(''); setChoixMotif(false); if (idArticle !== AUTRE) setQuantite(1); };

  const enregistrer = async () => {
    if (baremeId === null) { toast('Choisissez un motif'); return; }
    const motif = article ? article.motif : motifLibre.trim();
    if (!motif) { toast('Motif obligatoire'); return; }
    if (montant === undefined) { toast('Montant unitaire à saisir'); return; }
    const p: PenaliteAppliquee = {
      ...(penalite ?? { chantierId, creeLe: new Date().toISOString() }),
      lotCode, entreprise: entreprise.trim(), baremeId: article?.id, motif, articleCcap: article?.articleCcap ?? '',
      date, quantite, unite, montantUnitaire: unitaire, montant, statut, note: note.trim(),
      dateNotification: statut === 'constatee' ? undefined : penalite?.dateNotification ?? aujourdHui(),
    } as PenaliteAppliquee;
    await db.penalitesAppliquees.put(p);
    toast(penalite ? 'Pénalité modifiée' : `Pénalité appliquée : ${euros(montant)}`);
    onClose();
  };
  const supprimer = async () => {
    if (!penalite || !confirm('Supprimer cette pénalité du registre ?')) return;
    await db.penalitesAppliquees.delete(penalite.id!);
    onClose();
  };

  return (
    <Sheet titre={penalite ? 'Pénalité' : 'Appliquer une pénalité'} sousTitre={lot ? `Marché ${lot.code}${lot.numeroMarche ? ` · ${lot.numeroMarche}` : ''}` : undefined} onClose={onClose}
      pied={
        <div className="row">
          {penalite && <button type="button" className="btn danger tap" aria-label="Supprimer la pénalité" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>
            {penalite ? 'Enregistrer' : `Appliquer${montant !== undefined ? ` · ${euros(montant)}` : ''}`}
          </button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        {lots.length > 1 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Marché</div>
            <Segment<string> pill label="Marché" valeur={lotCode}
              onChange={(c) => { setLotCode(c); setEntreprise(titulaire(c)); if (article?.lotCode && article.lotCode !== c) choisirArticle(AUTRE); }}
              options={lots.map((l) => ({ v: l.code, l: <span className="mono">{l.code}</span>, aria: `Marché ${l.code}` }))} />
          </div>
        )}
        <div className="field">
          <label htmlFor="sp-ent">Entreprise</label>
          <input id="sp-ent" className="input" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Motif (barème du CCAP)</div>
          <div className="card flush" role="radiogroup" aria-label="Motif">
            {[...articles, { id: AUTRE, motif: 'Autre motif', montantOuTaux: 'Saisie libre', lotCode: undefined, articleCcap: '' } as Penalite]
              .filter((b) => choixMotif || b.id === baremeId).map((b, i) => {
              const actif = baremeId === b.id;
              return (
                <button key={b.id} type="button" role="radio" aria-checked={actif} className="tap" onClick={() => choisirArticle(b.id!)}
                  style={{ display: 'flex', gap: 12, width: '100%', textAlign: 'left', border: 0, padding: '10px 14px', borderTop: i ? '1px solid var(--line)' : 0,
                    background: actif ? 'var(--acc-bg)' : 'transparent', boxShadow: actif ? 'inset 3px 0 0 var(--accent)' : undefined }}>
                  <span className={`radio${actif ? ' on' : ''}`} aria-hidden />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{b.lotCode && <><CodeLot code={b.lotCode} />{' '}</>}{b.motif}</span>
                    <span className="ink2" style={{ display: 'block' }}>{b.montantOuTaux}{b.articleCcap ? ` · CCAP ${b.articleCcap}` : ''}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!choixMotif && (
            <button type="button" className="btn sec block tap" style={{ marginTop: 8, height: 48, fontSize: 16 }} onClick={() => setChoixMotif(true)}>Changer de motif</button>
          )}
          {baremeId === AUTRE && !choixMotif && (
            <input className="input" style={{ marginTop: 8 }} aria-label="Motif" placeholder="Motif de la pénalité" value={motifLibre} onChange={(e) => setMotifLibre(e.target.value)} />
          )}
        </div>

        <div className="field">
          <label htmlFor="sp-date">Date du constat</label>
          <input id="sp-date" type="date" className="input mono" value={date} max={aujourdHui()} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="lbl">Quantité</span>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="icon-btn round tap" aria-label="Diminuer" disabled={quantite <= 1} onClick={() => setQuantite((q) => Math.max(1, q - 1))}><Minus size={22} aria-hidden /></button>
              <input className="input mono" inputMode="numeric" aria-label="Quantité" value={quantite} style={{ width: 72, textAlign: 'center' }}
                onChange={(e) => setQuantite(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} onFocus={(e) => e.target.select()} />
              <button type="button" className="icon-btn round tap" aria-label="Augmenter" onClick={() => setQuantite((q) => q + 1)}><Plus size={22} aria-hidden /></button>
            </div>
          </div>
          <div className="ink2" style={{ textAlign: 'right', marginTop: 2 }}>{pluriel(quantite, unite)}</div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <label className="lbl" htmlFor="sp-pu">Montant unitaire (€ HT)</label>
            <input id="sp-pu" className="input mono" inputMode="decimal" style={{ width: 140, textAlign: 'right' }}
              placeholder={lecture?.mode === 'taux' && !lot?.montantHT ? 'à saisir' : '0'}
              value={unitaireSaisi !== '' ? unitaireSaisi : lecture?.unitaire !== undefined ? String(lecture.unitaire) : ''}
              onChange={(e) => setUnitaireSaisi(e.target.value.replace(/[^\d.,]/g, ''))} onFocus={(e) => e.target.select()} />
          </div>
          {lecture?.mode === 'taux' && (
            <div className="ink2" style={{ marginTop: 4 }}>
              {lot?.montantHT ? `${lecture.taux! < 1 ? `1/${Math.round(1 / lecture.taux!)}` : lecture.taux} × ${euros(lot.montantHT)} = ${euros(lecture.unitaire!)} par ${unite}`
                : 'Taux du montant du marché : renseignez le montant du marché dans les paramètres, ou saisissez le montant.'}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 700 }}>Montant</span>
            <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--r)' }}>{montant !== undefined ? euros(montant) : '—'}</span>
          </div>
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Statut</div>
          <Segment<StatutPenalite> label="Statut" valeur={statut} onChange={setStatut}
            options={(Object.keys(STATUT_PENALITE) as StatutPenalite[]).map((s) => ({ v: s, l: s === 'retenue' ? 'Retenue' : STATUT_PENALITE[s].libelle, aria: STATUT_PENALITE[s].libelle }))} />
        </div>

        <div className="field">
          <label htmlFor="sp-note">Note (facultatif)</label>
          <textarea id="sp-note" className="textarea" value={note} placeholder="ex. absence non excusée, réunion n°12" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
