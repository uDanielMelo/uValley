import { describe, expect, it } from 'vitest';
import { growthMinutesNeeded } from '../crops';
import { harvest } from '../actions';
import { addField, fieldAt, fieldRanking, fieldSoil, recordHarvest, removeField, renameField } from '../fields';
import { plotOfTile, tileIndex, withTile } from '../grid';
import { cropRating, soilYield } from '../soil';
import { createInitialState } from '../state';
import type { ActionResult, Field, GameState } from '../types';
import { applyArea, stepWorkers } from '../workers';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const SEED = 11;
const A = tileIndex(20, 40);
const B = tileIndex(23, 42);

const only = (s: GameState): Field => {
  const f = s.fields[0];
  if (!f) throw new Error('no field');
  return f;
};

describe('fields', () => {
  it('creates fields with the next free name', () => {
    let s = unwrap(addField(createInitialState(), A, B));
    expect(only(s)).toMatchObject({ name: 'Talhão 1', x: 20, y: 40, w: 4, h: 3 });
    s = unwrap(addField(s, tileIndex(30, 40), tileIndex(31, 41)));
    expect(s.fields.map((f) => f.name)).toEqual(['Talhão 1', 'Talhão 2']);
    s = unwrap(removeField(s, only(s).id));
    s = unwrap(addField(s, tileIndex(20, 34), tileIndex(21, 35)));
    expect(s.fields.map((f) => f.name).sort()).toEqual(['Talhão 1', 'Talhão 2']);
  });

  it('refuses overlaps and land for sale', () => {
    const s = unwrap(addField(createInitialState(), A, B));
    expect(addField(s, tileIndex(22, 41), tileIndex(25, 44))).toEqual({ ok: false, error: 'field-overlap' });
    expect(addField(s, tileIndex(0, 0), tileIndex(2, 2))).toEqual({ ok: false, error: 'field-not-owned' });
  });

  it('renames and refuses an empty name', () => {
    const s = unwrap(addField(createInitialState(), A, B));
    const id = only(s).id;
    expect(only(unwrap(renameField(s, id, '  Talhão Norte  '))).name).toBe('Talhão Norte');
    expect(only(unwrap(renameField(s, id, 'x'.repeat(50)))).name).toHaveLength(32);
    expect(renameField(s, id, '   ')).toEqual({ ok: false, error: 'field-name-empty' });
  });

  it('finds the field of a tile', () => {
    const s = unwrap(addField(createInitialState(), A, B));
    expect(fieldAt(s.fields, A)?.id).toBe(only(s).id);
    expect(fieldAt(s.fields, tileIndex(24, 40))).toBeUndefined();
  });

  it('fieldSoil counts only surveyed tiles', () => {
    let s = unwrap(addField(createInitialState(SEED), A, B));
    expect(fieldSoil(s, only(s))).toEqual({ surveyed: 0, total: 12, types: {} });
    s = { ...s, surveyedPlots: [plotOfTile(A)] };
    const soil = fieldSoil(s, only(s));
    expect(soil.surveyed).toBeGreaterThan(0);
    expect(soil.surveyed).toBeLessThanOrEqual(12);
    expect(Object.values(soil.types).reduce((a, b) => a + (b ?? 0), 0)).toBe(soil.surveyed);
  });

  it('ranks known crops by their soil, best first', () => {
    let s = unwrap(addField(createInitialState(SEED), A, B));
    expect(fieldRanking(s, only(s))).toEqual([]);
    s = { ...s, surveyedPlots: [plotOfTile(A), plotOfTile(B)] };
    const ranking = fieldRanking(s, only(s));
    expect(ranking.map((r) => r.cropId).sort()).toEqual([...s.research.unlocked].filter((c) => c !== 'strawberry').sort());
    for (let k = 1; k < ranking.length; k++) expect(ranking[k - 1]!.average).toBeGreaterThanOrEqual(ranking[k]!.average);
  });

  it('records the harvests of the day', () => {
    let fields: Field[] = [{ id: 1, name: 'T', x: 20, y: 40, w: 4, h: 3 }];
    fields = recordHarvest(fields, A, 2, 2, 3);
    fields = recordHarvest(fields, tileIndex(21, 40), 1, 1, 3);
    expect(fields[0]?.lastHarvest).toEqual({ day: 3, units: 3, tiles: 2, soil: 3 });
    fields = recordHarvest(fields, A, 1, 0.5, 4);
    expect(fields[0]?.lastHarvest).toEqual({ day: 4, units: 1, tiles: 1, soil: 0.5 });
    expect(recordHarvest(fields, tileIndex(40, 40), 1, 1, 4)).toBe(fields);
  });

  it('harvest updates the field', () => {
    let s = unwrap(addField(createInitialState(SEED), A, B));
    const crop = { cropId: 'wheat' as const, growthMinutes: growthMinutesNeeded({ cropId: 'wheat', growthMinutes: 0 }) };
    s = { ...s, tiles: withTile(s.tiles, A, { state: 'planted', crop }) };
    const after = unwrap(harvest(s, A));
    const last = only(after).lastHarvest;
    const tile = s.tiles[A];
    expect(last?.tiles).toBe(1);
    expect(last?.units).toBe(after.inventory.produce.wheat ?? 0);
    expect(last?.soil).toBe(tile ? soilYield(cropRating(SEED, tile, A, 'wheat')) : -1);
  });
});

describe('field harvest extras', () => {
  it('an extra unit counts without adding a tile', () => {
    let fields: Field[] = [{ id: 1, name: 'T', x: 20, y: 40, w: 4, h: 3 }];
    fields = recordHarvest(fields, A, 2, 2, 3);
    fields = recordHarvest(fields, A, 1, 0, 3, false);
    expect(fields[0]?.lastHarvest).toEqual({ day: 3, units: 3, tiles: 1, soil: 2 });
  });

  it('the worker bonus unit shows in the field harvest', () => {
    let s = unwrap(addField(createInitialState(), A, B));
    const crop = { cropId: 'wheat' as const, growthMinutes: growthMinutesNeeded({ cropId: 'wheat', growthMinutes: 0 }) };
    s = { ...s, tiles: withTile(s.tiles, A, { state: 'planted', crop }) };
    // A very effective worker standing on the tile: the bonus is certain.
    const base = s.workers[0];
    if (!base) throw new Error('no worker');
    const ace = { ...base, stars: 3 as const, skills: ['farming' as const], specialty: { kind: 'crop' as const, id: 'wheat' as const }, priorities: ['hand' as const], x: 20.5, y: 40.5, path: [], taskId: null, progress: 0 };
    s = { ...s, workers: [ace], gameMinutes: 8 * 60 };
    s = applyArea(s, 'hand', [A], 'wheat', 'queue').state;
    for (let m = 0; m < 60 && s.tasks.length > 0; m++) s = stepWorkers({ ...s, gameMinutes: s.gameMinutes + 1 }, 1);
    expect(only(s).lastHarvest?.units).toBe(s.inventory.produce.wheat ?? 0);
  });
});
