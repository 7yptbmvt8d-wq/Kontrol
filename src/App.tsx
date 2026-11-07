import { useRoute } from './router';
import { Accueil } from './screens/Accueil';
import { ImportChantier } from './screens/ImportChantier';
import { Chantier, ONGLETS, type Onglet } from './screens/Chantier';
import { Reglages } from './screens/Reglages';
import { DetailPoint } from './screens/DetailPoint';
import { DetailReserve } from './screens/DetailReserve';
import { Toaster } from './components/ui';
import { BandeauMiseAJour, TirerPourActualiser } from './components/Actualisation';

export function App() {
  const [a, b, c, d] = useRoute();
  let ecran;
  if (a === 'import') ecran = <ImportChantier />;
  else if (a === 'reglages') ecran = <Reglages />;
  else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'point' && d && /^\d+$/.test(d)) {
    ecran = <DetailPoint key={d} chantierId={Number(b)} uid={Number(d)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b) && c === 'reserve' && d && /^\d+$/.test(d)) {
    ecran = <DetailReserve key={d} chantierId={Number(b)} rid={Number(d)} />;
  } else if (a === 'chantier' && b && /^\d+$/.test(b)) {
    const onglet = ONGLETS.some((o) => o.v === c) ? (c as Onglet) : 'checklist';
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
