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
