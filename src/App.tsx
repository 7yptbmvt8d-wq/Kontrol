import { useRoute } from './router';
import { Accueil } from './screens/Accueil';
import { ImportChantier } from './screens/ImportChantier';
import { Chantier, type Onglet } from './screens/Chantier';
import { Reglages } from './screens/Reglages';
import { Toaster } from './components/ui';

const ONGLETS: Onglet[] = ['checklist', 'reserves', 'jalons', 'intervenants'];

export function App() {
  const [a, b, c] = useRoute();
  let ecran;
  if (a === 'import') ecran = <ImportChantier />;
  else if (a === 'reglages') ecran = <Reglages />;
  else if (a === 'chantier' && b) {
    const onglet = (ONGLETS as string[]).includes(c) ? (c as Onglet) : 'checklist';
    ecran = <Chantier key={b} id={Number(b)} onglet={onglet} />;
  } else ecran = <Accueil />;
  return (
    <>
      {ecran}
      <Toaster />
    </>
  );
}
