import { useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import { Header } from '../components/ui';
import { pourcentage, statistiques } from '../domain/checklist';
import { lien, remplacer, retour } from '../router';
import { OngletJalons } from './OngletJalons';
import { OngletChecklist } from './OngletChecklist';
import { OngletReserves } from './OngletReserves';
import { SaisieReserve } from './SaisieReserve';
import { OngletIntervenants } from './OngletIntervenants';
import { ParametresChantier } from './ParametresChantier';

export type Onglet = 'checklist' | 'reserves' | 'jalons' | 'intervenants';
export const ONGLETS: { v: Onglet; l: string }[] = [
  { v: 'checklist', l: 'Checklist' },
  { v: 'reserves', l: 'Réserves' },
  { v: 'jalons', l: 'Jalons' },
  { v: 'intervenants', l: 'Intervenants' },
];

export function Chantier({ id, onglet }: { id: number; onglet: Onglet }) {
  const ch = useLive(`chantier:${id}`, () => db.chantiers.get(id).then((c) => c ?? null), [id]);
  const avancement = useLive(`avancement:${id}`, async () => {
    const pts = await db.points.where('chantierId').equals(id).toArray();
    return pourcentage(statistiques(pts));
  }, [id]);
  const [params, setParams] = useState(false);
  const [saisie, setSaisie] = useState(false);

  const fermerParams = () => setParams(false);
  const retourAccueil = () => retour('');

  if (ch === undefined) return <main className="screen" />;
  if (ch === null) {
    return (
      <main className="screen">
        <Header title="Chantier introuvable" onBack={retourAccueil} backLabel="Retour à mes chantiers" />
        <div className="pad empty">Ce chantier n’existe plus sur cet appareil.</div>
      </main>
    );
  }

  return (
    <main className="screen">
      <Header
        sub={`${avancement !== undefined ? `${avancement} % · ` : ''}${ch.site || '—'}`}
        title={ch.nom}
        onBack={retourAccueil}
        backLabel="Retour à mes chantiers"
        right={
          <button type="button" className="icon-btn tap" aria-label="Paramètres du chantier et des marchés" onClick={() => setParams(true)}>
            <SlidersHorizontal size={24} strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <nav className="tabs" aria-label="Sections du chantier">
        {ONGLETS.map((o) => (
          <a key={o.v} className="tab tap" href={lien('chantier', id, o.v)} aria-current={onglet === o.v ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); remplacer('chantier', id, o.v); }}>
            {o.l}
          </a>
        ))}
      </nav>

      {onglet === 'checklist' && <OngletChecklist chantier={ch} />}
      {onglet === 'reserves' && <OngletReserves chantier={ch} />}
      {onglet === 'jalons' && <OngletJalons chantier={ch} onParams={() => setParams(true)} />}
      {onglet === 'intervenants' && <OngletIntervenants chantierId={id} />}

      {onglet !== 'intervenants' && (
        <>
          <div style={{ height: 96 }} aria-hidden />
          <button type="button" className="fab tap" aria-label="Nouvelle réserve" onClick={() => setSaisie(true)}>
            <Plus size={30} strokeWidth={2.8} aria-hidden />
          </button>
        </>
      )}
      {saisie && <SaisieReserve chantierId={id} onClose={() => setSaisie(false)} />}
      {params && <ParametresChantier chantier={ch} onClose={fermerParams} />}
    </main>
  );
}
