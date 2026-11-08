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
import { filtrerReservesSur } from './OngletReserves';
import { filtrerChecklistSur } from './OngletChecklist';

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

      <div className="pad stack" style={{ paddingTop: 20, gap: 10 }}>
        {data && data.chantiers.length === 0 && (
          <div className="card empty">
            Aucun chantier.<br />Importez le fichier JSON d’extraction du marché pour commencer.
          </div>
        )}
        {data?.chantiers.map((c) => {
          const k = data.par.get(c.id!)!;
          return (
            <section key={c.id} className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label={c.nom}>
              <a href={lien('chantier', c.id!, 'checklist')} className="card-link tap" style={{ display: 'block', padding: '16px 16px 12px' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono ink2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.site || '—'}</span>
                  <span className="ink2">{PHASE_CHANTIER[c.phase]}</span>
                </div>
                <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25, marginTop: 6 }}>{c.nom}</div>
                <div style={{ marginTop: 12 }}>
                  <BarreChecklist st={k.st} hauteur={8} />
                </div>
              </a>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: '0 16px 16px' }}>
                <Tuile n={k.ouvertes} libelle={k.ouvertes > 1 ? 'réserves ouvertes' : 'réserve ouverte'} ton="b"
                  onClick={() => { filtrerReservesSur(c.id!, 'non_levees'); aller('chantier', c.id!, 'reserves'); }} />
                <Tuile n={k.retard} libelle={k.retard > 1 ? 'réserves en retard' : 'réserve en retard'} ton="r"
                  onClick={() => { filtrerReservesSur(c.id!, 'en_retard'); aller('chantier', c.id!, 'reserves'); }} />
                <Tuile n={k.bloquants} libelle={k.bloquants > 1 ? 'points bloquants' : 'point bloquant'} ton="r"
                  onClick={() => { filtrerChecklistSur(c.id!, 'bloquants'); aller('chantier', c.id!, 'checklist'); }} />
              </div>
            </section>
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

/** Compteur d'un chantier (raccourci vers la liste correspondante) ; gris si zéro. */
function Tuile({ n, libelle, ton, onClick }: { n: number; libelle: string; ton: 'b' | 'r'; onClick: () => void }) {
  const t = n ? ton : 'n';
  return (
    <button type="button" className="tap" onClick={onClick} aria-label={`${n} ${libelle}`}
      style={{ background: `var(--${t}-bg)`, borderRadius: 14, padding: 10, border: 0, textAlign: 'left', minHeight: 48, color: 'var(--ink)' }}>
      <span className="mono" style={{ display: 'block', fontSize: 26, fontWeight: 600, color: `var(--${t})`, lineHeight: 1 }}>{n}</span>
      <span style={{ display: 'block', marginTop: 4, lineHeight: 1.2 }}>{libelle}</span>
    </button>
  );
}
