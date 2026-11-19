import {
  ANIMAL_IDS,
  ANIMAL_PRODUCT_IDS,
  BREEDS,
  BREED_IDS,
  type AnimalId,
  type AnimalProductId,
  type BreedId,
} from '../data/animals';
import { CROP_IDS, type CropId } from '../data/crops';
import { DISEASE_IDS, MEDICINE_IDS, type DiseaseId, type MedicineId } from '../data/health';
import { SHELTER_LEVEL_IDS, STRUCTURE_IDS, type ShelterLevel, type StructureId } from '../data/structures';
import { SKILL_IDS, type SkillId } from '../data/workers';
import { SPEED_OPTIONS, type GameSpeed } from '../data/world';
import { PLOT_COUNT, TILE_COUNT, inBounds, isValidTileIndex } from './grid';
import { TOWN_SHOP_IDS, VEHICLE_LEVELS, type OrderGood, type TownShopId, type VehicleLevel } from '../data/market';
import type {
  Animal,
  AnimalHealth,
  Candidate,
  Cargo,
  Carcass,
  GameState,
  GridPoint,
  ItemCounts,
  MedicineCounts,
  Order,
  ProductCounts,
  Research,
  GitHubLink,
  Rotation,
  Specialty,
  Stars,
  TaskJob,
  StructureInstance,
  StructureWork,
  StructureWorkKind,
  Task,
  TaskKind,
  Tile,
  TileState,
  Worker,
  WorkerKind,
  WorkerProfile,
} from './types';
import { repairSiteTasks } from './construction';
import { STARTING_CROPS } from './research';
import { rehomeAnimals } from './shelters';
import { stampStructures } from './structures';

export const SAVE_VERSION = 16;
/**
 * Saves older than this were made on the 32x32 map, before buildings needed roads; they cannot be
 * placed on the new map, so loading one starts a new game.
 */
export const OLDEST_LOADABLE_VERSION = 16;
export const SAVE_KEY = 'uvalley.save';

export type GraphicsQuality = 'high' | 'low';

export interface SaveSettings {
  speed: GameSpeed;
  edgePan: boolean;
  graphics: GraphicsQuality;
}

export const DEFAULT_SETTINGS: SaveSettings = { speed: 1, edgePan: false, graphics: 'high' };

/**
 * v16 is the 64x64 map (the farm starts with 32x32 tiles by the south edge), with road rings
 * around the buildings and ring road tasks tied to their site (`job.siteId`). Earlier versions
 * (v1–v15, on the 32x32 map) are not loaded.
 */
export interface SaveDataV16 {
  saveVersion: 16;
  savedAt: number;
  game: GameState;
  settings: SaveSettings;
}

export type SaveData = SaveDataV16;

export interface LoadedSave {
  game: GameState;
  settings: SaveSettings;
}

/**
 * Migrations from version N to N + 1. Add an entry here whenever SAVE_VERSION is bumped:
 * `migrations[16] = (v16) => v17`.
 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

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

const isMedicineId = (v: unknown): v is MedicineId => MEDICINE_IDS.some((id) => id === v);
const isDiseaseId = (v: unknown): v is DiseaseId => DISEASE_IDS.some((id) => id === v);

const parseMedicine = (v: unknown): MedicineCounts | null => {
  if (!isRecord(v)) return null;
  const counts: MedicineCounts = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isMedicineId(key) || !isFiniteNumber(value) || value < 0) return null;
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
  if (v.fertilized === true && (v.state === 'tilled' || v.state === 'planted' || v.state === 'watered')) {
    tile.fertilized = true;
  }
  return tile;
};

const TASK_KINDS: readonly TaskKind[] = ['hoe', 'seed', 'water', 'hand', 'fertilize', 'tend', 'build'];
const WORKER_KINDS: readonly WorkerKind[] = ['staff', 'temp'];
const STARS: readonly Stars[] = [1, 2, 3];
const isStars = (v: unknown): v is Stars => STARS.some((s) => s === v);
const isSkillId = (v: unknown): v is SkillId => SKILL_IDS.some((s) => s === v);
const isTaskKind = (v: unknown): v is TaskKind => TASK_KINDS.some((t) => t === v);
const isWorkerKind = (v: unknown): v is WorkerKind => WORKER_KINDS.some((k) => k === v);
const isId = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

const parsePoint = (v: unknown): GridPoint | null =>
  isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) ? { x: v.x, y: v.y } : null;

const parseSpecialty = (v: unknown): Specialty | null | undefined => {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  if (v.kind === 'crop' && isCropId(v.id)) return { kind: 'crop', id: v.id };
  if (v.kind === 'animal' && isAnimalId(v.id)) return { kind: 'animal', id: v.id };
  return undefined;
};

/** Shared by workers and candidates. */
const parseProfile = (v: Record<string, unknown>): WorkerProfile | null => {
  const { name, age, stars, skills, hourlyWage } = v;
  if (typeof name !== 'string' || !isFiniteNumber(age) || !isStars(stars)) return null;
  if (!isFiniteNumber(hourlyWage) || hourlyWage < 0) return null;
  if (!Array.isArray(skills) || !skills.every(isSkillId)) return null;
  const specialty = parseSpecialty(v.specialty);
  if (specialty === undefined) return null;
  const cropXp = v.cropXp === undefined ? undefined : parseCounts(v.cropXp);
  if (cropXp === null) return null;
  return {
    name,
    age: Math.floor(age),
    stars,
    skills: [...new Set(skills)],
    specialty,
    hourlyWage,
    ...(cropXp && Object.keys(cropXp).length > 0 ? { cropXp } : {}),
  };
};

const parseWorker = (v: unknown): Worker | null => {
  if (!isRecord(v)) return null;
  const profile = parseProfile(v);
  const { id, kind, priorities, x, y, taskId, path, progress } = v;
  if (!profile || !isId(id) || !isWorkerKind(kind)) return null;
  if (!Array.isArray(priorities) || !priorities.every(isTaskKind)) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(progress)) return null;
  if (taskId !== null && !isId(taskId)) return null;
  if (!Array.isArray(path)) return null;
  const points: GridPoint[] = [];
  for (const raw of path) {
    const p = parsePoint(raw);
    if (!p) return null;
    points.push(p);
  }
  return {
    id,
    kind,
    ...profile,
    priorities: [...new Set(priorities)],
    x,
    y,
    taskId,
    path: points,
    progress: Math.max(0, progress),
  };
};

const parseCandidate = (v: unknown): Candidate | null => {
  if (!isRecord(v)) return null;
  const profile = parseProfile(v);
  if (!profile || !isId(v.id) || !isFiniteNumber(v.hireCost) || v.hireCost < 0) return null;
  return { ...profile, id: v.id, hireCost: v.hireCost };
};

const parseJob = (v: unknown): TaskJob | null => {
  if (!isRecord(v)) return null;
  if (v.type === 'structure' && isId(v.structureId)) return { type: 'structure', structureId: v.structureId };
  if (v.type === 'shelter' && isId(v.structureId)) return { type: 'shelter', structureId: v.structureId };
  if (v.type === 'road' && typeof v.remove === 'boolean') {
    return isId(v.siteId) ? { type: 'road', remove: v.remove, siteId: v.siteId } : { type: 'road', remove: v.remove };
  }
  if (v.type === 'medicate' && isId(v.animalId)) return { type: 'medicate', animalId: v.animalId };
  if (v.type === 'carcass' && isId(v.carcassId)) return { type: 'carcass', carcassId: v.carcassId };
  return null;
};

const parseTask = (v: unknown): Task | null => {
  if (!isRecord(v)) return null;
  const { id, kind, tile, cropId, workerId } = v;
  if (!isId(id) || !isTaskKind(kind) || !isFiniteNumber(tile) || !isValidTileIndex(tile)) return null;
  if (cropId !== null && !isCropId(cropId)) return null;
  if (workerId !== null && !isId(workerId)) return null;
  if (kind !== 'build' && kind !== 'tend') return { id, kind, tile, cropId, workerId };
  const job = parseJob(v.job);
  return job ? { id, kind, tile, cropId: null, workerId, job } : null;
};

const parsePath = (v: unknown): GridPoint[] | null => {
  if (!Array.isArray(v)) return null;
  const points: GridPoint[] = [];
  for (const raw of v) {
    const p = parsePoint(raw);
    if (!p) return null;
    points.push(p);
  }
  return points;
};

const isBreedId = (v: unknown): v is BreedId => BREED_IDS.some((b) => b === v);

const parseAnimal = (v: unknown): Animal | null => {
  if (!isRecord(v)) return null;
  const { id, kind, breed, stars, bornAt, shelterId, x, y, waitMinutes, productMinutes, fed } = v;
  if (!isId(id) || !isAnimalId(kind) || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isBreedId(breed) || BREEDS[breed].species !== kind || !isStars(stars) || !isFiniteNumber(bornAt)) return null;
  // A missing or unknown shelter (-1 after migrating) is fixed by rehomeAnimals.
  if (!isFiniteNumber(shelterId) || !Number.isInteger(shelterId)) return null;
  if (!isFiniteNumber(waitMinutes) || !isFiniteNumber(productMinutes) || typeof fed !== 'boolean') return null;
  const path = parsePath(v.path);
  if (!path) return null;
  const health = parseHealth(v.health);
  if (health === null) return null;
  return {
    id,
    kind,
    breed,
    stars,
    bornAt,
    shelterId,
    x,
    y,
    path,
    waitMinutes: Math.max(0, waitMinutes),
    productMinutes: Math.max(0, productMinutes),
    fed,
    ...(health ? { health } : {}),
  };
};

/** Health, or undefined when the field is absent (null when it is invalid). */
const parseHealth = (v: unknown): AnimalHealth | undefined | null => {
  if (v === undefined) return undefined;
  if (!isRecord(v) || !isDiseaseId(v.disease) || !isFiniteNumber(v.since) || typeof v.noticed !== 'boolean') return null;
  return { disease: v.disease, since: v.since, noticed: v.noticed };
};

const isVehicleLevel = (v: unknown): v is VehicleLevel => VEHICLE_LEVELS.some((l) => l === v);
const isTownShop = (v: unknown): v is TownShopId => TOWN_SHOP_IDS.some((id) => id === v);

const parseOrderGood = (v: unknown): OrderGood | null => {
  if (!isRecord(v)) return null;
  if (v.kind === 'crop' && isCropId(v.id)) return { kind: 'crop', id: v.id };
  if (v.kind === 'product' && isProductId(v.id)) return { kind: 'product', id: v.id };
  return null;
};

const parseOrder = (v: unknown): Order | null => {
  if (!isRecord(v)) return null;
  const { id, shop, quantity, reward, dueDay } = v;
  const good = parseOrderGood(v.good);
  if (!isId(id) || !isTownShop(shop) || !good) return null;
  if (!isId(quantity) || quantity < 1 || !isFiniteNumber(reward) || reward < 0 || !isId(dueDay)) return null;
  return { id, shop, good, quantity, reward, dueDay };
};

const parseCargo = (v: unknown): Cargo | null => {
  if (!isRecord(v)) return null;
  const produce = parseCounts(v.produce);
  const products = parseProducts(v.products);
  return produce && products ? { produce, products } : null;
};

const parseResearch = (v: unknown): Research | null => {
  if (!isRecord(v) || !Array.isArray(v.unlocked) || !v.unlocked.every(isCropId)) return null;
  const unlocked = [...new Set([...STARTING_CROPS, ...v.unlocked])];
  const c = v.current;
  if (c === null) return { unlocked, current: null };
  if (!isRecord(c) || !isCropId(c.cropId) || !isFiniteNumber(c.minutesLeft)) return null;
  return { unlocked, current: { cropId: c.cropId, minutesLeft: Math.max(0, c.minutesLeft) } };
};

/** The linked GitHub account: null when none, undefined when invalid. */
const parseGitHub = (v: unknown): GitHubLink | null | undefined => {
  if (v === null) return null;
  if (!isRecord(v) || typeof v.login !== 'string' || !isFiniteNumber(v.activeDays) || !isFiniteNumber(v.syncedAt)) return undefined;
  return { login: v.login, activeDays: Math.max(0, Math.floor(v.activeDays)), syncedAt: v.syncedAt };
};

const parseCarcass = (v: unknown): Carcass | null => {
  if (!isRecord(v)) return null;
  const { id, kind, breed, x, y, diedAt, shelterId } = v;
  if (!isId(id) || !isAnimalId(kind) || !isBreedId(breed) || BREEDS[breed].species !== kind) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(diedAt)) return null;
  if (!isFiniteNumber(shelterId) || !Number.isInteger(shelterId)) return null;
  return { id, kind, breed, x, y, diedAt, shelterId };
};

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const isRotation = (v: unknown): v is Rotation => ROTATIONS.some((r) => r === v);

const WORK_KINDS: readonly StructureWorkKind[] = ['build', 'demolish', 'upgrade'];
const isWorkKind = (v: unknown): v is StructureWorkKind => WORK_KINDS.some((k) => k === v);
const isShelterLevel = (v: unknown): v is ShelterLevel => SHELTER_LEVEL_IDS.some((l) => l === v);

/** Structure work, or undefined when the field is absent (null when it is invalid). */
const parseWork = (v: unknown): StructureWork | undefined | null => {
  if (v === undefined) return undefined;
  if (!isRecord(v) || !isWorkKind(v.kind) || !isFiniteNumber(v.done) || !isFiniteNumber(v.total)) return null;
  const work: StructureWork = { kind: v.kind, done: Math.max(0, v.done), total: Math.max(0, v.total) };
  if (v.kind !== 'upgrade') return work;
  return isShelterLevel(v.toLevel) ? { ...work, toLevel: v.toLevel } : null;
};

const parseStructure = (v: unknown): StructureInstance | null => {
  if (!isRecord(v)) return null;
  const { id, type, x, y, rotation } = v;
  if (!isId(id) || !isStructureId(type) || !isRotation(rotation)) return null;
  if (!isId(x) || !isId(y) || !inBounds(x, y)) return null;
  const work = parseWork(v.work);
  if (work === null) return null;
  const stock = v.stock === undefined ? undefined : parseProducts(v.stock);
  if (stock === null) return null;
  if (v.level !== undefined && !isShelterLevel(v.level)) return null;
  const level = v.level !== undefined && v.level > 1 ? v.level : undefined;
  if (v.manure !== undefined && (!isFiniteNumber(v.manure) || v.manure < 0)) return null;
  const manure = isFiniteNumber(v.manure) && v.manure > 0 ? v.manure : undefined;
  return {
    id,
    type,
    x,
    y,
    rotation,
    ...(work ? { work } : {}),
    ...(level ? { level } : {}),
    ...(stock && Object.keys(stock).length > 0 ? { stock } : {}),
    ...(manure ? { manure } : {}),
  };
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
  const medicine = parseMedicine(inventory.medicine);
  if (!seeds || !produce || !products || !medicine) return null;
  if (!isFiniteNumber(inventory.fertilizer) || inventory.fertilizer < 0) return null;
  const fertilizer = Math.floor(inventory.fertilizer);
  const workers = parseList(v.workers, parseWorker);
  const tasks = parseList(v.tasks, parseTask);
  const animals = parseList(v.animals, parseAnimal);
  const structures = parseList(v.structures, parseStructure);
  const candidates = parseList(v.candidates, parseCandidate);
  const carcasses = parseList(v.carcasses, parseCarcass);
  const orders = parseList(v.orders, parseOrder);
  const cargo = parseCargo(v.cargo);
  const research = parseResearch(v.research);
  const github = parseGitHub(v.github);
  if (!orders || !cargo || !research || github === undefined || !isVehicleLevel(v.vehicleLevel)) return null;
  const vehicleLevel = v.vehicleLevel;
  if (!workers || !candidates || !tasks || !animals || !carcasses || !structures || !isId(nextId)) return null;
  const maxId = Math.max(
    0,
    ...workers.map((w) => w.id),
    ...candidates.map((c) => c.id),
    ...tasks.map((t) => t.id),
    ...animals.map((a) => a.id),
    ...carcasses.map((c) => c.id),
    ...orders.map((o) => o.id),
    ...structures.map((s) => s.id),
  );

  // Every animal has a shelter, and construction tasks and sites match (a site always has its crew).
  return repairSiteTasks(rehomeAnimals({
    gameMinutes,
    money,
    // Tile flags are derived from the structure list, so footprint changes never leave stale tiles.
    tiles: stampStructures(parsedTiles, structures),
    unlockedPlots: plots,
    plotsPurchased: Math.floor(plotsPurchased),
    inventory: { seeds, produce, products, medicine, fertilizer },
    workers,
    candidates,
    tasks,
    animals,
    carcasses,
    vehicleLevel,
    cargo,
    orders,
    research,
    github,
    structures,
    nextId: Math.max(nextId, maxId + 1),
  }));
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
  if (version > SAVE_VERSION || version < OLDEST_LOADABLE_VERSION) return null;
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

/** True for a readable save made before OLDEST_LOADABLE_VERSION (it cannot be loaded any more). */
export const isOutdatedSave = (raw: string | null): boolean => {
  if (!raw) return false;
  try {
    const data: unknown = JSON.parse(raw);
    return isRecord(data) && isFiniteNumber(data.saveVersion) && data.saveVersion < OLDEST_LOADABLE_VERSION;
  } catch {
    return false;
  }
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
