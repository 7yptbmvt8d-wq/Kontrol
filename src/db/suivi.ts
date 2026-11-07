// Date de dernière modification des données (pour savoir si une sauvegarde Drive est « en attente »).
// Alimentée par des crochets Dexie sur toutes les tables de données (pas les réglages).
import { db } from './schema';

const CLE = 'kontrol-modif';
let derniere = (() => { try { return Number(localStorage.getItem(CLE) ?? 0); } catch { return 0; } })();

const marquer = () => {
  derniere = Date.now();
  try { localStorage.setItem(CLE, String(derniere)); } catch { /* stockage indisponible */ }
};

for (const t of db.tables) {
  if (t.name === 'reglages') continue;
  t.hook('creating', marquer);
  t.hook('updating', marquer);
  t.hook('deleting', marquer);
}

export const derniereModification = () => derniere;

/** Après une restauration : les données correspondent à une sauvegarde, rien n'est « en attente » (0 = aucune modification). */
export function marquerSynchronise(date: number) {
  derniere = date;
  try { localStorage.setItem(CLE, String(derniere)); } catch { /* stockage indisponible */ }
}
