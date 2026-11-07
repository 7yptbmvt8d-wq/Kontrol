// useLiveQuery avec mémoire du dernier résultat : à la navigation, l'écran s'affiche
// immédiatement avec les données connues (pas d'écran vide), puis se met à jour.
import { useLiveQuery } from 'dexie-react-hooks';

const memoire = new Map<string, unknown>();

export function useLive<T>(cle: string, requete: () => Promise<T>, deps: unknown[]): T | undefined {
  return useLiveQuery(
    async () => {
      const r = await requete();
      memoire.set(cle, r);
      return r;
    },
    [cle, ...deps],
    memoire.get(cle) as T | undefined,
  );
}
