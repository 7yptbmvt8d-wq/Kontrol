import type { Stats } from '../domain/checklist';
import { pourcentage } from '../domain/checklist';

/** Barre d'avancement empilée : conformes (vert), sans objet (gris), non conformes (rouge), en cours (orange) + %. */
export function BarreChecklist({ st, hauteur = 10 }: { st: Stats; hauteur?: number }) {
  const w = (n: number) => (st.total ? `${(n / st.total) * 100}%` : '0');
  const pct = pourcentage(st);
  return (
    <div className="row" style={{ gap: 12 }}>
      <div className="bar" style={{ flex: '1 1 auto', height: hauteur }} aria-hidden>
        <span style={{ width: w(st.conformes), background: 'var(--g)' }} />
        <span style={{ width: w(st.sansObjet), background: 'var(--n)' }} />
        <span style={{ width: w(st.nonConformes), background: 'var(--r)' }} />
        <span style={{ width: w(st.enCours), background: 'var(--o)' }} />
      </div>
      <span className="mono" style={{ fontWeight: 600, minWidth: '4ch', textAlign: 'right' }}
        aria-label={`Checklist : ${pct} % (${st.conformes + st.sansObjet} points validés sur ${st.total})`}>{pct} %</span>
    </div>
  );
}
