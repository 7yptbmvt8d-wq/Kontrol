import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importerChantier, validerImport } from '../src/domain/import';
import { chargerChantier } from '../src/services/exports/donnees';
import { creerReserve, lever } from '../src/services/reserves';
import { actionsReprises, changementsDepuis, compteRendu, nouvelleReunion } from '../src/domain/reunion';
import type { Reunion } from '../src/domain/types';

const exemple = readFileSync(new URL('../exemples/chantier-exemple.json', import.meta.url), 'utf8');

describe('mode réunion', () => {
  it('participants : MOE, intervenants par lot, participants libres reconduits', async () => {
    const id = await importerChantier(validerImport(exemple).donnees!, '2026-08-03');
    const d = await chargerChantier(id);
    const prec = { participants: [{ cle: 'x', nom: 'M. Rossi', role: 'MOA', presence: 'present' }], observations: [], numero: 1 } as unknown as Reunion;
    const r = nouvelleReunion(id, 2, d.intervenants, d.lots, prec, new Date('2026-11-08T09:30:00'));
    expect(r.participants.map((p) => `${p.nom}|${p.role}|${p.lotCode ?? ''}|${p.presence ?? ''}`)).toEqual([
      'Représentant du MOE|Maîtrise d’œuvre||present',
      'Moretti GO|Titulaire|GO|', 'Étanchéité Corse Sud|Sous-traitant|GO|',
      'CVC Lanterna|Titulaire|CVC|', 'Calorifuge Méditerranée|Sous-traitant|CVC|',
      'M. Rossi|MOA||',
    ]);
    expect(r).toMatchObject({ numero: 2, date: '2026-11-08', heure: '09:30', type: 'chantier', cloturee: false });
  });

  it('actions non soldées reprises avec le n° de la réunion d’origine', () => {
    const prec = { numero: 3, observations: [
      { id: 'a', texte: 'Fournir le planning', responsable: 'Entreprise', echeance: '2026-11-10', faite: false, lotCode: 'GO' },
      { id: 'b', texte: 'Fait', responsable: 'MOE', faite: true },
      { id: 'c', texte: 'Information sans échéance', responsable: 'MOA', faite: false },
      { id: 'd', texte: 'Reprise ancienne', responsable: 'MOA', echeance: '2026-11-20', faite: false, reprise: 1 },
    ] } as unknown as Reunion;
    const r = actionsReprises(prec);
    expect(r.map((o) => [o.texte, o.reprise, o.lotCode])).toEqual([['Fournir le planning', 3, 'GO'], ['Reprise ancienne', 1, undefined]]); // sans échéance : non reprise
    expect(r[0].id).not.toBe('a');
  });

  it('changements depuis la réunion précédente et compte rendu', async () => {
    const d0 = await chargerChantier(1);
    const prec = nouvelleReunion(1, 1, d0.intervenants, d0.lots, undefined, new Date(Date.now() - 3600_000));
    const base = { chantierId: 1, lotCode: 'GO', entreprise: 'Moretti GO', localisation: 'R+1', gravite: 'majeure' as const, origine: 'cr' as const, photoIds: [] };
    const r1 = await creerReserve({ ...base, description: 'Fissure enduit', echeance: '2026-12-01' });
    await creerReserve({ ...base, description: 'Joint absent', echeance: '2026-12-01' });
    await lever(r1.id!, '2026-11-08', []);
    const d = await chargerChantier(1);
    const c = changementsDepuis(prec.creeLe, d);
    expect(c.reservesCreees).toHaveLength(2);
    expect(c.reservesLevees).toEqual(['R-01 [GO] Fissure enduit']);

    const r = nouvelleReunion(1, 2, d.intervenants, d.lots, prec);
    r.participants[1].presence = 'absent';
    r.observations.push({ id: 'o1', lotCode: 'GO', texte: 'Transmettre la note de calcul', responsable: 'Entreprise', echeance: '2026-11-15', faite: false });
    r.prochaine = '2026-11-15';
    const t = compteRendu(r, d, prec);
    expect(t).toContain('COMPTE RENDU — RÉUNION DE CHANTIER N°2');
    expect(t).toContain('Absents : Moretti GO (Titulaire GO)');
    expect(t).toContain('2. DEPUIS LA RÉUNION N°1');
    expect(t).toContain('Réserves levées (1) :');
    expect(t).toContain('- Transmettre la note de calcul — Entreprise — échéance 15/11/2026');
    expect(t).toContain('Réserves non levées (1) :');
    expect(t).toContain('Réunion de chantier le 15/11/2026.');
  });
});

describe('représentant du MOE', () => {
  it('libellé selon le profil saisi dans les Réglages', async () => {
    const { participantMoe } = await import('../src/domain/reunion');
    expect(participantMoe()).toMatchObject({ nom: 'Représentant du MOE', role: 'Maîtrise d’œuvre', presence: 'present' });
    expect(participantMoe({ nom: 'M. Deraedt', fonction: '', organisme: 'SID – BMO Corse' }))
      .toMatchObject({ nom: 'M. Deraedt', role: 'Représentant du MOE – SID – BMO Corse' });
    expect(participantMoe({ nom: '', fonction: 'Représentant du MOE', organisme: 'USID Corse' }))
      .toMatchObject({ nom: 'Représentant du MOE', role: 'USID Corse' });
  });
});

describe('points à suivre', () => {
  it('prioritaires triés (non conformes, retards, en cours, échéance à 15 j) ; autres bloquants à part', async () => {
    const { pointsASuivre } = await import('../src/domain/reunion');
    const ch = { dateOS: '2026-10-01' } as never;
    const pt = (uid: number, etat: string, bloquant: boolean, valeur?: string) =>
      ({ uid, id: `P${uid}`, lot: 'GO', etat, bloquant, ordre: uid, echeance: valeur ? { type: 'relative', valeur } : { type: 'evenement', valeur: 'avant coulage' } }) as never;
    const r = pointsASuivre([
      pt(1, 'a_faire', true), // bloquant sans échéance → autres
      pt(2, 'en_cours', false), // en cours
      pt(3, 'a_faire', false, '30'), // échéance 31/10 dépassée
      pt(4, 'non_conforme', false), // non conforme
      pt(5, 'a_faire', false, '45'), // échéance 15/11 : dans 7 j
      pt(6, 'a_faire', false, '90'), // lointaine, non bloquant → ignoré
      pt(7, 'conforme', true), // validé → ignoré
    ], ch, [], '2026-11-08');
    expect(r.prioritaires.map((p) => (p as { uid: number }).uid)).toEqual([4, 3, 2, 5]);
    expect(r.autresBloquants.map((p) => (p as { uid: number }).uid)).toEqual([1]);
  });
});
