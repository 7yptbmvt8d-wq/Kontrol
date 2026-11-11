import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importerChantier, validerImport } from '../src/domain/import';
import { db } from '../src/db/schema';

const exemple = readFileSync(new URL('../exemples/chantier-exemple.json', import.meta.url), 'utf8');

describe('validation', () => {
  it('le fichier d’exemple est valide', () => {
    const r = validerImport(exemple);
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.chantier.lots.map((l) => l.numero_marche)).toEqual(['2026-SID-SE-0412-L01', '2026-SID-SE-0413-L02']);
    expect(r.donnees!.points_controle).toHaveLength(15);
    expect(r.donnees!.jalons).toHaveLength(6);
    expect(r.donnees!.jalons.find((j) => j.id === 'J-PEXE')!.lot).toBe('CVC');
  });
  it('accepte les consignes du prompt d’extraction (fin_preparation, lot "" = commun)', async () => {
    const { PROMPT_EXTRACTION } = await import('../src/domain/promptExtraction');
    for (const ref of ['OS_demarrage', 'fin_preparation', 'reception', 'autre']) expect(PROMPT_EXTRACTION).toContain(ref);
    const d = JSON.parse(exemple);
    d.jalons.push({ id: 'J-DOCPREP', lot: '', categorie: 'documentaire', intitule: 'Documents de préparation', article_ccap: '', echeance: { reference: 'fin_preparation', jours: 0 } });
    d.penalites[0].lot = '';
    const r = validerImport(JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    const j = r.donnees!.jalons.find((x) => x.id === 'J-DOCPREP')!;
    expect([j.lot, j.echeance.reference]).toEqual([undefined, 'fin_preparation']);
  });
  it('tolère le BOM et les nombres à la place de textes', () => {
    const d = JSON.parse(exemple);
    d.chantier.lots[0].numero_marche = 412;
    const r = validerImport('﻿' + JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.chantier.lots[0].numero_marche).toBe('412');
  });
  it('signale les erreurs avec le chemin du champ', () => {
    const d = JSON.parse(exemple);
    d.points_controle[0].phase = 'exec';
    d.points_controle[1].lot = 'ZZ';
    d.jalons[0].lot = 'XX';
    const r = validerImport(JSON.stringify(d));
    expect(r.donnees).toBeUndefined();
    expect(r.erreurs.map((e) => e.chemin)).toEqual([
      'points_controle[0] (GO-1.3-01).phase',
      'points_controle[1] (GO-1.4-01).lot',
      'jalons[0] (J-PREP).lot',
    ]);
  });
  it('avertit si deux lots partagent le même n° de marché', () => {
    const d = JSON.parse(exemple);
    d.chantier.lots[1].numero_marche = d.chantier.lots[0].numero_marche;
    expect(validerImport(JSON.stringify(d)).avertissements.some((a) => a.chemin.endsWith('numero_marche'))).toBe(true);
  });
  it('JSON illisible', () => {
    expect(validerImport('{ pas du json').erreurs[0].chemin).toBe('fichier');
  });
});

describe('import en base', () => {
  it('crée chantier, lots (marchés), intervenants, points, jalons, pénalités', async () => {
    const id = await importerChantier(validerImport(exemple).donnees!, '2026-08-03');
    const lots = await db.lots.where('chantierId').equals(id).toArray();
    expect(lots.map((l) => l.numeroMarche)).toEqual(['2026-SID-SE-0412-L01', '2026-SID-SE-0413-L02']);
    expect(await db.intervenants.where('chantierId').equals(id).count()).toBe(4);
    expect(await db.points.where('chantierId').equals(id).count()).toBe(15);
    expect((await db.jalons.where('chantierId').equals(id).toArray()).filter((j) => j.lotCode === 'CVC')).toHaveLength(1);
    expect((await db.penalites.where('chantierId').equals(id).toArray()).filter((p) => p.lotCode === 'CVC')).toHaveLength(1);
    expect((await db.chantiers.get(id))!.phase).toBe('execution');
  });
});

describe('tolérance aux extractions imparfaites', () => {
  const base = () => JSON.parse(exemple);

  it('jalon sans durée exploitable : importé en « autre » avec avertissement, sans bloquer', () => {
    const d = base();
    d.jalons[0].echeance.jours = '';
    d.jalons[1].echeance.jours = null;
    d.jalons[2].echeance.jours = 'à définir';
    const r = validerImport(JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.jalons.slice(0, 3).map((j) => j.echeance.reference)).toEqual(['autre', 'autre', 'autre']);
    expect(r.avertissements.filter((a) => a.chemin.endsWith('.jours'))).toHaveLength(3);
  });

  it('durées en texte converties en jours calendaires', () => {
    const d = base();
    const cas: [unknown, number][] = [['1 mois', 30], ['J+30', 30], ['2 ans', 730], ['15 jours ouvrés', 21], ['8 mois', 240], ['30', 30], [12.4, 12], ['OS-15', -15]];
    d.jalons = cas.map(([jours], i) => ({ id: `J${i}`, categorie: 'delai', intitule: 'x', echeance: { reference: 'OS_demarrage', jours } }));
    const r = validerImport(JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.jalons.map((j) => j.echeance.jours)).toEqual(cas.map(([, n]) => n));
  });

  it('listes fermées : accents, majuscules et synonymes acceptés', () => {
    const d = base();
    Object.assign(d.points_controle[0], { phase: 'Exécution', type: "Point d'arrêt", responsable: 'Maître d’œuvre', bloquant: 'oui' });
    Object.assign(d.jalons[0], { categorie: 'Délai' });
    d.jalons[0].echeance.reference = 'OS de démarrage';
    Object.assign(d.jalons[1], { categorie: 'Document' });
    const r = validerImport(JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.points_controle[0]).toMatchObject({ phase: 'execution', type: 'point_arret', responsable: 'moe', bloquant: true });
    expect(r.donnees!.jalons[0]).toMatchObject({ categorie: 'delai', echeance: { reference: 'OS_demarrage' } });
    expect(r.donnees!.jalons[1].categorie).toBe('documentaire');
  });

  it('échéance de point vide ou illisible : conservée en texte, sans bloquer', () => {
    const d = base();
    d.points_controle[0].echeance = { type: 'relative', valeur: '' };
    d.points_controle[1].echeance = { type: 'date', valeur: 'fin novembre' };
    d.points_controle[2].echeance = { valeur: 'J+45' };
    d.points_controle[3].echeance = { type: 'relative', valeur: '2 mois' };
    const r = validerImport(JSON.stringify(d));
    expect(r.erreurs).toEqual([]);
    expect(r.donnees!.points_controle.slice(0, 4).map((p) => p.echeance)).toEqual([
      { type: 'evenement', valeur: '' },
      { type: 'evenement', valeur: 'fin novembre' },
      { type: 'relative', valeur: 'J+45' },
      { type: 'relative', valeur: '60' },
    ]);
  });

  it('valeur vraiment inconnue : toujours bloquante', () => {
    const d = base();
    d.points_controle[0].phase = 'demain';
    expect(validerImport(JSON.stringify(d)).erreurs[0].chemin).toBe('points_controle[0] (GO-1.3-01).phase');
  });
});
