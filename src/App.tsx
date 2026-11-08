import { useEffect } from 'react';
import { aller, useRoute } from './router';
import { demarrage } from './drive/sauvegardeDrive';
import { ouvrirListeDrive } from './screens/SectionDrive';
import { Accueil } from './screens/Accueil';
import { ImportChantier } from './screens/ImportChantier';
import { Chantier, ONGLETS, type Onglet } from './screens/Chantier';
import { Reglages } from './screens/Reglages';
import { DetailPoint } from './screens/DetailPoint';
import { DetailReserve } from './screens/DetailReserve';
import { Exports } from './screens/Exports';
import { Reunion } from './screens/Reunion';
import { Toaster } from './components/ui';
import { BandeauMiseAJour, TirerPourActualiser } from './components/Actualisation';

let demarre = false;

export function App() {
  useEffect(() => {
    if (demarre) return; // une seule fois (StrictMode monte deux fois en développement)
    demarre = true;
    void demarrage().then((intention) => { if (intention === 'lister') { ouvrirListeDrive(); aller('reglages'); } }).catch(() => {});
  }, []);
  const [a, b, c, d] = useRoute();
  let ecran;
  if (a === 'import') ecran = <ImportChantier />;
  else if (a === 'reglages') ecran = <Reglages />;
  else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'point' && d && /^\d+$/.test(d)) {
    ecran = <DetailPoint key={d} chantierId={Number(b)} uid={Number(d)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'reserve' && d && /^\d+$/.test(d)) {
    ecran = <DetailReserve key={d} chantierId={Number(b)} rid={Number(d)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'reunion' && d && /^\d+$/.test(d)) {
    ecran = <Reunion key={d} chantierId={Number(b)} rid={Number(d)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'exports') {
    ecran = <Exports key={b} chantierId={Number(b)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b)) {
    const onglet = ONGLETS.some((o) => o.v === c) || c === 'penalites' || c === 'reunions' ? (c as Onglet) : 'checklist';
    ecran = <Chantier key={b} id={Number(b)} onglet={onglet} />;
  } else ecran = <Accueil />;
  return (
    <>
      <div className="statusbar" aria-hidden />
      {ecran}
      <Toaster />
      <TirerPourActualiser />
      <BandeauMiseAJour />
    </>
  );
}
