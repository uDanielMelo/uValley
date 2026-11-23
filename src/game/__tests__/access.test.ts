import { describe, expect, it } from 'vitest';
import { addAnimal } from '../animals';
import { orderStructure, previewPlacement } from '../construction';
import { finishAllTasks, setTimeOfDay } from '../dev';
import { tileIndex, tileLine, withTile } from '../grid';
import { addStock, queueShelterChores, shelterFor } from '../shelters';
import { createInitialState } from '../state';
import { storageCapacity } from '../storage';
import { isActive, isCutOff, linkToNetwork } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';

/**
 * Buildings need a road to the access road: the bunkhouse (beds), shelters (new animals, the
 * crew's collection) and storage (room) stand idle without one.
 */

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// Fields north of the yard: no road reaches them.
const FAR = { x: 28, y: 44 };
// Beside the access road: the ring runs along it.
const NEAR = { x: 33, y: 60 };

/** 7:00, plenty of money and one finished building (its ring opened by the crew). */
const built = (type: StructureInstance['type'], at: { x: number; y: number }): GameState =>
  finishAllTasks(unwrap(orderStructure({ ...setTimeOfDay(createInitialState(), 7), money: 100_000 }, type, at.x, at.y)));

const last = (s: GameState): StructureInstance => {
  const found = s.structures[s.structures.length - 1];
  if (!found) throw new Error('no structure');
  return found;
};

/** Opens a road from the far building's ring down to the house's ring. */
const linkFar = (s: GameState): GameState => ({
  ...s,
  tiles: tileLine(tileIndex(FAR.x + 1, FAR.y + 2), tileIndex(FAR.x + 1, 54)).reduce(
    (tiles, i) => withTile(tiles, i, { state: 'grass', road: true }),
    s.tiles,
  ),
});

describe('road access', () => {
  it('the build preview says whether the ring reaches the access road', () => {
    const s = { ...createInitialState(), money: 100_000 };
    expect(previewPlacement(s, 'chickenCoop', NEAR.x, NEAR.y, 0).connects).toBe(true);
    expect(previewPlacement(s, 'chickenCoop', FAR.x, FAR.y, 0).connects).toBe(false);
    // Decorations and the greenhouse need no road to work.
    expect(previewPlacement(s, 'lampPost', FAR.x, FAR.y, 0).connects).toBe(true);
    expect(previewPlacement(s, 'greenhouse', FAR.x, FAR.y, 0).connects).toBe(true);
    // A road queued to the ring counts.
    const queued = tileLine(tileIndex(FAR.x + 1, FAR.y + 2), tileIndex(FAR.x + 1, 54)).reduce<GameState>(
      (acc, tile) => ({
        ...acc,
        tasks: [...acc.tasks, { id: acc.nextId, kind: 'build', tile, cropId: null, workerId: null, job: { type: 'road', remove: false } }],
        nextId: acc.nextId + 1,
      }),
      s,
    );
    expect(previewPlacement(queued, 'chickenCoop', FAR.x, FAR.y, 0).connects).toBe(true);
  });

  it('a shelter without a road takes no animals and its products wait', () => {
    const far = built('chickenCoop', FAR);
    const coop = last(far);
    expect(isCutOff(far, coop)).toBe(true);
    expect(shelterFor(far, 'chicken')).toBe('shelter-no-road');
    expect(addAnimal(far, 'chicken')).toEqual({ ok: false, error: 'shelter-no-road' });
    const stocked = addStock(far, coop.id, 'egg', 3);
    expect(queueShelterChores(stocked).tasks).toHaveLength(stocked.tasks.length);
    // Once a road links it, it works.
    const linked = linkFar(stocked);
    expect(isActive(linked, coop)).toBe(true);
    expect(unwrap(addAnimal(linked, 'chicken')).animals).toHaveLength(1);
    expect(queueShelterChores(linked).tasks).toHaveLength(linked.tasks.length + 1);
  });

  it('storage without a road holds nothing', () => {
    const base = storageCapacity(createInitialState());
    const far = built('silo', FAR);
    expect(storageCapacity(far)).toEqual(base);
    expect(storageCapacity(linkFar(far)).grain).toBeGreaterThan(0);
    expect(storageCapacity(built('silo', NEAR)).grain).toBeGreaterThan(0);
  });

  it('dev placement links what it places', () => {
    const s = built('chickenCoop', FAR);
    const coop = last(s);
    expect(isActive(linkToNetwork(s, coop), coop)).toBe(true);
  });
});
