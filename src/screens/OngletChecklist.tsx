import { useState } from 'react';
import { Plus, Search, TriangleAlert } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier } from '../domain/types';
import { ETAT_POINT, PHASE_CONTROLE, bloquantNonValide } from '../domain/statuts';
import { aujourdHui, datePoint, ecartJours, fmtCourt } from '../domain/dates';
import { grouper, memoriserParcours, statistiques, estValide, type FiltreEtat, type Filtres } from '../domain/checklist';
import { CodeLot, Pastille } from '../components/ui';
import { BarreChecklist } from '../components/BarreChecklist';
import { aller, lien } from '../router';
import { EditionPoint } from './EditionPoint';

/** Filtres mémorisés par chantier pendant la session (retour depuis un point). */
const memoire = new Map<number, Filtres>();
/** Ouverture de la checklist sur un filtre d'état (ex. depuis les compteurs de l'accueil). */
export const filtrerChecklistSur = (chantierId: number, etat: FiltreEtat) => memoire.set(chantierId, { etat, lot: '', texte: '' });

const FILTRES: { v: FiltreEtat; l: string; dot?: string }[] = [
  { v: 'tous', l: 'Tous' },
  { v: 'bloquants', l: 'Bloquants' },
  { v: 'a_faire', l: 'À faire', dot: 'var(--b)' },
  { v: 'en_cours', l: 'En cours', dot: 'var(--o)' },
  { v: 'non_conforme', l: 'Non conformes', dot: 'var(--r)' },
];

export function OngletChecklist({ chantier: ch }: { chantier: Chantier }) {
  const id = ch.id!;
  const data = useLive(`checklist:${id}`, async () => {
    const [points, lots] = await Promise.all([
      db.points.where('chantierId').equals(id).toArray(),
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
    ]);
    return { points, lots };
  }, [id]);
  const [f, setF] = useState<Filtres>(memoire.get(id) ?? { etat: 'tous', lot: '', texte: '' });
  const [ajout, setAjout] = useState(false);
  const maj = (patch: Partial<Filtres>) => setF((o) => { const n = { ...o, ...patch }; memoire.set(id, n); return n; });

  if (!data) return null;
  const { points, lots } = data;
  const st = statistiques(points);
  const compte = (v: FiltreEtat) =>
    v === 'tous' ? st.total : v === 'bloquants' ? st.bloquants : v === 'a_faire' ? st.aFaire : v === 'en_cours' ? st.enCours : st.nonConformes;
  const groupes = grouper(points, lots, f);
  const today = aujourdHui();
  memoriserParcours(id, groupes.flatMap((g) => g.points.map((p) => p.uid!)));

  if (!points.length) return <div className="pad" style={{ marginTop: 16 }}><div className="card empty">Aucun point de contrôle importé.</div></div>;

  return (
    <div>
      <div className="pad" style={{ marginTop: 12 }}>
        <BarreChecklist st={st} />
        <div className="ink2" style={{ marginTop: 4 }}>
          <span className="mono">{st.conformes + st.sansObjet}/{st.total}</span> validés · {st.conformes} conforme{st.conformes > 1 ? 's' : ''}
          {st.sansObjet > 0 && ` · ${st.sansObjet} S.O.`}
          {` · ${st.nonConformes} non conforme${st.nonConformes > 1 ? 's' : ''}`}
          {st.nonConformesBloquants > 0 && ` dont ${st.nonConformesBloquants} bloquant${st.nonConformesBloquants > 1 ? 's' : ''}`}
        </div>
      </div>

      <div className="fchips" role="group" aria-label="Filtrer par état">
        {FILTRES.map((o) => (
          <button key={o.v} type="button" className="fchip tap" aria-pressed={f.etat === o.v} onClick={() => maj({ etat: o.v })}>
            {o.v === 'bloquants' && <TriangleAlert size={16} strokeWidth={2.4} color={f.etat === o.v ? 'currentColor' : 'var(--r)'} aria-hidden />}
            {o.dot && <span className="dot" style={{ background: o.dot }} />}
            {o.l} <span className="mono">{compte(o.v)}</span>
          </button>
        ))}
      </div>
      {lots.length > 1 && (
        <div className="fchips" role="group" aria-label="Filtrer par lot" style={{ paddingTop: 8 }}>
          <button type="button" className="fchip tap" aria-pressed={f.lot === ''} onClick={() => maj({ lot: '' })}>Tous les lots</button>
          {lots.map((l) => (
            <button key={l.code} type="button" className="fchip tap mono" aria-pressed={f.lot === l.code} onClick={() => maj({ lot: f.lot === l.code ? '' : l.code })}>
              {l.code}
            </button>
          ))}
        </div>
      )}
      <div className="pad search-wrap" style={{ marginTop: 8 }}>
        <Search size={20} strokeWidth={2.2} aria-hidden style={{ left: 30 }} />
        <input type="search" className="search" placeholder="Rechercher (intitulé, article, norme)" aria-label="Rechercher un point"
          value={f.texte} onChange={(e) => maj({ texte: e.target.value })} enterKeyHint="search" />
      </div>

      <div className="pad stack" style={{ marginTop: 12 }}>
        {groupes.length === 0 && <div className="card empty">Aucun point ne correspond aux filtres.</div>}
        {groupes.map((g) => (
          <section key={`${g.lot}-${g.phase}`} className="card flush" aria-label={`${g.lot} ${PHASE_CONTROLE[g.phase]}`}>
            <div className="grp-head">
              <div className="row" style={{ alignItems: 'baseline' }}>
                <CodeLot code={g.lot} />
                <span className="sec-title">{PHASE_CONTROLE[g.phase]}</span>
              </div>
              <span className="mono ink2">{g.valides}/{g.total}</span>
            </div>
            {g.points.map((p) => {
              const e = ETAT_POINT[p.etat];
              const blo = bloquantNonValide(p);
              const date = estValide(p) ? undefined : datePoint(p, ch, lots);
              const retard = date ? ecartJours(date, today) : 0;
              return (
                <a key={p.uid} href={lien('chantier', id, 'point', p.uid!)} className={`pt tap${blo ? ' alert' : ''}`}
                  onClick={(ev) => { ev.preventDefault(); aller('chantier', id, 'point', p.uid!); }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="mono ink2" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.articleCctp || p.id}</span>
                    <Pastille ton={e.ton}>{e.libelle}</Pastille>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginTop: 4 }}>{p.intitule}</div>
                  {(date || p.photoIds.length > 0) && (
                    <div className="row ink2" style={{ marginTop: 4, gap: 12 }}>
                      {date && <span className="mono" style={retard > 0 ? { color: 'var(--r)', fontWeight: 600 } : undefined}>{fmtCourt(date)}{retard > 0 ? ` · +${retard} j` : ''}</span>}
                      {p.photoIds.length > 0 && <span>{p.photoIds.length} photo{p.photoIds.length > 1 ? 's' : ''}</span>}
                    </div>
                  )}
                  {blo && (
                    <div className="pt-blo">
                      <TriangleAlert size={18} strokeWidth={2.4} aria-hidden style={{ flex: '0 0 auto' }} />
                      <span>Point bloquant{p.echeance.type === 'evenement' && p.echeance.valeur ? ` · ${p.echeance.valeur}` : ''}</span>
                    </div>
                  )}
                </a>
              );
            })}
          </section>
        ))}
        <button type="button" className="btn sec block tap" onClick={() => setAjout(true)}>
          <Plus size={22} strokeWidth={2.4} aria-hidden />Ajouter un point de contrôle
        </button>
      </div>
      {ajout && (
        <EditionPoint chantierId={id} lots={lots.map((l) => l.code)} lotParDefaut={f.lot} onClose={() => setAjout(false)}
          onCree={(uid) => aller('chantier', id, 'point', uid)} />
      )}
    </div>
  );
}
