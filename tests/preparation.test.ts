import { describe, expect, it } from 'vitest';
import { analyserPreparation } from '../src/domain/preparation';
import type { Jalon } from '../src/domain/types';

const j = (p: Partial<Jalon>) => ({ categorie: 'documentaire' as const, intitule: '', reference: 'OS_demarrage' as const, jours: 0, ...p });

describe('période de préparation lue dans les jalons', () => {
  it('« Fin de la période de préparation OS + 30 » : 30 j, comprise (CCAG)', () => {
    const a = analyserPreparation([j({ categorie: 'delai', intitule: 'Fin de la période de préparation', jours: 30 })]);
    expect([a.duree, a.comprise]).toEqual([30, true]);
    expect(a.corrections).toEqual([{ i: 0, reference: 'fin_preparation', jours: 0 }]);
  });
  it('« non comprise dans le délai » en date libre', () => {
    const a = analyserPreparation([j({ categorie: 'delai', intitule: 'Période de préparation (2 mois, non comprise dans le délai d’exécution)', reference: 'autre', jours: 60 })]);
    expect([a.duree, a.comprise]).toEqual([60, false]);
  });
  it('garanties biennale et décennale sans durée : 2 et 10 ans après la réception', () => {
    const a = analyserPreparation([
      j({ categorie: 'garantie', intitule: 'Garantie biennale de bon fonctionnement', reference: 'autre' }),
      j({ categorie: 'garantie', intitule: 'Garantie décennale', reference: 'autre' }),
    ]);
    expect(a.corrections).toEqual([{ i: 0, reference: 'reception', jours: 730 }, { i: 1, reference: 'reception', jours: 3650 }]);
  });
  it('ne touche pas aux jalons sans rapport, ni à une date déjà saisie', () => {
    const a = analyserPreparation([
      j({ categorie: 'delai', intitule: 'Délai global d’exécution', jours: 480 }),
      j({ intitule: 'Observations sur un ordre de service', reference: 'autre', jours: 15 }),
      j({ intitule: 'Paiement de l’avance après l’OS de démarrage', reference: 'autre', jours: 30, dateFixe: '2026-09-01' }),
    ]);
    expect(a).toEqual({ corrections: [] });
  });
});
