import { useRef, useState, type ReactNode } from 'react';
import { FileUp, FlaskConical, CircleAlert, TriangleAlert, CircleCheck } from 'lucide-react';
import { CodeLot, Header, toast } from '../components/ui';
import { db } from '../db/schema';
import { importerChantier, validerImport, type Probleme, type ResultatValidation } from '../domain/import';
import { remplacer, retour } from '../router';
import exemple from '../../exemples/chantier-exemple.json?raw';

const MAX_AFFICHES = 50;

export function ImportChantier() {
  const input = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [res, setRes] = useState<ResultatValidation | null>(null);
  const [doublon, setDoublon] = useState(false);
  const [dateOS, setDateOS] = useState('');
  const [enCours, setEnCours] = useState(false);

  const analyser = async (texte: string, nom: string) => {
    const r = validerImport(texte);
    setNomFichier(nom);
    setRes(r);
    setDoublon(!!r.donnees && (await db.chantiers.where('nom').equals(r.donnees.chantier.nom).count()) > 0);
  };

  const lireFichier = async (f: File | undefined) => {
    if (!f) return;
    try {
      await analyser(await f.text(), f.name);
    } catch (e) {
      toast(`Lecture impossible : ${(e as Error).message}`);
    } finally {
      if (input.current) input.current.value = ''; // permet de re-choisir le même fichier
    }
  };

  const creer = async () => {
    if (!res?.donnees || enCours) return;
    setEnCours(true);
    try {
      const id = await importerChantier(res.donnees, dateOS || undefined);
      toast('Chantier créé');
      remplacer('chantier', id, 'checklist'); // l'écran d'import ne reste pas dans l'historique
    } catch (e) {
      toast(`Échec de l’import : ${(e as Error).message}`);
      setEnCours(false);
    }
  };

  const d = res?.donnees;

  return (
    <main className="screen">
      <Header sub="Import JSON" title="Nouveau chantier" onBack={() => retour('')} backLabel="Retour à mes chantiers" />

      <div className="pad stack" style={{ marginTop: 16 }}>
        <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => lireFichier(e.target.files?.[0])} />
        <button type="button" className="btn sec-acc block tap" style={{ height: 'var(--btn-h)' }} onClick={() => input.current?.click()}>
          <FileUp size={22} strokeWidth={2.2} aria-hidden />Choisir le fichier JSON
        </button>
        <button type="button" className="btn sec block tap" onClick={() => analyser(exemple, 'chantier-exemple.json')}>
          <FlaskConical size={22} strokeWidth={2.2} aria-hidden />Charger le chantier d’exemple
        </button>

        {res && (
          <>
            <div className="mono ink2" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{nomFichier}</div>

            {res.erreurs.length > 0 && (
              <ListeProblemes titre={`${res.erreurs.length} erreur${res.erreurs.length > 1 ? 's' : ''} : import impossible`}
                items={res.erreurs} ton="r" icone={<CircleAlert size={22} strokeWidth={2.2} aria-hidden />} />
            )}

            {d && (
              <section className="card flush" aria-label="Contenu du fichier">
                <div className="row c-g" style={{ padding: '12px 14px', fontWeight: 700 }}>
                  <CircleCheck size={22} strokeWidth={2.2} aria-hidden />Fichier valide
                </div>
                <dl>
                  <div className="kv"><dt>Chantier</dt><dd>{d.chantier.nom}</dd></div>
                  <div className="kv"><dt>Site</dt><dd className="mono">{d.chantier.site || '—'}</dd></div>
                  <div className="kv"><dt>Contenu</dt><dd>
                    <span className="mono">{d.points_controle.length}</span> points dont <span className="mono">{d.points_controle.filter((p) => p.bloquant).length}</span> bloquants
                    · <span className="mono">{d.jalons.length}</span> jalons · <span className="mono">{d.penalites.length}</span> pénalités
                  </dd></div>
                </dl>
                <div style={{ padding: '10px 14px 4px', borderTop: '1px solid var(--line)' }} className="ink2">
                  {d.chantier.lots.length} lot{d.chantier.lots.length > 1 ? 's' : ''} = {d.chantier.lots.length} marché{d.chantier.lots.length > 1 ? 's' : ''}
                </div>
                {d.chantier.lots.map((l) => (
                  <div key={l.code} style={{ padding: '6px 14px 10px' }}>
                    <div className="row" style={{ alignItems: 'baseline' }}><CodeLot code={l.code} /><span style={{ fontWeight: 600 }}>{l.intitule || l.code}</span></div>
                    <div className="mono" style={{ overflowWrap: 'anywhere' }}>{l.numero_marche || <span className="c-o">n° de marché manquant</span>}</div>
                    <div className="ink2">{l.titulaire || '—'}{l.sous_traitants.length ? ` · ${l.sous_traitants.length} sous-traitant${l.sous_traitants.length > 1 ? 's' : ''}` : ''}</div>
                  </div>
                ))}
              </section>
            )}

            {doublon && (
              <div className="card row c-o" style={{ fontWeight: 600 }}>
                <TriangleAlert size={22} strokeWidth={2.2} aria-hidden style={{ flex: '0 0 auto' }} />
                Un chantier du même nom existe déjà : l’import en créera un second.
              </div>
            )}

            {res.avertissements.length > 0 && (
              <ListeProblemes titre={`${res.avertissements.length} avertissement${res.avertissements.length > 1 ? 's' : ''}`}
                items={res.avertissements} ton="o" icone={<TriangleAlert size={22} strokeWidth={2.2} aria-hidden />} />
            )}

            {d && (
              <div className="field">
                <label htmlFor="os">Date de l’OS de démarrage (facultatif, modifiable ensuite, ajustable par lot)</label>
                <input id="os" type="date" className="input mono" value={dateOS} onChange={(e) => setDateOS(e.target.value)} />
              </div>
            )}
          </>
        )}
      </div>

      {d && (
        <>
          <div className="bar-space" />
          <div className="bottom-bar">
            <button type="button" className="btn block tap" onClick={creer} disabled={enCours}>
              {enCours ? 'Création…' : 'Créer le chantier'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

/** Regroupe les messages identiques : « 10 jalons : date à saisir » plutôt que 10 lignes. */
function grouper(items: Probleme[]) {
  const groupes = new Map<string, Probleme[]>();
  for (const p of items) groupes.set(p.message, [...(groupes.get(p.message) ?? []), p]);
  return [...groupes.entries()].map(([message, ps]) => {
    if (ps.length === 1) return { message, chemin: ps[0].chemin, n: 1 };
    // Partie commune (ex. « jalons[…].echeance ») + identifiants (J-01, J-04…)
    const ids = ps.map((p) => (/\(([^)]+)\)/.exec(p.chemin)?.[1] ?? p.chemin).replace(/-/g, '\u2011')); // trait d'union insécable
    const modele = ps[0].chemin.replace(/\[\d+\]/, '[…]').replace(/ \([^)]+\)/, '');
    return { message, chemin: `${modele} : ${ids.join(', ')}`, n: ps.length };
  });
}

function ListeProblemes({ titre, items, ton, icone }: { titre: string; items: Probleme[]; ton: 'r' | 'o'; icone: ReactNode }) {
  const [tout, setTout] = useState(false);
  const groupes = grouper(items);
  const vus = tout ? groupes : groupes.slice(0, MAX_AFFICHES);
  return (
    <section className="card flush" aria-label={titre} style={ton === 'r' ? { borderColor: 'var(--r)' } : undefined}>
      <div className={`row ${ton === 'r' ? 't-r' : 'c-o'}`} style={{ padding: '12px 14px', fontWeight: 700 }}>{icone}{titre}</div>
      <ul className="err-list">
        {vus.map((g, i) => (
          <li key={i}>
            <span className="err-path" style={ton === 'o' ? { color: 'var(--o)' } : undefined}>{g.chemin}</span>
            {g.n > 1 && <span className="mono">{g.n} × </span>}{g.message}
          </li>
        ))}
      </ul>
      {groupes.length > vus.length && (
        <button type="button" className="btn sec block tap" style={{ borderRadius: 0, border: 0, borderTop: '1px solid var(--line)' }} onClick={() => setTout(true)}>
          Afficher les {groupes.length - vus.length} autres
        </button>
      )}
    </section>
  );
}
