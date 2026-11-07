import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SlidersHorizontal } from 'lucide-react';
import { db } from '../db/schema';
import { Header } from '../components/ui';
import { aller, lien } from '../router';
import { OngletJalons } from './OngletJalons';
import { OngletIntervenants } from './OngletIntervenants';
import { ParametresChantier } from './ParametresChantier';

export type Onglet = 'checklist' | 'reserves' | 'jalons' | 'intervenants';
const ONGLETS: { v: Onglet; l: string }[] = [
  { v: 'checklist', l: 'Checklist' },
  { v: 'reserves', l: 'Réserves' },
  { v: 'jalons', l: 'Jalons' },
  { v: 'intervenants', l: 'Intervenants' },
];

export function Chantier({ id, onglet }: { id: number; onglet: Onglet }) {
  const ch = useLiveQuery(() => db.chantiers.get(id), [id]);
  const nbPoints = useLiveQuery(() => db.points.where('chantierId').equals(id).count(), [id]);
  const [params, setParams] = useState(false);

  if (ch === undefined) return null;
  if (ch === null) return <main className="screen empty">Chantier introuvable.</main>;

  return (
    <main className="screen">
      <Header
        sub={`${ch.site || '—'} · ${ch.avancementTravaux} %`}
        title={ch.nom}
        onBack={() => aller('')}
        backLabel="Retour à mes chantiers"
        right={
          <button type="button" className="icon-btn tap" aria-label="Paramètres du chantier" onClick={() => setParams(true)}>
            <SlidersHorizontal size={24} strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <nav className="tabs" aria-label="Sections du chantier">
        {ONGLETS.map((o) => (
          <a key={o.v} className="tab tap" href={lien('chantier', id, o.v)} aria-current={onglet === o.v ? 'page' : undefined}>{o.l}</a>
        ))}
      </nav>

      {onglet === 'checklist' && (
        <div className="pad" style={{ marginTop: 16 }}>
          <div className="card empty">
            <span className="mono">{nbPoints ?? 0}</span> points de contrôle importés.<br />La checklist arrive à l’étape (b).
          </div>
        </div>
      )}
      {onglet === 'reserves' && (
        <div className="pad" style={{ marginTop: 16 }}>
          <div className="card empty">Le suivi des réserves arrive à l’étape (c).</div>
        </div>
      )}
      {onglet === 'jalons' && <OngletJalons chantier={ch} onParams={() => setParams(true)} />}
      {onglet === 'intervenants' && <OngletIntervenants chantierId={id} />}

      {params && <ParametresChantier chantier={ch} onClose={() => setParams(false)} />}
    </main>
  );
}
