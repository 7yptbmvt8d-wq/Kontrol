import { CloudOff, CloudUpload, CloudCheck, Cloud } from 'lucide-react';
import { fmtCourt, fmtDate, fmtHeure, aujourdHui, jourLocal } from '../domain/dates';
import { CONSERVER, connecte, enAttente, reglerAuto, sauvegarderMaintenant, useDrive } from '../drive/sauvegardeDrive';
import { NOM_DOSSIER } from '../drive/api';
import { taille } from '../services/exports/partage';
import { toast } from './ui';
import { lien } from '../router';

/** Pastille d'état Drive (en-tête de l'accueil) : verte à jour, orange en attente / à reconnecter, grise non configurée. */
export function PuceDrive() {
  const { config, etat } = useDrive();
  let ton = 'n', texte = 'Drive', Icone = Cloud;
  if (etat.phase === 'sauvegarde') { ton = 'b'; texte = `Drive ${Math.round(etat.progres * 100)} %`; Icone = CloudUpload; }
  else if (!connecte(config)) { ton = 'n'; texte = 'Drive'; Icone = CloudOff; }
  else if (config.reconnexion || etat.phase === 'erreur') { ton = 'o'; texte = 'Reconnecter'; Icone = CloudOff; }
  else if (enAttente(config)) { ton = 'o'; texte = 'En attente'; Icone = CloudUpload; }
  else if (config.derniere) {
    ton = 'g'; Icone = CloudCheck;
    const d = config.derniere.date;
    texte = `Drive ${jourLocal(d) === aujourdHui() ? fmtHeure(d) : fmtCourt(jourLocal(d))}`;
  }
  return (
    <a href={lien('reglages')} className={`chip t-${ton} tap`} style={{ height: 44, padding: '0 12px', textDecoration: 'none' }}
      aria-label={`Sauvegarde Google Drive : ${texte}`}>
      <Icone size={18} strokeWidth={2.2} aria-hidden />{texte}
    </a>
  );
}

/** Carte « Sauvegarde Drive » (maquette Exports) : état, horodatage, dossier, contenu, auto, sauvegarder maintenant. */
export function CarteDrive() {
  const { config, etat } = useDrive();
  const ok = connecte(config) && !config.reconnexion && etat.phase !== 'erreur';
  const titre = etat.phase === 'sauvegarde' ? 'Sauvegarde en cours…'
    : !connecte(config) ? 'Google Drive non connecté'
    : config.reconnexion ? 'Reconnexion Google nécessaire'
    : etat.phase === 'erreur' ? 'Échec de la dernière sauvegarde'
    : enAttente(config) ? 'Modifications non sauvegardées' : 'Sauvegarde Drive à jour';
  const ton = etat.phase === 'sauvegarde' ? 'b' : !connecte(config) ? 'n' : ok && !enAttente(config) ? 'g' : 'o';
  const Icone = ton === 'g' ? CloudCheck : ton === 'n' ? CloudOff : CloudUpload;

  const lancer = async () => {
    try { await sauvegarderMaintenant(); toast('Sauvegarde Drive terminée'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <section aria-label="Sauvegarde Google Drive" className="card flush">
      <div className="row" style={{ gap: 12, padding: 14 }}>
        <span className={`t-${ton}`} style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icone size={24} strokeWidth={2.2} aria-hidden />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{titre}</div>
          <div className="mono ink2">
            {etat.phase === 'sauvegarde' ? `${Math.round(etat.progres * 100)} %`
              : config.derniere ? `${fmtDate(jourLocal(config.derniere.date))} · ${fmtHeure(config.derniere.date)}` : 'Aucune sauvegarde'}
          </div>
          {etat.phase === 'erreur' && etat.message && <div className="c-o" style={{ marginTop: 2 }}>{etat.message}</div>}
        </div>
      </div>
      {connecte(config) ? (
        <>
          <dl>
            <div className="ex"><dt style={{ flex: '0 0 96px' }} className="ink2">Compte</dt><dd className="mono ellipsis" style={{ margin: 0 }}>{config.email}</dd></div>
            <div className="ex"><dt style={{ flex: '0 0 96px' }} className="ink2">Dossier</dt><dd className="mono" style={{ margin: 0 }}>{NOM_DOSSIER} · {CONSERVER} dernières</dd></div>
            {config.derniere && (
              <div className="ex"><dt style={{ flex: '0 0 96px' }} className="ink2">Contenu</dt>
                <dd style={{ margin: 0 }}>{config.derniere.chantiers} chantier{config.derniere.chantiers > 1 ? 's' : ''} · {config.derniere.photos} photos · {taille(config.derniere.taille)}</dd></div>
            )}
            <label className="ex" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Sauvegarde automatique (24 h)</span>
              <input type="checkbox" {...{ switch: '' }} className="switch" checked={config.auto} onChange={(e) => reglerAuto(e.target.checked)} />
            </label>
          </dl>
          <div style={{ padding: '0 14px 14px' }}>
            <button type="button" className="btn sec-acc block tap" disabled={etat.phase === 'sauvegarde'} onClick={lancer}>
              {etat.phase === 'sauvegarde' ? <><span className="spinner" aria-hidden />{Math.round(etat.progres * 100)} %</> : config.reconnexion ? 'Se reconnecter et sauvegarder' : 'Sauvegarder maintenant'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '0 14px 14px' }}>
          <a href={lien('reglages')} className="btn sec-acc block tap">Configurer Google Drive</a>
        </div>
      )}
    </section>
  );
}
