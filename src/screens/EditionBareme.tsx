import { useState } from 'react';
import { ArrowRightLeft, Gavel, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import type { Penalite } from '../domain/types';
import { aujourdHui } from '../domain/dates';
import { euros, lireBareme } from '../domain/penalites';
import { Sheet, toast } from '../components/ui';

/** Article du barème du CCAP : modification, ajout, suppression ; « appliquer » ; conversion d'une saisie faite par erreur. */
export function EditionBareme({ p, chantierId, lots, onClose, onAppliquer }: {
  p?: Penalite; chantierId: number; lots: string[]; onClose: () => void; onAppliquer: (b: Penalite) => void;
}) {
  const [v, setV] = useState<Penalite>(p ?? { chantierId, motif: '', montantOuTaux: '', articleCcap: '' });
  const set = <K extends keyof Penalite>(k: K, val: Penalite[K]) => setV((o) => ({ ...o, [k]: val }));

  const enregistrer = async () => {
    if (!v.motif.trim()) { toast('Motif obligatoire'); return; }
    await db.penalites.put({ ...v, motif: v.motif.trim(), montantOuTaux: v.montantOuTaux.trim(), articleCcap: v.articleCcap.trim(), lotCode: v.lotCode || undefined });
    toast(p ? 'Article modifié' : 'Article ajouté au barème');
    onClose();
  };
  const supprimer = async () => {
    if (!p || !confirm('Supprimer cet article du barème ?')) return;
    await db.penalites.delete(p.id!);
    onClose();
  };
  /** Une pénalité constatée saisie par erreur dans le barème → registre des pénalités appliquées. */
  const deplacer = async () => {
    if (!p) return;
    const lotCode = p.lotCode ?? lots[0] ?? '';
    const lecture = lireBareme(p.montantOuTaux);
    const montant = lecture.unitaire ?? 0;
    const titulaire = (await db.intervenants.where('chantierId').equals(chantierId).toArray())
      .find((i) => i.lotCode === lotCode && i.role === 'titulaire')?.raisonSociale ?? '';
    if (!confirm(`Déplacer « ${p.motif} » dans les pénalités appliquées (marché ${lotCode}, ${euros(montant)}, constatée aujourd’hui) ?`)) return;
    await db.transaction('rw', [db.penalites, db.penalitesAppliquees], async () => {
      await db.penalitesAppliquees.add({
        chantierId, lotCode, entreprise: titulaire, motif: p.motif, articleCcap: p.articleCcap, date: aujourdHui(),
        quantite: 1, unite: lecture.unite, montantUnitaire: lecture.unitaire, montant, statut: 'constatee', note: '', creeLe: new Date().toISOString(),
      });
      await db.penalites.delete(p.id!);
    });
    toast('Déplacée dans les pénalités appliquées');
    onClose();
  };

  return (
    <Sheet titre={p ? 'Article du barème' : 'Nouvel article du barème'} sousTitre={p?.articleCcap ? `CCAP ${p.articleCcap}` : undefined} onClose={onClose}
      pied={
        <div className="row">
          {p && <button type="button" className="btn danger tap" aria-label="Supprimer l’article" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        {p && (
          <button type="button" className="btn sec-acc block tap" onClick={() => onAppliquer(p)}>
            <Gavel size={20} strokeWidth={2.2} aria-hidden />Appliquer cette pénalité
          </button>
        )}
        <div className="field">
          <label htmlFor="pe-motif">Motif</label>
          <textarea id="pe-motif" className="textarea" style={{ minHeight: 64 }} value={v.motif} onChange={(e) => set('motif', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pe-mt">Montant ou taux</label>
          <input id="pe-mt" className="input" placeholder="ex. 200 € HT par absence, 1/1000 du montant HT par jour" value={v.montantOuTaux} onChange={(e) => set('montantOuTaux', e.target.value)} />
        </div>
        <div>
          {lots.length > 1 && (
            <div className="frow">
              <label className="rl" htmlFor="pe-lot">Marché</label>
              <select id="pe-lot" value={v.lotCode ?? ''} onChange={(e) => set('lotCode', e.target.value || undefined)}>
                <option value="">Commun à tous</option>
                {lots.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div className="frow" style={{ borderBottom: 0 }}>
            <label className="rl" htmlFor="pe-art">Article CCAP</label>
            <input id="pe-art" className="mono" value={v.articleCcap} onChange={(e) => set('articleCcap', e.target.value)} />
          </div>
        </div>
        {p && (
          <div className="card" style={{ padding: 12 }}>
            <div className="ink2">Ce n’est pas un article du CCAP mais une pénalité infligée à une entreprise ?</div>
            <button type="button" className="btn sec block tap" style={{ marginTop: 8 }} onClick={deplacer}>
              <ArrowRightLeft size={20} strokeWidth={2.2} aria-hidden />Déplacer dans les pénalités appliquées
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
