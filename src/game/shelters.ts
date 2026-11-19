/**
 * Animal shelters: who lives where, how much pasture the farm has, and the products waiting in
 * each shelter for the crew to collect ('tend' tasks).
 */
import { ANIMALS, PLOT_PASTURE_UNITS, SHELTER_STOCK_PER_HEAD, type AnimalId, type AnimalProductId } from '../data/animals';
import { MANURE_PIT_BONUS, SHELTER_MANURE_PER_HEAD } from '../data/fertilizer';
import {
  SHELTER_LEVELS,
  SHELTER_LEVEL_LIMIT,
  STRUCTURES,
  type ShelterDef,
  type ShelterLevel,
  type ShelterLevelDef,
  type StructureId,
} from '../data/structures';
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

// ---------- levels ----------

export const shelterLevel = (s: Pick<StructureInstance, 'level'>): ShelterLevel => s.level ?? 1;

export const levelDef = (s: Pick<StructureInstance, 'level'>): ShelterLevelDef => SHELTER_LEVELS[shelterLevel(s)];

/** Highest level a shelter type can reach now (its own limit, and the game's for this stage). */
export const maxShelterLevel = (type: StructureId): ShelterLevel => {
  const own = shelterDef(type)?.maxLevel ?? 4;
  return own < SHELTER_LEVEL_LIMIT ? own : SHELTER_LEVEL_LIMIT;
};

/** The level an upgrade would reach, or null at the top (or for non-shelters). */
export const nextShelterLevel = (s: Pick<StructureInstance, 'type' | 'level'>): ShelterLevel | null => {
  if (!shelterDef(s.type)) return null;
  const level = shelterLevel(s);
  return level < maxShelterLevel(s.type) ? ((level + 1) as ShelterLevel) : null;
};

/** Heads a shelter holds at its level. */
export const shelterCapacity = (s: Pick<StructureInstance, 'type' | 'level'>): number =>
  Math.round((shelterDef(s.type)?.capacity ?? 0) * levelDef(s).capacity);

/** 0–1 comfort of a shelter at its level. */
export const shelterComfort = (s: Pick<StructureInstance, 'level'>): number => levelDef(s).comfort;

/** 0–1 safety of a shelter at its level (plus the coop's wire mesh from level 2). */
export const shelterSafety = (s: Pick<StructureInstance, 'type' | 'level'>): number => {
  const bonus = shelterLevel(s) >= 2 ? (shelterDef(s.type)?.safetyBonus ?? 0) : 0;
  return Math.min(1, levelDef(s).safety + bonus);
};

/** How fast the animals of a shelter produce, from its level (comfort). */
export const productionMultiplier = (s: Pick<StructureInstance, 'level'>): number => levelDef(s).production;

export const residents = (state: Pick<GameState, 'animals'>, shelterId: number): number =>
  state.animals.reduce((n, a) => (a.shelterId === shelterId ? n + 1 : n), 0);

export const freeSlots = (state: Pick<GameState, 'animals'>, s: StructureInstance): number =>
  shelterCapacity(s) - residents(state, s.id);

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

/** Products a shelter holds before production pauses (grows with its capacity). */
export const stockCap = (s: Pick<StructureInstance, 'type' | 'level'>): number =>
  shelterCapacity(s) * SHELTER_STOCK_PER_HEAD;

/** Adds products to a shelter's stock (up to its cap). */
export const addStock = (state: GameState, shelterId: number, product: AnimalProductId, amount = 1): GameState => ({
  ...state,
  structures: state.structures.map((s) => {
    if (s.id !== shelterId) return s;
    const room = stockCap(s) - stockTotal(s.stock);
    const added = Math.min(room, amount);
    return added > 0 ? { ...s, stock: addCount(s.stock ?? {}, product, added) } : s;
  }),
});

// ---------- manure ----------

/** Manure a shelter holds before it stops piling up. */
export const manureCap = (s: Pick<StructureInstance, 'type' | 'level'>): number => shelterCapacity(s) * SHELTER_MANURE_PER_HEAD;

/** Whole units of manure waiting in a shelter. */
export const manureUnits = (s: Pick<StructureInstance, 'manure'>): number => Math.floor((s.manure ?? 0) + 1e-9);

/** The shelter is full of manure (its animals fall sick more often). */
export const manureFull = (s: Pick<StructureInstance, 'type' | 'level' | 'manure'>): boolean =>
  manureCap(s) > 0 && (s.manure ?? 0) >= manureCap(s);

/** How much more manure a shelter yields (the pigsty's manure pit, from level 3). */
export const manureMultiplier = (s: Pick<StructureInstance, 'type' | 'level'>): number =>
  s.type === 'pigsty' && shelterLevel(s) >= 3 ? MANURE_PIT_BONUS : 1;

/** Adds manure to shelters (by id), up to each one's cap. */
export const addManure = (state: GameState, amounts: ReadonlyMap<number, number>): GameState => {
  if (amounts.size === 0) return state;
  return {
    ...state,
    structures: state.structures.map((s) => {
      const amount = amounts.get(s.id);
      if (!amount) return s;
      const manure = Math.min(manureCap(s), (s.manure ?? 0) + amount * manureMultiplier(s));
      return manure === s.manure ? s : { ...s, manure };
    }),
  };
};

/** Something for the crew to collect: products or a whole unit of manure. */
export const hasChores = (s: Pick<StructureInstance, 'stock' | 'manure'>): boolean =>
  stockTotal(s.stock) > 0 || manureUnits(s) > 0;

/**
 * Moves everything waiting in a shelter into the inventory (what a finished 'tend' task does):
 * products, and whole units of manure as fertilizer (the fraction stays).
 */
export const collectShelter = (state: GameState, shelterId: number): ActionResult => {
  const s = state.structures.find((x) => x.id === shelterId);
  if (!s || !shelterDef(s.type)) return fail('no-structure');
  if (!hasChores(s)) return fail('no-product');
  let products = state.inventory.products;
  for (const [id, n] of Object.entries(s.stock ?? {}) as [AnimalProductId, number][]) products = addCount(products, id, n);
  const manure = manureUnits(s);
  return ok({
    ...state,
    inventory: { ...state.inventory, products, fertilizer: state.inventory.fertilizer + manure },
    structures: state.structures.map((x) => {
      if (x.id !== shelterId) return x;
      const { stock: _collected, manure: pile, ...rest } = x;
      const left = (pile ?? 0) - manure;
      return left > 1e-9 ? { ...rest, manure: left } : rest;
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

/** Standing order: every shelter with products or manure gets a 'tend' task (one at a time) for the crew. */
export const queueShelterChores = (state: GameState): GameState => {
  let next = state;
  for (const s of state.structures) {
    if (!shelterDef(s.type) || !hasChores(s)) continue;
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
