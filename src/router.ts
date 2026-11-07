// Routeur minimal par hash (compatible GitHub Pages, aucun rechargement serveur).
import { useEffect, useState } from 'react';

export function useRoute(): string[] {
  const lire = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(lire);
  useEffect(() => {
    const f = () => { setParts(lire()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return parts;
}

export const lien = (...parts: (string | number)[]) => '#/' + parts.map((p) => encodeURIComponent(String(p))).join('/');

export function aller(...parts: (string | number)[]) {
  window.location.hash = lien(...parts);
}

export function retour(...repli: (string | number)[]) {
  if (window.history.length > 1) window.history.back();
  else aller(...repli);
}
