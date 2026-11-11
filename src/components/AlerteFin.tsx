import { CalendarClock, TriangleAlert } from 'lucide-react';
import { fmtDate } from '../domain/dates';

export type Alerte = { niveau: 'a_programmer' | 'depassee'; jours: number; date: string };

/** « OPR à programmer » (60 j avant la fin d'exécution) ou « fin d'exécution dépassée » (réception non prononcée). */
export function AlerteFin({ a }: { a?: Alerte }) {
  if (!a) return null;
  const t = a.niveau === 'depassee' ? 'r' : 'o';
  const Icone = a.niveau === 'depassee' ? TriangleAlert : CalendarClock;
  return (
    <div role="status" className="row" style={{ gap: 8, alignItems: 'flex-start', background: `var(--${t}-bg)`, color: `var(--${t})`, borderRadius: 12, padding: '8px 10px', fontWeight: 600 }}>
      <Icone size={20} strokeWidth={2.4} aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }} />
      <span>
        {a.niveau === 'depassee'
          ? <>Fin d’exécution dépassée de <span className="mono">{a.jours}</span> j ({fmtDate(a.date)}) · réception non prononcée</>
          : <>OPR à programmer · fin d’exécution le <span className="mono">{fmtDate(a.date)}</span> ({a.jours ? <>dans <span className="mono">{a.jours}</span> j</> : 'aujourd’hui'})</>}
      </span>
    </div>
  );
}
