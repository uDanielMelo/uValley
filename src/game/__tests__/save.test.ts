import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import type { Field, GameState } from '../types';

const reload = (s: GameState): GameState | undefined => deserialize(serialize(s, DEFAULT_SETTINGS))?.game;

/** A v24 save of a game (no soil data). */
const v24 = (s: GameState): string => {
  const raw = JSON.parse(serialize(s, DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
  raw.saveVersion = 24;
  delete raw.game.soilSeed;
  delete raw.game.surveyedPlots;
  delete raw.game.fields;
  return JSON.stringify(raw);
};

describe('soil save data (v25)', () => {
  it('new farm keeps the given soil seed', () => {
    const seeded = createInitialState(42);
    expect(seeded.soilSeed).toBe(42);
    const plain = createInitialState();
    expect(plain.soilSeed).toBeNull();
    expect(plain.surveyedPlots).toEqual([]);
    expect(plain.fields).toEqual([]);
    expect(seeded.tiles.some((t) => t.state === 'tilled')).toBe(false);
  });

  it('v24 save migrates to v25', () => {
    const raw = v24(createInitialState());
    const a = deserialize(raw)?.game;
    const b = deserialize(raw)?.game;
    expect(typeof a?.soilSeed).toBe('number');
    expect(a?.soilSeed).toBe(b?.soilSeed);
    expect(a?.surveyedPlots).toEqual([]);
    expect(a?.fields).toEqual([]);
  });

  it('round-trip keeps soil data', () => {
    const field: Field = { id: 900, name: 'Talhão Norte', x: 20, y: 40, w: 4, h: 3, lastHarvest: { day: 2, units: 5, tiles: 3, soil: 4.5 } };
    const s: GameState = { ...createInitialState(9), surveyedPlots: [5, 6], fields: [field], nextId: 901 };
    const loaded = reload(s);
    expect(loaded?.soilSeed).toBe(9);
    expect(loaded?.surveyedPlots).toEqual([5, 6]);
    expect(loaded?.fields).toEqual([field]);
  });

  it('invalid soil data is dropped', () => {
    const good: Field = { id: 900, name: 'A', x: 20, y: 40, w: 4, h: 3 };
    const raw = JSON.parse(serialize(createInitialState(9), DEFAULT_SETTINGS)) as { game: Record<string, unknown> };
    raw.game.surveyedPlots = [-1, 5, 9999, 5];
    raw.game.fields = [
      good,
      { id: 901, name: 'Zero', x: 10, y: 10, w: 0, h: 3 },
      { id: 902, name: 'Fora', x: 62, y: 10, w: 4, h: 3 },
      { id: 903, name: 'Encosta', x: 22, y: 41, w: 2, h: 2 },
      { id: 904, name: '   ', x: 30, y: 10, w: 2, h: 2 },
    ];
    const loaded = deserialize(JSON.stringify(raw))?.game;
    expect(loaded?.surveyedPlots).toEqual([5]);
    expect(loaded?.fields).toEqual([good]);
  });
});
