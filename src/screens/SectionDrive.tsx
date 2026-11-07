import { useEffect, useState } from 'react';
import { ClipboardCopy, CloudDownload, LogOut } from 'lucide-react';
import { Sheet, toast } from '../components/ui';
import { CarteDrive } from '../components/Drive';
import { URL_RETOUR, enregistrerIdClient, idClient } from '../drive/oauth';
import { connecte, connecterDrive, deconnecter, listerSauvegardes, telechargerSauvegarde, useDrive } from '../drive/sauvegardeDrive';
import type { FichierDrive } from '../drive/api';
import { fmtDate, fmtHeure, jourLocal } from '../domain/dates';
import { taille } from '../services/exports/partage';

/** Demande d'ouverture de la liste des sauvegardes (au retour de la connexion Google), même si l'écran est déjà affiché. */
let listeDemandee = false;
const ecouteurs = new Set<() => void>();
export const ouvrirListeDrive = () => { listeDemandee = true; ecouteurs.forEach((f) => f()); };

const copier = async (t: string) => {
  try { await navigator.clipboard.writeText(t); toast('Copié'); } catch { toast(t); }
};

/** Section « Google Drive » des Réglages : configuration unique, état, sauvegarde, restauration. */
export function SectionDrive({ onRestaurer }: { onRestaurer: (fichier: Blob, nom: string) => void }) {
  const { config } = useDrive();
  const [client, setClient] = useState(idClient());
  const [saisie, setSaisie] = useState('');
  const [modifier, setModifier] = useState(false);
  const [liste, setListe] = useState<FichierDrive[] | null>(null);
  const [chargement, setChargement] = useState<string | null>(null);

  const ouvrirListe = async () => {
    setChargement('liste');
    try {
      const l = await listerSauvegardes(); // peut rediriger vers Google si la connexion a expiré
      if (l) setListe(l);
    } catch (e) { toast((e as Error).message); }
    finally { setChargement(null); }
  };
  useEffect(() => {
    const f = () => { if (listeDemandee) { listeDemandee = false; void ouvrirListe(); } };
    f();
    ecouteurs.add(f);
    return () => { ecouteurs.delete(f); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!client || modifier) {
    const origine = new URL(URL_RETOUR).origin;
    return (
      <section className="card stack" style={{ gap: 10 }} aria-label="Google Drive">
        <h2 className="sec-title">Google Drive</h2>
        <div>Configuration unique : collez l’<strong>identifiant client OAuth</strong> créé dans Google Cloud.</div>
        <div className="field">
          <label htmlFor="gd-client">Identifiant client</label>
          <input id="gd-client" className="input mono" placeholder="…apps.googleusercontent.com" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        <button type="button" className="btn block tap" disabled={!/\.apps\.googleusercontent\.com\s*$/.test(saisie)} onClick={() => {
          enregistrerIdClient(saisie); setClient(saisie.trim()); setModifier(false); toast('Identifiant enregistré');
        }}>Enregistrer</button>
        <div className="ink2">À déclarer dans Google Cloud (identifiant de type « Application Web ») :</div>
        <dl className="card flush">
          <div className="kv" style={{ alignItems: 'center' }}><dt>Origine</dt><dd className="mono">{origine}</dd>
            <button type="button" className="icon-btn tap" aria-label="Copier l’origine" onClick={() => copier(origine)}><ClipboardCopy size={20} aria-hidden /></button></div>
          <div className="kv" style={{ alignItems: 'center' }}><dt>Redirection</dt><dd className="mono">{URL_RETOUR}</dd>
            <button type="button" className="icon-btn tap" aria-label="Copier l’adresse de redirection" onClick={() => copier(URL_RETOUR)}><ClipboardCopy size={20} aria-hidden /></button></div>
        </dl>
        {modifier && <button type="button" className="btn sec block tap" onClick={() => setModifier(false)}>Annuler</button>}
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: 10 }} aria-label="Google Drive">
      <h2 className="sec-title" style={{ marginTop: 4 }}>Google Drive</h2>
      {!connecte(config) ? (
        <div className="card stack" style={{ gap: 10 }}>
          <div>Sauvegarde automatique de tous les chantiers dans un dossier « Kontrol » de votre Google Drive (10 dernières conservées).</div>
          <div className="ink2">L’app n’a accès qu’aux fichiers qu’elle crée (autorisation « drive.file »).</div>
          <button type="button" className="btn block tap" onClick={() => connecterDrive()}>Connecter Google Drive</button>
          <button type="button" className="btn sec block tap" onClick={() => { setSaisie(client); setModifier(true); }}>Modifier l’identifiant client</button>
        </div>
      ) : (
        <>
          <CarteDrive />
          <button type="button" className="btn sec block tap" onClick={ouvrirListe} disabled={chargement !== null}>
            {chargement === 'liste' ? <span className="spinner" aria-hidden /> : <CloudDownload size={20} strokeWidth={2.2} aria-hidden />}Restaurer depuis Google Drive
          </button>
          <button type="button" className="btn sec block tap" onClick={() => {
            if (confirm('Déconnecter Google Drive ? Les sauvegardes déjà déposées restent sur votre Drive.')) deconnecter();
          }}><LogOut size={20} strokeWidth={2.2} aria-hidden />Déconnecter</button>
        </>
      )}

      {liste && (
        <Sheet titre="Sauvegardes Google Drive" sousTitre="Dossier Kontrol" onClose={() => setListe(null)} auto>
          {liste.length === 0 && <div className="empty">Aucune sauvegarde sur Drive.</div>}
          <ul className="card flush" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {liste.map((f, i) => (
              <li key={f.id} style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
                <button type="button" className="row tap" disabled={chargement !== null}
                  style={{ width: '100%', minHeight: 56, border: 0, background: 'transparent', padding: '8px 14px', justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={async () => {
                    setChargement(f.id);
                    try {
                      const b = await telechargerSauvegarde(f.id);
                      if (b) { setListe(null); onRestaurer(b, f.name); }
                    } catch (e) { toast((e as Error).message); }
                    finally { setChargement(null); }
                  }}>
                  <span>
                    <span className="mono" style={{ fontWeight: 600 }}>{fmtDate(jourLocal(f.createdTime))} · {fmtHeure(f.createdTime)}</span>
                    {i === 0 && <span className="ink2"> · la plus récente</span>}
                  </span>
                  {chargement === f.id ? <span className="spinner" aria-hidden /> : <span className="mono ink2">{f.size ? taille(Number(f.size)) : ''}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="ink2" style={{ marginTop: 10 }}>Touchez une sauvegarde : son contenu s’affiche avant toute restauration.</div>
        </Sheet>
      )}
    </section>
  );
}
