// Routeur minimal par hash (compatible GitHub Pages).
// - Pile de navigation interne : « Retour » revient en arrière dans l'historique si la page précédente est le parent,
//   sinon va au parent (jamais de sortie de l'app).
// - Défilement : restauré au retour arrière, remis en haut sinon.
// - Onglets : remplacement (n'empile pas l'historique).
import { useEffect, useLayoutEffect, useState } from 'react';

const norm = (h: string) => (h === '' || h === '#' ? '#/' : h);

const pile: string[] = [norm(window.location.hash)];
const defilement = new Map<string, number>();
let remplacement = false;
let cibleDefilement = 0;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

window.addEventListener('scroll', () => defilement.set(pile[pile.length - 1], window.scrollY), { passive: true });

// Enregistré avant les composants : la pile est à jour quand ils se rendent.
window.addEventListener('hashchange', () => {
  const h = norm(window.location.hash);
  let retourArriere = false;
  if (remplacement) {
    pile[pile.length - 1] = h;
    remplacement = false;
  } else if (pile.length >= 2 && pile[pile.length - 2] === h) {
    pile.pop();
    retourArriere = true;
  } else {
    pile.push(h);
  }
  cibleDefilement = retourArriere ? defilement.get(h) ?? 0 : 0;
});

const decouper = () => norm(window.location.hash).replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

export function useRoute(): string[] {
  const [parts, setParts] = useState(decouper);
  useEffect(() => {
    const f = () => setParts(decouper());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  // Après rendu, avant affichage : position de défilement voulue (pas de saut visible).
  useLayoutEffect(() => { window.scrollTo(0, cibleDefilement); }, [parts]);
  return parts;
}

export const lien = (...parts: (string | number)[]) => norm('#/' + parts.filter((p) => p !== '').map((p) => encodeURIComponent(String(p))).join('/'));

export function aller(...parts: (string | number)[]) {
  window.location.hash = lien(...parts);
}

/** Navigation sans nouvelle entrée d'historique (onglets). */
export function remplacer(...parts: (string | number)[]) {
  const cible = lien(...parts);
  if (cible === norm(window.location.hash)) return;
  remplacement = true;
  window.location.replace(cible);
}

/**
 * Retour : revient à l'écran précédent s'il est le parent, ou s'il appartient au même chantier
 * (ex. réserve ouverte depuis un point → retour au point) ; sinon va au parent. Jamais de sortie de l'app.
 */
export function retour(...parent: (string | number)[]) {
  const cible = lien(...parent);
  const prec = pile.length >= 2 ? pile[pile.length - 2] : undefined;
  const chantier = /^#\/chantier\/\d+/.exec(cible)?.[0];
  if (prec && (prec === cible || (chantier && (prec === chantier || prec.startsWith(`${chantier}/`))))) history.back();
  else aller(...parent);
}
