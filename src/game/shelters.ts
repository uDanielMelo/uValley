/**
 * Animal shelters: who lives where, how much pasture the farm has, and the products waiting in
 * each shelter for the crew to collect ('tend' tasks).
 */
import { ANIMALS, PLOT_PASTURE_UNITS, SHELTER_STOCK_PER_HEAD, type AnimalId, type AnimalProductId } from '../data/animals';
import { STRUCTURES, type ShelterDef, type StructureId } from '../data/structures';
import { HOME_POSITION, MAX_TASKS } from '../data/workers';
import { PLOT_SIZE } from '../data/world';
import { inBounds, tileCoords, tileIndex, tilesInPlot } from './grid';
import { addCount } from './inventory';
import { findFreeSpot, frontPoint, frontTile, isOperational, placeStructure } from './structures';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type GameState,
  type GridPoint,
  type ProductCounts,
  type StructureInstance,
  type Task,
  type Tile,
} from './types';

// ---------- shelters ----------

export const shelterDef = (type: StructureId): ShelterDef | undefined => STRUCTURES[type].shelter;

export const housesKind = (type: StructureId, kind: AnimalId): boolean => shelterDef(type)?.species.includes(kind) ?? false;

/** The shelter types that house a species (normally one). */
export const sheltersFor = (kind: AnimalId): StructureId[] =>
  (Object.keys(STRUCTURES) as StructureId[]).filter((type) => housesKind(type, kind));

/** Where a shelter's animals go in and out: just outside the door. */
export const shelterDoor = (s: StructureInstance): GridPoint => frontPoint(s, 0.35);

export const residents = (state: Pick<GameState, 'animals'>, shelterId: number): number =>
  state.animals.reduce((n, a) => (a.shelterId === shelterId ? n + 1 : n), 0);

export const freeSlots = (state: Pick<GameState, 'animals'>, s: StructureInstance): number =>
  (shelterDef(s.type)?.capacity ?? 0) - residents(state, s.id);

/** The shelter a new animal moves into (finished, with room, the emptiest), or why there is none. */
export const shelterFor = (state: GameState, kind: AnimalId): StructureInstance | ActionError => {
  const homes = state.structures.filter((s) => housesKind(s.type, kind) && isOperational(s));
  if (homes.length === 0) return 'no-shelter';
  let best: StructureInstance | null = null;
  let bestFree = 0;
  for (const s of homes) {
    const free = freeSlots(state, s);
    if (free > bestFree) {
      best = s;
      bestFree = free;
    }
  }
  return best ?? 'shelter-full';
};

// ---------- pasture ----------

/** Animals graze on unlocked grass without structures or roads; tilled land is off limits. */
export const isPasture = (tiles: readonly Tile[], x: number, y: number): boolean => {
  if (!inBounds(x, y)) return false;
  const tile = tiles[tileIndex(x, y)];
  return !!tile && tile.state === 'grass' && !tile.structure && !tile.road;
};

/** Pasture units a plot holds: PLOT_PASTURE_UNITS when all its tiles are free grass. */
export const plotPastureUnits = (tiles: readonly Tile[], plot: number): number => {
  let grass = 0;
  for (const index of tilesInPlot(plot)) {
    const { x, y } = tileCoords(index);
    if (isPasture(tiles, x, y)) grass++;
  }
  return (PLOT_PASTURE_UNITS * grass) / (PLOT_SIZE * PLOT_SIZE);
};

/** Pasture units the whole farm holds (owned plots only), rounded down. */
export const pastureCapacity = (state: Pick<GameState, 'tiles' | 'unlockedPlots'>): number =>
  Math.floor(state.unlockedPlots.reduce((sum, plot) => sum + plotPastureUnits(state.tiles, plot), 0) + 1e-9);

export const pastureUsed = (state: Pick<GameState, 'animals'>): number =>
  state.animals.reduce((sum, a) => sum + ANIMALS[a.kind].pastureUnits, 0);

/** Crowding slows production: 1 while the pasture has room, down to 0.25 when badly overstocked. */
export const crowdingFactor = (state: Pick<GameState, 'tiles' | 'unlockedPlots' | 'animals'>): number => {
  const used = pastureUsed(state);
  if (used === 0) return 1;
  const capacity = pastureCapacity(state);
  return used <= capacity ? 1 : Math.max(0.25, capacity / used);
};

// ---------- products ----------

export const stockTotal = (stock: ProductCounts | undefined): number =>
  stock ? Object.values(stock).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

/** Products a shelter holds before production pauses. */
export const stockCap = (type: StructureId): number => (shelterDef(type)?.capacity ?? 0) * SHELTER_STOCK_PER_HEAD;

/** Adds products to a shelter's stock (up to its cap). */
export const addStock = (state: GameState, shelterId: number, product: AnimalProductId, amount = 1): GameState => ({
  ...state,
  structures: state.structures.map((s) => {
    if (s.id !== shelterId) return s;
    const room = stockCap(s.type) - stockTotal(s.stock);
    const added = Math.min(room, amount);
    return added > 0 ? { ...s, stock: addCount(s.stock ?? {}, product, added) } : s;
  }),
});

/** Moves everything waiting in a shelter into the inventory (what a finished 'tend' task does). */
export const collectShelter = (state: GameState, shelterId: number): ActionResult => {
  const s = state.structures.find((x) => x.id === shelterId);
  if (!s || !shelterDef(s.type)) return fail('no-structure');
  if (stockTotal(s.stock) === 0) return fail('no-product');
  let products = state.inventory.products;
  for (const [id, n] of Object.entries(s.stock ?? {}) as [AnimalProductId, number][]) products = addCount(products, id, n);
  return ok({
    ...state,
    inventory: { ...state.inventory, products },
    structures: state.structures.map((x) => {
      if (x.id !== shelterId) return x;
      const { stock: _collected, ...rest } = x;
      return rest;
    }),
  });
};

/** The species with most heads in a shelter (for the specialty of whoever tends it). */
export const mainSpecies = (state: Pick<GameState, 'animals'>, shelterId: number): AnimalId | null => {
  const counts = new Map<AnimalId, number>();
  for (const a of state.animals) if (a.shelterId === shelterId) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  let best: AnimalId | null = null;
  let bestCount = 0;
  for (const [kind, n] of counts) {
    if (n > bestCount) {
      best = kind;
      bestCount = n;
    }
  }
  return best;
};

const isChoreFor = (shelterId: number) => (t: Task) => t.job?.type === 'shelter' && t.job.structureId === shelterId;

/** Standing order: every shelter with products gets a 'tend' task (one at a time) for the crew. */
export const queueShelterChores = (state: GameState): GameState => {
  let next = state;
  for (const s of state.structures) {
    if (!shelterDef(s.type) || stockTotal(s.stock) === 0) continue;
    if (next.tasks.length >= MAX_TASKS) break;
    if (next.tasks.some(isChoreFor(s.id))) continue;
    const task: Task = {
      id: next.nextId,
      kind: 'tend',
      tile: frontTile(s),
      cropId: null,
      workerId: null,
      job: { type: 'shelter', structureId: s.id },
    };
    next = { ...next, tasks: [...next.tasks, task], nextId: next.nextId + 1 };
  }
  return next;
};

// ---------- keeping animals housed ----------

/**
 * Gives every animal a home (after loading older saves): a matching shelter with room, else a new
 * one placed for free on the nearest free grass, else the animal is sold back at its full price.
 */
export const rehomeAnimals = (state: GameState): GameState => {
  let next = state;
  for (const animal of state.animals) {
    const current = next.structures.find((s) => s.id === animal.shelterId);
    if (current && housesKind(current.type, animal.kind) && isOperational(current)) continue;
    let home = shelterFor(next, animal.kind);
    if (typeof home === 'string') {
      const type = sheltersFor(animal.kind)[0];
      const spot = type ? findFreeSpot(next, type, HOME_POSITION) : null;
      if (type && spot) {
        const cost = STRUCTURES[type].cost ?? 0;
        const placed = placeStructure({ ...next, money: next.money + cost }, type, spot.x, spot.y, spot.rotation);
        if (placed.ok) {
          next = { ...placed.state, money: next.money };
          home = shelterFor(next, animal.kind);
        }
      }
    }
    if (typeof home === 'string') {
      next = {
        ...next,
        money: next.money + ANIMALS[animal.kind].purchaseCost,
        animals: next.animals.filter((a) => a.id !== animal.id),
      };
      continue;
    }
    const door = shelterDoor(home);
    const homeId = home.id;
    next = {
      ...next,
      animals: next.animals.map((a) => (a.id === animal.id ? { ...a, shelterId: homeId, x: door.x, y: door.y, path: [] } : a)),
    };
  }
  return next;
};
