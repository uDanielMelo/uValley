import { ANIMAL_IDS, ANIMAL_PRODUCT_IDS, type AnimalId, type AnimalProductId } from '../data/animals';
import { CROP_IDS, type CropId } from '../data/crops';
import { START_STRUCTURES, STRUCTURE_IDS, type StructureId } from '../data/structures';
import { SPEED_OPTIONS, type GameSpeed } from '../data/world';
import { PLOT_COUNT, TILE_COUNT, inBounds, isValidTileIndex } from './grid';
import type {
  Animal,
  GameState,
  GridPoint,
  ItemCounts,
  ProductCounts,
  Rotation,
  StructureInstance,
  Task,
  Tile,
  TileState,
  ToolId,
  Worker,
  WorkerKind,
} from './types';
import { accessRoadTiles } from './roads';
import { stampStructures } from './structures';
import { createFamily } from './workers';

export const SAVE_VERSION = 5;
export const SAVE_KEY = 'uvalley.save';

export type GraphicsQuality = 'high' | 'low';

export interface SaveSettings {
  speed: GameSpeed;
  edgePan: boolean;
  graphics: GraphicsQuality;
}

export const DEFAULT_SETTINGS: SaveSettings = { speed: 1, edgePan: false, graphics: 'high' };

/**
 * v2 added workers, the task queue and nextId; v3 added animals and animal products;
 * v4 added the list of placed structures; v5 added roads (`Tile.road`) and the access road.
 */
export interface SaveDataV5 {
  saveVersion: 5;
  savedAt: number;
  game: GameState;
  settings: SaveSettings;
}

export type SaveData = SaveDataV5;

export interface LoadedSave {
  game: GameState;
  settings: SaveSettings;
}

/**
 * Migrations from version N to N + 1. Add an entry here whenever SAVE_VERSION is bumped:
 * `migrations[1] = (v1) => v2`.
 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: the family arrives; the queue starts empty.
  1: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const family = createFamily(1);
    return { ...data, game: { ...game, workers: family, tasks: [], nextId: family.length + 1 } };
  },
  // v2 → v3: no animals yet, empty product inventory.
  2: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const inventory = isRecord(game.inventory) ? game.inventory : {};
    return { ...data, game: { ...game, animals: [], inventory: { ...inventory, products: {} } } };
  },
  // v3 → v4: the starting structures (already marked on the tiles) become placed instances.
  3: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const firstId = isFiniteNumber(game.nextId) ? game.nextId : 1;
    const structures = START_STRUCTURES.map((p, i) => ({ id: firstId + i, type: p.id, x: p.x, y: p.y, rotation: 0 }));
    return { ...data, game: { ...game, structures, nextId: firstId + structures.length } };
  },
  // v4 → v5: the access road appears, but only on free grass or land for sale (crops and
  // buildings already there are kept; the car then parks at the last reachable road tile).
  4: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    if (!Array.isArray(game.tiles)) return data;
    const tiles: unknown[] = game.tiles.slice();
    for (const index of accessRoadTiles()) {
      const tile = tiles[index];
      if (isRecord(tile) && (tile.state === 'grass' || tile.state === 'locked') && tile.structure === undefined) {
        tiles[index] = { ...tile, road: true };
      }
    }
    return { ...data, game: { ...game, tiles } };
  },
};

export const serialize = (game: GameState, settings: SaveSettings, now = Date.now()): string => {
  const data: SaveData = { saveVersion: SAVE_VERSION, savedAt: now, game, settings };
  return JSON.stringify(data);
};

// ---------- validation helpers (no `any`, everything starts as `unknown`) ----------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const TILE_STATES: readonly TileState[] = ['locked', 'grass', 'tilled', 'planted', 'watered'];

const isCropId = (v: unknown): v is CropId => CROP_IDS.some((id) => id === v);
const isStructureId = (v: unknown): v is StructureId => STRUCTURE_IDS.some((id) => id === v);
const isTileState = (v: unknown): v is TileState => TILE_STATES.some((s) => s === v);
const isSpeed = (v: unknown): v is GameSpeed => SPEED_OPTIONS.some((s) => s === v);

const isAnimalId = (v: unknown): v is AnimalId => ANIMAL_IDS.some((id) => id === v);
const isProductId = (v: unknown): v is AnimalProductId => ANIMAL_PRODUCT_IDS.some((id) => id === v);

const parseProducts = (v: unknown): ProductCounts | null => {
  if (!isRecord(v)) return null;
  const counts: ProductCounts = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isProductId(key) || !isFiniteNumber(value) || value < 0) return null;
    if (value > 0) counts[key] = Math.floor(value);
  }
  return counts;
};

const parseCounts = (v: unknown): ItemCounts | null => {
  if (!isRecord(v)) return null;
  const counts: ItemCounts = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isCropId(key) || !isFiniteNumber(value) || value < 0) return null;
    if (value > 0) counts[key] = Math.floor(value);
  }
  return counts;
};

const parseTile = (v: unknown): Tile | null => {
  if (!isRecord(v) || !isTileState(v.state)) return null;
  const tile: Tile = { state: v.state };
  if (v.structure !== undefined) {
    if (!isStructureId(v.structure)) return null;
    tile.structure = v.structure;
  }
  if (v.road === true) {
    if (v.state !== 'grass' && v.state !== 'locked') return null;
    tile.road = true;
  }
  if (v.state === 'planted' || v.state === 'watered') {
    const crop = v.crop;
    if (!isRecord(crop) || !isCropId(crop.cropId) || !isFiniteNumber(crop.growthMinutes)) return null;
    tile.crop = { cropId: crop.cropId, growthMinutes: Math.max(0, crop.growthMinutes) };
  }
  if (v.state === 'watered') {
    if (!isFiniteNumber(v.wateredUntil)) return null;
    tile.wateredUntil = v.wateredUntil;
  }
  return tile;
};

const TOOL_IDS: readonly ToolId[] = ['hoe', 'seed', 'water', 'hand'];
const WORKER_KINDS: readonly WorkerKind[] = ['family', 'hired'];
const isToolId = (v: unknown): v is ToolId => TOOL_IDS.some((t) => t === v);
const isWorkerKind = (v: unknown): v is WorkerKind => WORKER_KINDS.some((k) => k === v);
const isId = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

const parsePoint = (v: unknown): GridPoint | null =>
  isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) ? { x: v.x, y: v.y } : null;

const parseWorker = (v: unknown): Worker | null => {
  if (!isRecord(v)) return null;
  const { id, name, role, kind, efficiency, x, y, taskId, path, progress } = v;
  if (!isId(id) || typeof name !== 'string' || typeof role !== 'string' || !isWorkerKind(kind)) return null;
  if (!isFiniteNumber(efficiency) || efficiency <= 0) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(progress)) return null;
  if (taskId !== null && !isId(taskId)) return null;
  if (!Array.isArray(path)) return null;
  const points: GridPoint[] = [];
  for (const raw of path) {
    const p = parsePoint(raw);
    if (!p) return null;
    points.push(p);
  }
  return { id, name, role, kind, efficiency, x, y, taskId, path: points, progress: Math.max(0, progress) };
};

const parseTask = (v: unknown): Task | null => {
  if (!isRecord(v)) return null;
  const { id, kind, tile, cropId, workerId } = v;
  if (!isId(id) || !isToolId(kind) || !isFiniteNumber(tile) || !isValidTileIndex(tile)) return null;
  if (cropId !== null && !isCropId(cropId)) return null;
  if (workerId !== null && !isId(workerId)) return null;
  return { id, kind, tile, cropId, workerId };
};

const parseAnimal = (v: unknown): Animal | null => {
  if (!isRecord(v)) return null;
  const { id, kind, x, y, target, waitMinutes, productMinutes, hasProduct, fed } = v;
  if (!isId(id) || !isAnimalId(kind) || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(waitMinutes) || !isFiniteNumber(productMinutes)) return null;
  if (typeof hasProduct !== 'boolean' || typeof fed !== 'boolean') return null;
  const point = target === null ? null : parsePoint(target);
  if (target !== null && !point) return null;
  return {
    id,
    kind,
    x,
    y,
    target: point,
    waitMinutes: Math.max(0, waitMinutes),
    productMinutes: Math.max(0, productMinutes),
    hasProduct,
    fed,
  };
};

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const isRotation = (v: unknown): v is Rotation => ROTATIONS.some((r) => r === v);

const parseStructure = (v: unknown): StructureInstance | null => {
  if (!isRecord(v)) return null;
  const { id, type, x, y, rotation } = v;
  if (!isId(id) || !isStructureId(type) || !isRotation(rotation)) return null;
  if (!isId(x) || !isId(y) || !inBounds(x, y)) return null;
  return { id, type, x, y, rotation };
};

const parseList = <T>(v: unknown, parse: (item: unknown) => T | null): T[] | null => {
  if (!Array.isArray(v)) return null;
  const result: T[] = [];
  for (const raw of v) {
    const item = parse(raw);
    if (!item) return null;
    result.push(item);
  }
  return result;
};

const parseGame = (v: unknown): GameState | null => {
  if (!isRecord(v)) return null;
  const { gameMinutes, money, tiles, unlockedPlots, plotsPurchased, inventory, nextId } = v;
  if (!isFiniteNumber(gameMinutes) || gameMinutes < 0) return null;
  if (!isFiniteNumber(money)) return null;
  if (!isFiniteNumber(plotsPurchased) || plotsPurchased < 0) return null;
  if (!Array.isArray(tiles) || tiles.length !== TILE_COUNT) return null;
  if (!Array.isArray(unlockedPlots)) return null;
  if (!isRecord(inventory)) return null;

  const parsedTiles: Tile[] = [];
  for (const raw of tiles) {
    const tile = parseTile(raw);
    if (!tile) return null;
    parsedTiles.push(tile);
  }
  const plots: number[] = [];
  for (const p of unlockedPlots) {
    if (!isFiniteNumber(p) || !Number.isInteger(p) || p < 0 || p >= PLOT_COUNT) return null;
    plots.push(p);
  }
  const seeds = parseCounts(inventory.seeds);
  const produce = parseCounts(inventory.produce);
  const products = parseProducts(inventory.products);
  if (!seeds || !produce || !products) return null;
  const workers = parseList(v.workers, parseWorker);
  const tasks = parseList(v.tasks, parseTask);
  const animals = parseList(v.animals, parseAnimal);
  const structures = parseList(v.structures, parseStructure);
  if (!workers || !tasks || !animals || !structures || !isId(nextId)) return null;
  const maxId = Math.max(
    0,
    ...workers.map((w) => w.id),
    ...tasks.map((t) => t.id),
    ...animals.map((a) => a.id),
    ...structures.map((s) => s.id),
  );

  return {
    gameMinutes,
    money,
    // Tile flags are derived from the structure list, so footprint changes never leave stale tiles.
    tiles: stampStructures(parsedTiles, structures),
    unlockedPlots: plots,
    plotsPurchased: Math.floor(plotsPurchased),
    inventory: { seeds, produce, products },
    workers,
    tasks,
    animals,
    structures,
    nextId: Math.max(nextId, maxId + 1),
  };
};

const parseSettings = (v: unknown): SaveSettings => {
  const fallback = DEFAULT_SETTINGS;
  if (!isRecord(v)) return fallback;
  return {
    speed: isSpeed(v.speed) ? v.speed : fallback.speed,
    edgePan: typeof v.edgePan === 'boolean' ? v.edgePan : fallback.edgePan,
    graphics: v.graphics === 'high' || v.graphics === 'low' ? v.graphics : fallback.graphics,
  };
};

/** Parses and migrates a raw save string. Returns null for missing, corrupt or future saves. */
export const deserialize = (raw: string | null): LoadedSave | null => {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isFiniteNumber(data.saveVersion)) return null;
  let version = data.saveVersion;
  if (version > SAVE_VERSION) return null;
  let current: Record<string, unknown> = data;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return null;
    current = migrate(current);
    version++;
  }
  const game = parseGame(current.game);
  if (!game) return null;
  return { game, settings: parseSettings(current.settings) };
};

/** Minimal storage interface so the logic can be tested without a browser. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const loadFromStorage = (storage: KeyValueStorage): LoadedSave | null => {
  try {
    return deserialize(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
};

export const writeToStorage = (
  storage: KeyValueStorage,
  game: GameState,
  settings: SaveSettings,
): boolean => {
  try {
    storage.setItem(SAVE_KEY, serialize(game, settings));
    return true;
  } catch {
    return false;
  }
};

export const clearStorage = (storage: KeyValueStorage): void => {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode etc.): nothing to clear.
  }
};
