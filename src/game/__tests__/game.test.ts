import { describe, expect, it } from 'vitest';
import { CROPS } from '../../data/crops';
import { PLOT_BASE_COST, STARTING_MONEY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../../data/world';
import { applyTool, harvest, plant, till, water } from '../actions';
import { cropStage, isMature } from '../crops';
import { buyPlot, buySeeds, plotCost, plotStatus, sellAllProduce, sellProduce } from '../economy';
import { plotIndex, tileIndex } from '../grid';
import { tick } from '../simulation';
import { deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import { daylight, formatClock, toClock } from '../time';
import type { ActionResult, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const FREE_TILE = tileIndex(13, 13);
const LOCKED_TILE = tileIndex(0, 0);
const HOUSE_TILE = tileIndex(15, 15);

describe('initial state', () => {
  it('unlocks the central 8x8 area and places the house', () => {
    const s = createInitialState();
    expect(s.tiles.filter((t) => t.state !== 'locked')).toHaveLength(64);
    expect(s.tiles[HOUSE_TILE]?.structure).toBe('house');
    expect(s.tiles[LOCKED_TILE]?.state).toBe('locked');
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
    expect(s.inventory.seeds.wheat).toBe(4);
    s = unwrap(water(s, FREE_TILE));
    expect(s.tiles[FREE_TILE]?.state).toBe('watered');

    expect(harvest(s, FREE_TILE)).toEqual({ ok: false, error: 'not-mature' });

    // Wheat needs 20 watered hours; watered at 06:00 lasts until midnight (18h).
    s = tick(s, 18 * 60);
    const afterDay = s.tiles[FREE_TILE];
    expect(afterDay?.state).toBe('planted');
    expect(afterDay?.crop && isMature(afterDay.crop)).toBe(false);

    s = unwrap(water(s, FREE_TILE));
    s = tick(s, 3 * 60);
    const grown = s.tiles[FREE_TILE];
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
  it('buys seeds and sells produce', () => {
    let s = unwrap(buySeeds(createInitialState(), 'corn', 3));
    expect(s.money).toBe(STARTING_MONEY - CROPS.corn.seedCost * 3);
    expect(s.inventory.seeds.corn).toBe(3);
    expect(buySeeds(s, 'tomato', 1000)).toEqual({ ok: false, error: 'not-enough-money' });

    s = { ...s, inventory: { ...s.inventory, produce: { wheat: 2, corn: 1 } } };
    const sold = unwrap(sellProduce(s, 'wheat', 1));
    expect(sold.money).toBe(s.money + CROPS.wheat.sellPrice);
    expect(sellProduce(sold, 'tomato', 1)).toEqual({ ok: false, error: 'no-produce' });
    const all = unwrap(sellAllProduce(s));
    expect(all.money).toBe(s.money + CROPS.wheat.sellPrice * 2 + CROPS.corn.sellPrice);
    expect(all.inventory.produce).toEqual({});
  });

  it('buys adjacent plots with increasing cost', () => {
    let s = createInitialState();
    const adjacent = plotIndex(5, 3);
    expect(plotStatus(s, adjacent)).toBe('available');
    expect(plotStatus(s, plotIndex(0, 0))).toBe('not-adjacent');
    expect(buyPlot(s, plotIndex(0, 0))).toEqual({ ok: false, error: 'plot-not-adjacent' });

    s = unwrap(buyPlot(s, adjacent));
    expect(s.money).toBe(STARTING_MONEY - PLOT_BASE_COST);
    expect(s.tiles[tileIndex(20, 12)]?.state).toBe('grass');
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
});
