import { describe, expect, it } from 'vitest';
import { CROP_SOIL, SOILS, SOIL_IDS, WITHER_AT, type SoilId, type SoilRating } from '../../data/soil';
import { CROPS, type CropId } from '../../data/crops';
import { GROWTH_STEP_MINUTES } from '../../data/world';
import { harvest } from '../actions';
import { growthMinutesNeeded } from '../crops';
import { withTile } from '../grid';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import { GRID_SIZE } from '../../data/world';
import { TILE_COUNT, tileIndex } from '../grid';
import { cropRating, pastureFactor, plowFactor, soilAt, soilGrid, soilUnits, soilYield, witherCrops } from '../soil';
import type { ActionResult, GameState, Tile } from '../types';

const GRASS: Tile = { state: 'grass' };

describe('soil generation', () => {
  it('soilGrid is deterministic per seed', () => {
    const a = soilGrid(7);
    const again = soilGrid(7);
    const b = soilGrid(8);
    expect(Array.from(again)).toEqual(Array.from(a));
    let diff = 0;
    for (let i = 0; i < TILE_COUNT; i++) if (a[i] !== b[i]) diff++;
    expect(diff / TILE_COUNT).toBeGreaterThan(0.2);
  });

  it('each soil type is near its target share', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const grid = soilGrid(seed);
      const counts = new Array<number>(SOIL_IDS.length).fill(0);
      for (const v of grid) counts[v] = (counts[v] ?? 0) + 1;
      SOIL_IDS.forEach((id, k) => {
        expect(Math.abs((counts[k] ?? 0) / TILE_COUNT - SOILS[id].share)).toBeLessThan(0.08);
      });
    }
  });

  it('soil comes in patches', () => {
    const grid = soilGrid(3);
    let alike = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const here = grid[tileIndex(x, y)];
        let same = 0;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
          n++;
          if (grid[tileIndex(nx, ny)] === here) same++;
        }
        if (same >= Math.min(3, n)) alike++;
      }
    }
    expect(alike / TILE_COUNT).toBeGreaterThan(0.7);
  });

  it('start area has at least three types', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const types = new Set<SoilId | null>();
      for (let y = 32; y <= 63; y++) for (let x = 16; x <= 47; x++) types.add(soilAt(seed, tileIndex(x, y)));
      expect(types.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('blind planting averages out', () => {
    for (const crop of Object.keys(CROP_SOIL) as CropId[]) {
      let sum = 0;
      let n = 0;
      for (let seed = 1; seed <= 5; seed++) {
        for (let i = 0; i < TILE_COUNT; i++) {
          sum += soilYield(cropRating(seed, GRASS, i, crop));
          n++;
        }
      }
      const average = sum / n;
      expect(average, crop).toBeGreaterThanOrEqual(0.85);
      expect(average, crop).toBeLessThanOrEqual(1.1);
    }
  });

  it('null seed is uniform', () => {
    expect(soilAt(null, 0)).toBeNull();
    expect(cropRating(null, GRASS, 0, 'corn')).toBe('neutral');
    expect(plowFactor(null, GRASS, 0)).toBe(1);
    expect(pastureFactor(null, 0)).toBe(1);
  });

  it('greenhouse ignores soil', () => {
    const covered: Tile = { state: 'tilled', cover: true };
    for (let i = 0; i < TILE_COUNT; i += 37) {
      expect(cropRating(3, covered, i, 'corn')).toBe('neutral');
      expect(cropRating(3, GRASS, i, 'strawberry')).toBe('neutral');
      expect(plowFactor(3, covered, i)).toBe(1);
    }
  });

  it('plow and pasture factors follow the soil type', () => {
    for (let i = 0; i < TILE_COUNT; i += 53) {
      const soil = soilAt(4, i);
      expect(soil).not.toBeNull();
      if (!soil) continue;
      expect(plowFactor(4, GRASS, i)).toBe(SOILS[soil].plowFactor);
      expect(pastureFactor(4, i)).toBe(SOILS[soil].pastureFactor);
    }
  });
});

describe('harvest by soil', () => {
  const SEED = 11;
  /** A free farm tile where the crop has this rating. */
  const findTile = (s: GameState, cropId: CropId, rating: SoilRating): number => {
    for (let y = 33; y <= 55; y++) {
      for (let x = 17; x <= 46; x++) {
        const i = tileIndex(x, y);
        const t = s.tiles[i];
        if (t && t.state === 'grass' && !t.road && !t.structure && cropRating(SEED, t, i, cropId) === rating) return i;
      }
    }
    throw new Error(`no ${rating} tile for ${cropId}`);
  };
  const mature = (s: GameState, index: number, cropId: CropId, extra: Partial<Tile> = {}): GameState => {
    const growthMinutes = growthMinutesNeeded({ cropId, growthMinutes: 0 });
    return { ...s, tiles: withTile(s.tiles, index, { state: 'planted', crop: { cropId, growthMinutes }, ...extra }) };
  };
  const unwrap = (r: ActionResult): GameState => {
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it('soilUnits rounds by the roll', () => {
    expect(soilUnits(1.5, 0.4)).toBe(2);
    expect(soilUnits(1.5, 0.6)).toBe(1);
    expect(soilUnits(0.5, 0.7)).toBe(0);
    expect(soilUnits(2, 0.99)).toBe(2);
  });

  it('harvest on great soil gives two units', () => {
    const s = createInitialState(SEED);
    const i = findTile(s, 'wheat', 'great');
    const after = unwrap(harvest(mature(s, i, 'wheat'), i));
    expect(after.inventory.produce.wheat).toBe(2);
  });

  it('harvest with null seed gives one unit', () => {
    const s = createInitialState();
    const i = tileIndex(22, 40);
    const after = unwrap(harvest(mature(s, i, 'wheat'), i));
    expect(after.inventory.produce.wheat).toBe(1);
  });

  it('orchard harvest uses the soil', () => {
    const s = createInitialState(SEED);
    const i = findTile(s, 'orange', 'great');
    const after = unwrap(harvest(mature(s, i, 'orange'), i));
    expect(after.inventory.produce.orange).toBe(2);
    const tile = after.tiles[i];
    expect(tile?.state).toBe('planted');
    expect(tile?.crop?.growthMinutes).toBe((CROPS.orange.growthHours - (CROPS.orange.regrowHours ?? 0)) * 60);
  });

  it('bad soil withers at half growth', () => {
    const s = createInitialState(SEED);
    const i = findTile(s, 'corn', 'bad');
    const half = growthMinutesNeeded({ cropId: 'corn', growthMinutes: 0 }) * WITHER_AT;
    const tiles = withTile(s.tiles, i, { state: 'watered', crop: { cropId: 'corn', growthMinutes: half }, wateredUntil: 9999, fertilized: true });
    const result = witherCrops(tiles, SEED);
    expect(result.tiles[i]).toEqual({ state: 'tilled' });
    expect(result.withered.corn).toBe(1);
    const young = withTile(s.tiles, i, { state: 'planted', crop: { cropId: 'corn', growthMinutes: half - 1 } });
    expect(witherCrops(young, SEED).tiles).toBe(young);
  });

  it('greenhouse never withers', () => {
    const s = createInitialState(SEED);
    const i = findTile(s, 'corn', 'bad');
    const half = growthMinutesNeeded({ cropId: 'corn', growthMinutes: 0 }) * WITHER_AT;
    const tiles = withTile(s.tiles, i, { state: 'planted', cover: true, crop: { cropId: 'corn', growthMinutes: half } });
    expect(witherCrops(tiles, SEED).tiles).toBe(tiles);
  });

  it('witherCrops keeps the array when nothing withers', () => {
    const tiles = createInitialState().tiles;
    expect(witherCrops(tiles, null).tiles).toBe(tiles);
  });

  it('the simulation withers crops and reports them', () => {
    const s = createInitialState(SEED);
    const i = findTile(s, 'corn', 'bad');
    const half = growthMinutesNeeded({ cropId: 'corn', growthMinutes: 0 }) * WITHER_AT;
    const start: GameState = { ...s, tiles: withTile(s.tiles, i, { state: 'planted', crop: { cropId: 'corn', growthMinutes: half } }) };
    const tick = advanceGame(start, GROWTH_STEP_MINUTES);
    expect(tick.state.tiles[i]?.state).toBe('tilled');
    expect(tick.withered.corn).toBe(1);
  });
});
