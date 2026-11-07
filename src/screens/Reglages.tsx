import { useEffect, useState } from 'react';
import { Header, Segment } from '../components/ui';
import { getReglage, setReglage } from '../db/schema';
import { appliquerTheme, type Theme } from '../theme';
import { retour } from '../router';

export function Reglages() {
  const [theme, setTheme] = useState<Theme>('sombre');
  const [persist, setPersist] = useState<boolean | null>(null);

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
        <div className="ink2 mono" style={{ textAlign: 'center' }}>v{__APP_VERSION__}</div>
      </div>
    </main>
  );
}
