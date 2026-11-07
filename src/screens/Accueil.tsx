import { Plus, Settings } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import { fmtJourLong } from '../domain/dates';
import { PHASE_CHANTIER, bloquantNonValide, estOuverte, statutAffiche } from '../domain/statuts';
import { statistiques, type Stats } from '../domain/checklist';
import { BarreChecklist } from '../components/BarreChecklist';
import { aller, lien } from '../router';
import { Logo } from '../components/Logo';
import { PuceDrive } from '../components/Drive';

interface Compteurs { ouvertes: number; retard: number; bloquants: number; st: Stats }

export function Accueil() {
  const data = useLive('accueil', async () => {
    const [chantiers, reserves, points] = await Promise.all([db.chantiers.toArray(), db.reserves.toArray(), db.points.toArray()]);
    const par = new Map<number, Compteurs>();
    for (const c of chantiers) par.set(c.id!, { ouvertes: 0, retard: 0, bloquants: 0, st: statistiques(points.filter((p) => p.chantierId === c.id)) });
    for (const r of reserves) {
      const k = par.get(r.chantierId);
      if (!k || !estOuverte(r)) continue;
      k.ouvertes++;
      if (statutAffiche(r) === 'en_retard') k.retard++;
    }
    for (const p of points) {
      const k = par.get(p.chantierId);
      if (k && bloquantNonValide(p)) k.bloquants++;
    }
    chantiers.sort((a, b) => b.majLe.localeCompare(a.majLe));
    return { chantiers, par };
  }, []);

  const total = { ouvertes: 0, retard: 0, bloquants: 0 };
  data?.par.forEach((k) => { total.ouvertes += k.ouvertes; total.retard += k.retard; total.bloquants += k.bloquants; });

  return (
    <main className="screen has-bar">
      <header className="pad row" style={{ justifyContent: 'space-between', paddingTop: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <Logo size={36} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Kontrol</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <PuceDrive />
          <a className="icon-btn tap" href={lien('reglages')} aria-label="Réglages">
            <Settings size={24} strokeWidth={2} aria-hidden />
          </a>
        </div>
      </header>

      <div className="pad" style={{ paddingTop: 20 }}>
        <div className="ink2">{fmtJourLong()}</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 'var(--fs-h1)', fontWeight: 700, letterSpacing: -0.5 }}>Mes chantiers</h1>
      </div>

      <div className="pad" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <Tuile n={total.ouvertes} libelle={total.ouvertes > 1 ? 'ouvertes' : 'ouverte'} ton="b" />
        <Tuile n={total.retard} libelle="en retard" ton="r" />
        <Tuile n={total.bloquants} libelle={total.bloquants > 1 ? 'bloquants' : 'bloquant'} ton="r" />
      </div>

      <div className="pad stack" style={{ paddingTop: 20, gap: 10 }}>
        {data && data.chantiers.length === 0 && (
          <div className="card empty">
            Aucun chantier.<br />Importez le fichier JSON d’extraction du marché pour commencer.
          </div>
        )}
        {data?.chantiers.map((c) => {
          const k = data.par.get(c.id!)!;
          return (
            <a key={c.id} href={lien('chantier', c.id!, 'checklist')} className="card card-link tap">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="mono ink2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.site || '—'}</span>
                <span className="ink2">{PHASE_CHANTIER[c.phase]}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25, marginTop: 6 }}>{c.nom}</div>
              <div style={{ marginTop: 12 }}>
                <BarreChecklist st={k.st} hauteur={8} />
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                <span className={`chip ${k.ouvertes ? 't-b' : 't-n'}`}>{k.ouvertes} {k.ouvertes > 1 ? 'ouvertes' : 'ouverte'}</span>
                <span className={`chip ${k.retard ? 't-r' : 't-n'}`}>{k.retard} en retard</span>
                <span className={`chip ${k.bloquants ? 't-r' : 't-n'}`}>{k.bloquants} {k.bloquants > 1 ? 'bloquants' : 'bloquant'}</span>
              </div>
            </a>
          );
        })}
      </div>

      <div className="bottom-bar">
        <button type="button" className="btn block tap" onClick={() => aller('import')}>
          <Plus size={22} strokeWidth={2.6} aria-hidden />Nouveau chantier
        </button>
      </div>
    </main>
  );
}

function Tuile({ n, libelle, ton }: { n: number; libelle: string; ton: 'b' | 'r' }) {
  return (
    <div style={{ background: `var(--${ton}-bg)`, borderRadius: 14, padding: 12 }}>
      <div className="mono" style={{ fontSize: 'var(--fs-kpi)', fontWeight: 600, color: `var(--${ton})`, lineHeight: 1 }}>{n}</div>
      <div style={{ marginTop: 4 }}>{libelle}</div>
    </div>
  );
}
