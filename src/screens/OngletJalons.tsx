import { useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/schema';
import { useLive } from '../db/live';
import type { CategorieJalon, Chantier, Jalon, RefJalon } from '../domain/types';
import { aujourdHui, calculJalon, contexte, dateJalon, ecartJours, fmtCourt, fmtDate, statutJalon, type Contexte, type StatutJalon } from '../domain/dates';
import { CodeLot, Segment, Sheet, toast } from '../components/ui';

const TON: Record<StatutJalon, { dot: string; date: string; libelle: string }> = {
  fait: { dot: 'var(--g)', date: 'var(--ink2)', libelle: 'Fait' },
  en_retard: { dot: 'var(--r)', date: 'var(--r)', libelle: 'En retard' },
  a_venir: { dot: 'var(--b)', date: 'var(--ink)', libelle: 'À venir' },
  non_date: { dot: 'var(--n)', date: 'var(--ink2)', libelle: 'Non daté' },
};


/** Filtre mémorisé par chantier pendant la session. */
const filtres = new Map<number, string>();
const TOUS = '';

export function OngletJalons({ chantier: ch, onParams }: { chantier: Chantier; onParams: () => void }) {
  const id = ch.id!;
  const data = useLive(`jalons:${id}`, async () => {
    const [jalons, lots] = await Promise.all([
      db.jalons.where('chantierId').equals(id).sortBy('ordre'),
      db.lots.where('chantierId').equals(id).sortBy('ordre'),
    ]);
    return { jalons, lots };
  }, [id]);
  const [filtre, setFiltreEtat] = useState(filtres.get(id) ?? TOUS);
  const setFiltre = (f: string) => { filtres.set(id, f); setFiltreEtat(f); };
  const [edition, setEdition] = useState<{ j?: Jalon } | null>(null);

  if (!data) return null;
  const { jalons, lots } = data;
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
              let sous: string;
              if (st === 'fait') sous = `Fait le ${fmtDate(j.dateRealisee)}`;
              else if (st === 'en_retard') sous = `En retard · +${ecartJours(date!, today)} j`;
              else if (st === 'a_venir') {
                const n = ecartJours(today, date!);
                sous = `${calculJalon(j, ctx)} · ${n === 0 ? 'aujourd’hui' : `dans ${n} j`}`;
              } else sous = j.reference === 'autre' ? `Date à saisir${j.jours ? ` · délai ${j.jours} j` : ''}`
                : !ctx.dateOS ? 'Date d’OS à saisir'
                : j.reference === 'fin_preparation' ? 'Durée de la période de préparation à saisir'
                : 'Délai d’exécution inconnu';
              return (
                <li key={j.uid}>
                  <div className="tl-date" style={{ color: t.date }}>
                    {fmtCourt(date)}{date && <span className="tl-an">{date.slice(0, 4)}</span>}
                  </div>
                  <div className="tl-rail" aria-hidden>
                    <span className="tl-dot" style={{ background: t.dot }} />
                    <span className="tl-line" />
                  </div>
                  <button type="button" className={`tl-box btnlike tap${st === 'en_retard' ? ' alert' : ''}`} onClick={() => setEdition({ j })}>
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

        <button type="button" className="btn sec block tap" style={{ marginTop: 8 }} onClick={() => setEdition({})}>
          <Plus size={22} strokeWidth={2.4} aria-hidden />Ajouter un jalon
        </button>

      </div>

      {edition && (
        <EditionJalon j={edition.j} chantierId={id} lots={lots.map((l) => l.code)} onClose={() => setEdition(null)}
          calculer={(x) => { const ctx = ctxDe(x); return { ctx, date: dateJalon(x, ctx) }; }} />
      )}
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
  // Le délai d'exécution part de l'OS, ou du début des travaux si la période de préparation n'y est pas comprise
  const depart = ctx.debutDelai ?? ctx.dateOS;
  const ecoules = ecartJours(depart, today);
  const pctTemps = ctx.delai ? Math.max(0, Math.min(100, Math.round((ecoules / ctx.delai) * 100))) : 0;
  const enPreparation = !!ctx.finPreparation && today >= ctx.dateOS && today < ctx.finPreparation;
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
        {ecoules < 0 ? <>{enPreparation ? 'Période de préparation · travaux' : 'Démarrage'} dans <span className="mono">{-ecoules}</span> j</> : <>Temps <span className="mono">{pctTemps} %</span></>} · travaux <span className="mono">{av} %</span>
      </div>
      {ctx.finPreparation && ctx.finPreparation > ctx.dateOS ? (
        <div className="ink2">
          Préparation <span className="mono">{ecartJours(ctx.dateOS, ctx.finPreparation)}</span> j · début d’exécution <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ctx.finPreparation)}</span>
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 2, flexWrap: 'wrap' }}>
        <button type="button" className="tap row ink2" onClick={onParams} aria-label={`Modifier la date d’OS${osPropre ? ' du lot' : ''} (${fmtDate(ctx.dateOS)})`}
          style={{ minHeight: 44, border: 0, background: 'transparent', padding: 0, gap: 6 }}>
          OS{osPropre ? ' du lot' : ''} <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ctx.dateOS)}</span>
          <Pencil size={18} strokeWidth={2.2} color="var(--accent)" aria-hidden />
        </button>
        <span className="ink2">{ctx.receptionReelle ? 'réception' : 'fin d’exécution'} <span className="mono" style={{ color: 'var(--ink)' }}>{fmtDate(ctx.reception)}</span></span>
      </div>
    </section>
  );
}

const CATEGORIES: Record<CategorieJalon, string> = {
  delai: 'Délai', documentaire: 'Documentaire', reception: 'Réception', garantie: 'Garantie', paiement: 'Paiement',
};

/** Modification ou création d'un jalon (j absent = création). Aperçu de la date calculée en direct. */
function EditionJalon({ j, chantierId, lots, calculer, onClose }: {
  j?: Jalon; chantierId: number; lots: string[]; calculer: (j: Jalon) => { date?: string; ctx: Contexte }; onClose: () => void;
}) {
  const [v, setV] = useState<Jalon>(j ?? {
    id: '', chantierId, categorie: 'documentaire', intitule: '', articleCcap: '', reference: 'OS_demarrage', jours: 0, ordre: 0,
  });
  const [jours, setJours] = useState(String(j?.jours ?? 0));
  const set = <K extends keyof Jalon>(k: K, val: Jalon[K]) => setV((o) => ({ ...o, [k]: val }));
  const nJours = /^-?\d+$/.test(jours.trim()) ? Number(jours) : NaN;
  const brouillon: Jalon = { ...v, jours: Number.isNaN(nJours) ? 0 : nJours, dateFixe: v.dateFixe || undefined };
  const { date, ctx } = calculer(brouillon);

  const enregistrer = async () => {
    if (!v.intitule.trim()) { toast('Intitulé obligatoire'); return; }
    if (v.reference !== 'autre' && Number.isNaN(nJours)) { toast('Nombre de jours attendu (ex. 30 ou -15)'); return; }
    const propre: Jalon = { ...brouillon, intitule: v.intitule.trim(), articleCcap: v.articleCcap.trim(), lotCode: v.lotCode || undefined, dateRealisee: v.dateRealisee || undefined };
    if (j) await db.jalons.put(propre);
    else {
      await db.transaction('rw', db.jalons, async () => {
        const existants = await db.jalons.where('chantierId').equals(chantierId).toArray();
        const ids = new Set(existants.map((x) => x.id));
        let n = existants.length + 1;
        while (ids.has(`J-AJ-${n}`)) n++;
        await db.jalons.add({ ...propre, id: `J-AJ-${n}`, ordre: Math.max(0, ...existants.map((x) => x.ordre)) + 1 });
      });
    }
    toast(j ? 'Jalon mis à jour' : 'Jalon ajouté');
    onClose();
  };
  const supprimer = async () => {
    if (!j || !confirm(`Supprimer le jalon « ${j.intitule} » ?`)) return;
    await db.jalons.delete(j.uid!);
    toast('Jalon supprimé');
    onClose();
  };

  return (
    <Sheet titre={j ? 'Jalon' : 'Nouveau jalon'} sousTitre={j?.id} onClose={onClose}
      pied={
        <div className="row">
          {j && <button type="button" className="btn danger tap" aria-label="Supprimer le jalon" onClick={supprimer}><Trash2 size={22} aria-hidden /></button>}
          <button type="button" className="btn block tap" onClick={enregistrer}>{j ? 'Enregistrer' : 'Ajouter le jalon'}</button>
        </div>
      }>
      <div className="stack" style={{ gap: 14 }}>
        <dl className="card flush">
          <div className="kv"><dt>Échéance</dt><dd className="mono" style={{ fontWeight: 600 }}>{fmtDate(date)}</dd></div>
          <div className="kv"><dt>Calcul</dt><dd>{calculJalon(brouillon, ctx)}</dd></div>
        </dl>

        <div className="field">
          <label htmlFor="jreal">Réalisé le (vide = non fait)</label>
          <div className="row">
            <input id="jreal" type="date" className="input mono" style={{ flex: '1 1 auto', minWidth: 0 }} value={v.dateRealisee ?? ''} onChange={(e) => set('dateRealisee', e.target.value)} />
            {v.dateRealisee
              ? <button type="button" className="btn sec tap" onClick={() => set('dateRealisee', '')}>Effacer</button>
              : <button type="button" className="btn sec tap" onClick={() => set('dateRealisee', aujourdHui())}>Aujourd’hui</button>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="j-int">Intitulé</label>
          <textarea id="j-int" className="textarea" style={{ minHeight: 64 }} value={v.intitule} onChange={(e) => set('intitule', e.target.value)} />
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Calculé à partir de</div>
          <Segment<RefJalon> label="Référence du jalon" valeur={v.reference} onChange={(r) => set('reference', r)}
            options={[{ v: 'OS_demarrage', l: 'OS', aria: 'OS de démarrage' }, { v: 'fin_preparation', l: 'Fin PP', aria: 'Fin de la période de préparation' },
              { v: 'reception', l: 'Réception' }, { v: 'autre', l: 'Date', aria: 'Date libre' }]} />
          <div style={{ marginTop: 8 }}>
            {v.reference === 'autre' ? (
              <input type="date" className="input mono" aria-label="Date d’échéance" value={v.dateFixe ?? ''} onChange={(e) => set('dateFixe', e.target.value)} />
            ) : (
              <div className="row">
                <input className="input mono" inputMode="numeric" aria-label="Nombre de jours" value={jours}
                  onChange={(e) => setJours(e.target.value.replace(/[^\d-]/g, ''))} onFocus={(e) => e.target.select()} style={{ flex: '1 1 auto', minWidth: 0 }} />
                <span className="ink2" style={{ flex: '0 0 auto' }}>jours (− = avant)</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="frow">
            <label className="rl" htmlFor="j-cat">Catégorie</label>
            <select id="j-cat" value={v.categorie} onChange={(e) => set('categorie', e.target.value as CategorieJalon)}>
              {(Object.keys(CATEGORIES) as CategorieJalon[]).map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
            </select>
          </div>
          {lots.length > 1 && (
            <div className="frow">
              <label className="rl" htmlFor="j-lot">Marché</label>
              <select id="j-lot" value={v.lotCode ?? ''} onChange={(e) => set('lotCode', e.target.value || undefined)}>
                <option value="">Commun à tous</option>
                {lots.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div className="frow" style={{ borderBottom: 0 }}>
            <label className="rl" htmlFor="j-art">Article CCAP</label>
            <input id="j-art" className="mono" value={v.articleCcap} onChange={(e) => set('articleCcap', e.target.value)} />
          </div>
        </div>
        {v.categorie === 'delai' && (
          <div className="ink2">Un jalon « Délai » rapporté à l’OS fixe la fin du délai d’exécution et la réception prévisionnelle.</div>
        )}
      </div>
    </Sheet>
  );
}
