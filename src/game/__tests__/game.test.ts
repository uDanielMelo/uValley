import { describe, expect, it } from 'vitest';
import { CROPS } from '../../data/crops';
import { PLOT_BASE_COST, STARTING_MONEY, STARTING_SEEDS } from '../../data/economy';
import { MINUTES_PER_DAY } from '../../data/world';
import { applyTool, harvest, plant, till, water } from '../actions';
import { cropStage, isMature } from '../crops';
import { buyPlot, plotCost, plotStatus, produceValue } from '../economy';
import { plotIndex, tileIndex } from '../grid';
import { tick } from '../simulation';
import { DEFAULT_SETTINGS, SAVE_VERSION, deserialize, isOutdatedSave, serialize } from '../save';
import { createInitialState } from '../state';
import { hasRoadAccess, ringCells } from '../structures';
import { daylight, formatClock, toClock } from '../time';
import type { ActionResult, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const FREE_TILE = tileIndex(29, 45);
const LOCKED_TILE = tileIndex(0, 0);
const HOUSE_TILE = tileIndex(30, 56);

describe('initial state', () => {
  it('owns 32x32 tiles by the south edge, with the yard and its roads', () => {
    const s = createInitialState();
    expect(s.tiles).toHaveLength(64 * 64);
    expect(s.tiles.filter((t) => t.state !== 'locked')).toHaveLength(32 * 32);
    // Centered left to right, touching the south edge (the highway side).
    expect(s.tiles[tileIndex(16, 63)]?.state).toBe('grass');
    expect(s.tiles[tileIndex(47, 32)]?.state).toBe('grass');
    expect(s.tiles[tileIndex(15, 63)]?.state).toBe('locked');
    expect(s.tiles[tileIndex(16, 31)]?.state).toBe('locked');
    expect(s.tiles[HOUSE_TILE]?.structure).toBe('house');
    expect(s.tiles[LOCKED_TILE]?.state).toBe('locked');
    // Every starting building has its road ring, linked to the access road.
    for (const x of s.structures) {
      for (const c of ringCells(x.type, x.x, x.y, x.rotation)) expect(s.tiles[tileIndex(c.x, c.y)]?.road).toBe(true);
      expect(hasRoadAccess(s.tiles, x)).toBe(true);
    }
    expect(s.money).toBe(STARTING_MONEY);
  });
});

describe('tile actions', () => {
  it('runs the full till → plant → water → grow → harvest cycle', () => {
    let s = createInitialState();
    s = unwrap(till(s, FREE_TILE));
    expect(s.tiles[FREE_TILE]?.state).toBe('tilled');
    s = unwrap(plant(s, FREE_TILE, 'wheat'));
    expect(s.tiles[FREE_TILE]?.state).toBe('planted');
    expect(s.inventory.seeds.wheat).toBe(STARTING_SEEDS.wheat - 1);
    s = unwrap(water(s, FREE_TILE));
    expect(s.tiles[FREE_TILE]?.state).toBe('watered');

    expect(harvest(s, FREE_TILE)).toEqual({ ok: false, error: 'not-mature' });

    // Wheat needs 20 watered hours, 1.15× faster in spring (about 17.4 h); watered at 06:00 it
    // lasts until midnight (18 h).
    s = tick(s, 12 * 60);
    const midday = s.tiles[FREE_TILE];
    expect(midday?.state).toBe('watered');
    expect(midday?.crop && isMature(midday.crop)).toBe(false);

    s = tick(s, 6 * 60);
    const grown = s.tiles[FREE_TILE];
    // The watering wore off at midnight, but the crop got there first.
    expect(grown?.state).toBe('planted');
    expect(grown?.crop && isMature(grown.crop)).toBe(true);
    expect(grown?.crop && cropStage(grown.crop)).toBe(2);

    s = unwrap(harvest(s, FREE_TILE));
    expect(s.tiles[FREE_TILE]?.state).toBe('tilled');
    expect(s.inventory.produce.wheat).toBe(1);
  });

  it('does not grow unwatered crops', () => {
    let s = createInitialState();
    s = unwrap(plant(unwrap(till(s, FREE_TILE)), FREE_TILE, 'wheat'));
    s = tick(s, 5 * MINUTES_PER_DAY);
    expect(s.tiles[FREE_TILE]?.crop?.growthMinutes).toBe(0);
  });

  it('rejects invalid targets', () => {
    const s = createInitialState();
    expect(till(s, LOCKED_TILE)).toEqual({ ok: false, error: 'locked' });
    expect(till(s, HOUSE_TILE)).toEqual({ ok: false, error: 'structure' });
    expect(till(s, -1)).toEqual({ ok: false, error: 'out-of-bounds' });
    expect(plant(s, FREE_TILE, 'wheat')).toEqual({ ok: false, error: 'not-tilled' });
    expect(water(s, FREE_TILE)).toEqual({ ok: false, error: 'no-crop' });
    const tilled = unwrap(till(s, FREE_TILE));
    expect(plant(tilled, FREE_TILE, 'corn')).toEqual({ ok: false, error: 'no-seeds' });
  });

  it('dispatches by tool', () => {
    const s = unwrap(applyTool(createInitialState(), 'hoe', FREE_TILE, 'wheat'));
    expect(s.tiles[FREE_TILE]?.state).toBe('tilled');
  });
});

describe('economy', () => {
  it('values the produce', () => {
    let s = createInitialState();
    s = { ...s, inventory: { ...s.inventory, produce: { wheat: 2, corn: 1 } } };
    expect(produceValue(s)).toBe(CROPS.wheat.sellPrice * 2 + CROPS.corn.sellPrice);
  });

  it('buys adjacent plots with increasing cost', () => {
    let s = createInitialState();
    const adjacent = plotIndex(12, 8);
    expect(plotStatus(s, adjacent)).toBe('available');
    expect(plotStatus(s, plotIndex(0, 0))).toBe('not-adjacent');
    expect(buyPlot(s, plotIndex(0, 0))).toEqual({ ok: false, error: 'plot-not-adjacent' });

    s = unwrap(buyPlot(s, adjacent));
    expect(s.money).toBe(STARTING_MONEY - PLOT_BASE_COST);
    expect(s.tiles[tileIndex(48, 32)]?.state).toBe('grass');
    expect(plotCost(1)).toBeGreaterThan(plotCost(0));
    expect(buyPlot(s, adjacent)).toEqual({ ok: false, error: 'plot-unlocked' });
  });
});

describe('time', () => {
  it('formats the clock', () => {
    const c = toClock(MINUTES_PER_DAY + 6 * 60 + 5);
    expect(c.day).toBe(2);
    expect(formatClock(c)).toBe('06:05');
  });

  it('is dark at night and bright at noon', () => {
    expect(daylight(2 * 60)).toBe(0);
    expect(daylight(12 * 60)).toBe(1);
  });
});

describe('save', () => {
  it('round-trips the state', () => {
    const s = unwrap(water(unwrap(plant(unwrap(till(createInitialState(), FREE_TILE)), FREE_TILE, 'wheat')), FREE_TILE));
    const loaded = deserialize(serialize(s, { speed: 2, edgePan: true, graphics: 'low' }));
    expect(loaded?.game).toEqual(s);
    expect(loaded?.settings).toEqual({ speed: 2, edgePan: true, graphics: 'low' });
  });

  it('rejects corrupt or future saves', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(JSON.stringify({ saveVersion: 99, game: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ saveVersion: 1, game: { money: 1 } }))).toBeNull();
  });

  it('does not load saves from the smaller map (before v16), and says so', () => {
    const current = serialize(createInitialState(), DEFAULT_SETTINGS);
    const old = current.replace(`"saveVersion":${SAVE_VERSION}`, '"saveVersion":15');
    expect(deserialize(old)).toBeNull();
    expect(isOutdatedSave(old)).toBe(true);
    expect(isOutdatedSave(current)).toBe(false);
    expect(isOutdatedSave('not json')).toBe(false);
  });
});
