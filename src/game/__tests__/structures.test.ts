import { describe, expect, it } from 'vitest';
import { STRUCTURES } from '../../data/structures';
import { spawnAnimals } from '../dev';
import { tileIndex } from '../grid';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import {
  anchorFor,
  checkPlacement,
  demolishStructure,
  footprintOf,
  placeStructure,
  refundFor,
  structureAt,
} from '../structures';
import type { ActionResult, GameState } from '../types';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// The starting area is tiles 12..19 on both axes; the house covers 15–16 × 15–16.
const FREE_X = 12;
const FREE_Y = 12;

describe('structure placement', () => {
  it('starts with the house, shipping bin and bunkhouse as placed instances', () => {
    const s = createInitialState();
    expect(s.structures.map((x) => x.type)).toEqual(['house', 'shippingBin', 'bunkhouse']);
    expect(new Set([...s.workers.map((w) => w.id), ...s.structures.map((x) => x.id)]).size).toBe(
      s.workers.length + s.structures.length,
    );
    expect(s.nextId).toBeGreaterThan(Math.max(...s.structures.map((x) => x.id)));
  });

  it('builds a structure, charges it and marks its tiles', () => {
    const s0 = createInitialState();
    const s = unwrap(placeStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    expect(s.money).toBe(s0.money - (STRUCTURES.chickenCoop.cost ?? 0));
    expect(s.structures).toHaveLength(s0.structures.length + 1);
    // The coop is 2×1 tiles (7 × 3.5 m).
    for (const [x, y] of [[12, 12], [13, 12]] as const) {
      expect(s.tiles[tileIndex(x, y)]?.structure).toBe('chickenCoop');
    }
    expect(s.tiles[tileIndex(14, 12)]?.structure).toBeUndefined();
    expect(s.tiles[tileIndex(12, 13)]?.structure).toBeUndefined();
    expect(structureAt(s, tileIndex(13, 12))?.type).toBe('chickenCoop');
  });

  it('swaps width and depth on odd rotations', () => {
    expect(footprintOf('warehouse', 0, 0, 0)).toMatchObject({ width: 3, depth: 2 });
    expect(footprintOf('warehouse', 0, 0, 1)).toMatchObject({ width: 2, depth: 3 });
    const s = unwrap(placeStructure(createInitialState(), 'warehouse', FREE_X, FREE_Y, 1));
    expect(s.tiles[tileIndex(13, 14)]?.structure).toBe('warehouse');
    expect(s.tiles[tileIndex(14, 12)]?.structure).toBeUndefined();
  });

  it('centers the footprint on the hovered tile', () => {
    expect(anchorFor('barn', 14, 14, 0)).toEqual({ x: 13, y: 13 });
    expect(anchorFor('silo', 14, 14, 0)).toEqual({ x: 14, y: 14 });
  });

  it('rejects overlap, locked land, the map edge, worked soil, queued tiles and lack of money', () => {
    const s = createInitialState();
    expect(checkPlacement(s, 'chickenCoop', 14, 15, 0)).toBe('structure');
    expect(checkPlacement(s, 'chickenCoop', 11, 12, 0)).toBe('locked');
    expect(checkPlacement(s, 'chickenCoop', 31, 12, 0)).toBe('out-of-bounds');
    expect(checkPlacement(s, 'house', FREE_X, FREE_Y, 0)).toBe('not-buildable');
    const queued = unwrap(toggleTask(s, 'hoe', tileIndex(13, 12), 'wheat'));
    expect(checkPlacement(queued, 'chickenCoop', FREE_X, FREE_Y, 0)).toBe('tile-busy');
    const tilled = { ...s, tiles: s.tiles.map((t, i) => (i === tileIndex(13, 12) ? { state: 'tilled' as const } : t)) };
    expect(checkPlacement(tilled, 'chickenCoop', FREE_X, FREE_Y, 0)).toBe('not-grass');
    expect(checkPlacement({ ...s, money: 10 }, 'chickenCoop', FREE_X, FREE_Y, 0)).toBe('not-enough-money');
    expect(placeStructure({ ...s, money: 10 }, 'chickenCoop', FREE_X, FREE_Y)).toEqual({
      ok: false,
      error: 'not-enough-money',
    });
  });

  it('moves animals out of the new footprint onto free land', () => {
    const base = spawnAnimals(createInitialState(), 'pig', 1);
    const animal = base.animals[0];
    if (!animal) throw new Error('no animal');
    const s0 = { ...base, animals: [{ ...animal, x: 12.6, y: 12.4 }] };
    // Coop at (12,12)-(13,12): west and north are locked, so it must exit south.
    const s = unwrap(placeStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    const moved = s.animals[0];
    if (!moved) throw new Error('no animal');
    expect(moved.y).toBeGreaterThanOrEqual(13);
    expect(s.tiles[tileIndex(Math.floor(moved.x), Math.floor(moved.y))]?.state).toBe('grass');
  });

  it('blocks worker paths and tool use on the new tiles', () => {
    const s = unwrap(placeStructure(createInitialState(), 'chickenCoop', FREE_X, FREE_Y));
    expect(toggleTask(s, 'hoe', tileIndex(12, 12), 'wheat')).toEqual({ ok: false, error: 'structure' });
  });
});

describe('demolition', () => {
  it('removes the structure, frees its tiles and refunds part of the cost', () => {
    const built = unwrap(placeStructure(createInitialState(), 'barn', FREE_X, FREE_Y));
    const s = unwrap(demolishStructure(built, tileIndex(14, 14)));
    expect(s.money).toBe(built.money + refundFor('barn'));
    expect(s.structures.some((x) => x.type === 'barn')).toBe(false);
    expect(s.tiles[tileIndex(14, 14)]).toEqual({ state: 'grass' });
  });

  it('cannot demolish the house or empty ground', () => {
    const s = createInitialState();
    expect(demolishStructure(s, tileIndex(15, 15))).toEqual({ ok: false, error: 'not-demolishable' });
    expect(demolishStructure(s, tileIndex(12, 12))).toEqual({ ok: false, error: 'no-structure' });
  });
});

describe('structure saves', () => {
  it('round-trips placed structures', () => {
    const s = unwrap(placeStructure(createInitialState(), 'silo', FREE_X, FREE_Y, 2));
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
    expect(loaded?.game.structures).toEqual(s.structures);
  });

  it('rebuilds tile flags from the structure list on load', () => {
    const s = unwrap(placeStructure(createInitialState(), 'chickenCoop', FREE_X, FREE_Y));
    // A stale flag (e.g. from an older, bigger footprint) is dropped on load.
    const stale = { ...s, tiles: s.tiles.map((t, i) => (i === tileIndex(12, 13) ? { ...t, structure: 'chickenCoop' as const } : t)) };
    const loaded = deserialize(serialize(stale, DEFAULT_SETTINGS));
    expect(loaded?.game.tiles[tileIndex(12, 13)]?.structure).toBeUndefined();
    expect(loaded?.game.tiles[tileIndex(13, 12)]?.structure).toBe('chickenCoop');
  });

  it('migrates a v3 save by adding the starting structures (and the bunkhouse in v6)', () => {
    const s = createInitialState();
    const { structures: _omit, ...v3game } = s;
    const raw = JSON.stringify({ saveVersion: 3, savedAt: 0, game: { ...v3game, nextId: 10 }, settings: DEFAULT_SETTINGS });
    const loaded = deserialize(raw);
    expect(loaded?.game.structures.map((x) => [x.type, x.id])).toEqual([
      ['house', 10],
      ['shippingBin', 11],
      ['bunkhouse', 12],
    ]);
    // Then the v6 hiring board takes the next ids.
    expect(loaded?.game.candidates.map((c) => c.id)).toEqual([13, 14, 15, 16]);
    expect(loaded?.game.nextId).toBe(17);
  });
});
