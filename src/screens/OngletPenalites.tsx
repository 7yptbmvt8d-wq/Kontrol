import { useState } from 'react';
import { ChevronDown, Gavel, Plus } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier, Penalite, PenaliteAppliquee } from '../domain/types';
import { STATUT_PENALITE, euros, pluriel, totauxParMarche } from '../domain/penalites';
import { fmtDate } from '../domain/dates';
import { CodeLot, Pastille } from '../components/ui';
import { SaisiePenalite } from './SaisiePenalite';
import { EditionBareme } from './EditionBareme';

/** Filtre par marché mémorisé par chantier (partagé avec l'accès depuis Intervenants). */
const filtres = new Map<number, string>();
export const filtrerPenalitesSur = (chantierId: number, lot: string) => filtres.set(chantierId, lot);

export function OngletPenalites({ chantier: ch }: { chantier: Chantier }) {
  const id = ch.id!;
  const data = useLive(`penalites:${id}`, async () => {
    const [appliquees, bareme, lots, intervenants] = await Promise.all([
      db.penalitesAppliquees.where('chantierId').equals(id).toArray(),
      db.penalites.where('chantierId').equals(id).toArray(),
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
      db.intervenants.where('chantierId').equals(id).toArray(),
    ]);
    return { appliquees, bareme, lots, intervenants };
  }, [id]);
  const [lot, setLotEtat] = useState(filtres.get(id) ?? '');
  const setLot = (l: string) => { filtres.set(id, l); setLotEtat(l); };
  const [saisie, setSaisie] = useState<{ p?: PenaliteAppliquee; depuis?: Penalite } | null>(null);
  const [bareme, setBareme] = useState<{ p?: Penalite } | null>(null);
  const [voirBareme, setVoirBareme] = useState(false);

  if (!data) return null;
  const { appliquees, lots } = data;
  const liste = appliquees.filter((p) => !lot || p.lotCode === lot).sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
  const totaux = totauxParMarche(liste);
  const total = [...totaux.values()].reduce((s, t) => ({ n: s.n + t.nombre, m: s.m + t.total, c: s.c + t.constatee, no: s.no + t.notifiee, r: s.r + t.retenue }), { n: 0, m: 0, c: 0, no: 0, r: 0 });
  const lotSel = lots.find((l) => l.code === lot);
  const baremeVisible = data.bareme.filter((b) => !lot || !b.lotCode || b.lotCode === lot);

  return (
    <div>
      {lots.length > 1 && (
        <div className="fchips" role="group" aria-label="Filtrer par marché" style={{ paddingTop: 12 }}>
          <button type="button" className="fchip tap" aria-pressed={lot === ''} onClick={() => setLot('')}>Tous les marchés</button>
          {lots.map((l) => (
            <button key={l.code} type="button" className="fchip tap" aria-pressed={lot === l.code} onClick={() => setLot(l.code)}>
              <span className="mono">{l.code}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pad" style={{ marginTop: 12 }}>
        <section className="card" aria-label="Total des pénalités" style={{ padding: 14 }}>
          <div className="ink2">{lotSel ? `Marché ${lotSel.code}${lotSel.numeroMarche ? ` · ${lotSel.numeroMarche}` : ''}` : 'Tous les marchés'}</div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
            <span className="mono" style={{ fontSize: 'var(--fs-kpi)', fontWeight: 600, color: total.m ? 'var(--r)' : 'var(--ink)' }}>{euros(total.m)}</span>
            <span className="ink2">{pluriel(total.n, 'pénalité')}</span>
          </div>
          {total.n > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {total.c > 0 && <Pastille ton="o">Constatées {euros(total.c)}</Pastille>}
              {total.no > 0 && <Pastille ton="b">Notifiées {euros(total.no)}</Pastille>}
              {total.r > 0 && <Pastille ton="n">Retenues {euros(total.r)}</Pastille>}
            </div>
          )}
          {lotSel?.montantHT ? (
            <div className="ink2" style={{ marginTop: 8 }}>
              Soit <span className="mono">{((total.m / lotSel.montantHT) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %</span> du marché ({euros(lotSel.montantHT)})
            </div>
          ) : lotSel ? <div className="ink2" style={{ marginTop: 8 }}>Montant du marché non renseigné (Paramètres) : % et pénalités en taux non calculés.</div> : null}
          {!lot && totaux.size > 1 && (
            <div style={{ marginTop: 10 }}>
              {[...totaux.values()].sort((a, b) => b.total - a.total).map((t) => (
                <div key={t.lotCode} className="row" style={{ justifyContent: 'space-between', minHeight: 32 }}>
                  <span><CodeLot code={t.lotCode} /> <span className="ink2">{pluriel(t.nombre, 'pénalité')}</span></span>
                  <span className="mono" style={{ fontWeight: 600 }}>{euros(t.total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <button type="button" className="btn block tap" style={{ marginTop: 12 }} onClick={() => setSaisie({})}>
          <Gavel size={22} strokeWidth={2.2} aria-hidden />Appliquer une pénalité
        </button>

        <h2 className="sec-title" style={{ margin: '20px 0 8px' }}>Pénalités appliquées</h2>
        {liste.length === 0 && <div className="card empty">Aucune pénalité appliquée{lot ? ` au marché ${lot}` : ''}.</div>}
        <div className="stack" style={{ gap: 8 }}>
          {liste.map((p) => {
            const s = STATUT_PENALITE[p.statut];
            return (
              <button key={p.id} type="button" className="card tap" style={{ textAlign: 'left', padding: 12, width: '100%' }} onClick={() => setSaisie({ p })}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono ink2">{fmtDate(p.date)} · {p.lotCode}</span>
                  <Pastille ton={s.ton}>{s.libelle}</Pastille>
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginTop: 4 }}>{p.motif}</div>
                <div className="ink2 ellipsis" style={{ marginTop: 2 }}>{p.entreprise || '—'}</div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="ink2">{p.montantUnitaire !== undefined ? `${pluriel(p.quantite, p.unite)} × ${euros(p.montantUnitaire)}` : pluriel(p.quantite, p.unite)}</span>
                  <span className="mono" style={{ fontWeight: 600, fontSize: 17 }}>{euros(p.montant)}</span>
                </div>
              </button>
            );
          })}
        </div>

        <button type="button" className="row tap" aria-expanded={voirBareme} onClick={() => setVoirBareme((x) => !x)}
          style={{ width: '100%', justifyContent: 'space-between', border: 0, background: 'transparent', padding: 0, margin: '20px 0 4px', minHeight: 48 }}>
          <span className="sec-title">Barème du CCAP <span className="mono ink2">{baremeVisible.length}</span></span>
          <ChevronDown size={22} aria-hidden style={{ transform: voirBareme ? 'rotate(180deg)' : undefined }} />
        </button>
        {voirBareme && <>
        <div className="ink2" style={{ marginBottom: 8 }}>Articles du marché, utilisés pour calculer les pénalités. Touchez un article pour l’appliquer ou le modifier.</div>
        <section className="card flush">
          {baremeVisible.length === 0 && <div className="empty">Aucun article.</div>}
          {baremeVisible.map((b, i) => (
            <button key={b.id} type="button" className="tap" onClick={() => setBareme({ p: b })}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '12px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
              <div style={{ fontWeight: 600 }}>{b.lotCode && <><CodeLot code={b.lotCode} />{' '}</>}{b.motif}</div>
              <div>{b.montantOuTaux}</div>
              {b.articleCcap && <div className="mono ink2">CCAP {b.articleCcap}</div>}
            </button>
          ))}
        </section>
        <button type="button" className="btn sec block tap" style={{ marginTop: 8 }} onClick={() => setBareme({})}>
          <Plus size={22} strokeWidth={2.4} aria-hidden />Ajouter un article au barème
        </button>
        </>}
      </div>

      {saisie && (
        <SaisiePenalite chantierId={id} penalite={saisie.p} depuis={saisie.depuis} lotParDefaut={lot || undefined}
          lots={lots} bareme={data.bareme} intervenants={data.intervenants} onClose={() => setSaisie(null)} />
      )}
      {bareme && (
        <EditionBareme p={bareme.p} chantierId={id} lots={lots.map((l) => l.code)} onClose={() => setBareme(null)}
          onAppliquer={(b) => { setBareme(null); setSaisie({ depuis: b }); }} />
      )}
    </div>
  );
}
