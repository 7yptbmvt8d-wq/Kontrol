import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock } from 'lucide-react';
import { db } from '../db/schema';
import type { Chantier, Jalon } from '../domain/types';
import { aujourdHui, dateJalon, dateReception, delaiExecution, ecartJours, fmtCourt, fmtDate, statutJalon, type StatutJalon } from '../domain/dates';
import { Pastille, Sheet, toast } from '../components/ui';

const TON: Record<StatutJalon, { dot: string; date: string; libelle: string }> = {
  fait: { dot: 'var(--g)', date: 'var(--ink2)', libelle: 'Fait' },
  en_retard: { dot: 'var(--r)', date: 'var(--r)', libelle: 'En retard' },
  a_venir: { dot: 'var(--b)', date: 'var(--ink)', libelle: 'À venir' },
  non_date: { dot: 'var(--n)', date: 'var(--ink2)', libelle: 'Non daté' },
};

const REF_LIB = { OS_demarrage: 'OS', reception: 'réception', autre: 'date saisie' } as const;

export function OngletJalons({ chantier: ch, onParams }: { chantier: Chantier; onParams: () => void }) {
  const jalons = useLiveQuery(() => db.jalons.where('chantierId').equals(ch.id!).sortBy('ordre'), [ch.id]);
  const penalites = useLiveQuery(() => db.penalites.where('chantierId').equals(ch.id!).toArray(), [ch.id]);
  const [edition, setEdition] = useState<Jalon | null>(null);

  if (!jalons) return null;
  const today = aujourdHui();
  const delai = delaiExecution(jalons);
  const reception = dateReception(ch, jalons);

  // Délai : J+n / total
  const jEcoules = ch.dateOS ? ecartJours(ch.dateOS, today) : undefined;
  const pctTemps = delai && jEcoules !== undefined ? Math.max(0, Math.min(100, Math.round((jEcoules / delai) * 100))) : 0;

  const lignes = jalons
    .map((j) => {
      const date = dateJalon(j, ch, jalons);
      return { j, date, st: statutJalon(j, date, today) };
    })
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.j.ordre - b.j.ordre);

  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <section className="card" aria-label="Délai d’exécution" style={{ padding: 14 }}>
        {!ch.dateOS ? (
          <div className="stack" style={{ gap: 10 }}>
            <div>Date de l’OS de démarrage non saisie : les dates des jalons ne peuvent pas être calculées.</div>
            <button type="button" className="btn sec-acc block tap" onClick={onParams}>
              <CalendarClock size={22} strokeWidth={2.2} aria-hidden />Saisir la date d’OS
            </button>
          </div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="ink2">Délai d’exécution{delai ? <> · <span className="mono">{delai}</span> j</> : ''}</span>
              <span className="mono" style={{ fontWeight: 600 }}>J+{jEcoules}{delai ? ` / ${delai}` : ''}</span>
            </div>
            <div style={{ position: 'relative', marginTop: 10 }}>
              <div className="bar" style={{ height: 10 }} aria-hidden>
                <span style={{ width: `${pctTemps}%`, background: 'var(--accent)', borderRadius: 999 }} />
              </div>
              <div aria-hidden style={{ position: 'absolute', left: `${ch.avancementTravaux}%`, top: -4, width: 2, height: 18, background: 'var(--ink)' }} />
            </div>
            <div className="ink2" style={{ marginTop: 8 }}>Temps <span className="mono">{pctTemps} %</span> · travaux <span className="mono">{ch.avancementTravaux} %</span></div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
              <span className="ink2">OS <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ch.dateOS)}</span></span>
              <span className="ink2">{ch.dateReceptionReelle ? 'réception' : 'fin'} <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(reception)}</span></span>
            </div>
          </>
        )}
      </section>

      {lignes.length === 0 ? (
        <div className="card empty" style={{ marginTop: 14 }}>Aucun jalon importé.</div>
      ) : (
        <ol className="tl" style={{ marginTop: 14 }} aria-label="Frise des jalons">
          {lignes.map(({ j, date, st }) => {
            const t = TON[st];
            const an = date && date.slice(0, 4) !== today.slice(0, 4) ? date.slice(0, 4) + ' · ' : '';
            let sous: string;
            if (st === 'fait') sous = `Fait le ${fmtDate(j.dateRealisee)}`;
            else if (st === 'en_retard') sous = `En retard · +${ecartJours(date!, today)} j`;
            else if (st === 'a_venir') sous = `${an}${REF_LIB[j.reference]}${j.reference !== 'autre' ? ` + ${j.jours} j` : ''} · dans ${ecartJours(today, date!)} j`;
            else sous = j.reference === 'autre' ? 'Date à saisir' : 'Saisir la date d’OS';
            return (
              <li key={j.uid}>
                <div className="tl-date" style={{ color: t.date }}>{fmtCourt(date)}</div>
                <div className="tl-rail" aria-hidden>
                  <span className="tl-dot" style={{ background: t.dot }} />
                  <span className="tl-line" />
                </div>
                <button type="button" className={`tl-box btnlike tap${st === 'en_retard' ? ' alert' : ''}`} onClick={() => setEdition(j)}>
                  <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{j.intitule}</div>
                  <div style={{ color: st === 'en_retard' ? 'var(--r)' : 'var(--ink2)' }}>
                    <span className="sr-only">{t.libelle}. </span>{sous}
                  </div>
                  {j.articleCcap && <div className="mono ink2">{j.articleCcap}</div>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {penalites && penalites.length > 0 && (
        <>
          <h2 className="sec-title" style={{ margin: '16px 0 8px' }}>Pénalités</h2>
          <section className="card flush">
            {penalites.map((p, i) => (
              <div key={p.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                <div style={{ fontWeight: 600 }}>{p.motif}</div>
                <div>{p.montantOuTaux}</div>
                {p.articleCcap && <div className="mono ink2">{p.articleCcap}</div>}
              </div>
            ))}
          </section>
        </>
      )}

      {edition && <EditionJalon jalon={edition} date={dateJalon(edition, ch, jalons)} onClose={() => setEdition(null)} />}
    </div>
  );
}

function EditionJalon({ jalon: j, date, onClose }: { jalon: Jalon; date?: string; onClose: () => void }) {
  const [realise, setRealise] = useState(j.dateRealisee ?? '');
  const [fixe, setFixe] = useState(j.dateFixe ?? '');
  const enregistrer = async () => {
    await db.jalons.update(j.uid!, { dateRealisee: realise || undefined, dateFixe: fixe || undefined });
    toast('Jalon mis à jour');
    onClose();
  };
  return (
    <Sheet titre={j.intitule} sousTitre={j.articleCcap} onClose={onClose} auto
      pied={<button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>}>
      <div className="stack">
        <dl className="card flush">
          <div className="kv"><dt>Échéance</dt><dd className="mono">{fmtDate(date)}</dd></div>
          <div className="kv"><dt>Calcul</dt><dd>{j.reference === 'autre' ? 'Date saisie manuellement' : `${j.reference === 'OS_demarrage' ? 'OS de démarrage' : 'Réception'} + ${j.jours} j`}</dd></div>
          <div className="kv"><dt>État</dt><dd>{j.dateRealisee ? <Pastille ton="g">Fait</Pastille> : '—'}</dd></div>
        </dl>
        {j.reference === 'autre' && (
          <div className="field">
            <label htmlFor="jfixe">Date d’échéance</label>
            <input id="jfixe" type="date" className="input mono" value={fixe} onChange={(e) => setFixe(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="jreal">Date de réalisation (vide = non fait)</label>
          <div className="row">
            <input id="jreal" type="date" className="input mono" value={realise} onChange={(e) => setRealise(e.target.value)} />
            {!realise && <button type="button" className="btn sec tap" onClick={() => setRealise(aujourdHui())}>Aujourd’hui</button>}
            {realise && <button type="button" className="btn sec tap" onClick={() => setRealise('')}>Effacer</button>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
