import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { EtatPoint } from '../domain/types';
import { ETAT_POINT, PHASE_CONTROLE, RESPONSABLE, TYPE_CONTROLE, bloquantNonValide } from '../domain/statuts';
import { aujourdHui, datePoint, ecartJours, fmtDate } from '../domain/dates';
import { estValide, lireParcours } from '../domain/checklist';
import { BadgeBloquant, Header, toast } from '../components/ui';
import { BandeauPhotos } from '../components/Photos';
import { enregistrerPhotos } from '../services/photos';
import { remplacer, retour } from '../router';
import { EditionPoint } from './EditionPoint';

const ORDRE_ETATS: { v: EtatPoint; large?: boolean }[] = [
  { v: 'conforme', large: true }, { v: 'non_conforme', large: true },
  { v: 'en_cours' }, { v: 'a_faire' }, { v: 'sans_objet' },
];

export function DetailPoint({ chantierId, uid }: { chantierId: number; uid: number }) {
  const data = useLive(`point:${uid}`, async () => {
    const [p, ch, lots] = await Promise.all([
      db.points.get(uid),
      db.chantiers.get(chantierId),
      db.lots.where('chantierId').equals(chantierId).toArray(),
    ]);
    if (!p || !ch || p.chantierId !== chantierId) return null;
    const groupe = await db.points.where('[chantierId+lot]').equals([chantierId, p.lot]).filter((x) => x.phase === p.phase).sortBy('ordre');
    return { p, ch, lots, rang: groupe.findIndex((x) => x.uid === uid) + 1, taille: groupe.length };
  }, [chantierId, uid]);
  const [edition, setEdition] = useState(false);
  const [photosEnCours, setPhotosEnCours] = useState(false);
  const retourChecklist = () => retour('chantier', chantierId, 'checklist');

  if (data === undefined) return <main className="screen" />;
  if (data === null) {
    return (
      <main className="screen">
        <Header title="Point introuvable" onBack={retourChecklist} backLabel="Retour à la checklist" />
      </main>
    );
  }
  const { p, ch, lots, rang, taille } = data;
  const parcours = lireParcours(chantierId) ?? [];
  const i = parcours.indexOf(uid);
  const prec = i > 0 ? parcours[i - 1] : undefined;
  const suiv = i >= 0 && i < parcours.length - 1 ? parcours[i + 1] : undefined;

  const date = datePoint(p, ch, lots);
  const retard = date && !estValide(p) ? ecartJours(date, aujourdHui()) : 0;

  const changerEtat = async (etat: EtatPoint) => {
    if (etat === p.etat) return;
    const now = new Date().toISOString();
    await db.transaction('rw', [db.points, db.chantiers], async () => {
      await db.points.update(uid, { etat, dateEtat: aujourdHui() });
      await db.chantiers.update(chantierId, { majLe: now });
    });
  };

  const ajouterPhotos = async (fichiers: File[]) => {
    setPhotosEnCours(true);
    try {
      const ids = await enregistrerPhotos(chantierId, fichiers);
      await db.points.update(uid, { photoIds: [...p.photoIds, ...ids] });
    } catch (e) {
      toast(`Photo non enregistrée : ${(e as Error).message}`);
    } finally {
      setPhotosEnCours(false);
    }
  };
  const supprimerPhoto = async (id: number) => {
    await db.transaction('rw', [db.points, db.photos], async () => {
      await db.points.update(uid, { photoIds: p.photoIds.filter((x) => x !== id) });
      await db.photos.delete(id);
    });
  };

  return (
    <main className="screen has-bar">
      <Header
        sub={`${p.lot} · ${PHASE_CONTROLE[p.phase]} · ${rang}/${taille}`}
        onBack={retourChecklist}
        backLabel="Retour à la checklist"
        right={
          <button type="button" className="icon-btn tap" aria-label="Modifier le point" onClick={() => setEdition(true)}>
            <Pencil size={22} strokeWidth={2.2} aria-hidden />
          </button>
        }
      />

      <div className="pad" style={{ marginTop: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {p.bloquant && <BadgeBloquant />}
          {p.articleCctp && <span className="st no-dot mono" style={{ background: 'var(--surface2)' }}>{p.articleCctp}</span>}
        </div>
        <h1 style={{ marginTop: 10, fontSize: 22, lineHeight: 1.25, fontWeight: 700, overflowWrap: 'anywhere' }}>{p.intitule}</h1>
        {bloquantNonValide(p) && (
          <div className="pt-blo" style={{ marginTop: 8 }}>
            <TriangleAlert size={18} strokeWidth={2.4} aria-hidden style={{ flex: '0 0 auto' }} />
            <span>À valider avant de poursuivre{p.echeance.type === 'evenement' && p.echeance.valeur ? ` · ${p.echeance.valeur}` : ''}</span>
          </div>
        )}
      </div>

      <dl className="card flush" style={{ margin: '12px 16px 0' }}>
        <div className="kv"><dt>Type</dt><dd>{TYPE_CONTROLE[p.type]}</dd></div>
        {p.critere && <div className="kv"><dt>Critère</dt><dd>{p.critere}</dd></div>}
        {p.reference && <div className="kv"><dt>Référentiel</dt><dd className="mono">{p.reference}</dd></div>}
        <div className="kv"><dt>Échéance</dt><dd>
          {date
            ? <span className="mono" style={{ fontWeight: 600, color: retard > 0 ? 'var(--r)' : undefined }}>{fmtDate(date)}{retard > 0 ? ` · +${retard} j` : ''}</span>
            : p.echeance.type === 'relative' ? <span className="ink2">OS non saisie ({p.echeance.valeur} j)</span>
            : p.echeance.valeur || '—'}
        </dd></div>
        <div className="kv"><dt>Responsable</dt><dd>{RESPONSABLE[p.responsable]}</dd></div>
      </dl>

      <div className="pad" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="lbl">État</span>
          {p.dateEtat && p.etat !== 'a_faire' && <span className="mono ink2">le {fmtDate(p.dateEtat)}</span>}
        </div>
        <div className="etats" role="group" aria-label="État du point">
          {ORDRE_ETATS.map(({ v, large }) => {
            const e = ETAT_POINT[v];
            const actif = p.etat === v;
            return (
              <button key={v} type="button" className={`tap${large ? ' large' : ''}`} aria-pressed={actif} onClick={() => changerEtat(v)}
                style={{ color: `var(--${e.ton})`, background: actif ? `var(--${e.ton}-bg)` : undefined }}>
                {large ? e.libelle : e.court}
              </button>
            );
          })}
        </div>
      </div>

      <Commentaire uid={uid} initial={p.commentaire} />

      <div className="pad" style={{ marginTop: 14 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>Photos</div>
        <BandeauPhotos ids={p.photoIds} onAjout={ajouterPhotos} onSupprimer={supprimerPhoto} enCours={photosEnCours} />
      </div>

      <div className="bar-space" />
      <div className="bottom-bar">
        <button type="button" className="btn sec tap" aria-label="Point précédent" disabled={prec === undefined}
          onClick={() => prec !== undefined && remplacer('chantier', chantierId, 'point', prec)} style={{ width: 56, padding: 0 }}>
          <ChevronLeft size={26} strokeWidth={2.4} aria-hidden />
        </button>
        {p.etat === 'non_conforme' ? (
          <button type="button" className="btn block tap" onClick={() => toast('Création de réserve : disponible à l’étape (c)')}>
            <Plus size={22} strokeWidth={2.6} aria-hidden />Créer une réserve
          </button>
        ) : (
          <button type="button" className="btn block tap" disabled={suiv === undefined}
            onClick={() => suiv !== undefined && remplacer('chantier', chantierId, 'point', suiv)}>
            Point suivant<ChevronRight size={22} strokeWidth={2.6} aria-hidden />
          </button>
        )}
        {p.etat === 'non_conforme' && (
          <button type="button" className="btn sec tap" aria-label="Point suivant" disabled={suiv === undefined}
            onClick={() => suiv !== undefined && remplacer('chantier', chantierId, 'point', suiv)} style={{ width: 56, padding: 0 }}>
            <ChevronRight size={26} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>

      {edition && <EditionPoint chantierId={chantierId} point={p} lots={lots.map((l) => l.code)} onClose={() => setEdition(false)} />}
    </main>
  );
}

/** Commentaire enregistré automatiquement (pause de frappe, sortie du champ, fermeture de l'écran). Dictée iOS compatible. */
function Commentaire({ uid, initial }: { uid: number; initial: string }) {
  const [v, setV] = useState(initial);
  const dernier = useRef(initial);
  const minuterie = useRef<number | undefined>(undefined);
  const enregistrer = (val: string) => {
    window.clearTimeout(minuterie.current);
    if (val === dernier.current) return;
    dernier.current = val;
    void db.points.update(uid, { commentaire: val });
  };
  const valeur = useRef(v);
  valeur.current = v;
  useEffect(() => () => enregistrer(valeur.current), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pad field" style={{ marginTop: 14 }}>
      <label htmlFor={`com-${uid}`}>Commentaire</label>
      <textarea id={`com-${uid}`} className="textarea" value={v} placeholder="Constat, mesure, remarque… (dictée possible)"
        onChange={(e) => {
          setV(e.target.value);
          window.clearTimeout(minuterie.current);
          const val = e.target.value;
          minuterie.current = window.setTimeout(() => enregistrer(val), 600);
        }}
        onBlur={() => enregistrer(v)} />
    </div>
  );
}
