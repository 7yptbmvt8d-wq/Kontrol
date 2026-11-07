import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { db, supprimerChantier } from '../db/schema';
import type { Chantier, PhaseChantier } from '../domain/types';
import { PHASE_CHANTIER } from '../domain/statuts';
import { Segment, Sheet, toast } from '../components/ui';
import { aller } from '../router';

export function ParametresChantier({ chantier, onClose }: { chantier: Chantier; onClose: () => void }) {
  const [v, setV] = useState(chantier);
  const set = <K extends keyof Chantier>(k: K, val: Chantier[K]) => setV((o) => ({ ...o, [k]: val }));

  const enregistrer = async () => {
    if (!v.nom.trim()) { toast('Nom obligatoire'); return; }
    const pct = Math.max(0, Math.min(100, Math.round(Number(v.avancementTravaux) || 0)));
    await db.chantiers.put({
      ...v, nom: v.nom.trim(), avancementTravaux: pct,
      dateOS: v.dateOS || undefined, dateReceptionReelle: v.dateReceptionReelle || undefined,
      majLe: new Date().toISOString(),
    });
    toast('Chantier mis à jour');
    onClose();
  };

  const supprimer = async () => {
    if (!confirm(`Supprimer définitivement « ${chantier.nom} » et toutes ses données (points, réserves, photos) ?`)) return;
    await supprimerChantier(chantier.id!);
    toast('Chantier supprimé');
    aller('');
  };

  return (
    <Sheet titre="Paramètres du chantier" sousTitre={chantier.numeroMarche} onClose={onClose}
      pied={<button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>}>
      <div className="stack">
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
            <label className="rl" htmlFor="p-mar">N° marché</label>
            <input id="p-mar" className="mono" value={v.numeroMarche} onChange={(e) => set('numeroMarche', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-os">OS démarrage</label>
            <input id="p-os" type="date" className="mono" value={v.dateOS ?? ''} onChange={(e) => set('dateOS', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-rec">Réception</label>
            <input id="p-rec" type="date" className="mono" value={v.dateReceptionReelle ?? ''} onChange={(e) => set('dateReceptionReelle', e.target.value)} />
          </div>
          <div className="frow">
            <label className="rl" htmlFor="p-av">Avancement travaux (%)</label>
            <input id="p-av" type="number" inputMode="numeric" min={0} max={100} className="mono" value={v.avancementTravaux}
              onChange={(e) => set('avancementTravaux', Number(e.target.value))} />
          </div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Phase</div>
          <Segment<PhaseChantier> label="Phase du chantier" valeur={v.phase} onChange={(p) => set('phase', p)}
            options={(Object.keys(PHASE_CHANTIER) as PhaseChantier[]).map((p) => ({ v: p, l: p === 'preparation' ? 'Prépa.' : p === 'execution' ? 'Exéc.' : PHASE_CHANTIER[p], aria: PHASE_CHANTIER[p] }))} />
        </div>
        <div className="ink2">La date de réception réelle remplace la date prévisionnelle (OS + délai) dans le calcul des jalons rapportés à la réception.</div>
        <button type="button" className="btn danger block tap" onClick={supprimer} style={{ marginTop: 12 }}>
          <Trash2 size={22} aria-hidden />Supprimer le chantier
        </button>
      </div>
    </Sheet>
  );
}
