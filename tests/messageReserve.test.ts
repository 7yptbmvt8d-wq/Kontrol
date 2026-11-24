import { describe, expect, it } from 'vitest';
import { messageReserve } from '../src/domain/messageReserve';
import type { Chantier, Lot, Reserve } from '../src/domain/types';

const ch = { nom: 'Création d’un atelier NTI 1+' } as Chantier;
const lot = { code: 'VRD', intitule: 'Lot 1 - Terrassement / VRD', numeroMarche: '25 VT 501' } as Lot;
const r = {
  numero: 2, lotCode: 'VRD', entreprise: 'CORSE TRAVAUX', localisation: 'Traversée de route', description: 'Câble télécom 30 paires non protégé',
  gravite: 'majeure', echeance: '2026-12-02', creeLe: '2026-11-24T10:00:00Z', photoIds: [], historique: [], statut: 'ouvert', origine: 'visite', chantierId: 1,
} as Reserve;

describe('message de la fiche de réserve', () => {
  it('objet et corps prêts à envoyer, signés du représentant du MOE', () => {
    const m = messageReserve(r, ch, lot, { nom: 'M. Dupont', fonction: 'Représentant du MOE', organisme: 'SID – USID de Corse' });
    expect(m.objet).toBe('Création d’un atelier NTI 1+ – Réserve R-02 – Câble télécom 30 paires non protégé');
    expect(m.corps).toContain('fiche de la réserve R-02 relevée le 24/11/2026');
    expect(m.corps).toContain('(marché n° 25 VT 501 – lot VRD Lot 1 - Terrassement / VRD)');
    expect(m.corps).toContain('Localisation : Traversée de route');
    expect(m.corps).toContain('avant le 02/12/2026');
    expect(m.corps.trim().split('\n').slice(-3)).toEqual(['M. Dupont', 'Représentant du MOE', 'SID – USID de Corse']);
  });
  it('sans échéance ni profil', () => {
    const m = messageReserve({ ...r, echeance: undefined, localisation: '' }, ch, undefined, { nom: '', fonction: '', organisme: '' });
    expect(m.corps).toContain('dans les meilleurs délais');
    expect(m.corps).not.toContain('Localisation');
    expect(m.corps.trim().endsWith('Cordialement,')).toBe(true);
  });
});
