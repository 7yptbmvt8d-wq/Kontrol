import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import type { PhaseControle, PointControle, Responsable, TypeControle } from '../domain/types';
import { ORDRE_PHASES, PHASE_CONTROLE, RESPONSABLE, TYPE_CONTROLE } from '../domain/statuts';
import { lireDate, lireRelatif } from '../domain/dates';
import { Segment, Sheet, toast } from '../components/ui';
import { retour } from '../router';

type TypeEcheance = PointControle['echeance']['type'];

/** Modification (point fourni) ou création (point absent) d'un point de contrôle. */
export function EditionPoint({ chantierId, point, lots, lotParDefaut, onClose, onCree }: {
  chantierId: number; point?: PointControle; lots: string[]; lotParDefaut?: string; onClose: () => void; onCree?: (uid: number) => void;
}) {
  const [v, setV] = useState<PointControle>(point ?? {
    id: '', chantierId, lot: lotParDefaut || lots[0] || '', articleCctp: '', phase: 'execution', type: 'controle', intitule: '',
    critere: '', reference: '', responsable: 'entreprise', echeance: { type: 'evenement', valeur: '' }, bloquant: false,
    ordre: 0, etat: 'a_faire', commentaire: '', photoIds: [],
  });
  // Saisie de l'échéance : jours (relative) ou date ISO (date) ou texte (événement)
  const [jours, setJours] = useState(point?.echeance.type === 'relative' ? String(lireRelatif(point.echeance.valeur) ?? '') : '');
  const [dateEch, setDateEch] = useState(point?.echeance.type === 'date' ? lireDate(point.echeance.valeur) ?? '' : '');
  const set = <K extends keyof PointControle>(k: K, val: PointControle[K]) => setV((o) => ({ ...o, [k]: val }));

  const enregistrer = async () => {
    if (!v.intitule.trim()) { toast('Intitulé obligatoire'); return; }
    let echeance = v.echeance;
    if (echeance.type === 'relative') {
      if (!/^-?\d+$/.test(jours.trim())) { toast('Nombre de jours après l’OS attendu'); return; }
      echeance = { type: 'relative', valeur: jours.trim() };
    } else if (echeance.type === 'date') {
      if (!dateEch) { toast('Date d’échéance attendue'); return; }
      echeance = { type: 'date', valeur: dateEch };
    }
    const propre = { ...v, intitule: v.intitule.trim(), articleCctp: v.articleCctp.trim(), critere: v.critere.trim(), reference: v.reference.trim(), echeance };
    if (point) {
      await db.points.put(propre);
      toast('Point modifié');
      onClose();
    } else {
      const uid = await db.transaction('rw', db.points, async () => {
        const existants = await db.points.where('chantierId').equals(chantierId).toArray();
        const ids = new Set(existants.map((p) => p.id));
        let n = 1;
        while (ids.has(`${propre.lot}-AJ-${String(n).padStart(2, '0')}`)) n++;
        return (await db.points.add({
          ...propre, id: `${propre.lot}-AJ-${String(n).padStart(2, '0')}`,
          ordre: Math.max(0, ...existants.map((p) => p.ordre)) + 1,
        })) as number;
      });
      toast('Point ajouté');
      onClose();
      onCree?.(uid);
    }
  };

  const supprimer = async () => {
    if (!point || !confirm(`Supprimer le point « ${point.intitule} » ? Ses photos seront supprimées.`)) return;
    await db.transaction('rw', [db.points, db.photos], async () => {
      await db.photos.bulkDelete(point.photoIds);
      await db.points.delete(point.uid!);
    });
    toast('Point supprimé');
    onClose();
    retour('chantier', chantierId, 'checklist');
  };

  return (
    <Sheet titre={point ? 'Modifier le point' : 'Nouveau point'} sousTitre={point?.id} onClose={onClose}
      pied={
        <div className="row">
          {point && <button type="button" className="btn danger tap" aria-label="Supprimer le point" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>{point ? 'Enregistrer' : 'Ajouter le point'}</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <label className="row" style={{ justifyContent: 'space-between', minHeight: 48 }}>
          <span style={{ fontWeight: 600, color: v.bloquant ? 'var(--r)' : undefined }}>Point bloquant</span>
          <input type="checkbox" className="switch" checked={v.bloquant} onChange={(e) => set('bloquant', e.target.checked)} />
        </label>
        <div className="ink2" style={{ marginTop: -10 }}>À valider avant que l’entreprise poursuive (point d’arrêt, agrément avant commande…).</div>

        <div className="field">
          <label htmlFor="ep-int">Intitulé</label>
          <textarea id="ep-int" className="textarea" style={{ minHeight: 72 }} value={v.intitule} onChange={(e) => set('intitule', e.target.value)} />
        </div>

        <div>
          {lots.length > 1 && (
            <div className="frow">
              <label className="rl" htmlFor="ep-lot">Lot</label>
              <select id="ep-lot" value={v.lot} onChange={(e) => set('lot', e.target.value)}>
                {lots.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div className="frow">
            <label className="rl" htmlFor="ep-art">Article</label>
            <input id="ep-art" className="mono" value={v.articleCctp} placeholder="ex. GO 3.2" onChange={(e) => set('articleCctp', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="ep-type">Type</label>
            <select id="ep-type" value={v.type} onChange={(e) => set('type', e.target.value as TypeControle)}>
              {(Object.keys(TYPE_CONTROLE) as TypeControle[]).map((t) => <option key={t} value={t}>{TYPE_CONTROLE[t]}</option>)}
            </select>
          </div>
          <div className="frow">
            <label className="rl" htmlFor="ep-resp">Responsable</label>
            <select id="ep-resp" value={v.responsable} onChange={(e) => set('responsable', e.target.value as Responsable)}>
              {(Object.keys(RESPONSABLE) as Responsable[]).map((r) => <option key={r} value={r}>{RESPONSABLE[r]}</option>)}
            </select>
          </div>
          <div className="frow">
            <label className="rl" htmlFor="ep-ref">Référentiel</label>
            <input id="ep-ref" className="mono" value={v.reference} placeholder="ex. NF DTU 21" onChange={(e) => set('reference', e.target.value)} />
          </div>
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Phase</div>
          <Segment<PhaseControle> label="Phase" valeur={v.phase} onChange={(x) => set('phase', x)}
            options={ORDRE_PHASES.map((x) => ({ v: x, l: x === 'preparation' ? 'Prépa.' : x === 'execution' ? 'Exéc.' : x === 'reception' ? 'Récep.' : 'Clôture', aria: PHASE_CONTROLE[x] }))} />
        </div>

        <div className="field">
          <label htmlFor="ep-crit">Critère d’acceptation</label>
          <textarea id="ep-crit" className="textarea" style={{ minHeight: 72 }} value={v.critere} onChange={(e) => set('critere', e.target.value)} />
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Échéance</div>
          <Segment<TypeEcheance> label="Type d’échéance" valeur={v.echeance.type}
            onChange={(t) => set('echeance', { type: t, valeur: t === 'evenement' ? (v.echeance.type === 'evenement' ? v.echeance.valeur : '') : v.echeance.valeur })}
            options={[{ v: 'evenement', l: 'Événement' }, { v: 'relative', l: 'Jours / OS', aria: 'Jours après l’OS' }, { v: 'date', l: 'Date' }]} />
          <div style={{ marginTop: 8 }}>
            {v.echeance.type === 'evenement' && (
              <input className="input" aria-label="Événement" placeholder="ex. avant coulage" value={v.echeance.valeur}
                onChange={(e) => set('echeance', { type: 'evenement', valeur: e.target.value })} />
            )}
            {v.echeance.type === 'relative' && (
              <input className="input mono" aria-label="Nombre de jours après l’OS" inputMode="numeric" placeholder="jours après l’OS (ex. 30)"
                value={jours} onChange={(e) => setJours(e.target.value.replace(/[^\d-]/g, ''))} />
            )}
            {v.echeance.type === 'date' && (
              <input className="input mono" type="date" aria-label="Date d’échéance" value={dateEch} onChange={(e) => setDateEch(e.target.value)} />
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
