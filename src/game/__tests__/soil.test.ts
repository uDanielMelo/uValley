import { describe, expect, it } from 'vitest';
import { CROP_SOIL, SOILS, SOIL_IDS, type SoilId } from '../../data/soil';
import type { CropId } from '../../data/crops';
import { GRID_SIZE } from '../../data/world';
import { TILE_COUNT, tileIndex } from '../grid';
import { cropRating, pastureFactor, plowFactor, soilAt, soilGrid, soilYield } from '../soil';
import type { Tile } from '../types';

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
