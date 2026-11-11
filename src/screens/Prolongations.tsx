import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import type { Chantier, Prolongation } from '../domain/types';
import { fmtDate } from '../domain/dates';
import { nouvelId } from '../domain/reunion';
import { Sheet, toast } from '../components/ui';
import { BoutonDictee } from '../components/Dictee';

/** Prolongations du délai d'exécution (avenants, OS) : liste, ajout, modification, suppression. */
export function Prolongations({ ch, lots, onClose }: { ch: Chantier; lots: string[]; onClose: () => void }) {
  const liste = ch.prolongations ?? [];
  const [edition, setEdition] = useState<Prolongation | null>(null);
  const [jours, setJours] = useState('');
  const refMotif = useRef<HTMLTextAreaElement>(null);
  const enregistrerListe = (l: Prolongation[]) => db.chantiers.update(ch.id!, { prolongations: l, majLe: new Date().toISOString() });
  const ouvrir = (p?: Prolongation) => {
    const x = p ?? { id: nouvelId(), acte: '', jours: 0, motif: '' };
    setEdition(x);
    setJours(x.jours ? String(x.jours) : '');
  };
  const total = liste.reduce((t, p) => t + p.jours, 0);

  if (edition) {
    const set = <K extends keyof Prolongation>(k: K, v: Prolongation[K]) => setEdition((o) => ({ ...o!, [k]: v }));
    const existe = liste.some((p) => p.id === edition.id);
    const enregistrer = async () => {
      const n = Number(jours);
      if (!edition.acte.trim()) { toast('Acte obligatoire (ex. Avenant n° 1)'); return; }
      if (!n) { toast('Nombre de jours obligatoire'); return; }
      const p: Prolongation = { ...edition, acte: edition.acte.trim(), motif: edition.motif.trim(), jours: n, date: edition.date || undefined, lotCode: edition.lotCode || undefined };
      await enregistrerListe(existe ? liste.map((x) => (x.id === p.id ? p : x)) : [...liste, p]);
      toast(existe ? 'Prolongation modifiée' : 'Prolongation ajoutée');
      setEdition(null);
    };
    const supprimer = async () => {
      if (!confirm(`Supprimer la prolongation « ${edition.acte} » ?`)) return;
      await enregistrerListe(liste.filter((x) => x.id !== edition.id));
      toast('Prolongation supprimée');
      setEdition(null);
    };
    return (
      <Sheet titre={existe ? 'Prolongation' : 'Nouvelle prolongation'} sousTitre="Délai d’exécution" onClose={() => setEdition(null)} auto
        pied={
          <div className="row">
            {existe && <button type="button" className="btn danger tap" aria-label="Supprimer la prolongation" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
            <button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>
          </div>
        }>
        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="pr-acte">Acte</label>
            <input id="pr-acte" className="input" value={edition.acte} placeholder="ex. Avenant n° 1, OS n° 3" onChange={(e) => set('acte', e.target.value)} />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: '1 1 0', minWidth: 0 }}>
              <label htmlFor="pr-j">Jours</label>
              <input id="pr-j" className="input mono" inputMode="numeric" value={jours} placeholder="ex. 30"
                onChange={(e) => setJours(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} />
            </div>
            <div className="field" style={{ flex: '1.4 1 0', minWidth: 0 }}>
              <label htmlFor="pr-date">Date de l’acte</label>
              <input id="pr-date" type="date" className="input mono" value={edition.date ?? ''} onChange={(e) => set('date', e.target.value)} />
            </div>
          </div>
          <div className="saisie-desc">
            <label htmlFor="pr-motif" className="saisie-desc-lbl">Motif</label>
            <textarea ref={refMotif} id="pr-motif" className="textarea" value={edition.motif} placeholder="ex. intempéries, travaux supplémentaires" onChange={(e) => set('motif', e.target.value)} />
            <BoutonDictee cible={refMotif} onTexte={(t) => setEdition((o) => ({ ...o!, motif: o!.motif ? `${o!.motif.replace(/\s+$/, '')} ${t}` : t.charAt(0).toUpperCase() + t.slice(1) }))} />
          </div>
          {lots.length > 1 && (
            <div className="frow">
              <label className="rl" htmlFor="pr-lot">Marché</label>
              <select id="pr-lot" value={edition.lotCode ?? ''} onChange={(e) => set('lotCode', e.target.value || undefined)}>
                <option value="">Tous les marchés</option>
                {lots.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet titre="Prolongations de délai" sousTitre={liste.length ? `${liste.length} · +${total} j au total` : 'Aucune'} onClose={onClose} auto>
      <div className="stack" style={{ gap: 10 }}>
        {liste.length > 0 && (
          <ul className="card flush" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {liste.map((p, i) => (
              <li key={p.id} style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
                <button type="button" className="tap" onClick={() => ouvrir(p)}
                  style={{ width: '100%', minHeight: 56, border: 0, background: 'transparent', padding: '10px 14px', textAlign: 'left', color: 'var(--ink)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{p.acte}{p.lotCode ? ` · ${p.lotCode}` : ''}</span>
                    <span className="mono" style={{ fontWeight: 600 }}>+{p.jours} j</span>
                  </div>
                  <div className="ink2">{[p.date && `du ${fmtDate(p.date)}`, p.motif].filter(Boolean).join(' · ') || '—'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ink2">La fin d’exécution, la réception prévisionnelle, les jalons et les échéances sont décalés d’autant.</div>
        <button type="button" className="btn sec block tap" onClick={() => ouvrir()}>
          <Plus size={22} strokeWidth={2.4} aria-hidden />Ajouter une prolongation
        </button>
      </div>
    </Sheet>
  );
}
