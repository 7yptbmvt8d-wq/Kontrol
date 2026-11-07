import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, RefreshCw } from 'lucide-react';
import type JSZip from 'jszip';
import type { Contenu, Resume } from '../services/sauvegarde';
import { fmtDate, fmtHeure } from '../domain/dates';
import { Header, Segment, Sheet, toast } from '../components/ui';
import { nouvelleVersionDisponible, rafraichir, versionChargee } from '../pwa/miseAJour';
import { getReglage, setReglage } from '../db/schema';
import { appliquerTheme, type Theme } from '../theme';
import { aller, retour } from '../router';

export function Reglages() {
  const [theme, setTheme] = useState<Theme>('sombre');
  const [persist, setPersist] = useState<boolean | null>(null);
  const [verif, setVerif] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);
  const [lue, setLue] = useState<{ nom: string; zip: JSZip; contenu: Contenu; resume: Resume } | null>(null);
  const [restauration, setRestauration] = useState<number | null>(null);

  useEffect(() => {
    getReglage<Theme>('theme', 'sombre').then(setTheme);
    navigator.storage?.persisted?.().then(setPersist).catch(() => setPersist(null));
  }, []);

  const choisir = async (t: Theme) => {
    setTheme(t);
    appliquerTheme(t);
    await setReglage('theme', t);
  };

  return (
    <main className="screen">
      <Header sub="Kontrol" title="Réglages" onBack={() => retour('')} backLabel="Retour à mes chantiers" />
      <div className="pad stack" style={{ marginTop: 16 }}>
        <section className="card stack" style={{ gap: 10 }}>
          <h2 className="sec-title">Affichage</h2>
          <Segment<Theme> label="Thème" valeur={theme} onChange={choisir}
            options={[{ v: 'sombre', l: 'Sombre' }, { v: 'clair', l: 'Clair' }, { v: 'systeme', l: 'Système' }]} />
          <div className="ink2">« Système » suit le réglage clair/sombre de l’iPhone.</div>
        </section>
        <section className="card stack" style={{ gap: 6 }}>
          <h2 className="sec-title">Stockage</h2>
          <div>Données conservées uniquement sur cet appareil.</div>
          <div className="ink2">
            Stockage persistant : {persist === null ? 'inconnu' : persist ? 'accordé' : 'non accordé (l’app s’installe sur l’écran d’accueil pour l’obtenir)'}
          </div>
        </section>
        <section className="card stack" style={{ gap: 10 }} aria-label="Sauvegarde et restauration">
          <h2 className="sec-title">Sauvegarde</h2>
          <div className="ink2">Créer une sauvegarde : écran Exports d’un chantier (bouton ↓). Elle contient tous les chantiers et leurs photos.</div>
          <input ref={fichier} type="file" accept=".zip,application/zip" className="sr-only" tabIndex={-1} aria-hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const { lireSauvegarde } = await import('../services/sauvegarde');
                setLue({ nom: f.name, ...(await lireSauvegarde(f)) });
              } catch (err) { toast((err as Error).message); }
            }} />
          <button type="button" className="btn sec block tap" onClick={() => fichier.current?.click()}>
            <ArchiveRestore size={20} strokeWidth={2.2} aria-hidden />Restaurer une sauvegarde (ZIP)
          </button>
        </section>
        <section className="card stack" style={{ gap: 10 }}>
          <h2 className="sec-title">Version</h2>
          <div className="mono ink2" style={{ overflowWrap: 'anywhere' }}>v{__APP_VERSION__} · {versionChargee()?.replace(/^assets\/index-|\.js$/g, '') ?? 'dév.'}</div>
          <button type="button" className="btn sec block tap" disabled={verif} onClick={async () => {
            setVerif(true);
            const dispo = await nouvelleVersionDisponible();
            setVerif(false);
            if (dispo) void rafraichir(); else toast('L’app est à jour');
          }}>
            <RefreshCw size={20} strokeWidth={2.2} aria-hidden />{verif ? 'Vérification…' : 'Rechercher une mise à jour'}
          </button>
          <div className="ink2">Astuce : sur n’importe quel écran, tirez vers le bas depuis le haut pour actualiser.</div>
        </section>
      </div>
      {lue && (
        <Sheet titre="Restaurer cette sauvegarde ?" sousTitre={lue.nom} onClose={() => !restauration && setLue(null)} auto
          pied={
            <button type="button" className="btn danger block tap" disabled={restauration !== null} onClick={async () => {
              setRestauration(0);
              try {
                const { restaurer } = await import('../services/sauvegarde');
                await restaurer(lue.zip, lue.contenu, setRestauration);
                toast('Sauvegarde restaurée');
                setLue(null);
                aller('');
              } catch (err) {
                toast(`Restauration impossible : ${(err as Error).message}`);
              } finally {
                setRestauration(null);
              }
            }}>
              {restauration !== null ? `Restauration… ${Math.round(restauration * 100)} %` : 'Remplacer toutes les données'}
            </button>
          }>
          <dl className="card flush">
            <div className="kv"><dt>Créée le</dt><dd className="mono">{fmtDate(lue.contenu.creeLe.slice(0, 10))} · {fmtHeure(lue.contenu.creeLe)}</dd></div>
            <div className="kv"><dt>Contenu</dt><dd>{lue.resume.chantiers} chantier(s) · {lue.resume.points} points · {lue.resume.reserves} réserves · {lue.resume.photos} photos</dd></div>
          </dl>
          <div className="c-r" style={{ marginTop: 12, fontWeight: 600 }}>
            Toutes les données actuelles de cet iPhone seront remplacées par celles de la sauvegarde.
          </div>
        </Sheet>
      )}
    </main>
  );
}
