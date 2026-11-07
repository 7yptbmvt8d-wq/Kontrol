import { describe, expect, it } from 'vitest';
import { correspond, grouper, statistiques, type Filtres } from '../src/domain/checklist';
import type { Lot, PointControle } from '../src/domain/types';

const pt = (p: Partial<PointControle>): PointControle => ({
  id: 'X', chantierId: 1, lot: 'GO', articleCctp: '', phase: 'execution', type: 'controle', intitule: '', critere: '', reference: '',
  responsable: 'entreprise', echeance: { type: 'evenement', valeur: '' }, bloquant: false, ordre: 0, etat: 'a_faire', commentaire: '', photoIds: [], ...p,
});
const lots: Lot[] = [{ chantierId: 1, code: 'VRD', intitule: '', numeroMarche: '', ordre: 0 }, { chantierId: 1, code: 'GO', intitule: '', numeroMarche: '', ordre: 1 }];
const tous: Filtres = { etat: 'tous', lot: '', texte: '' };

const points = [
  pt({ uid: 1, lot: 'GO', phase: 'execution', ordre: 2, bloquant: true, intitule: 'Réception des fonds de fouille', reference: 'NF DTU 13.1' }),
  pt({ uid: 2, lot: 'GO', phase: 'preparation', ordre: 1, etat: 'conforme', bloquant: true, intitule: 'Agrément béton' }),
  pt({ uid: 3, lot: 'VRD', phase: 'execution', ordre: 3, etat: 'non_conforme', intitule: 'Compactage', bloquant: true }),
  pt({ uid: 4, lot: 'VRD', phase: 'execution', ordre: 4, etat: 'sans_objet', intitule: 'Essai à la plaque' }),
  pt({ uid: 5, lot: 'GO', phase: 'execution', ordre: 5, etat: 'en_cours', intitule: 'Coffrage œuvre' }),
];

describe('checklist', () => {
  it('groupe par lot (ordre des lots) puis phase, compteur validés/total', () => {
    const g = grouper(points, lots, tous);
    expect(g.map((x) => `${x.lot}/${x.phase} ${x.valides}/${x.total}`)).toEqual(['VRD/execution 1/2', 'GO/preparation 1/1', 'GO/execution 0/2']);
    expect(g[2].points.map((p) => p.uid)).toEqual([1, 5]);
  });
  it('filtres : bloquants non validés, état, lot, texte sans accents', () => {
    const uids = (f: Partial<Filtres>) => grouper(points, lots, { ...tous, ...f }).flatMap((g) => g.points.map((p) => p.uid));
    expect(uids({ etat: 'bloquants' })).toEqual([3, 1]);
    expect(uids({ etat: 'non_conforme' })).toEqual([3]);
    expect(uids({ lot: 'GO' })).toEqual([2, 1, 5]);
    expect(uids({ texte: 'reception fouille' })).toEqual([1]);
    expect(uids({ texte: 'oeuvre' })).toEqual([5]);
    expect(uids({ texte: 'dtu 13' })).toEqual([1]);
    expect(correspond(points[0], { ...tous, texte: 'inexistant' })).toBe(false);
  });
  it('statistiques', () => {
    expect(statistiques(points)).toEqual({ total: 5, conformes: 1, sansObjet: 1, nonConformes: 1, enCours: 1, aFaire: 1, bloquants: 2, nonConformesBloquants: 1 });
  });
});
