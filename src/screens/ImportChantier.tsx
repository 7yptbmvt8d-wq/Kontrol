import { useRef, useState } from 'react';
import { FileUp, FlaskConical, CircleAlert, TriangleAlert, CircleCheck } from 'lucide-react';
import { Header, toast } from '../components/ui';
import { importerChantier, validerImport, type ResultatValidation } from '../domain/import';
import { aller, retour } from '../router';
import exemple from '../../exemples/chantier-exemple.json?raw';

export function ImportChantier() {
  const input = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [res, setRes] = useState<ResultatValidation | null>(null);
  const [dateOS, setDateOS] = useState('');
  const [enCours, setEnCours] = useState(false);

  const analyser = (texte: string, nom: string) => {
    setNomFichier(nom);
    setRes(validerImport(texte));
  };

  const lireFichier = async (f: File | undefined) => {
    if (!f) return;
    analyser(await f.text(), f.name);
    if (input.current) input.current.value = '';
  };

  const creer = async () => {
    if (!res?.donnees) return;
    setEnCours(true);
    try {
      const id = await importerChantier(res.donnees, dateOS || undefined);
      toast('Chantier créé');
      aller('chantier', id, 'checklist');
    } catch (e) {
      toast(`Échec de l’import : ${(e as Error).message}`);
      setEnCours(false);
    }
  };

  const d = res?.donnees;

  return (
    <main className={`screen${d ? ' has-bar' : ''}`}>
      <Header sub="Import JSON" title="Nouveau chantier" onBack={() => retour('')} backLabel="Retour à mes chantiers" />

      <div className="pad stack" style={{ marginTop: 16 }}>
        <input ref={input} type="file" accept=".json,application/json" className="sr-only" id="fic" onChange={(e) => lireFichier(e.target.files?.[0])} />
        <label htmlFor="fic" className="btn sec-acc block tap" style={{ height: 'var(--btn-h)' }}>
          <FileUp size={22} strokeWidth={2.2} aria-hidden />Choisir le fichier JSON
        </label>
        <button type="button" className="btn sec block tap" onClick={() => analyser(exemple, 'chantier-exemple.json')}>
          <FlaskConical size={22} strokeWidth={2.2} aria-hidden />Charger le chantier d’exemple
        </button>

        {res && (
          <>
            <div className="mono ink2" style={{ marginTop: 8 }}>{nomFichier}</div>

            {res.erreurs.length > 0 && (
              <section className="card flush" aria-label="Erreurs" style={{ borderColor: 'var(--r)' }}>
                <div className="row t-r" style={{ padding: '12px 14px', fontWeight: 700 }}>
                  <CircleAlert size={22} strokeWidth={2.2} aria-hidden />
                  {res.erreurs.length} erreur{res.erreurs.length > 1 ? 's' : ''} : import impossible
                </div>
                <ul className="err-list">
                  {res.erreurs.map((e, i) => (
                    <li key={i}><span className="err-path">{e.chemin}</span>{e.message}</li>
                  ))}
                </ul>
              </section>
            )}

            {d && (
              <section className="card flush" aria-label="Contenu du fichier">
                <div className="row t-g" style={{ padding: '12px 14px', fontWeight: 700 }}>
                  <CircleCheck size={22} strokeWidth={2.2} aria-hidden />Fichier valide
                </div>
                <dl>
                  <div className="kv"><dt>Chantier</dt><dd>{d.chantier.nom}</dd></div>
                  <div className="kv"><dt>Site</dt><dd className="mono">{d.chantier.site || '—'}</dd></div>
                  <div className="kv"><dt>Marché</dt><dd className="mono">{d.chantier.numero_marche || '—'}</dd></div>
                  <div className="kv"><dt>Lots</dt><dd className="mono">{d.chantier.lots.map((l) => l.code).join(' · ')}</dd></div>
                  <div className="kv"><dt>Contenu</dt><dd>
                    <span className="mono">{d.points_controle.length}</span> points dont <span className="mono">{d.points_controle.filter((p) => p.bloquant).length}</span> bloquants
                    · <span className="mono">{d.jalons.length}</span> jalons · <span className="mono">{d.penalites.length}</span> pénalités
                  </dd></div>
                </dl>
              </section>
            )}

            {res.avertissements.length > 0 && (
              <section className="card flush" aria-label="Avertissements">
                <div className="row c-o" style={{ padding: '12px 14px', fontWeight: 700 }}>
                  <TriangleAlert size={22} strokeWidth={2.2} aria-hidden />
                  {res.avertissements.length} avertissement{res.avertissements.length > 1 ? 's' : ''}
                </div>
                <ul className="err-list">
                  {res.avertissements.map((e, i) => (
                    <li key={i}><span className="err-path" style={{ color: 'var(--o)' }}>{e.chemin}</span>{e.message}</li>
                  ))}
                </ul>
              </section>
            )}

            {d && (
              <div className="field">
                <label htmlFor="os">Date de l’OS de démarrage (facultatif, modifiable ensuite)</label>
                <input id="os" type="date" className="input mono" value={dateOS} onChange={(e) => setDateOS(e.target.value)} />
              </div>
            )}
          </>
        )}
      </div>

      {d && (
        <div className="bottom-bar">
          <button type="button" className="btn block tap" onClick={creer} disabled={enCours}>Créer le chantier</button>
        </div>
      )}
    </main>
  );
}
