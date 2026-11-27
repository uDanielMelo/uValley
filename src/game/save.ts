import {
  ANIMALS,
  ANIMAL_IDS,
  ANIMAL_PRODUCT_IDS,
  BREEDS,
  FEED,
  BREED_IDS,
  type AnimalId,
  type AnimalProductId,
  type BreedId,
} from '../data/animals';
import { CROP_IDS, type CropId } from '../data/crops';
import { DISEASE_IDS, MEDICINE_IDS, type DiseaseId, type MedicineId } from '../data/health';
import { SHELTER_LEVEL_IDS, STRUCTURE_IDS, type ShelterLevel, type StructureId } from '../data/structures';
import { CONDITION, MACHINE_IDS, type MachineId } from '../data/machines';
import { DEFAULT_PRIORITIES, SKILL_IDS, type SkillId } from '../data/workers';
import { SPEED_OPTIONS, type GameSpeed } from '../data/world';
import { PLOT_COUNT, TILE_COUNT, inBounds, isValidTileIndex } from './grid';
import { hash01 } from './random';
import { TOWN_SHOP_IDS, VEHICLE_LEVELS, type OrderGood, type TownShopId, type VehicleLevel } from '../data/market';
import type {
  Field,
  Animal,
  AnimalHealth,
  Candidate,
  Machine,
  Carcass,
  Delivery,
  HeldPurchase,
  PendingAnimal,
  GameState,
  GridPoint,
  ItemCounts,
  MedicineCounts,
  Order,
  ProductCounts,
  Listing,
  Offer,
  Research,
  Rotation,
  Shipment,
  ShipmentKind,
  ShipmentLine,
  ShipmentOutcome,
  ShipmentPhase,
  ShipmentWork,
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
import { rehomeMachines } from './machines';
import { rehomeAnimals } from './shelters';
import { repairHaulTasks } from './shipments';
import { stampStructures } from './structures';

export const SAVE_VERSION = 25;
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
 * v21 sells live animals through the loading pen (`Animal.penned`, 'herd' tasks, 'livestock' trucks
 * with their `animals`). v20 has dock levels with several bays (`Shipment.bay`, loader `slot`s) and the freight vehicle the
 * farm chose (`freightVehicle`). v19 buys by freight: purchases are shipments carrying a `delivery`, deliveries nobody unloaded
 * are `held` in town, and feed is a stock (`inventory.feed`, kg) with automatic orders
 * (`feedOrder`). v18 sells through the dock only: listings, offers and hired freight (`listings`, `offers`, sale
 * shipments with the goods set aside), and the town load (`cargo`) is gone. v17 replaced the
 * shipping bin with the dock and added the vehicles visiting it (`shipments`) and the loading
 * activity ('haul'). v16 is the 64x64 map (the farm starts with 32x32 tiles by the
 * south edge), with road rings around the buildings and ring road tasks tied to their site
 * (`job.siteId`). Earlier versions (v1–v15, on the 32x32 map) are not loaded.
 */
export interface SaveDataV23 {
  saveVersion: 25;
  savedAt: number;
  game: GameState;
  settings: SaveSettings;
}

export type SaveData = SaveDataV23;

export interface LoadedSave {
  game: GameState;
  settings: SaveSettings;
}

const renameBin = (v: unknown): unknown => (v === 'shippingBin' ? 'dock' : v);

/** v16 → v17: the shipping bin becomes the dock (same spot), no vehicles yet, and everyone loads first. */
const migrateV16 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game)) return data;
  const structures = Array.isArray(game.structures)
    ? game.structures.map((s: unknown) => (isRecord(s) ? { ...s, type: renameBin(s.type) } : s))
    : game.structures;
  const tiles = Array.isArray(game.tiles)
    ? game.tiles.map((t: unknown) => (isRecord(t) && t.structure === 'shippingBin' ? { ...t, structure: 'dock' } : t))
    : game.tiles;
  const workers = Array.isArray(game.workers)
    ? game.workers.map((w: unknown) =>
        isRecord(w) && Array.isArray(w.priorities) && !w.priorities.includes('haul')
          ? { ...w, priorities: [DEFAULT_PRIORITIES[0], ...w.priorities] }
          : w,
      )
    : game.workers;
  return { ...data, saveVersion: 17, game: { ...game, structures, tiles, workers, shipments: [] } };
};

/** Adds a record of counts (`{ wheat: 3 }`) into another, ignoring anything that is not a count. */
const mergeCounts = (into: unknown, from: unknown): unknown => {
  if (!isRecord(into) || !isRecord(from)) return into;
  const result: Record<string, unknown> = { ...into };
  for (const [key, value] of Object.entries(from)) {
    if (!isFiniteNumber(value) || value <= 0) continue;
    const had = result[key];
    result[key] = (isFiniteNumber(had) ? had : 0) + value;
  }
  return result;
};

/**
 * v17 → v18: what was loaded for town goes back to the inventory (selling is by listing now), no
 * listings yet, and a customer being loaded has its lot set aside.
 */
const migrateV17 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game)) return data;
  const { cargo, ...rest } = game;
  const inventory =
    isRecord(game.inventory) && isRecord(cargo)
      ? {
          ...game.inventory,
          produce: mergeCounts(game.inventory.produce, cargo.produce),
          products: mergeCounts(game.inventory.products, cargo.products),
        }
      : game.inventory;
  const shipments = Array.isArray(game.shipments)
    ? game.shipments.map((s: unknown) => (isRecord(s) && s.phase === 'loading' ? { ...s, staged: true } : s))
    : game.shipments;
  return { ...data, saveVersion: 18, game: { ...rest, inventory, shipments, listings: [], offers: [] } };
};

/**
 * v18 → v19: feed becomes a stock. The farm gets FEED.autoDays of feed for the animals it has
 * (what it used to pay at midnight) and automatic orders are on; nothing is held in town yet.
 */
const migrateV18 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game)) return data;
  const daily = Array.isArray(game.animals)
    ? game.animals.reduce<number>((sum, a: unknown) => sum + (isRecord(a) && isAnimalId(a.kind) ? ANIMALS[a.kind].feedKgPerDay : 0), 0)
    : 0;
  const inventory = isRecord(game.inventory) ? { ...game.inventory, feed: daily * FEED.autoDays } : game.inventory;
  return {
    ...data,
    saveVersion: 19,
    game: { ...game, inventory, held: [], feedOrder: { auto: true, days: FEED.autoDays } },
  };
};

/** v19 → v20: vehicles under way hold the only bay there was, and the freight picks its vehicle by weight. */
const migrateV19 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game)) return data;
  const shipments = Array.isArray(game.shipments)
    ? game.shipments.map((s: unknown) => (isRecord(s) && s.phase !== 'scheduled' ? { ...s, bay: 0 } : s))
    : game.shipments;
  return { ...data, saveVersion: 20, game: { ...game, shipments, freightVehicle: 'auto' } };
};

/** v20 → v21: nothing to convert (no animal is penned yet); only the version moves. */
const migrateV20 = (data: Record<string, unknown>): Record<string, unknown> => ({ ...data, saveVersion: 21 });

/**
 * v21 → v22: the house grew from 2×2 to a 4×2 lodge. It widens to the west (x - 2); whatever stood
 * there (the starting bunkhouse) moves further west, one street away, with its ring opened.
 */
const migrateV21 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game) || !Array.isArray(game.structures) || !Array.isArray(game.tiles)) return { ...data, saveVersion: 22 };
  const size = 64;
  const tiles = [...game.tiles] as unknown[];
  const bunkhouseWidth = (s: Record<string, unknown>): number => (s.rotation === 1 || s.rotation === 3 ? 1 : 2);
  const house = game.structures.find((s): s is Record<string, unknown> => isRecord(s) && s.type === 'house');
  if (!house || typeof house.x !== 'number' || typeof house.y !== 'number') return { ...data, saveVersion: 22 };
  const hx = house.x - 2;
  const hy = house.y;
  const structures = game.structures.map((s: unknown) => {
    if (!isRecord(s) || s === house || typeof s.x !== 'number' || typeof s.y !== 'number') return s;
    // Only the starting bunkhouse is a likely neighbour; others stay where they are.
    if (s.type !== 'bunkhouse') return s;
    const w = bunkhouseWidth(s);
    const overlaps = s.x < hx + 4 && s.x + w > hx && s.y < hy + 2 && s.y + 1 > hy;
    if (!overlaps) return s;
    const nx = hx - 1 - w;
    for (let y = s.y - 1; y <= s.y + 1; y++) {
      for (let x = nx - 1; x <= nx + w; x++) {
        const i = y * size + x;
        const t = tiles[i];
        if (x < 0 || x >= size || y < 0 || y >= size || !isRecord(t) || t.state !== 'grass' || t.structure !== undefined) continue;
        tiles[i] = { ...t, road: true };
      }
    }
    return { ...s, x: nx };
  });
  // The lodge covers the old street column and anything under it.
  for (let y = hy; y < hy + 2; y++) {
    for (let x = hx; x < hx + 4; x++) {
      const t = tiles[y * size + x];
      if (isRecord(t) && t.road !== undefined) {
        const { road: _road, ...rest } = t;
        tiles[y * size + x] = rest;
      }
    }
  }
  return {
    ...data,
    saveVersion: 22,
    game: { ...game, tiles, structures: structures.map((s: unknown) => (s === house ? { ...house, x: hx } : s)) },
  };
};

/**
 * v24 → v25: soil. The farm gets a soil seed derived from the save itself (so loading the same save twice
 * gives the same map), no surveys and no fields.
 */
const migrateV24 = (data: Record<string, unknown>): Record<string, unknown> => {
  const game = data.game;
  if (!isRecord(game)) return { ...data, saveVersion: 25 };
  const nextId = isFiniteNumber(game.nextId) ? game.nextId : 1;
  const minutes = isFiniteNumber(game.gameMinutes) ? Math.floor(game.gameMinutes) : 0;
  const soilSeed = 1 + Math.floor(hash01(nextId * 7919 + minutes) * (2 ** 31 - 2));
  return { ...data, saveVersion: 25, game: { ...game, soilSeed, surveyedPlots: [], fields: [] } };
};

/**
 * Migrations from version N to N + 1. Add an entry here whenever SAVE_VERSION is bumped:
 * `migrations[21] = (v21) => v22`.
 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  16: migrateV16,
  17: migrateV17,
  18: migrateV18,
  19: migrateV19,
  20: migrateV20,
  21: migrateV21,
  // v23 adds player-built fences (Tile.fence, 'fence' jobs): nothing to convert.
  22: (data) => ({ ...data, saveVersion: 23 }),
  // v24 adds machinery (GameState.machines, the machinery skill, riding workers).
  23: (data) => ({ ...data, machines: [], saveVersion: 24 }),
  24: migrateV24,
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
  if (v.fence !== undefined) {
    const fence = v.fence;
    if (!isRecord(fence) || v.state !== 'grass' || tile.road || tile.structure) return null;
    tile.fence = {};
    if (fence.gate === true) {
      tile.fence.gate = true;
      if (fence.open === true) tile.fence.open = true;
    }
  }
  return tile;
};

const TASK_KINDS: readonly TaskKind[] = ['hoe', 'seed', 'water', 'hand', 'fertilize', 'tend', 'build', 'haul'];
const WORKER_KINDS: readonly WorkerKind[] = ['staff', 'temp'];
const STARS: readonly Stars[] = [1, 2, 3];
const isStars = (v: unknown): v is Stars => STARS.some((s) => s === v);
const isSkillId = (v: unknown): v is SkillId => SKILL_IDS.some((s) => s === v);
const isTaskKind = (v: unknown): v is TaskKind => TASK_KINDS.some((t) => t === v);
const isMachineId = (v: unknown): v is MachineId => MACHINE_IDS.some((m) => m === v);
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
    ...(isId(v.machineId) ? { machineId: v.machineId } : {}),
    ...(v.riding === true && isId(v.machineId) ? { riding: true as const } : {}),
    ...(isId(v.rentalId) ? { rentalId: v.rentalId } : {}),
  };
};

const parseMachine = (v: unknown): Machine | null => {
  if (!isRecord(v)) return null;
  const { id, type, parkId, slot, condition } = v;
  if (!isId(id) || !isMachineId(type) || !isId(parkId) || !isId(slot)) return null;
  if (!isFiniteNumber(condition)) return null;
  let rental: Machine['rental'];
  if (v.rental !== undefined) {
    if (!isRecord(v.rental) || !isFiniteNumber(v.rental.until)) return null;
    const operatorId = v.rental.operatorId;
    if (operatorId !== undefined && !isId(operatorId)) return null;
    rental = operatorId === undefined ? { until: v.rental.until } : { until: v.rental.until, operatorId };
  }
  if (v.repairUntil !== undefined && !isFiniteNumber(v.repairUntil)) return null;
  if (v.driverId !== undefined && !isId(v.driverId)) return null;
  if (v.unpaidMinutes !== undefined && !isFiniteNumber(v.unpaidMinutes)) return null;
  return {
    id,
    type,
    parkId,
    slot,
    condition: Math.min(CONDITION.max, Math.max(0, condition)),
    ...(rental ? { rental } : {}),
    ...(v.repairUntil !== undefined ? { repairUntil: v.repairUntil } : {}),
    ...(v.driverId !== undefined ? { driverId: v.driverId } : {}),
    ...(v.unpaidMinutes !== undefined ? { unpaidMinutes: Math.max(0, v.unpaidMinutes) } : {}),
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
  if (v.type === 'fence' && typeof v.remove === 'boolean' && isFiniteNumber(v.cost) && v.cost >= 0) {
    return v.gate === true ? { type: 'fence', remove: v.remove, gate: true, cost: v.cost } : { type: 'fence', remove: v.remove, cost: v.cost };
  }
  if (v.type === 'medicate' && isId(v.animalId)) return { type: 'medicate', animalId: v.animalId };
  if (v.type === 'carcass' && isId(v.carcassId)) return { type: 'carcass', carcassId: v.carcassId };
  if (v.type === 'herd' && isId(v.animalId) && isId(v.penId)) return { type: 'herd', animalId: v.animalId, penId: v.penId };
  // Loaders saved before slots (v19) get none and are queued again by repairHaulTasks.
  if (v.type === 'shipment' && isId(v.shipmentId)) return { type: 'shipment', shipmentId: v.shipmentId, slot: isId(v.slot) ? v.slot : -1 };
  return null;
};

const parseTask = (v: unknown): Task | null => {
  if (!isRecord(v)) return null;
  const { id, kind, tile, cropId, workerId } = v;
  if (!isId(id) || !isTaskKind(kind) || !isFiniteNumber(tile) || !isValidTileIndex(tile)) return null;
  if (cropId !== null && !isCropId(cropId)) return null;
  if (workerId !== null && !isId(workerId)) return null;
  if (kind !== 'build' && kind !== 'tend' && kind !== 'haul') return { id, kind, tile, cropId, workerId };
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
  const p = v.penned;
  if (p !== undefined && (!isRecord(p) || !isId(p.penId) || !isFiniteNumber(p.since))) return null;
  const penned = isRecord(p) && isId(p.penId) && isFiniteNumber(p.since) ? { penId: p.penId, since: p.since } : undefined;
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
    ...(penned ? { penned } : {}),
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

const parseListing = (v: unknown): Listing | null => {
  if (!isRecord(v)) return null;
  const { id, price, quantity, postedAt, offered } = v;
  const good = parseOrderGood(v.good);
  if (!isId(id) || !good || !isId(price) || price < 1 || !isId(quantity) || quantity < 1 || !isFiniteNumber(postedAt)) return null;
  if (!isRecord(offered) || !isId(offered.day) || !isId(offered.units)) return null;
  return { id, good, price, quantity, postedAt, offered: { day: offered.day, units: offered.units } };
};

const parseOffer = (v: unknown): Offer | null => {
  if (!isRecord(v)) return null;
  const { id, listingId, quantity, price, expiresAt } = v;
  if (!isId(id) || !isId(listingId) || !isId(quantity) || quantity < 1 || !isId(price) || !isFiniteNumber(expiresAt)) return null;
  return { id, listingId, quantity, price, expiresAt };
};

const SHIPMENT_PHASES: readonly ShipmentPhase[] = ['scheduled', 'enroute', 'waiting', 'loading', 'leaving'];
const SHIPMENT_KINDS: readonly ShipmentKind[] = ['walkin', 'sale', 'purchase', 'livestock'];
const isShipmentKind = (v: unknown): v is ShipmentKind => SHIPMENT_KINDS.some((k) => k === v);
const SHIPMENT_OUTCOMES: readonly ShipmentOutcome[] = ['sold', 'delivered', 'expired', 'dismissed'];
const isShipmentPhase = (v: unknown): v is ShipmentPhase => SHIPMENT_PHASES.some((p) => p === v);
const isShipmentOutcome = (v: unknown): v is ShipmentOutcome => SHIPMENT_OUTCOMES.some((o) => o === v);

const parseLine = (v: unknown): ShipmentLine | null => {
  if (!isRecord(v)) return null;
  const good = parseOrderGood(v.good);
  return good && isId(v.quantity) && v.quantity >= 1 ? { good, quantity: v.quantity } : null;
};

const parsePendingAnimal = (v: unknown): PendingAnimal | null => {
  if (!isRecord(v)) return null;
  const { kind, breed, age, stars, shelterId, price } = v;
  if (!isAnimalId(kind) || !isBreedId(breed) || BREEDS[breed].species !== kind || !isStars(stars)) return null;
  if ((age !== 'baby' && age !== 'adult') || !isId(shelterId) || !isFiniteNumber(price) || price < 0) return null;
  return { kind, breed, age, stars, shelterId, price };
};

const parseDelivery = (v: unknown): Delivery | null => {
  if (!isRecord(v)) return null;
  const seeds = parseCounts(v.seeds);
  const medicine = parseMedicine(v.medicine);
  const animals = parseList(v.animals, parsePendingAnimal);
  const { fertilizer, feed } = v;
  if (!seeds || !medicine || !animals || !isId(fertilizer) || !isFiniteNumber(feed) || feed < 0) return null;
  const delivery: Delivery = { seeds, medicine, fertilizer, feed, animals };
  if (isFiniteNumber(v.heldSince)) delivery.heldSince = v.heldSince;
  return delivery;
};

const parseHeld = (v: unknown): HeldPurchase | null => {
  if (!isRecord(v)) return null;
  const delivery = parseDelivery(v.delivery);
  if (!delivery || !isId(v.id) || !isFiniteNumber(v.since) || !isFiniteNumber(v.cost) || v.cost < 0) return null;
  return { id: v.id, delivery, since: v.since, cost: v.cost };
};

const parseShipmentWork = (v: unknown): ShipmentWork | undefined | null => {
  if (v === undefined) return undefined;
  if (!isRecord(v) || !isFiniteNumber(v.done) || !isFiniteNumber(v.total)) return null;
  return { done: Math.max(0, v.done), total: Math.max(0, v.total) };
};

const parseShipment = (v: unknown): Shipment | null => {
  if (!isRecord(v)) return null;
  const { id, kind, dockId, phase, setOffAt, arrivesAt, deadline, payment } = v;
  if (!isId(id) || !isShipmentKind(kind) || !isId(dockId) || !isShipmentPhase(phase)) return null;
  if (!isFiniteNumber(setOffAt) || !isFiniteNumber(arrivesAt) || !isFiniteNumber(deadline)) return null;
  if (!isFiniteNumber(payment) || payment < 0) return null;
  const goods = parseList(v.goods, parseLine);
  const work = parseShipmentWork(v.work);
  // Sales carry their lot; a purchase carries its delivery and a livestock truck its animals instead.
  if (!goods || (goods.length === 0) !== (kind === 'purchase' || kind === 'livestock') || work === null) return null;
  // A loading shipment always has its work, and its goods already left the inventory.
  if ((phase === 'loading') !== (work !== undefined)) return null;
  const staged = v.staged === true;
  if (phase === 'loading' && !staged) return null;
  const shipment: Shipment = { id, kind, dockId, phase, setOffAt, arrivesAt, deadline, goods, payment };
  if (isId(v.bay)) shipment.bay = v.bay;
  else if (phase !== 'scheduled') return null;
  if (work) shipment.work = work;
  if (staged && phase !== 'leaving') shipment.staged = true;
  if (kind === 'livestock') {
    if (!Array.isArray(v.animals) || !v.animals.every(isId)) return null;
    shipment.animals = v.animals.filter(isId);
  }
  if (kind === 'purchase') {
    const delivery = parseDelivery(v.delivery);
    if (!delivery || !isFiniteNumber(v.goodsCost) || v.goodsCost < 0) return null;
    shipment.delivery = delivery;
    shipment.goodsCost = v.goodsCost;
  }
  if (kind !== 'walkin') {
    if (!isFiniteNumber(v.freight) || v.freight < 0 || !isVehicleLevel(v.vehicle)) return null;
    shipment.freight = v.freight;
    shipment.vehicle = v.vehicle;
    if (v.order !== undefined) {
      const order = parseOrder(v.order);
      if (!order) return null;
      shipment.order = order;
    }
  }
  if (phase === 'leaving') {
    if (!isFiniteNumber(v.leftAt) || !isFiniteNumber(v.goneAt) || !isShipmentOutcome(v.outcome)) return null;
    shipment.leftAt = v.leftAt;
    shipment.goneAt = v.goneAt;
    shipment.outcome = v.outcome;
    if (isId(v.lost) && v.lost > 0) shipment.lost = v.lost;
  }
  return shipment;
};

const parseResearch = (v: unknown): Research | null => {
  if (!isRecord(v) || !Array.isArray(v.unlocked) || !v.unlocked.every(isCropId)) return null;
  const unlocked = [...new Set([...STARTING_CROPS, ...v.unlocked])];
  const c = v.current;
  if (c === null) return { unlocked, current: null };
  if (!isRecord(c) || !isCropId(c.cropId) || !isFiniteNumber(c.minutesLeft)) return null;
  return { unlocked, current: { cropId: c.cropId, minutesLeft: Math.max(0, c.minutesLeft) } };
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

const FIELD_NAME_MAX = 32;

/** Analyzed plots: valid plot indices, each once (bad entries are dropped). */
const parseSurveyed = (v: unknown): number[] => {
  if (!Array.isArray(v)) return [];
  const result: number[] = [];
  for (const p of v) {
    if (isFiniteNumber(p) && Number.isInteger(p) && p >= 0 && p < PLOT_COUNT && !result.includes(p)) result.push(p);
  }
  return result;
};

const overlaps = (a: Field, b: Field): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const parseField = (v: unknown): Field | null => {
  if (!isRecord(v)) return null;
  const { id, name, x, y, w, h } = v;
  if (!isId(id) || typeof name !== 'string' || !isId(x) || !isId(y) || !isId(w) || !isId(h)) return null;
  const trimmed = name.trim().slice(0, FIELD_NAME_MAX);
  if (!trimmed || w < 1 || h < 1 || !inBounds(x, y) || !inBounds(x + w - 1, y + h - 1)) return null;
  const field: Field = { id, name: trimmed, x, y, w, h };
  const last = v.lastHarvest;
  if (
    isRecord(last) &&
    isId(last.day) &&
    isId(last.units) &&
    isId(last.tiles) &&
    isFiniteNumber(last.soil) &&
    last.soil >= 0
  ) {
    field.lastHarvest = { day: last.day, units: last.units, tiles: last.tiles, soil: last.soil };
  }
  return field;
};

/** Fields: bad ones and ones overlapping an earlier field are dropped. */
const parseFields = (v: unknown): Field[] => {
  if (!Array.isArray(v)) return [];
  const result: Field[] = [];
  for (const raw of v) {
    const field = parseField(raw);
    if (field && !result.some((f) => f.id === field.id || overlaps(f, field))) result.push(field);
  }
  return result;
};

const parseSoilSeed = (v: unknown): number | null =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 1 ? v : null;

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
  if (!isFiniteNumber(inventory.feed) || inventory.feed < 0) return null;
  const feed = inventory.feed;
  const held = parseList(v.held, parseHeld);
  const feedOrder = isRecord(v.feedOrder) && typeof v.feedOrder.auto === 'boolean' && isId(v.feedOrder.days) && v.feedOrder.days >= 1
    ? { auto: v.feedOrder.auto, days: v.feedOrder.days }
    : null;
  if (!held || !feedOrder) return null;
  const workers = parseList(v.workers, parseWorker);
  const tasks = parseList(v.tasks, parseTask);
  const animals = parseList(v.animals, parseAnimal);
  const structures = parseList(v.structures, parseStructure);
  const candidates = parseList(v.candidates, parseCandidate);
  const carcasses = parseList(v.carcasses, parseCarcass);
  const orders = parseList(v.orders, parseOrder);
  const research = parseResearch(v.research);
  const allShipments = parseList(v.shipments, parseShipment);
  // A machine that does not validate is dropped, not the whole save.
  const machines = Array.isArray(v.machines)
    ? v.machines.map(parseMachine).filter((m): m is Machine => m !== null)
    : [];
  const listings = parseList(v.listings, parseListing);
  const allOffers = parseList(v.offers, parseOffer);
  if (!allShipments || !listings || !allOffers) return null;
  if (!orders || !research || !isVehicleLevel(v.vehicleLevel)) return null;
  const offers = allOffers.filter((o) => listings.some((l) => l.id === o.listingId));
  const vehicleLevel = v.vehicleLevel;
  const freightVehicle = v.freightVehicle === 'auto' || isVehicleLevel(v.freightVehicle) ? v.freightVehicle : null;
  if (freightVehicle === null) return null;
  if (!workers || !candidates || !tasks || !animals || !carcasses || !structures || !isId(nextId)) return null;
  const fields = parseFields(v.fields);
  const maxId = Math.max(
    0,
    ...workers.map((w) => w.id),
    ...candidates.map((c) => c.id),
    ...tasks.map((t) => t.id),
    ...animals.map((a) => a.id),
    ...carcasses.map((c) => c.id),
    ...orders.map((o) => o.id),
    ...structures.map((s) => s.id),
    ...allShipments.map((s) => s.id),
    ...machines.map((m) => m.id),
    ...listings.map((l) => l.id),
    ...allOffers.map((o) => o.id),
    ...held.map((h) => h.id),
    ...fields.map((f) => f.id),
  );
  // A vehicle whose dock (or loading pen) is gone is dropped (neither can go while a vehicle is coming,
  // so this only guards bad data).
  const docks = new Set(structures.filter((s) => s.type === 'dock' || s.type === 'loadingPen').map((s) => s.id));
  const shipments = allShipments.filter((s) => docks.has(s.dockId));

  // Every animal has a shelter, construction tasks and sites match (a site always has its crew),
  // and so do the loaders and the vehicles being loaded.
  return repairHaulTasks(repairSiteTasks(rehomeMachines(rehomeAnimals({
    gameMinutes,
    money,
    // Tile flags are derived from the structure list, so footprint changes never leave stale tiles.
    tiles: stampStructures(parsedTiles, structures),
    unlockedPlots: plots,
    plotsPurchased: Math.floor(plotsPurchased),
    inventory: { seeds, produce, products, medicine, fertilizer, feed },
    workers,
    candidates,
    tasks,
    animals,
    carcasses,
    vehicleLevel,
    freightVehicle,
    orders,
    listings,
    offers,
    research,
    structures,
    shipments,
    machines,
    held,
    feedOrder,
    soilSeed: parseSoilSeed(v.soilSeed),
    surveyedPlots: parseSurveyed(v.surveyedPlots),
    fields,
    nextId: Math.max(nextId, maxId + 1),
  }))));
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
