import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Phone, Mail, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import type { Intervenant, RoleIntervenant } from '../domain/types';
import { ROLE_INTERVENANT } from '../domain/statuts';
import { Sheet, toast } from '../components/ui';

const ORDRE_ROLE: RoleIntervenant[] = ['titulaire', 'sous_traitant', 'moa', 'controleur_technique', 'csps', 'autre'];

export function OngletIntervenants({ chantierId }: { chantierId: number }) {
  const data = useLiveQuery(async () => {
    const [lots, inter] = await Promise.all([
      db.lots.where('chantierId').equals(chantierId).sortBy('ordre'),
      db.intervenants.where('chantierId').equals(chantierId).toArray(),
    ]);
    return { lots, inter };
  }, [chantierId]);
  const [edition, setEdition] = useState<Intervenant | null>(null);

  if (!data) return null;
  const tri = (a: Intervenant, b: Intervenant) => ORDRE_ROLE.indexOf(a.role) - ORDRE_ROLE.indexOf(b.role) || a.raisonSociale.localeCompare(b.raisonSociale);
  const groupes = [
    ...data.lots.map((l) => ({ cle: l.code, code: l.code, titre: l.intitule || l.code, items: data.inter.filter((i) => i.lotCode === l.code).sort(tri) })),
    { cle: '_', code: '', titre: 'Autres intervenants', items: data.inter.filter((i) => !i.lotCode || !data.lots.some((l) => l.code === i.lotCode)).sort(tri) },
  ].filter((g) => g.items.length || g.code);

  const nouveau = (): Intervenant => ({ chantierId, lotCode: '', role: 'autre', raisonSociale: '', contact: '', tel: '', email: '', notes: '' });

  return (
    <div className="screen-part" style={{ paddingBottom: 96 }}>
      <div className="pad stack" style={{ marginTop: 12 }}>
        {groupes.map((g) => (
          <section key={g.cle} className="card flush">
            <div className="row" style={{ padding: '12px 14px 10px', alignItems: 'baseline' }}>
              {g.code && <span className="mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{g.code}</span>}
              <span className="sec-title">{g.titre}</span>
            </div>
            {g.items.length === 0 && <div className="ink2" style={{ padding: '0 14px 12px' }}>Aucun intervenant.</div>}
            {g.items.map((i) => (
              <div key={i.id} className="row" style={{ borderTop: '1px solid var(--line)', padding: '6px 6px 6px 14px' }}>
                <button type="button" className="tap" onClick={() => setEdition(i)}
                  style={{ flex: '1 1 auto', minWidth: 0, minHeight: 48, border: 0, background: 'transparent', textAlign: 'left', padding: '4px 0' }}>
                  <div className="ink2">{ROLE_INTERVENANT[i.role]}</div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{i.raisonSociale || '—'}</div>
                  {i.contact && <div>{i.contact}</div>}
                </button>
                {i.tel && <a className="icon-btn round tap" href={`tel:${i.tel.replace(/\s/g, '')}`} aria-label={`Appeler ${i.raisonSociale}`}><Phone size={22} strokeWidth={2.2} aria-hidden /></a>}
                {i.email && <a className="icon-btn round tap" href={`mailto:${i.email}`} aria-label={`Écrire à ${i.raisonSociale}`}><Mail size={22} strokeWidth={2.2} aria-hidden /></a>}
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn block tap" onClick={() => setEdition(nouveau())}>
          <Plus size={22} strokeWidth={2.6} aria-hidden />Ajouter un intervenant
        </button>
      </div>
      {edition && <EditionIntervenant init={edition} lots={data.lots.map((l) => l.code)} onClose={() => setEdition(null)} />}
    </div>
  );
}

function EditionIntervenant({ init, lots, onClose }: { init: Intervenant; lots: string[]; onClose: () => void }) {
  const [v, setV] = useState(init);
  const set = <K extends keyof Intervenant>(k: K, val: Intervenant[K]) => setV((o) => ({ ...o, [k]: val }));

  const enregistrer = async () => {
    if (!v.raisonSociale.trim()) { toast('Raison sociale obligatoire'); return; }
    await db.intervenants.put({ ...v, raisonSociale: v.raisonSociale.trim() });
    toast('Intervenant enregistré');
    onClose();
  };
  const supprimer = async () => {
    if (!v.id || !confirm(`Supprimer ${v.raisonSociale} ?`)) return;
    await db.intervenants.delete(v.id);
    onClose();
  };

  return (
    <Sheet titre={init.id ? 'Intervenant' : 'Nouvel intervenant'} onClose={onClose}
      pied={
        <div className="row">
          {init.id && <button type="button" className="btn danger tap" aria-label="Supprimer l’intervenant" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>
        </div>
      }>
      <div>
        <div className="frow">
          <label className="rl" htmlFor="i-rs">Raison sociale</label>
          <input id="i-rs" value={v.raisonSociale} onChange={(e) => set('raisonSociale', e.target.value)} autoComplete="organization" />
        </div>
        <div className="frow">
          <label className="rl" htmlFor="i-role">Rôle</label>
          <select id="i-role" value={v.role} onChange={(e) => set('role', e.target.value as RoleIntervenant)}>
            {ORDRE_ROLE.map((r) => <option key={r} value={r}>{ROLE_INTERVENANT[r]}</option>)}
          </select>
        </div>
        <div className="frow">
          <label className="rl" htmlFor="i-lot">Lot</label>
          <select id="i-lot" value={v.lotCode ?? ''} onChange={(e) => set('lotCode', e.target.value)}>
            <option value="">Aucun</option>
            {lots.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="frow">
          <label className="rl" htmlFor="i-ct">Contact</label>
          <input id="i-ct" value={v.contact} onChange={(e) => set('contact', e.target.value)} autoComplete="name" />
        </div>
        <div className="frow">
          <label className="rl" htmlFor="i-tel">Téléphone</label>
          <input id="i-tel" type="tel" inputMode="tel" className="mono" value={v.tel} onChange={(e) => set('tel', e.target.value)} autoComplete="tel" />
        </div>
        <div className="frow">
          <label className="rl" htmlFor="i-mail">E-mail</label>
          <input id="i-mail" type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" autoCapitalize="off" />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="i-notes">Notes</label>
          <textarea id="i-notes" className="textarea" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
