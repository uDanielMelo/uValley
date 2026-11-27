import { CROPS, type CropId } from '../data/crops';
import type { SoilId } from '../data/soil';
import { GRID_SIZE } from '../data/world';
import { plotOfTile, tileCoords, tileIndex } from './grid';
import { cropRating, soilAt, soilYield } from './soil';
import { fail, ok, type ActionResult, type Field, type GameState } from './types';

/** Named fields: rectangles of farm land the player names to organize planting. They block nothing. */

const NAME_MAX = 32;

const tilesOf = (field: Pick<Field, 'x' | 'y' | 'w' | 'h'>): number[] => {
  const result: number[] = [];
  for (let y = field.y; y < field.y + field.h; y++) for (let x = field.x; x < field.x + field.w; x++) result.push(tileIndex(x, y));
  return result;
};

const overlaps = (a: Pick<Field, 'x' | 'y' | 'w' | 'h'>, b: Pick<Field, 'x' | 'y' | 'w' | 'h'>): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The smallest "Talhão N" not taken. */
const defaultName = (fields: readonly Field[]): string => {
  const taken = new Set(fields.map((f) => f.name));
  let n = 1;
  while (taken.has(`Talhão ${n}`)) n++;
  return `Talhão ${n}`;
};

/** A new field covering the rectangle between two tiles (any corners), on farm land, touching no other. */
export const addField = (state: GameState, a: number, b: number): ActionResult => {
  const p = tileCoords(a);
  const q = tileCoords(b);
  const rect = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x) + 1, h: Math.abs(p.y - q.y) + 1 };
  if (rect.x + rect.w > GRID_SIZE || rect.y + rect.h > GRID_SIZE) return fail('field-not-owned');
  if (!tilesOf(rect).every((t) => state.unlockedPlots.includes(plotOfTile(t)))) return fail('field-not-owned');
  if (state.fields.some((f) => overlaps(f, rect))) return fail('field-overlap');
  const field: Field = { id: state.nextId, name: defaultName(state.fields), ...rect };
  return ok({ ...state, fields: [...state.fields, field], nextId: state.nextId + 1 });
};

export const renameField = (state: GameState, id: number, name: string): ActionResult => {
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) return fail('field-name-empty');
  if (!state.fields.some((f) => f.id === id)) return fail('no-field');
  return ok({ ...state, fields: state.fields.map((f) => (f.id === id ? { ...f, name: clean } : f)) });
};

export const removeField = (state: GameState, id: number): ActionResult => {
  if (!state.fields.some((f) => f.id === id)) return fail('no-field');
  return ok({ ...state, fields: state.fields.filter((f) => f.id !== id) });
};

export const fieldAt = (fields: readonly Field[], tile: number): Field | undefined => {
  const { x, y } = tileCoords(tile);
  return fields.find((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
};

/** Tiles of the field whose plot has been analyzed. */
const surveyedTiles = (state: Pick<GameState, 'surveyedPlots'>, field: Field): number[] =>
  tilesOf(field).filter((t) => state.surveyedPlots.includes(plotOfTile(t)));

/** Soil makeup of a field, counting only analyzed tiles. */
export const fieldSoil = (
  state: Pick<GameState, 'surveyedPlots' | 'soilSeed'>,
  field: Field,
): { surveyed: number; total: number; types: Partial<Record<SoilId, number>> } => {
  const known = surveyedTiles(state, field);
  const types: Partial<Record<SoilId, number>> = {};
  for (const t of known) {
    const soil = soilAt(state.soilSeed, t);
    if (soil) types[soil] = (types[soil] ?? 0) + 1;
  }
  return { surveyed: known.length, total: field.w * field.h, types };
};

/** Known open-air crops by their average soil multiplier over the analyzed tiles, best first. */
export const fieldRanking = (
  state: Pick<GameState, 'surveyedPlots' | 'soilSeed' | 'research' | 'tiles'>,
  field: Field,
): { cropId: CropId; average: number }[] => {
  const known = surveyedTiles(state, field);
  if (known.length === 0) return [];
  const crops = state.research.unlocked.filter((c) => CROPS[c].kind !== 'greenhouse');
  return crops
    .map((cropId) => {
      const sum = known.reduce((acc, t) => {
        const tile = state.tiles[t];
        return acc + (tile ? soilYield(cropRating(state.soilSeed, tile, t, cropId)) : 0);
      }, 0);
      return { cropId, average: sum / known.length };
    })
    .sort((a, b) => b.average - a.average);
};

/** Adds one harvested tile to its field's harvest of the day (a new day starts over). */
export const recordHarvest = (fields: Field[], tile: number, units: number, soil: number, day: number): Field[] => {
  const field = fieldAt(fields, tile);
  if (!field) return fields;
  const last = field.lastHarvest?.day === day ? field.lastHarvest : { day, units: 0, tiles: 0, soil: 0 };
  const lastHarvest = { day, units: last.units + units, tiles: last.tiles + 1, soil: last.soil + soil };
  return fields.map((f) => (f.id === field.id ? { ...f, lastHarvest } : f));
};
