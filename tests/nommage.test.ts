import { describe, expect, it } from 'vitest';
import { nomPropre, photosAttendues } from '../src/drive/nommage';
import type { PointControle, Reserve } from '../src/domain/types';

const reserve = (o: Partial<Reserve>): Reserve => ({
  chantierId: 1, numero: 3, lotCode: 'GO', entreprise: '', localisation: '', description: 'Fissure enduit', gravite: 'mineure',
  origine: 'visite', statut: 'ouvert', photoIds: [], historique: [], creeLe: '2026-11-01T08:00:00Z', ...o,
});

describe('nommage Drive', () => {
  it('nettoie les noms (caractères interdits sous Windows, longueur)', () => {
    expect(nomPropre('Façade nord / reprise : "urgent"')).toBe('Façade nord reprise urgent');
    expect(nomPropre('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
  it('nomme les photos par réserve (constat, levée) puis par point', () => {
    const r = reserve({ photoIds: [11, 12], levee: { date: '2026-11-05', photoIds: [13] } });
    const p = { id: 'GO-3.2-01', articleCctp: 'GO 3.2', intitule: 'Ferraillage', photoIds: [20] } as PointControle;
    expect(photosAttendues([r], [p])).toEqual([
      { photoId: 11, nom: 'R-03 · constat 1 – Fissure enduit.jpg' },
      { photoId: 12, nom: 'R-03 · constat 2 – Fissure enduit.jpg' },
      { photoId: 13, nom: 'R-03 · levée 1 – Fissure enduit.jpg' },
      { photoId: 20, nom: 'GO-3.2-01 · 1 – Ferraillage.jpg' },
    ]);
  });
});

describe('nom des sauvegardes', () => {
  it('date lisible, sans caractère interdit', async () => {
    const { nomSauvegarde, renommageSauvegarde } = await import('../src/drive/nommage');
    expect(nomSauvegarde(new Date(2026, 10, 8, 9, 5))).toBe('Kontrol – sauvegarde du 08-11-2026 à 09h05.zip');
    expect(renommageSauvegarde('Kontrol-sauvegarde-20261108-0945.zip')).toBe('Kontrol – sauvegarde du 08-11-2026 à 09h45.zip');
    expect(renommageSauvegarde('Kontrol – sauvegarde du 08-11-2026 à 09h45.zip')).toBeNull();
  });
});
