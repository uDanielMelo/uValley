import { describe, expect, it } from 'vitest';
import { CROPS, CROP_SEASON_BONUS, GREENHOUSE_GROWTH, MASTERY_LEVELS } from '../../data/crops';
import { SEASONS, SEASON_DAYS } from '../../data/climate';
import { MINUTES_PER_DAY } from '../../data/world';
import { harvest, plant, till, water } from '../actions';
import { applyDayWeather, weatherOf } from '../climate';
import { growthMinutesNeeded } from '../crops';
import { unlockAll } from '../dev';
import { buySeeds } from '../economy';
import { tileIndex } from '../grid';
import { growTiles } from '../growth';
import { isUnlocked, startResearch, stepResearch } from '../research';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { isPasture } from '../shelters';
import { gainMastery, masteryLevel, workSpeed } from '../staff';
import { createInitialState } from '../state';
import { checkPlacement, placeStructure, removeStructure } from '../structures';
import type { CropId } from '../../data/crops';
import type { ActionResult, GameState, Worker } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** Unlocked farm with lots of money and every crop known, with seeds. */
const farm = (): GameState => {
  const s: GameState = { ...unlockAll(createInitialState()), money: 100_000 };
  const seeds = { wheat: 20, strawberry: 20, orange: 5, carrot: 10 };
  return { ...s, inventory: { ...s.inventory, seeds }, research: { unlocked: Object.keys(CROPS) as CropId[], current: null } };
};

const GH_X = 29;
const GH_Y = 52;
/** A tile inside the greenhouse at (GH_X, GH_Y), and one outside. */
const INSIDE = tileIndex(GH_X + 1, GH_Y);
const OUTSIDE = tileIndex(GH_X + 7, GH_Y + 3);

const withGreenhouse = (): GameState => unwrap(placeStructure(farm(), 'greenhouse', GH_X, GH_Y));

describe('research', () => {
  it('a new farm knows wheat, corn and tomato; other seeds wait for research', () => {
    const s = { ...createInitialState(), money: 10_000 };
    expect(s.research.unlocked).toEqual(['wheat', 'corn', 'tomato']);
    expect(buySeeds(s, 'carrot', 1)).toEqual({ ok: false, error: 'not-researched' });
    expect(buySeeds(s, 'wheat', 1).ok).toBe(true);
  });

  it('costs money, takes game time, one at a time, and unlocks the crop', () => {
    const cost = CROPS.carrot.research?.cost ?? 0;
    const hours = CROPS.carrot.research?.hours ?? 0;
    let s = unwrap(startResearch({ ...createInitialState(), money: 10_000 }, 'carrot'));
    expect(s.money).toBe(10_000 - cost);
    expect(startResearch(s, 'potato')).toEqual({ ok: false, error: 'researching' });
    const half = stepResearch(s, (hours * 60) / 2);
    expect(half.finished).toBeNull();
    const done = stepResearch(half.state, (hours * 60) / 2);
    expect(done.finished).toBe('carrot');
    s = done.state;
    expect(isUnlocked(s, 'carrot')).toBe(true);
    expect(s.research.current).toBeNull();
    expect(startResearch(s, 'carrot')).toEqual({ ok: false, error: 'already-researched' });
  });
});

describe('greenhouse', () => {
  it('covers its tiles instead of blocking them: they stay plantable, but no building or pasture there', () => {
    const s = withGreenhouse();
    const tile = s.tiles[INSIDE];
    expect(tile?.cover).toBe(true);
    expect(tile?.structure).toBeUndefined();
    expect(till(s, INSIDE).ok).toBe(true);
    expect(isPasture(s.tiles, GH_X + 1, GH_Y)).toBe(false);
    expect(checkPlacement(s, 'lampPost', GH_X + 1, GH_Y, 0)).toBe('structure');
  });

  it('strawberries only grow inside', () => {
    let s = withGreenhouse();
    s = unwrap(till(unwrap(till(s, INSIDE)), OUTSIDE));
    expect(plant(s, OUTSIDE, 'strawberry')).toEqual({ ok: false, error: 'needs-greenhouse' });
    expect(plant(s, INSIDE, 'strawberry').ok).toBe(true);
  });

  it('crops inside grow without watering, at the same rate in any season, and need no water', () => {
    const s = unwrap(plant(unwrap(till(withGreenhouse(), INSIDE)), INSIDE, 'wheat'));
    expect(water(s, INSIDE)).toEqual({ ok: false, error: 'no-water-needed' });
    const winter = SEASON_DAYS * 3 * MINUTES_PER_DAY;
    expect(growTiles(s.tiles, 0, 60)[INSIDE]?.crop?.growthMinutes).toBeCloseTo(60 * GREENHOUSE_GROWTH);
    expect(growTiles(s.tiles, winter, winter + 60)[INSIDE]?.crop?.growthMinutes).toBeCloseTo(60 * GREENHOUSE_GROWTH);
  });

  it('keeps storms out', () => {
    let s = unwrap(plant(unwrap(till(withGreenhouse(), INSIDE)), INSIDE, 'wheat'));
    let stormy = 2;
    while (weatherOf(stormy) !== 'storm') stormy++;
    for (let k = 0; k < 20; k++) {
      let day = stormy + k * 28;
      while (weatherOf(day) !== 'storm') day++;
      s = applyDayWeather(s, day).state;
    }
    expect(s.tiles[INSIDE]?.crop?.cropId).toBe('wheat');
  });

  it('coming down leaves the crops underneath', () => {
    const s = unwrap(plant(unwrap(till(withGreenhouse(), INSIDE)), INSIDE, 'wheat'));
    const greenhouse = s.structures.find((x) => x.type === 'greenhouse');
    if (!greenhouse) throw new Error('no greenhouse');
    const removed = removeStructure(s, greenhouse.id);
    expect(removed.tiles[INSIDE]?.cover).toBeUndefined();
    expect(removed.tiles[INSIDE]?.crop?.cropId).toBe('wheat');
  });
});

describe('orchard', () => {
  it('trees grow without watering and fruit again after a harvest', () => {
    const t = OUTSIDE;
    let s = unwrap(plant(unwrap(till(farm(), t)), t, 'orange'));
    expect(water(s, t)).toEqual({ ok: false, error: 'no-water-needed' });
    expect(growTiles(s.tiles, 0, 60)[t]?.crop?.growthMinutes ?? 0).toBeGreaterThan(0);
    const crop = s.tiles[t]?.crop;
    if (!crop) throw new Error('no tree');
    s = { ...s, tiles: s.tiles.map((x, i) => (i === t ? { ...x, crop: { ...crop, growthMinutes: growthMinutesNeeded(crop) } } : x)) };
    const picked = unwrap(harvest(s, t));
    expect(picked.inventory.produce.orange).toBe(1);
    expect(picked.tiles[t]?.state).toBe('planted');
    const left = growthMinutesNeeded(crop) - (picked.tiles[t]?.crop?.growthMinutes ?? 0);
    expect(left).toBe((CROPS.orange.regrowHours ?? 0) * 60);
  });
});

describe('seasons per crop', () => {
  it('a crop grows faster in its own season', () => {
    const t = OUTSIDE;
    const s = unwrap(water(unwrap(plant(unwrap(till(farm(), t)), t, 'wheat')), t));
    const summer = SEASON_DAYS * MINUTES_PER_DAY;
    const watered = { ...s, tiles: s.tiles.map((x, i) => (i === t ? { ...x, wateredUntil: summer + 600 } : x)) };
    const grown = growTiles(watered.tiles, summer, summer + 60)[t]?.crop?.growthMinutes ?? 0;
    expect(grown).toBeCloseTo(60 * SEASONS.summer.growth * CROP_SEASON_BONUS);
  });
});

describe('crop mastery', () => {
  it('builds with tasks on a crop and speeds up work on it', () => {
    const base = createInitialState().workers[0];
    if (!base) throw new Error('no worker');
    let w: Worker = { ...base };
    const context = { kind: 'hand' as const, cropId: 'wheat' as const };
    const before = workSpeed(w, context);
    for (let i = 0; i < (MASTERY_LEVELS[0]?.tasks ?? 0); i++) w = gainMastery(w, 'wheat');
    expect(masteryLevel(w, 'wheat')).toBe(0);
    expect(masteryLevel(w, 'corn')).toBe(-1);
    expect(workSpeed(w, context)).toBeCloseTo(before * (MASTERY_LEVELS[0]?.speed ?? 1));
    expect(workSpeed(w, { kind: 'hand', cropId: 'corn' })).toBeCloseTo(workSpeed(base, { kind: 'hand', cropId: 'corn' }));
  });
});

describe('save', () => {
  it('keeps research, crop mastery and the greenhouse cover', () => {
    const fresh = { ...withGreenhouse(), research: { unlocked: ['wheat', 'corn', 'tomato'] as CropId[], current: null } };
    let s = unwrap(startResearch(fresh, 'carrot'));
    s = { ...s, workers: s.workers.map((w, i) => (i === 0 ? gainMastery(w, 'wheat') : w)) };
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

});
