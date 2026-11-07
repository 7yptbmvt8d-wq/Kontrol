import { useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ImageIcon, Pencil, RotateCcw } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { EvenementReserve, Reserve } from '../domain/types';
import { GRAVITE, ORIGINE, STATUT_RESERVE, refReserve, statutAffiche } from '../domain/statuts';
import { ajouterJours, aujourdHui, ecartJours, fmtCourt, fmtDate, fmtHeure } from '../domain/dates';
import { Header, Pastille, Segment, Sheet, toast } from '../components/ui';
import { BandeauPhotos, Visionneuse, usePhotoUrl } from '../components/Photos';
import { enregistrerPhotos } from '../services/photos';
import { lever, refuserLevee, relancer, rouvrir, signalerLevee } from '../services/reserves';
import { aller, retour } from '../router';
import { SaisieReserve } from './SaisieReserve';

const COULEUR_EVT: Record<EvenementReserve['type'], string> = {
  creation: 'var(--b)', relance: 'var(--o)', levee_a_verifier: 'var(--o)', levee: 'var(--g)', refus: 'var(--r)',
  reouverture: 'var(--b)', modification: 'var(--n)',
};

type Action = 'relance' | 'refus' | 'levee' | null;

export function DetailReserve({ chantierId, rid }: { chantierId: number; rid: number }) {
  const r = useLive(`reserve:${rid}`, () => db.reserves.get(rid).then((x) => (x && x.chantierId === chantierId ? x : null)), [rid]);
  const [action, setAction] = useState<Action>(null);
  const [edition, setEdition] = useState(false);
  const [vue, setVue] = useState<{ ids: number[]; titre: string } | null>(null);
  const retourListe = () => retour('chantier', chantierId, 'reserves');

  if (r === undefined) return <main className="screen" />;
  if (r === null) return <main className="screen"><Header title="Réserve introuvable" onBack={retourListe} backLabel="Retour aux réserves" /></main>;

  const today = aujourdHui();
  const st = statutAffiche(r, today);
  const s = STATUT_RESERVE[st];
  const retard = st === 'en_retard' && r.echeance ? ecartJours(r.echeance, today) : 0;
  const premiere = r.historique[0]?.date.slice(0, 10) ?? r.creeLe.slice(0, 10);

  return (
    <main className="screen has-bar">
      <header className="hdr" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="icon-btn tap" aria-label="Retour aux réserves" onClick={retourListe}>
          <ChevronLeft size={28} strokeWidth={2.2} aria-hidden />
        </button>
        <div className="row">
          <Pastille ton={s.ton}>{s.libelle}</Pastille>
          <button type="button" className="icon-btn tap" aria-label="Modifier la réserve" onClick={() => setEdition(true)}><Pencil size={22} strokeWidth={2.2} aria-hidden /></button>
        </div>
      </header>

      <div className="pad" style={{ marginTop: 4 }}>
        <div className="mono ink2" style={{ overflowWrap: 'anywhere' }}>{refReserve(r.numero)} · {r.lotCode}{r.entreprise ? ` · ${r.entreprise}` : ''}</div>
        <h1 style={{ marginTop: 4, fontSize: 22, lineHeight: 1.25, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.description}</h1>
      </div>

      <div className="pad res-photos" style={{ marginTop: 12 }}>
        <TuilePhoto ids={r.photoIds} libelle={`Avant · ${fmtCourt(premiere)}`} ton="r" vide="Pas de photo" onOuvrir={() => setVue({ ids: r.photoIds, titre: 'Avant' })} />
        <TuilePhoto ids={r.levee?.photoIds ?? []} libelle={r.levee ? `Après · ${fmtCourt(r.levee.date)}` : 'Après'} ton="g"
          vide={r.statut === 'leve' ? 'Pas de photo' : 'À la levée'} onOuvrir={() => setVue({ ids: r.levee?.photoIds ?? [], titre: 'Après' })} />
      </div>

      <dl className="card flush" style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div className="cell"><dt>Localisation</dt><dd>{r.localisation || '—'}</dd></div>
        <div className="cell"><dt>Gravité</dt><dd className={r.gravite === 'bloquante' ? 'c-r' : undefined}>{GRAVITE[r.gravite]}</dd></div>
        <div className="cell" style={{ borderTop: '1px solid var(--line)' }}><dt>Échéance</dt>
          <dd className="mono" style={retard ? { color: 'var(--r)' } : undefined}>{fmtDate(r.echeance)}{retard ? ` · +${retard} j` : ''}</dd></div>
        <div className="cell" style={{ borderTop: '1px solid var(--line)' }}><dt>Origine</dt>
          <dd>{r.pointId
            ? <button type="button" className="mono tap" style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, minHeight: 44, textAlign: 'left' }}
                onClick={async () => { const p = await db.points.where('[chantierId+id]').equals([chantierId, r.pointId!]).first(); if (p) aller('chantier', chantierId, 'point', p.uid!); else toast('Point introuvable'); }}>
                Point {r.pointId}
              </button>
            : ORIGINE[r.origine]}</dd></div>
      </dl>

      {r.statut !== 'leve' && r.statut !== 'levee_a_verifier' && (
        <div className="pad row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn sec tap" style={{ flex: '1 1 0' }} onClick={() => setAction('relance')}>Relancer</button>
          <button type="button" className="btn sec tap" style={{ flex: '1 1 0' }}
            onClick={async () => { await signalerLevee(r.id!); toast('Levée à vérifier'); }}>Signalée levée</button>
        </div>
      )}

      <h2 className="sec-title pad" style={{ margin: '16px 0 4px' }}>Historique</h2>
      <ol className="tl pad" style={{ margin: 0 }}>
        {[...r.historique].reverse().map((h, i) => (
          <li key={i} style={{ gap: 12 }}>
            <div className="tl-rail" aria-hidden style={{ flex: '0 0 14px' }}>
              <span className="tl-dot" style={{ background: COULEUR_EVT[h.type], marginTop: 5 }} />
              <span className="tl-line" />
            </div>
            <div style={{ paddingBottom: 10, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{h.texte}</div>
              <div className="mono ink2">{fmtCourt(h.date.slice(0, 10))} · {fmtHeure(h.date)}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="bar-space" />
      <div className="bottom-bar">
        {r.statut === 'leve' ? (
          <button type="button" className="btn sec block tap" onClick={async () => {
            if (!confirm('Rouvrir cette réserve ? Les photos de levée seront supprimées.')) return;
            await rouvrir(r.id!); toast('Réserve rouverte');
          }}><RotateCcw size={22} aria-hidden />Rouvrir la réserve</button>
        ) : (
          <>
            {r.statut === 'levee_a_verifier' && (
              <button type="button" className="btn sec tap" style={{ flex: '0 0 auto' }} onClick={() => setAction('refus')}>Refuser</button>
            )}
            <button type="button" className="btn ok block tap" onClick={() => setAction('levee')}>
              <Check size={22} strokeWidth={2.8} aria-hidden />Lever la réserve
            </button>
          </>
        )}
      </div>

      {(action === 'relance' || action === 'refus') && <SheetRelance r={r} refus={action === 'refus'} onClose={() => setAction(null)} />}
      {action === 'levee' && <SheetLevee r={r} onClose={() => setAction(null)} />}
      {edition && <SaisieReserve chantierId={chantierId} reserve={r} onClose={() => setEdition(false)} />}
      {vue && vue.ids.length > 0 && <Visionneuse ids={vue.ids} titre={vue.titre} onClose={() => setVue(null)} />}
    </main>
  );
}

function TuilePhoto({ ids, libelle, ton, vide, onOuvrir }: { ids: number[]; libelle: string; ton: 'r' | 'g'; vide: string; onOuvrir: () => void }) {
  const url = usePhotoUrl(ids[0] ?? -1);
  return (
    <button type="button" className="res-ph tap" onClick={() => { if (ids.length) onOuvrir(); }} aria-disabled={!ids.length} aria-label={`${libelle}${ids.length ? `, ${ids.length} photo${ids.length > 1 ? 's' : ''}` : ', aucune photo'}`}>
      {ids.length && url ? <img src={url} alt="" /> : <span className="row ink2"><ImageIcon size={24} aria-hidden />{vide}</span>}
      <span className={`res-phl t-${ton}`}>{libelle}</span>
      {ids.length > 1 && <span className="res-phn">+{ids.length - 1}</span>}
    </button>
  );
}

const DELAIS = [8, 15, 30];

function SheetRelance({ r, refus, onClose }: { r: Reserve; refus: boolean; onClose: () => void }) {
  const [delai, setDelai] = useState<number | null>(8);
  const [note, setNote] = useState('');
  const echeance = delai ? ajouterJours(aujourdHui(), delai) : undefined;
  const valider = async () => {
    if (refus) await refuserLevee(r.id!, echeance, note); else await relancer(r.id!, echeance, note);
    toast(refus ? 'Levée refusée' : 'Réserve relancée');
    onClose();
  };
  return (
    <Sheet titre={refus ? 'Refuser la levée' : 'Relancer l’entreprise'} sousTitre={`${refReserve(r.numero)} · ${r.entreprise}`} onClose={onClose} auto
      pied={<button type="button" className="btn block tap" onClick={valider}>{refus ? 'Refuser la levée' : 'Enregistrer la relance'}</button>}>
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="row lbl" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span>Nouvelle échéance</span><span className="mono" style={{ color: 'var(--ink)' }}>{echeance ? fmtDate(echeance) : `inchangée (${fmtDate(r.echeance)})`}</span>
          </div>
          <Segment<string> pill label="Nouvelle échéance" valeur={delai ? String(delai) : 'x'} onChange={(x) => setDelai(x === 'x' ? null : Number(x))}
            options={[...DELAIS.map((d) => ({ v: String(d), l: `+${d} j` })), { v: 'x', l: 'Inchangée' }]} />
        </div>
        <div className="field">
          <label htmlFor="rel-note">{refus ? 'Motif du refus' : 'Note (facultatif)'}</label>
          <textarea id="rel-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={refus ? 'ex. reprise incomplète, fixation non conforme' : 'ex. relance orale en réunion'} />
        </div>
      </div>
    </Sheet>
  );
}

/** Levée : photo de constat obligatoire, date (aujourd'hui par défaut), note. */
function SheetLevee({ r, onClose }: { r: Reserve; onClose: () => void }) {
  const [photos, setPhotos] = useState<number[]>([]);
  const [date, setDate] = useState(aujourdHui());
  const [note, setNote] = useState('');
  const [enCours, setEnCours] = useState(false);
  const enregistre = useRef(false);
  const fermer = () => {
    if (!enregistre.current && photos.length) void db.photos.bulkDelete(photos);
    onClose();
  };
  const ajouter = async (f: File[]) => {
    setEnCours(true);
    try { const ids = await enregistrerPhotos(r.chantierId, f); setPhotos((p) => [...p, ...ids]); }
    catch (e) { toast(`Photo non enregistrée : ${(e as Error).message}`); }
    finally { setEnCours(false); }
  };
  const valider = async () => {
    if (!photos.length) { toast('Photo de constat obligatoire'); return; }
    if (!date) { toast('Date de levée obligatoire'); return; }
    await lever(r.id!, date, photos, note);
    enregistre.current = true;
    toast(`${refReserve(r.numero)} levée`);
    onClose();
  };
  return (
    <Sheet titre="Lever la réserve" sousTitre={`${refReserve(r.numero)} · ${r.entreprise}`} onClose={fermer} auto
      pied={
        <button type="button" className="btn ok block tap" onClick={valider} disabled={enCours}>
          <Check size={22} strokeWidth={2.8} aria-hidden />Lever la réserve
        </button>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Photo de constat (obligatoire)</div>
          <BandeauPhotos ids={photos} onAjout={ajouter} enCours={enCours}
            onSupprimer={(id) => { setPhotos((p) => p.filter((x) => x !== id)); void db.photos.delete(id); }} />
          {!photos.length && <div className="row ink2" style={{ marginTop: 6 }}><Camera size={18} aria-hidden />Touchez la tuile pour photographier la reprise.</div>}
        </div>
        <div className="field">
          <label htmlFor="lev-date">Date de levée</label>
          <input id="lev-date" type="date" className="input mono" value={date} max={aujourdHui()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="lev-note">Note (facultatif)</label>
          <textarea id="lev-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. constatée en présence du conducteur de travaux" />
        </div>
      </div>
    </Sheet>
  );
}
