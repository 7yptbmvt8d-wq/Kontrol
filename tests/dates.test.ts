import { describe, expect, it } from 'vitest';
import { ajouterJours, contexte, dateJalon, ecartJours, fmtDate, lireDate, lireRelatif, statutJalon, datePoint } from '../src/domain/dates';
import type { Chantier, Jalon, Lot, PointControle } from '../src/domain/types';

const ch: Chantier = { id: 1, nom: 'X', operation: '', site: '', phase: 'execution', avancementTravaux: 0, dateOS: '2026-08-03', compteurReserve: 0, creeLe: '', majLe: '' };
const lot = (code: string, p: Partial<Lot> = {}): Lot => ({ chantierId: 1, code, intitule: '', numeroMarche: '', ordre: 0, ...p });
const jalon = (p: Partial<Jalon>): Jalon => ({ id: 'J', chantierId: 1, categorie: 'documentaire', intitule: '', articleCcap: '', reference: 'OS_demarrage', jours: 0, ordre: 0, ...p });

describe('dates', () => {
  it('ajoute des jours et calcule les écarts (y compris changement d’heure)', () => {
    expect(ajouterJours('2026-10-20', 10)).toBe('2026-10-30');
    expect(ajouterJours('2026-03-25', 7)).toBe('2026-04-01');
    expect(ecartJours('2026-03-28', '2026-03-30')).toBe(2);
    expect(ecartJours('2026-10-24', '2026-10-26')).toBe(2);
  });
  it('lit et formate les dates', () => {
    expect(lireDate('30/06/2027')).toBe('2027-06-30');
    expect(lireDate('2027-06-30')).toBe('2027-06-30');
    expect(lireDate('31/02/2027')).toBeUndefined();
    expect(fmtDate('2027-06-30')).toBe('30/06/2027');
  });
  it('lit les échéances relatives', () => {
    expect(lireRelatif('30')).toBe(30);
    expect(lireRelatif('J+30')).toBe(30);
    expect(lireRelatif('OS-15')).toBe(-15);
    expect(lireRelatif('OS + 45 j')).toBe(45);
    expect(lireRelatif('bientôt')).toBeUndefined();
  });
});

describe('contexte par marché', () => {
  const jalons = [
    jalon({ id: 'D', categorie: 'delai', jours: 243 }),
    jalon({ id: 'Dcvc', categorie: 'delai', jours: 100, lotCode: 'CVC' }),
    jalon({ id: 'DOE', reference: 'reception', jours: 30 }),
  ];
  const lots = [lot('GO'), lot('CVC', { dateOS: '2026-09-01' })];

  it('ensemble : OS générale + délai commun', () => {
    const c = contexte(ch, lots, jalons);
    expect(c).toMatchObject({ dateOS: '2026-08-03', delai: 243, reception: '2027-04-03', receptionReelle: false });
  });
  it('lot sans OS ni délai propres : hérite de l’ensemble', () => {
    expect(contexte(ch, lots, jalons, 'GO')).toMatchObject({ dateOS: '2026-08-03', delai: 243, reception: '2027-04-03' });
  });
  it('lot avec OS et délai propres', () => {
    expect(contexte(ch, lots, jalons, 'CVC')).toMatchObject({ dateOS: '2026-09-01', delai: 100, reception: '2026-12-10' });
  });
  it('lot avec OS propre sans délai propre : OS du lot + délai commun', () => {
    const l2 = [lot('GO', { dateOS: '2026-09-01' })];
    const c = contexte(ch, l2, jalons, 'GO');
    expect(c).toMatchObject({ dateOS: '2026-09-01', delai: 243, reception: '2027-05-02' });
    expect(dateJalon(jalons[0], c)).toBe(c.reception); // fin de délai = réception prévisionnelle
  });
  it('lot sans OS ni délai propres : réception réelle de l’ensemble', () => {
    expect(contexte({ ...ch, dateReceptionReelle: '2027-04-20' }, lots, jalons, 'GO')).toMatchObject({ reception: '2027-04-20', receptionReelle: true });
  });
  it('réception réelle du lot prioritaire', () => {
    const l2 = [lot('GO', { dateReceptionReelle: '2027-05-15' })];
    expect(contexte(ch, l2, jalons, 'GO')).toMatchObject({ reception: '2027-05-15', receptionReelle: true });
  });
  it('jalon commun calculé avec le contexte du lot', () => {
    expect(dateJalon(jalons[2], contexte(ch, lots, jalons, 'CVC'))).toBe('2027-01-09');
    expect(dateJalon(jalons[2], contexte(ch, lots, jalons))).toBe('2027-05-03');
  });
  it('statut des jalons', () => {
    expect(statutJalon(jalon({}), '2026-11-01', '2026-11-07')).toBe('en_retard');
    expect(statutJalon(jalon({}), '2026-11-07', '2026-11-07')).toBe('a_venir');
    expect(statutJalon(jalon({ dateRealisee: '2026-11-02' }), '2026-11-01', '2026-11-07')).toBe('fait');
    expect(statutJalon(jalon({}), undefined)).toBe('non_date');
  });
  it('échéance d’un point relative à l’OS de son lot', () => {
    const p = { lot: 'CVC', echeance: { type: 'relative', valeur: 'J+30' } } as PointControle;
    expect(datePoint(p, ch, lots)).toBe('2026-10-01');
    expect(datePoint({ ...p, lot: 'GO' }, ch, lots)).toBe('2026-09-02');
  });
});

describe('période de préparation et échéances en texte', () => {
  // Cas Ventiseri : OS de démarrage de la PP le 06/08/2026, PP de 60 j non comprise, délai de 480 j
  const chPP: Chantier = { ...ch, dateOS: '2026-08-06', dureePreparation: 60, preparationComprise: false };
  const jalons = [
    jalon({ id: 'PP', categorie: 'delai', reference: 'fin_preparation', jours: 0 }),
    jalon({ id: 'D', categorie: 'delai', reference: 'OS_demarrage', jours: 480 }),
    jalon({ id: 'AV', categorie: 'paiement', reference: 'OS_demarrage', jours: 30 }),
  ];
  const pt = (valeur: string): PointControle => ({
    id: 'P', chantierId: 1, lot: 'GO', articleCctp: '', phase: 'preparation', type: 'document', intitule: '', critere: '', reference: '',
    responsable: 'entreprise', echeance: { type: 'evenement', valeur }, bloquant: true, ordre: 0, etat: 'a_faire', commentaire: '', photoIds: [],
  });

  it('PP non comprise : le délai part de la fin de la PP', async () => {
    const { calculJalon } = await import('../src/domain/dates');
    const c = contexte(chPP, [lot('GO')], jalons);
    expect(c.finPreparation).toBe('2026-10-05');
    expect(c.debutDelai).toBe('2026-10-05');
    expect(c.reception).toBe(ajouterJours('2026-10-05', 480));
    expect(dateJalon(jalons[0], c)).toBe('2026-10-05');
    expect(dateJalon(jalons[1], c)).toBe(c.reception);
    expect(dateJalon(jalons[2], c)).toBe('2026-09-05'); // l'avance : OS + 30, pas début des travaux + 30
    expect(calculJalon(jalons[1], c)).toBe('Début d’exécution + 480 j');
    expect(calculJalon(jalons[0], c)).toBe('Fin de préparation');
  });
  it('PP comprise (CCAG) : le délai part de l’OS ; début des travaux saisi prioritaire', () => {
    const c = contexte({ ...chPP, preparationComprise: true }, [], jalons);
    expect([c.finPreparation, c.debutDelai, c.reception]).toEqual(['2026-10-05', '2026-08-06', ajouterJours('2026-08-06', 480)]);
    const c2 = contexte({ ...chPP, dateDebutTravaux: '2026-10-12' }, [], jalons);
    expect([c2.finPreparation, c2.debutDelai]).toEqual(['2026-10-12', '2026-10-12']);
  });
  it('OS n° 1 avec ses trois dates : début de PP, début et fin d’exécution', async () => {
    const { calculJalon } = await import('../src/domain/dates');
    const ch3: Chantier = { ...ch, dateOS: '2026-08-06', dateDebutTravaux: '2026-10-06', dateFinExecution: '2028-01-26', dureePreparation: 60, preparationComprise: false };
    const c = contexte(ch3, [lot('GO')], jalons);
    expect([c.finPreparation, c.debutDelai, c.reception]).toEqual(['2026-10-06', '2026-10-06', '2028-01-26']);
    expect(c.delai).toBe(ecartJours('2026-10-06', '2028-01-26'));
    expect(dateJalon(jalons[1], c)).toBe('2028-01-26'); // délai global = fin d'exécution de l'OS
    expect(calculJalon(jalons[1], c)).toBe('Fin d’exécution (OS n° 1)');
    expect(dateJalon(jalons[0], c)).toBe('2026-10-06'); // fin de la PP = début d'exécution
    // Même résultat pour un marché sans OS propre ; « comprise » sans effet quand les dates sont données
    expect(contexte({ ...ch3, preparationComprise: true }, [lot('GO')], jalons, 'GO').reception).toBe('2028-01-26');
    expect(datePoint(pt('avant fin de la période de préparation'), ch3, [lot('GO')], jalons)).toBe('2026-10-06');
    expect(datePoint(pt('au plus tard à la demande de réception'), ch3, [lot('GO')], jalons)).toBe('2028-01-26');
  });
  it('prolongations de délai et alerte OPR à 60 jours', async () => {
    const { alerteFinExecution, calculJalon } = await import('../src/domain/dates');
    const ch3: Chantier = { ...ch, dateOS: '2026-08-06', dateDebutTravaux: '2026-10-06', dateFinExecution: '2028-01-26',
      prolongations: [{ id: 'a', acte: 'Avenant n° 1', jours: 30, motif: 'Intempéries' }, { id: 'b', acte: 'OS n° 4', jours: 10, motif: '', lotCode: 'CVC' }] };
    const lots = [lot('GO'), lot('CVC')];
    const c = contexte(ch3, lots, jalons);
    expect([c.finExecution, c.reception, c.prolongation]).toEqual(['2028-02-25', '2028-02-25', 30]);
    expect(dateJalon(jalons[1], c)).toBe('2028-02-25');
    expect(calculJalon(jalons[1], c)).toBe('Fin d’exécution (OS n° 1) + 30 j de prolongation');
    // Prolongation propre au marché CVC : s'ajoute pour ce marché seulement
    expect(contexte(ch3, lots, jalons, 'CVC').reception).toBe('2028-03-06');
    expect(contexte(ch3, lots, jalons, 'GO').reception).toBe('2028-02-25');
    // Alerte : rien à J-61, « OPR à programmer » à J-60, « dépassée » après ; rien une fois en phase OPR
    expect(alerteFinExecution(c, 'execution', '2027-12-26')).toBeUndefined();
    expect(alerteFinExecution(c, 'execution', '2027-12-27')).toEqual({ niveau: 'a_programmer', jours: 60, date: '2028-02-25' });
    expect(alerteFinExecution(c, 'execution', '2028-03-01')).toEqual({ niveau: 'depassee', jours: 5, date: '2028-02-25' });
    expect(alerteFinExecution(c, 'opr', '2028-02-01')).toBeUndefined();
    expect(alerteFinExecution(contexte({ ...ch3, dateReceptionReelle: '2028-02-20' }, lots, jalons), 'execution', '2028-02-01')).toBeUndefined();
  });
  it('échéances en texte rattachées aux dates du chantier', () => {
    const d = (v: string) => datePoint(pt(v), chPP, [lot('GO')], jalons);
    const rec = ajouterJours('2026-10-05', 480);
    expect(d('avant fin de la période de préparation')).toBe('2026-10-05');
    expect(d('dès la période de préparation')).toBe('2026-10-05');
    expect(d('au plus tard à la demande de réception')).toBe(rec);
    expect(d('avant réception')).toBe(rec);
    expect(d('pendant l’année de GPA')).toBe(ajouterJours(rec, 365));
    expect(d('15 jours avant la réception')).toBe(ajouterJours(rec, -15));
    expect(d('avant le début des travaux')).toBe('2026-10-05');
    // Événements du déroulement du chantier : pas de date
    for (const v of ['avant commande', 'à la réception du support et après coulage', '3 semaines avant début des travaux de menuiserie', 'à la demande du MOE']) {
      expect(d(v)).toBeUndefined();
    }
  });
});
