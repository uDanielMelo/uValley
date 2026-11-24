import { describe, expect, it } from 'vitest';
import { tileIndex, withTile } from '../grid';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import type { GameState, Task } from '../types';

/** Free owned grass, away from the yard. */
const FREE = tileIndex(22, 40);
const FREE2 = tileIndex(23, 40);

const reload = (s: GameState): GameState => {
  const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
  if (!loaded) throw new Error('save did not load');
  return loaded.game;
};

describe('fence save', () => {
  it('round-trips a fence and a gate through the save', () => {
    const s0 = createInitialState();
    let tiles = withTile(s0.tiles, FREE, { state: 'grass', fence: {} });
    tiles = withTile(tiles, FREE2, { state: 'grass', fence: { gate: true, open: true } });
    const loaded = reload({ ...s0, tiles });
    expect(loaded.tiles[FREE]).toEqual({ state: 'grass', fence: {} });
    expect(loaded.tiles[FREE2]).toEqual({ state: 'grass', fence: { gate: true, open: true } });
  });

  it('round-trips a queued fence task', () => {
    const s0 = createInitialState();
    const task: Task = { id: s0.nextId, kind: 'build', tile: FREE, cropId: null, workerId: null, job: { type: 'fence', remove: false, cost: 6 } };
    const loaded = reload({ ...s0, tasks: [task], nextId: s0.nextId + 1 });
    expect(loaded.tasks.find((t) => t.id === task.id)?.job).toEqual({ type: 'fence', remove: false, cost: 6 });
  });

  it('rejects a fence on a road tile in a save', () => {
    const s0 = createInitialState();
    const tiles = withTile(s0.tiles, FREE, { state: 'grass', road: true, fence: {} });
    expect(deserialize(serialize({ ...s0, tiles }, DEFAULT_SETTINGS))).toBeNull();
  });
});
