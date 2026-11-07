import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { db, supprimerChantier } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier, Lot, PhaseChantier, TypeControle } from '../domain/types';
import { PHASE_CHANTIER, TYPE_CONTROLE } from '../domain/statuts';
import { CodeLot, Segment, Sheet, toast } from '../components/ui';
import { remplacer } from '../router';

const COURT: Partial<Record<PhaseChantier, string>> = { preparation: 'Prépa.', execution: 'Exéc.' };

export function ParametresChantier({ chantier, onClose }: { chantier: Chantier; onClose: () => void }) {
  const [v, setV] = useState(chantier);
  const [avancement, setAvancement] = useState(String(chantier.avancementTravaux));
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    db.lots.where('chantierId').equals(chantier.id!).sortBy('ordre').then(setLots);
  }, [chantier.id]);

  const set = <K extends keyof Chantier>(k: K, val: Chantier[K]) => setV((o) => ({ ...o, [k]: val }));
  const setLot = (i: number, patch: Partial<Lot>) => setLots((ls) => ls && ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const enregistrer = async () => {
    if (!v.nom.trim()) { toast('Nom obligatoire'); return; }
    setEnCours(true);
    const pct = Math.max(0, Math.min(100, Math.round(Number(avancement.replace(',', '.')) || 0)));
    try {
      await db.transaction('rw', [db.chantiers, db.lots], async () => {
        await db.chantiers.put({
          ...v, nom: v.nom.trim(), site: v.site.trim(), avancementTravaux: pct,
          dateOS: v.dateOS || undefined, dateReceptionReelle: v.dateReceptionReelle || undefined,
          majLe: new Date().toISOString(),
        });
        if (lots) {
          await db.lots.bulkPut(lots.map((l) => ({
            ...l, numeroMarche: l.numeroMarche.trim(), dateOS: l.dateOS || undefined, dateReceptionReelle: l.dateReceptionReelle || undefined,
          })));
        }
      });
      toast('Chantier mis à jour');
      onClose();
    } catch (e) {
      toast(`Enregistrement impossible : ${(e as Error).message}`);
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!confirm(`Supprimer définitivement « ${chantier.nom} » et toutes ses données (points, réserves, photos) ?`)) return;
    await supprimerChantier(chantier.id!);
    toast('Chantier supprimé');
    remplacer('');
  };

  return (
    <Sheet titre="Paramètres du chantier" sousTitre={chantier.site} onClose={onClose}
      pied={<button type="button" className="btn block tap" onClick={enregistrer} disabled={enCours}>Enregistrer</button>}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="frow">
            <label className="rl" htmlFor="p-nom">Nom</label>
            <input id="p-nom" value={v.nom} onChange={(e) => set('nom', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-site">Site</label>
            <input id="p-site" className="mono" value={v.site} onChange={(e) => set('site', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-os">OS générale</label>
            <input id="p-os" type="date" className="mono" value={v.dateOS ?? ''} onChange={(e) => set('dateOS', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-rec">Réception</label>
            <input id="p-rec" type="date" className="mono" value={v.dateReceptionReelle ?? ''} onChange={(e) => set('dateReceptionReelle', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-av">Avancement travaux (%)</label>
            <input id="p-av" type="text" inputMode="numeric" pattern="[0-9]*" className="mono" value={avancement}
              onChange={(e) => setAvancement(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} onFocus={(e) => e.target.select()} />
          </div>
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Phase</div>
          <Segment<PhaseChantier> label="Phase du chantier" valeur={v.phase} onChange={(p) => set('phase', p)}
            options={(Object.keys(PHASE_CHANTIER) as PhaseChantier[]).map((p) => ({ v: p, l: COURT[p] ?? PHASE_CHANTIER[p], aria: PHASE_CHANTIER[p] }))} />
        </div>

        <div>
          <h3 className="sec-title">Marchés (un par lot)</h3>
          <div className="ink2" style={{ marginTop: 2 }}>OS ou réception vide = date générale du chantier.</div>
        </div>
        {lots?.map((l, i) => (
          <section key={l.id} className="card" style={{ padding: '10px 14px 0' }} aria-label={`Marché ${l.code}`}>
            <div className="row" style={{ alignItems: 'baseline' }}><CodeLot code={l.code} /><span style={{ fontWeight: 600 }}>{l.intitule || l.code}</span></div>
            <div className="frow">
              <label className="rl" htmlFor={`m-num-${i}`}>N° marché</label>
              <input id={`m-num-${i}`} className="mono" value={l.numeroMarche} placeholder="à renseigner" onChange={(e) => setLot(i, { numeroMarche: e.target.value })} />
            </div>
            <div className="frow">
              <label className="rl" htmlFor={`m-os-${i}`}>OS du lot</label>
              <input id={`m-os-${i}`} type="date" className="mono" value={l.dateOS ?? ''} onChange={(e) => setLot(i, { dateOS: e.target.value })} />
            </div>
            <div className="frow" style={{ borderBottom: 0 }}>
              <label className="rl" htmlFor={`m-rec-${i}`}>Réception</label>
              <input id={`m-rec-${i}`} type="date" className="mono" value={l.dateReceptionReelle ?? ''} onChange={(e) => setLot(i, { dateReceptionReelle: e.target.value })} />
            </div>
          </section>
        ))}

        <BloquantsParType chantierId={chantier.id!} />

        <div className="ink2">
          La réception réelle remplace la date prévisionnelle (OS + délai) dans le calcul des jalons rapportés à la réception.
        </div>
        <button type="button" className="btn danger block tap" onClick={supprimer}>
          <Trash2 size={22} aria-hidden />Supprimer le chantier
        </button>
      </div>
    </Sheet>
  );
}

/** Réglage en masse du caractère bloquant, type par type (ex. retirer les 30 documents marqués bloquants). */
function BloquantsParType({ chantierId }: { chantierId: number }) {
  const points = useLive(`bloquants-types:${chantierId}`, () => db.points.where('chantierId').equals(chantierId).toArray(), [chantierId]);
  if (!points?.length) return null;
  const appliquer = async (t: TypeControle, bloquant: boolean, n: number) => {
    const msg = bloquant
      ? `Rendre bloquants les ${n} points de type « ${TYPE_CONTROLE[t]} » ?`
      : `Retirer le caractère bloquant des ${n} points de type « ${TYPE_CONTROLE[t]} » ?`;
    if (!confirm(msg)) return;
    await db.points.where('chantierId').equals(chantierId).filter((p) => p.type === t && p.bloquant !== bloquant).modify({ bloquant });
    toast(`${n} point${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}`);
  };
  const total = points.filter((p) => p.bloquant).length;
  return (
    <section aria-label="Points bloquants par type">
      <h3 className="sec-title">Points bloquants par type</h3>
      <div className="ink2" style={{ marginTop: 2 }}>
        <span className="mono">{total}</span> bloquant{total > 1 ? 's' : ''} sur <span className="mono">{points.length}</span> points. Réglage fin : bouton crayon d’un point.
      </div>
      <div className="card flush" style={{ marginTop: 8 }}>
        {(Object.keys(TYPE_CONTROLE) as TypeControle[]).map((t, i) => {
          const duType = points.filter((p) => p.type === t);
          if (!duType.length) return null;
          const n = duType.filter((p) => p.bloquant).length;
          return (
            <div key={t} className="row" style={{ padding: '6px 6px 6px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{TYPE_CONTROLE[t]}</div>
                <div className="ink2"><span className="mono" style={n ? { color: 'var(--r)', fontWeight: 600 } : undefined}>{n}</span> / <span className="mono">{duType.length}</span> bloquants</div>
              </div>
              <button type="button" className="btn sec tap" style={{ height: 48, padding: '0 12px', fontSize: 16 }} disabled={n === 0}
                onClick={() => appliquer(t, false, n)}>Aucun</button>
              <button type="button" className="btn sec tap" style={{ height: 48, padding: '0 12px', fontSize: 16 }} disabled={n === duType.length}
                onClick={() => appliquer(t, true, duType.length - n)}>Tous</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
