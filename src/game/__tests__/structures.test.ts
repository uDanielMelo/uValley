import { describe, expect, it } from 'vitest';
import { ROAD_COST } from '../../data/roads';
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
  hasRoadAccess,
  placeStructure,
  refundFor,
  ringCells,
  structureAt,
} from '../structures';
import type { ActionResult, GameState } from '../types';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// The starting area is tiles 16..47 × 32..63; the house covers 30–31 × 56–57, by the south edge.
const FREE_X = 28;
const FREE_Y = 44;

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
    // The price includes the 10 road tiles of its ring.
    expect(s.money).toBe(s0.money - (STRUCTURES.chickenCoop.cost ?? 0) - 10 * ROAD_COST);
    expect(s.structures).toHaveLength(s0.structures.length + 1);
    // The coop is 2×1 tiles (7 × 3.5 m), with its road ring around it.
    for (const [x, y] of [[28, 44], [29, 44]] as const) {
      expect(s.tiles[tileIndex(x, y)]?.structure).toBe('chickenCoop');
    }
    expect(s.tiles[tileIndex(30, 44)]?.structure).toBeUndefined();
    expect(s.tiles[tileIndex(28, 45)]?.structure).toBeUndefined();
    expect(structureAt(s, tileIndex(29, 44))?.type).toBe('chickenCoop');
    for (const c of ringCells('chickenCoop', FREE_X, FREE_Y, 0)) expect(s.tiles[tileIndex(c.x, c.y)]?.road).toBe(true);
    // Placed at once (dev tools), it also gets a road linking it to the yard, so it works.
    const coop = s.structures[s.structures.length - 1];
    expect(coop && hasRoadAccess(s.tiles, coop)).toBe(true);
  });

  it('swaps width and depth on odd rotations', () => {
    expect(footprintOf('warehouse', 0, 0, 0)).toMatchObject({ width: 3, depth: 2 });
    expect(footprintOf('warehouse', 0, 0, 1)).toMatchObject({ width: 2, depth: 3 });
    const s = unwrap(placeStructure(createInitialState(), 'warehouse', FREE_X, FREE_Y, 1));
    expect(s.tiles[tileIndex(29, 46)]?.structure).toBe('warehouse');
    expect(s.tiles[tileIndex(30, 44)]?.structure).toBeUndefined();
  });

  it('centers the footprint on the hovered tile', () => {
    expect(anchorFor('barn', 30, 46, 0)).toEqual({ x: 29, y: 45 });
    expect(anchorFor('silo', 30, 46, 0)).toEqual({ x: 30, y: 46 });
  });

  it('rejects overlap, locked land, the map edge, worked soil, queued tiles and lack of money', () => {
    const s = createInitialState();
    expect(checkPlacement(s, 'chickenCoop', 30, 56, 0)).toBe('structure');
    expect(checkPlacement(s, 'chickenCoop', 14, 44, 0)).toBe('locked');
    expect(checkPlacement(s, 'chickenCoop', 63, 44, 0)).toBe('out-of-bounds');
    // Its road ring must fit on owned land too.
    expect(checkPlacement(s, 'chickenCoop', 16, 44, 0)).toBe('no-room-for-road');
    // Decorations need no ring.
    expect(checkPlacement(s, 'lampPost', 16, 44, 0)).toBeNull();
    expect(checkPlacement(s, 'house', FREE_X, FREE_Y, 0)).toBe('not-buildable');
    const queued = unwrap(toggleTask(s, 'hoe', tileIndex(29, 44), 'wheat'));
    expect(checkPlacement(queued, 'chickenCoop', FREE_X, FREE_Y, 0)).toBe('tile-busy');
    const tilled = { ...s, tiles: s.tiles.map((t, i) => (i === tileIndex(29, 44) ? { state: 'tilled' as const } : t)) };
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
    const s0 = { ...base, animals: [{ ...animal, x: 28.6, y: 44.4 }] };
    // Coop at (28, 44)-(29, 44): the animal stands near its north wall, so it leaves that way.
    const s = unwrap(placeStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    const moved = s.animals[0];
    if (!moved) throw new Error('no animal');
    expect(moved.y).toBeLessThan(FREE_Y);
    expect(s.tiles[tileIndex(Math.floor(moved.x), Math.floor(moved.y))]?.state).toBe('grass');
  });

  it('blocks worker paths and tool use on the new tiles', () => {
    const s = unwrap(placeStructure(createInitialState(), 'chickenCoop', FREE_X, FREE_Y));
    expect(toggleTask(s, 'hoe', tileIndex(28, 44), 'wheat')).toEqual({ ok: false, error: 'structure' });
  });
});

describe('demolition', () => {
  it('removes the structure, frees its tiles and refunds part of the cost', () => {
    const built = unwrap(placeStructure(createInitialState(), 'barn', FREE_X, FREE_Y));
    const s = unwrap(demolishStructure(built, tileIndex(30, 46)));
    expect(s.money).toBe(built.money + refundFor('barn'));
    expect(s.structures.some((x) => x.type === 'barn')).toBe(false);
    expect(s.tiles[tileIndex(30, 46)]).toEqual({ state: 'grass' });
  });

  it('cannot demolish the house or empty ground', () => {
    const s = createInitialState();
    expect(demolishStructure(s, tileIndex(30, 56))).toEqual({ ok: false, error: 'not-demolishable' });
    expect(demolishStructure(s, tileIndex(28, 44))).toEqual({ ok: false, error: 'no-structure' });
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
    const stale = { ...s, tiles: s.tiles.map((t, i) => (i === tileIndex(28, 45) ? { ...t, structure: 'chickenCoop' as const } : t)) };
    const loaded = deserialize(serialize(stale, DEFAULT_SETTINGS));
    expect(loaded?.game.tiles[tileIndex(28, 45)]?.structure).toBeUndefined();
    expect(loaded?.game.tiles[tileIndex(29, 44)]?.structure).toBe('chickenCoop');
  });

});
