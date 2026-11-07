import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { Chantier, Jalon } from '../domain/types';
import { aujourdHui, contexte, dateJalon, ecartJours, fmtCourt, fmtDate, statutJalon, type Contexte, type StatutJalon } from '../domain/dates';
import { CodeLot, Pastille, Sheet, toast } from '../components/ui';

const TON: Record<StatutJalon, { dot: string; date: string; libelle: string }> = {
  fait: { dot: 'var(--g)', date: 'var(--ink2)', libelle: 'Fait' },
  en_retard: { dot: 'var(--r)', date: 'var(--r)', libelle: 'En retard' },
  a_venir: { dot: 'var(--b)', date: 'var(--ink)', libelle: 'À venir' },
  non_date: { dot: 'var(--n)', date: 'var(--ink2)', libelle: 'Non daté' },
};

const REF_LIB = { OS_demarrage: 'OS', reception: 'réception', autre: 'date saisie' } as const;

/** Filtre mémorisé par chantier pendant la session. */
const filtres = new Map<number, string>();
const TOUS = '';

export function OngletJalons({ chantier: ch, onParams }: { chantier: Chantier; onParams: () => void }) {
  const id = ch.id!;
  const data = useLive(`jalons:${id}`, async () => {
    const [jalons, lots, penalites] = await Promise.all([
      db.jalons.where('chantierId').equals(id).sortBy('ordre'),
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
      db.penalites.where('chantierId').equals(id).toArray(),
    ]);
    return { jalons, lots, penalites };
  }, [id]);
  const [filtre, setFiltreEtat] = useState(filtres.get(id) ?? TOUS);
  const setFiltre = (f: string) => { filtres.set(id, f); setFiltreEtat(f); };
  const [edition, setEdition] = useState<{ j: Jalon; date?: string; ctx: Contexte } | null>(null);

  if (!data) return null;
  const { jalons, lots, penalites } = data;
  const today = aujourdHui();
  const lotFiltre = lots.find((l) => l.code === filtre);
  const ctxCarte = contexte(ch, lots, jalons, lotFiltre?.code);
  const ctxDe = (j: Jalon) => contexte(ch, lots, jalons, lotFiltre?.code ?? j.lotCode);

  const lignes = jalons
    .filter((j) => !lotFiltre || !j.lotCode || j.lotCode === lotFiltre.code)
    .map((j) => {
      const ctx = ctxDe(j);
      const date = dateJalon(j, ctx);
      return { j, ctx, date, st: statutJalon(j, date, today) };
    })
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.j.ordre - b.j.ordre);

  const pens = penalites.filter((p) => !lotFiltre || !p.lotCode || p.lotCode === lotFiltre.code);
  const nbLot = (code: string) => jalons.filter((j) => !j.lotCode || j.lotCode === code).length;

  return (
    <div style={{ marginTop: 4 }}>
      {lots.length > 1 && (
        <div className="fchips" role="group" aria-label="Filtrer par marché">
          <button type="button" className="fchip tap" aria-pressed={filtre === TOUS} onClick={() => setFiltre(TOUS)}>
            Tous <span className="mono">{jalons.length}</span>
          </button>
          {lots.map((l) => (
            <button key={l.code} type="button" className="fchip tap" aria-pressed={filtre === l.code} onClick={() => setFiltre(l.code)}>
              <span className="mono">{l.code}</span><span className="mono">{nbLot(l.code)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pad" style={{ marginTop: 12 }}>
        <CarteDelai ch={ch} ctx={ctxCarte} titre={lotFiltre ? `Marché ${lotFiltre.code}` : lots.length > 1 ? 'Ensemble des marchés' : undefined}
          numero={lotFiltre?.numeroMarche} osPropre={!!lotFiltre?.dateOS} onParams={onParams} />

        {lignes.length === 0 ? (
          <div className="card empty" style={{ marginTop: 14 }}>Aucun jalon.</div>
        ) : (
          <ol className="tl" style={{ marginTop: 14 }} aria-label="Frise des jalons">
            {lignes.map(({ j, ctx, date, st }) => {
              const t = TON[st];
              const an = date && date.slice(0, 4) !== today.slice(0, 4) ? date.slice(0, 4) + ' · ' : '';
              let sous: string;
              if (st === 'fait') sous = `Fait le ${fmtDate(j.dateRealisee)}`;
              else if (st === 'en_retard') sous = `En retard · +${ecartJours(date!, today)} j`;
              else if (st === 'a_venir') {
                const n = ecartJours(today, date!);
                sous = `${an}${REF_LIB[j.reference]}${j.reference !== 'autre' ? ` + ${j.jours} j` : ''} · ${n === 0 ? 'aujourd’hui' : `dans ${n} j`}`;
              } else sous = j.reference === 'autre' ? 'Date à saisir' : j.reference === 'reception' && ctx.dateOS ? 'Délai d’exécution inconnu' : 'Date d’OS à saisir';
              return (
                <li key={j.uid}>
                  <div className="tl-date" style={{ color: t.date }}>{fmtCourt(date)}</div>
                  <div className="tl-rail" aria-hidden>
                    <span className="tl-dot" style={{ background: t.dot }} />
                    <span className="tl-line" />
                  </div>
                  <button type="button" className={`tl-box btnlike tap${st === 'en_retard' ? ' alert' : ''}`} onClick={() => setEdition({ j, date, ctx })}>
                    <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{j.lotCode && <><CodeLot code={j.lotCode} />{' '}</>}{j.intitule}</div>
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

        {pens.length > 0 && (
          <>
            <h2 className="sec-title" style={{ margin: '16px 0 8px' }}>Pénalités</h2>
            <section className="card flush">
              {pens.map((p, i) => (
                <div key={p.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.lotCode && <><CodeLot code={p.lotCode} />{' '}</>}{p.motif}</div>
                  <div>{p.montantOuTaux}</div>
                  {p.articleCcap && <div className="mono ink2">{p.articleCcap}</div>}
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      {edition && <EditionJalon {...edition} onClose={() => setEdition(null)} />}
    </div>
  );
}

function CarteDelai({ ch, ctx, titre, numero, osPropre, onParams }: {
  ch: Chantier; ctx: Contexte; titre?: string; numero?: string; osPropre: boolean; onParams: () => void;
}) {
  const today = aujourdHui();
  const entete = titre && (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 700 }}>{titre}</div>
      {numero && <div className="mono ink2" style={{ overflowWrap: 'anywhere' }}>{numero}</div>}
    </div>
  );
  if (!ctx.dateOS) {
    return (
      <section className="card stack" aria-label="Délai d’exécution" style={{ padding: 14, gap: 10 }}>
        {entete}
        <div>Date de l’OS de démarrage non saisie : les dates des jalons ne peuvent pas être calculées.</div>
        <button type="button" className="btn sec-acc block tap" onClick={onParams}>
          <CalendarClock size={22} strokeWidth={2.2} aria-hidden />Saisir la date d’OS
        </button>
      </section>
    );
  }
  const ecoules = ecartJours(ctx.dateOS, today);
  const pctTemps = ctx.delai ? Math.max(0, Math.min(100, Math.round((ecoules / ctx.delai) * 100))) : 0;
  const av = Math.max(0, Math.min(100, ch.avancementTravaux));
  return (
    <section className="card" aria-label="Délai d’exécution" style={{ padding: 14 }}>
      {entete}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="ink2">Délai d’exécution{ctx.delai !== undefined ? <> · <span className="mono">{ctx.delai}</span> j</> : ' inconnu'}</span>
        <span className="mono" style={{ fontWeight: 600 }}>
          {ecoules < 0 ? `J${ecoules}` : `J+${ecoules}`}{ctx.delai !== undefined ? ` / ${ctx.delai}` : ''}
        </span>
      </div>
      <div style={{ position: 'relative', marginTop: 10 }}>
        <div className="bar" style={{ height: 10 }} aria-hidden>
          <span style={{ width: `${pctTemps}%`, background: 'var(--accent)', borderRadius: 999 }} />
        </div>
        <div aria-hidden style={{ position: 'absolute', left: `calc(${av}% - 1px)`, top: -4, width: 2, height: 18, background: 'var(--ink)' }} />
      </div>
      <div className="ink2" style={{ marginTop: 8 }}>
        {ecoules < 0 ? <>Démarrage dans <span className="mono">{-ecoules}</span> j</> : <>Temps <span className="mono">{pctTemps} %</span></>} · travaux <span className="mono">{av} %</span>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 2, flexWrap: 'wrap' }}>
        <span className="ink2">OS{osPropre ? ' du lot' : ''} <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ctx.dateOS)}</span></span>
        <span className="ink2">{ctx.receptionReelle ? 'réception' : 'fin'} <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ctx.reception)}</span></span>
      </div>
    </section>
  );
}

function EditionJalon({ j, date, ctx, onClose }: { j: Jalon; date?: string; ctx: Contexte; onClose: () => void }) {
  const [realise, setRealise] = useState(j.dateRealisee ?? '');
  const [fixe, setFixe] = useState(j.dateFixe ?? '');
  const enregistrer = async () => {
    await db.jalons.update(j.uid!, { dateRealisee: realise || undefined, dateFixe: fixe || undefined });
    toast('Jalon mis à jour');
    onClose();
  };
  const base = j.reference === 'OS_demarrage' ? `OS (${fmtDate(ctx.dateOS)})` : `Réception (${fmtDate(ctx.reception)})`;
  return (
    <Sheet titre={j.intitule} sousTitre={[j.lotCode ? `Lot ${j.lotCode}` : 'Commun', j.articleCcap].filter(Boolean).join(' · ')} onClose={onClose} auto
      pied={<button type="button" className="btn block tap" onClick={enregistrer}>Enregistrer</button>}>
      <div className="stack">
        <dl className="card flush">
          <div className="kv"><dt>Échéance</dt><dd className="mono">{fmtDate(j.reference === 'autre' ? fixe || undefined : date)}</dd></div>
          <div className="kv"><dt>Calcul</dt><dd>{j.reference === 'autre' ? 'Date saisie manuellement' : `${base} + ${j.jours} j`}</dd></div>
          <div className="kv"><dt>État</dt><dd>{realise ? <Pastille ton="g">Fait</Pastille> : '—'}</dd></div>
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
            <input id="jreal" type="date" className="input mono" style={{ flex: '1 1 auto', minWidth: 0 }} value={realise} onChange={(e) => setRealise(e.target.value)} />
            {realise
              ? <button type="button" className="btn sec tap" onClick={() => setRealise('')}>Effacer</button>
              : <button type="button" className="btn sec tap" onClick={() => setRealise(aujourdHui())}>Aujourd’hui</button>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
