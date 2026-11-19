import {
  ANIMALS,
  ANIMAL_IDS,
  ANIMAL_PRODUCT_IDS,
  BREEDS,
  BREED_IDS,
  GAME_MINUTES_PER_REAL_HOUR,
  LIFE_STAGES,
  SPECIES_BREEDS,
  type AnimalId,
  type AnimalProductId,
  type BreedId,
} from '../data/animals';
import { CROP_IDS, type CropId } from '../data/crops';
import { DISEASE_IDS, MEDICINE_IDS, type DiseaseId, type MedicineId } from '../data/health';
import { ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X } from '../data/roads';
import { SHELTER_LEVEL_IDS, START_STRUCTURES, STRUCTURE_IDS, type ShelterLevel, type StructureId } from '../data/structures';
import {
  DEFAULT_PRIORITIES,
  HOME_POSITION,
  SKILL_IDS,
  STARTING_WORKERS,
  type SkillId,
  type WorkerTemplate,
} from '../data/workers';
import { GRID_SIZE, MINUTES_PER_DAY, SPEED_OPTIONS, type GameSpeed } from '../data/world';
import { PLOT_COUNT, TILE_COUNT, inBounds, isValidTileIndex, tileIndex } from './grid';
import type {
  Animal,
  AnimalHealth,
  Candidate,
  Carcass,
  GameState,
  GridPoint,
  ItemCounts,
  MedicineCounts,
  ProductCounts,
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
import { rehomeAnimals } from './shelters';
import { accessRoadTiles } from './roads';
import { hourlyWageFor, rollCandidates } from './staff';
import { footprintCells, footprintOf, stampStructures } from './structures';

export const SAVE_VERSION = 11;
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
 * v4 added the list of placed structures; v5 added roads (`Tile.road`) and the access road;
 * v6 moved the access road south, replaced the family with staff (age, stars, skills,
 * priorities, hourly wage), added the bunkhouse and the hiring board; v7 made construction
 * work for the crew (`StructureInstance.work`, 'build' tasks with a `job`, 'build' in priorities);
 * v8 housed animals in shelters (`Animal.shelterId`, `path` instead of `target`, products in
 * `StructureInstance.stock`) and added the 'tend' activity; v9 added shelter levels
 * (`StructureInstance.level`, 'upgrade' work with `toLevel`); v10 gave animals a breed, stars and a
 * birth time (`bornAt`); v11 added health (`Animal.health`), medicine in the inventory and carcasses.
 */
export interface SaveDataV11 {
  saveVersion: 11;
  savedAt: number;
  game: GameState;
  settings: SaveSettings;
}

export type SaveData = SaveDataV11;

export interface LoadedSave {
  game: GameState;
  settings: SaveSettings;
}

/**
 * Migrations from version N to N + 1. Add an entry here whenever SAVE_VERSION is bumped:
 * `migrations[1] = (v1) => v2`.
 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: the family arrives (in the v2 worker format); the queue starts empty.
  1: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const family = LEGACY_FAMILY.map((f, i) => ({
      id: 1 + i,
      name: f.name,
      role: f.role,
      kind: 'family',
      efficiency: f.efficiency,
      x: HOME_POSITION.x + (i - 1.5) * 0.3,
      y: HOME_POSITION.y,
      taskId: null,
      path: [],
      progress: 0,
    }));
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
    const structures = START_STRUCTURES.filter((p) => p.id === 'house' || p.id === 'shippingBin').map((p, i) => ({
      id: firstId + i,
      type: p.id,
      x: p.x,
      y: p.y,
      rotation: 0,
    }));
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
  // v5 → v6: the access road moves south, the family becomes staff in a new bunkhouse, and the
  // hiring board opens.
  5: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    if (!Array.isArray(game.tiles)) return data;
    const tiles = moveAccessRoad(game.tiles);
    let nextId = isFiniteNumber(game.nextId) ? game.nextId : 1;
    const structures = Array.isArray(game.structures) ? game.structures.slice() : [];
    const taskTiles = new Set(
      (Array.isArray(game.tasks) ? game.tasks : []).flatMap((t) => (isRecord(t) && isFiniteNumber(t.tile) ? [t.tile] : [])),
    );
    const spot = findBunkhouseSpot(tiles, taskTiles);
    if (spot) structures.push({ id: nextId++, type: 'bunkhouse', x: spot.x, y: spot.y, rotation: spot.rotation });
    const workers = (Array.isArray(game.workers) ? game.workers : []).map((w, i) => (isRecord(w) ? migrateWorker(w, i) : w));
    const names = workers.flatMap((w) => (isRecord(w) && typeof w.name === 'string' ? [w.name] : []));
    const day = isFiniteNumber(game.gameMinutes) ? Math.floor(game.gameMinutes / MINUTES_PER_DAY) : 0;
    const candidates = rollCandidates(day, nextId, names);
    nextId += candidates.length;
    return { ...data, game: { ...game, tiles, structures, workers, candidates, nextId } };
  },
  // v6 → v7: construction becomes crew work. Saved structures are finished; everyone gets the
  // new 'build' activity at the end of their list.
  6: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const workers = (Array.isArray(game.workers) ? game.workers : []).map((w) =>
      isRecord(w) && Array.isArray(w.priorities) && !w.priorities.includes('build')
        ? { ...w, priorities: [...w.priorities, 'build'] }
        : w,
    );
    return { ...data, game: { ...game, workers } };
  },
  // v7 → v8: animals move into shelters (assigned on load by rehomeAnimals), walk along paths and
  // leave their products in the shelter; a ready product is laid as soon as the game runs. Everyone
  // gets the new 'tend' activity at the end of their list.
  7: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const workers = (Array.isArray(game.workers) ? game.workers : []).map((w) =>
      isRecord(w) && Array.isArray(w.priorities) && !w.priorities.includes('tend')
        ? { ...w, priorities: [...w.priorities, 'tend'] }
        : w,
    );
    const animals = (Array.isArray(game.animals) ? game.animals : []).map((a) => {
      if (!isRecord(a)) return a;
      const { target, hasProduct, ...rest } = a;
      const hours = isAnimalId(a.kind) ? ANIMALS[a.kind].productionHours : 0;
      return {
        ...rest,
        shelterId: -1,
        path: isRecord(target) ? [target] : [],
        productMinutes: hasProduct === true ? hours * 60 : rest.productMinutes,
      };
    });
    return { ...data, game: { ...game, workers, animals } };
  },
  // v8 → v9: shelter levels. Absent level means level 1, so the data needs no change.
  8: (data) => data,
  // v9 → v10: animals get the common breed of their species, 2 stars and a birth time that makes
  // them just adult now (a whole adult life ahead).
  9: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const now = isFiniteNumber(game.gameMinutes) ? game.gameMinutes : 0;
    const adultAt = LIFE_STAGES.adult.startsAtRealHours * GAME_MINUTES_PER_REAL_HOUR;
    const animals = (Array.isArray(game.animals) ? game.animals : []).map((a) =>
      isRecord(a) && isAnimalId(a.kind) ? { ...a, breed: SPECIES_BREEDS[a.kind][0], stars: 2, bornAt: now - adultAt } : a,
    );
    return { ...data, game: { ...game, animals } };
  },
  // v10 → v11: everyone healthy (no `health`), no medicine and no carcasses yet.
  10: (data) => {
    const game = isRecord(data.game) ? data.game : {};
    const inventory = isRecord(game.inventory) ? game.inventory : {};
    return { ...data, game: { ...game, inventory: { ...inventory, medicine: {} }, carcasses: [] } };
  },
};

/** The v2–v5 family, as it was saved before v6. */
const LEGACY_FAMILY = [
  { name: 'Antônio', role: 'Pai', efficiency: 1 },
  { name: 'Helena', role: 'Mãe', efficiency: 1 },
  { name: 'Lucas', role: 'Filho', efficiency: 0.8 },
] as const;

/** v6: drops the old northward access road and lays the southward one on free land. */
const moveAccessRoad = (raw: readonly unknown[]): unknown[] => {
  const tiles = raw.slice();
  for (let y = 0; y < ACCESS_ROAD_FARM_Y; y++) {
    const index = tileIndex(ACCESS_ROAD_X, y);
    const tile = tiles[index];
    if (isRecord(tile) && tile.road === true) {
      const { road: _road, ...rest } = tile;
      tiles[index] = rest;
    }
  }
  for (const index of accessRoadTiles()) {
    const tile = tiles[index];
    if (isRecord(tile) && (tile.state === 'grass' || tile.state === 'locked') && tile.structure === undefined) {
      tiles[index] = { ...tile, road: true };
    }
  }
  return tiles;
};

/** v6: where the new bunkhouse fits: its default spot, else the free owned grass nearest to it. */
const findBunkhouseSpot = (
  tiles: readonly unknown[],
  taskTiles: ReadonlySet<number>,
): { x: number; y: number; rotation: Rotation } | null => {
  const free = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    const index = tileIndex(x, y);
    const tile = tiles[index];
    return (
      isRecord(tile) && tile.state === 'grass' && tile.structure === undefined && tile.road !== true && !taskTiles.has(index)
    );
  };
  const fits = (x: number, y: number, rotation: Rotation) =>
    footprintCells(footprintOf('bunkhouse', x, y, rotation)).every((c) => free(c.x, c.y));
  const home = START_STRUCTURES.find((p) => p.id === 'bunkhouse') ?? { x: 0, y: 0 };
  let best: { x: number; y: number; rotation: Rotation } | null = null;
  let bestDistance = Infinity;
  for (const rotation of [0, 1] as const) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const d = Math.hypot(x - home.x, y - home.y) + rotation * 0.01;
        if (d < bestDistance && fits(x, y, rotation)) {
          best = { x, y, rotation };
          bestDistance = d;
        }
      }
    }
  }
  return best;
};

/** v6: family and hired workers become staff with attributes (the family keeps the starting crew's). */
const migrateWorker = (w: Record<string, unknown>, index: number): Record<string, unknown> => {
  const template: WorkerTemplate | undefined =
    w.kind === 'family' ? (STARTING_WORKERS.find((t) => t.name === w.name) ?? STARTING_WORKERS[index]) : undefined;
  const profile: Omit<WorkerProfile, 'name'> = template
    ? {
        age: template.age,
        stars: template.stars,
        skills: template.skills.slice(),
        specialty: template.specialty,
        hourlyWage: hourlyWageFor(template.stars, template.specialty),
      }
    : { age: 30, stars: 2, skills: ['farming'], specialty: null, hourlyWage: hourlyWageFor(2, null) };
  const { role: _role, efficiency: _efficiency, ...rest } = w;
  return { ...rest, ...profile, kind: 'staff', priorities: DEFAULT_PRIORITIES.slice() };
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
  return tile;
};

const TASK_KINDS: readonly TaskKind[] = ['hoe', 'seed', 'water', 'hand', 'tend', 'build'];
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
  return { name, age: Math.floor(age), stars, skills: [...new Set(skills)], specialty, hourlyWage };
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
  if (v.type === 'road' && typeof v.remove === 'boolean') return { type: 'road', remove: v.remove };
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
  return {
    id,
    type,
    x,
    y,
    rotation,
    ...(work ? { work } : {}),
    ...(level ? { level } : {}),
    ...(stock && Object.keys(stock).length > 0 ? { stock } : {}),
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
  const workers = parseList(v.workers, parseWorker);
  const tasks = parseList(v.tasks, parseTask);
  const animals = parseList(v.animals, parseAnimal);
  const structures = parseList(v.structures, parseStructure);
  const candidates = parseList(v.candidates, parseCandidate);
  const carcasses = parseList(v.carcasses, parseCarcass);
  if (!workers || !candidates || !tasks || !animals || !carcasses || !structures || !isId(nextId)) return null;
  const maxId = Math.max(
    0,
    ...workers.map((w) => w.id),
    ...candidates.map((c) => c.id),
    ...tasks.map((t) => t.id),
    ...animals.map((a) => a.id),
    ...carcasses.map((c) => c.id),
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
    inventory: { seeds, produce, products, medicine },
    workers,
    candidates,
    tasks,
    animals,
    carcasses,
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
