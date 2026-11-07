import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { compter, filtrerTrier } from '../src/domain/reserves';
import { statutAffiche } from '../src/domain/statuts';
import type { Reserve } from '../src/domain/types';
import { db } from '../src/db/schema';
import { creerReserve, lever, lireMemoire, refuserLevee, relancer, rouvrir, signalerLevee } from '../src/services/reserves';

const res = (p: Partial<Reserve>): Reserve => ({
  chantierId: 1, numero: 1, lotCode: 'GO', entreprise: 'A', localisation: '', description: '', gravite: 'majeure',
  origine: 'visite', statut: 'ouvert', photoIds: [], historique: [], creeLe: '', ...p,
});
const T = '2026-11-07';

describe('statuts et tri', () => {
  it('en retard seulement si l’entreprise doit encore agir', () => {
    expect(statutAffiche(res({ echeance: '2026-11-01' }), T)).toBe('en_retard');
    expect(statutAffiche(res({ echeance: '2026-11-01', statut: 'relance' }), T)).toBe('en_retard');
    expect(statutAffiche(res({ echeance: '2026-11-01', statut: 'levee_a_verifier' }), T)).toBe('levee_a_verifier');
    expect(statutAffiche(res({ echeance: '2026-11-01', statut: 'leve' }), T)).toBe('leve');
    expect(statutAffiche(res({ echeance: T }), T)).toBe('ouvert');
  });
  const liste = [
    res({ id: 1, numero: 1, statut: 'leve', echeance: '2026-10-01' }),
    res({ id: 2, numero: 2, echeance: '2026-11-20', gravite: 'mineure' }),
    res({ id: 3, numero: 3, echeance: '2026-11-02', lotCode: 'CVC', entreprise: 'B' }),
    res({ id: 4, numero: 4, statut: 'levee_a_verifier', echeance: '2026-11-30', gravite: 'bloquante' }),
  ];
  it('compteurs', () => {
    expect(compter(liste, T)).toMatchObject({ toutes: 4, non_levees: 3, en_retard: 1, ouvert: 1, levee_a_verifier: 1, leve: 1 });
  });
  it('tri par priorité : retard, à vérifier, …, levées en dernier', () => {
    const f = { statut: 'toutes' as const, lot: '', entreprise: '', tri: 'echeance' as const };
    expect(filtrerTrier(liste, f, T).map((r) => r.id)).toEqual([3, 4, 2, 1]);
    expect(filtrerTrier(liste, { ...f, tri: 'gravite' }, T).map((r) => r.id)).toEqual([4, 1, 3, 2]);
    expect(filtrerTrier(liste, { ...f, lot: 'CVC' }, T).map((r) => r.id)).toEqual([3]);
    expect(filtrerTrier(liste, { ...f, statut: 'en_retard' }, T).map((r) => r.id)).toEqual([3]);
  });
});

describe('cycle de vie en base', () => {
  it('numérote, mémorise la saisie, relance, refuse, lève, rouvre', async () => {
    const chantierId = (await db.chantiers.add({ nom: 'X', operation: '', site: '', phase: 'execution', avancementTravaux: 0, compteurReserve: 0, creeLe: '', majLe: '' })) as number;
    const base = { chantierId, lotCode: 'GO', entreprise: 'Moretti', localisation: 'R+1', description: 'Fissure', gravite: 'majeure' as const, origine: 'visite' as const, photoIds: [] };
    const r1 = await creerReserve(base);
    const r2 = await creerReserve({ ...base, lotCode: 'CVC', entreprise: 'Lanterna', localisation: 'R+2' });
    expect([r1.numero, r2.numero]).toEqual([1, 2]);
    expect(await lireMemoire(chantierId)).toEqual({ lot: 'CVC', entreprises: { GO: 'Moretti', CVC: 'Lanterna' }, localisation: 'R+2' });

    await relancer(r1.id!, '2026-12-01', 'oral');
    let r = (await db.reserves.get(r1.id!))!;
    expect(r).toMatchObject({ statut: 'relance', echeance: '2026-12-01' });
    expect(r.historique.at(-1)!.texte).toBe('Relance n°1 · nouvelle échéance 01/12/2026 : oral');

    await signalerLevee(r1.id!);
    await refuserLevee(r1.id!, undefined, 'incomplet');
    r = (await db.reserves.get(r1.id!))!;
    expect(r.statut).toBe('relance');
    expect(r.historique.map((h) => h.type)).toEqual(['creation', 'relance', 'levee_a_verifier', 'refus']);

    const photo = (await db.photos.add({ chantierId, blob: new Blob(['x']), vignette: new Blob(['x']), prisLe: '' })) as number;
    await lever(r1.id!, '2026-11-07', [photo]);
    expect((await db.reserves.get(r1.id!))!).toMatchObject({ statut: 'leve', levee: { date: '2026-11-07', photoIds: [photo] } });

    await rouvrir(r1.id!);
    r = (await db.reserves.get(r1.id!))!;
    expect(r.statut).toBe('ouvert');
    expect(r.levee).toBeUndefined();
    expect(await db.photos.get(photo)).toBeUndefined();
  });
});
