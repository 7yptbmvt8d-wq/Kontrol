import { describe, expect, it } from 'vitest';
import { euros, lireBareme, totauxParMarche } from '../src/domain/penalites';
import type { PenaliteAppliquee } from '../src/domain/types';

describe('barème du CCAP', () => {
  it('montants fixes et unités', () => {
    expect(lireBareme('200 € HT par absence')).toEqual({ mode: 'fixe', unitaire: 200, unite: 'absence' });
    expect(lireBareme('50 € HT par jour calendaire de retard')).toEqual({ mode: 'fixe', unitaire: 50, unite: 'jour' });
    expect(lireBareme('50 € HT par manquement constaté')).toEqual({ mode: 'fixe', unitaire: 50, unite: 'manquement' });
    expect(lireBareme('2 000 € HT')).toEqual({ mode: 'fixe', unitaire: 2000, unite: 'forfait' });
    expect(lireBareme('Retenue provisoire de 10 000 € HT, définitive si non remis')).toMatchObject({ mode: 'fixe', unitaire: 10000 });
  });
  it('taux du montant du marché', () => {
    expect(lireBareme('1/1000 du montant HT du marché par jour calendaire', 450000)).toEqual({ mode: 'taux', taux: 0.001, unitaire: 450, unite: 'jour' });
    expect(lireBareme('1/3 000 du montant HT par jour de retard')).toMatchObject({ mode: 'taux', unitaire: undefined, unite: 'jour' });
  });
  it('texte non chiffré', () => {
    expect(lireBareme('20 % du montant HT total du marché').mode).toBe('inconnu');
  });
  it('totaux par marché et format', () => {
    const p = (lotCode: string, montant: number, statut: PenaliteAppliquee['statut']) => ({ lotCode, montant, statut }) as PenaliteAppliquee;
    const t = totauxParMarche([p('TCE', 200, 'constatee'), p('TCE', 450, 'notifiee'), p('VRD', 50, 'retenue')]);
    expect(t.get('TCE')).toMatchObject({ nombre: 2, total: 650, constatee: 200, notifiee: 450 });
    expect(euros(12500)).toBe('12 500 € HT');
    expect(euros(450.5)).toBe('450,50 € HT');
  });
});
