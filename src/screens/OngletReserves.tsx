import { useState } from 'react';
import { ArrowDownUp, ChevronDown, ImageIcon } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier, Reserve } from '../domain/types';
import { STATUT_RESERVE, refReserve, statutAffiche } from '../domain/statuts';
import { aujourdHui, ecartJours, fmtCourt } from '../domain/dates';
import { compter, entreprises, filtrerTrier, type FiltreStatut, type FiltresReserves, type Tri } from '../domain/reserves';
import { Pastille } from '../components/ui';
import { Vignette } from '../components/Photos';
import { aller, lien } from '../router';

const memoire = new Map<number, FiltresReserves>();
/** Filtres actifs de l'onglet Réserves (repris par l'export « liste des réserves »). */
/** Ouverture de l'onglet Réserves sur un statut (ex. depuis les compteurs de l'accueil). */
export const filtrerReservesSur = (chantierId: number, statut: FiltreStatut) =>
  memoire.set(chantierId, { ...filtresReserves(chantierId), statut, lot: '', entreprise: '' });
export const filtresReserves = (chantierId: number): FiltresReserves =>
  memoire.get(chantierId) ?? { statut: 'toutes', lot: '', entreprise: '', tri: 'echeance' };

const STATUTS: { v: FiltreStatut; l: string; dot?: string }[] = [
  { v: 'toutes', l: 'Toutes' },
  { v: 'non_levees', l: 'Non levées' },
  { v: 'en_retard', l: 'Retard', dot: 'var(--r)' },
  { v: 'levee_a_verifier', l: 'À vérifier', dot: 'var(--o)' },
  { v: 'relance', l: 'Relancées', dot: 'var(--o)' },
  { v: 'ouvert', l: 'Ouvertes', dot: 'var(--b)' },
  { v: 'leve', l: 'Levées', dot: 'var(--g)' },
];
const TRIS: Record<Tri, string> = { echeance: 'Priorité', numero: 'Plus récentes', gravite: 'Gravité' };

export function OngletReserves({ chantier: ch }: { chantier: Chantier }) {
  const id = ch.id!;
  const data = useLive(`reserves:${id}`, async () => {
    const [reserves, lots] = await Promise.all([
      db.reserves.where('chantierId').equals(id).toArray(),
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
    ]);
    return { reserves, lots };
  }, [id]);
  const [f, setF] = useState<FiltresReserves>(memoire.get(id) ?? { statut: 'toutes', lot: '', entreprise: '', tri: 'echeance' });
  const maj = (patch: Partial<FiltresReserves>) => setF((o) => { const n = { ...o, ...patch }; memoire.set(id, n); return n; });

  if (!data) return null;
  const { reserves, lots } = data;
  const today = aujourdHui();
  const n = compter(reserves, today);
  const liste = filtrerTrier(reserves, f, today);
  const ents = entreprises(f.lot ? reserves.filter((r) => r.lotCode === f.lot) : reserves);

  return (
    <div>
      <div className="fchips" role="group" aria-label="Filtrer par statut">
        {STATUTS.filter((s) => s.v === 'toutes' || n[s.v] > 0 || f.statut === s.v).map((s) => (
          <button key={s.v} type="button" className="fchip tap" aria-pressed={f.statut === s.v} onClick={() => maj({ statut: s.v })}>
            {s.dot && <span className="dot" style={{ background: s.dot }} />}
            {s.l} <span className="mono">{n[s.v]}</span>
          </button>
        ))}
      </div>
      <div className="fchips" style={{ paddingTop: 8 }}>
        {lots.length > 1 && (
          <label className="fchip fchip-select tap" aria-pressed={!!f.lot}>
            <span className={f.lot ? 'mono' : undefined}>{f.lot || 'Lot'}</span><ChevronDown size={18} strokeWidth={2.2} aria-hidden />
            <select aria-label="Filtrer par lot" value={f.lot} onChange={(e) => maj({ lot: e.target.value, entreprise: '' })}>
              <option value="">Tous les lots</option>
              {lots.map((l) => <option key={l.code} value={l.code}>{l.code} – {l.intitule}</option>)}
            </select>
          </label>
        )}
        <label className="fchip fchip-select tap" aria-pressed={!!f.entreprise} style={{ maxWidth: 200 }}>
          <span className="ellipsis">{f.entreprise || 'Entreprise'}</span><ChevronDown size={18} strokeWidth={2.2} aria-hidden style={{ flex: '0 0 auto' }} />
          <select aria-label="Filtrer par entreprise" value={f.entreprise} onChange={(e) => maj({ entreprise: e.target.value })}>
            <option value="">Toutes les entreprises</option>
            {ents.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="fchip fchip-select tap" style={{ marginLeft: 'auto' }}>
          <ArrowDownUp size={18} strokeWidth={2.2} aria-hidden /><span>{TRIS[f.tri]}</span>
          <select aria-label="Trier les réserves" value={f.tri} onChange={(e) => maj({ tri: e.target.value as Tri })}>
            {(Object.keys(TRIS) as Tri[]).map((t) => <option key={t} value={t}>{TRIS[t]}</option>)}
          </select>
        </label>
      </div>

      <ul className="pad stack" style={{ listStyle: 'none', margin: 0, paddingTop: 14, gap: 8 }}>
        {reserves.length === 0 && (
          <li className="card empty">Aucune réserve.<br />Touchez le bouton <strong>+</strong> pour en saisir une.</li>
        )}
        {reserves.length > 0 && liste.length === 0 && <li className="card empty">Aucune réserve ne correspond aux filtres.</li>}
        {liste.map((r) => <LigneReserve key={r.id} r={r} today={today} />)}
      </ul>
    </div>
  );
}

function LigneReserve({ r, today }: { r: Reserve; today: string }) {
  const st = statutAffiche(r, today);
  const s = STATUT_RESERVE[st];
  const retard = st === 'en_retard' && r.echeance ? ecartJours(r.echeance, today) : 0;
  let date = r.echeance ? fmtCourt(r.echeance) : '—';
  if (r.statut === 'leve' && r.levee) date = `levée ${fmtCourt(r.levee.date)}`;
  else if (retard) date = `${date} · +${retard} j`;
  return (
    <li>
      <a href={lien('chantier', r.chantierId, 'reserve', r.id!)} className={`res tap${st === 'en_retard' || (r.gravite === 'bloquante' && r.statut !== 'leve') ? ' alert' : ''}`}
        onClick={(e) => { e.preventDefault(); aller('chantier', r.chantierId, 'reserve', r.id!); }}>
        {r.photoIds.length ? <Vignette id={r.photoIds[0]} taille={64} label="" /> : (
          <div className="photo-tile" style={{ width: 64, height: 64, flex: '0 0 64px' }} aria-hidden><ImageIcon size={26} strokeWidth={1.8} /></div>
        )}
        <div className="res-txt">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="mono ink2">{refReserve(r.numero)} · {r.lotCode}</span>
            <Pastille ton={s.ton}>{s.libelle}</Pastille>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginTop: 4, overflowWrap: 'anywhere' }}>
            {r.description}{r.localisation ? <span className="ink2" style={{ fontWeight: 400 }}> · {r.localisation}</span> : null}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <span className="ink2 ellipsis" style={{ minWidth: 0 }}>{r.entreprise || '—'}</span>
            <span className="mono" style={{ fontWeight: 600, flex: '0 0 auto', color: retard ? 'var(--r)' : 'var(--ink2)' }}>{date}</span>
          </div>
          {r.gravite === 'bloquante' && r.statut !== 'leve' && <div className="c-r" style={{ fontWeight: 700, marginTop: 4 }}>Gravité bloquante</div>}
        </div>
      </a>
    </li>
  );
}
