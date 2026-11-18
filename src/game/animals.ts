import {
  ANIMALS,
  ANIMAL_PRODUCTS,
  ANIMAL_RESALE,
  ANIMAL_SLEEP_HOUR,
  ANIMAL_WAKE_HOUR,
  LABOR_BONUS_CAP,
  LEASH_RADIUS,
  MAX_ANIMALS,
  WANDER_PAUSE,
  WANDER_RADIUS,
  type AnimalId,
} from '../data/animals';
import { MINUTES_PER_DAY } from '../data/world';
import { findPath, segmentClear } from './path';
import { hash01 } from './random';
import {
  addStock,
  crowdingFactor,
  isPasture,
  pastureCapacity,
  pastureUsed,
  shelterDoor,
  shelterFor,
  stockCap,
  stockTotal,
} from './shelters';
import { fail, ok, type ActionResult, type Animal, type AnimalActivity, type GameState, type GridPoint, type Tile } from './types';

export { isPasture };

export const isAwake = (gameMinutes: number): boolean => {
  const hour = (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
  return hour >= ANIMAL_WAKE_HOUR && hour < ANIMAL_SLEEP_HOUR;
};

export const animalActivity = (state: GameState, animal: Animal): AnimalActivity => {
  if (animal.path.length > 0) return 'walking';
  return isAwake(state.gameMinutes) ? 'grazing' : 'sleeping';
};

/** How close to the door counts as being in the shelter. */
const AT_DOOR = 0.3;

/** The point an animal goes home to (its shelter's door), if the shelter exists. */
export const homeOf = (state: Pick<GameState, 'structures'>, animal: Animal): GridPoint | null => {
  const shelter = state.structures.find((s) => s.id === animal.shelterId);
  return shelter ? shelterDoor(shelter) : null;
};

/** Asleep inside its shelter (not drawn). */
export const isInside = (state: GameState, animal: Animal): boolean => {
  if (isAwake(state.gameMinutes) || animal.path.length > 0) return false;
  const home = homeOf(state, animal);
  return !!home && Math.hypot(home.x - animal.x, home.y - animal.y) <= AT_DOOR;
};

export interface AddAnimalOptions {
  /** Dev tools: ignore the pasture limit. */
  ignorePasture?: boolean;
}

/**
 * Adds an animal without charging anything (used by buying and dev tools). It moves into a
 * finished shelter for its species with room and needs room on the pasture.
 */
export const addAnimal = (state: GameState, kind: AnimalId, options: AddAnimalOptions = {}): ActionResult => {
  if (state.animals.length >= MAX_ANIMALS) return fail('max-animals');
  const shelter = shelterFor(state, kind);
  if (typeof shelter === 'string') return fail(shelter);
  if (!options.ignorePasture && pastureUsed(state) + ANIMALS[kind].pastureUnits > pastureCapacity(state)) {
    return fail('pasture-full');
  }
  const id = state.nextId;
  const door = shelterDoor(shelter);
  const animal: Animal = {
    id,
    kind,
    shelterId: shelter.id,
    x: door.x,
    y: door.y,
    path: [],
    waitMinutes: 5,
    productMinutes: 0,
    fed: true,
  };
  return ok({ ...state, animals: [...state.animals, animal], nextId: id + 1 });
};

export const buyAnimal = (state: GameState, kind: AnimalId): ActionResult => {
  const cost = ANIMALS[kind].purchaseCost;
  if (state.money < cost) return fail('not-enough-money');
  const added = addAnimal(state, kind);
  return added.ok ? ok({ ...added.state, money: added.state.money - cost }) : added;
};

export const animalSalePrice = (kind: AnimalId): number => Math.round(ANIMALS[kind].purchaseCost * ANIMAL_RESALE);

/** Sells the most recently bought animal of a kind. */
export const sellAnimal = (state: GameState, kind: AnimalId): ActionResult => {
  let animal: Animal | undefined;
  for (const a of state.animals) if (a.kind === kind) animal = a;
  if (!animal) return fail('no-animal');
  return ok({
    ...state,
    money: state.money + animalSalePrice(kind),
    animals: state.animals.filter((a) => a.id !== animal.id),
  });
};

export const dailyFeedCost = (state: GameState): number =>
  state.animals.reduce((sum, a) => sum + ANIMALS[a.kind].feedCostPerDay, 0);

/** Pays feed for every animal in order; those that can't be fed go hungry (no production) for a day. */
export const payFeed = (state: GameState): { state: GameState; hungry: number } => {
  if (state.animals.length === 0) return { state, hungry: 0 };
  let money = state.money;
  let hungry = 0;
  const animals = state.animals.map((a) => {
    const cost = ANIMALS[a.kind].feedCostPerDay;
    if (money >= cost) {
      money -= cost;
      return a.fed ? a : { ...a, fed: true };
    }
    hungry++;
    return { ...a, fed: false };
  });
  return { state: { ...state, money, animals }, hungry };
};

/** Work speed multipliers from draft animals (ox: tilling, horse: walking). */
export const laborMultipliers = (state: GameState): { hoe: number; walk: number } => {
  let hoe = 0;
  let walk = 0;
  for (const a of state.animals) {
    const labor = ANIMALS[a.kind].labor;
    hoe += labor.hoe ?? 0;
    walk += labor.walk ?? 0;
  }
  return { hoe: 1 + Math.min(hoe, LABOR_BONUS_CAP), walk: 1 + Math.min(walk, LABOR_BONUS_CAP) };
};

/** Picks a nearby pasture spot within reach of home, reachable in a straight line over pasture, or null. */
const pickTarget = (tiles: readonly Tile[], animal: Animal, home: GridPoint, seed: number): GridPoint | null => {
  const fx = Math.floor(animal.x);
  const fy = Math.floor(animal.y);
  const onPasture = isPasture(tiles, fx, fy);
  const pasture = (x: number, y: number) => isPasture(tiles, x, y);
  for (let k = 0; k < 8; k++) {
    const dx = Math.round((hash01(seed + k * 7) * 2 - 1) * WANDER_RADIUS);
    const dy = Math.round((hash01(seed + k * 11 + 3) * 2 - 1) * WANDER_RADIUS);
    // Off-pasture animals (at the door, or their tile was tilled) look further to find grass.
    const tx = fx + dx * (onPasture ? 1 : 2);
    const ty = fy + dy * (onPasture ? 1 : 2);
    if (!pasture(tx, ty)) continue;
    const target = {
      x: tx + 0.2 + hash01(seed + k * 13 + 5) * 0.6,
      y: ty + 0.2 + hash01(seed + k * 17 + 9) * 0.6,
    };
    if (Math.hypot(target.x - home.x, target.y - home.y) > LEASH_RADIUS) continue;
    if (!onPasture || segmentClear(animal, target, pasture)) return target;
  }
  return null;
};

/** Moves along a path for `distance` tiles. */
const followPath = (from: Pick<Animal, 'x' | 'y' | 'path'>, distance: number): Pick<Animal, 'x' | 'y' | 'path'> => {
  let budget = distance;
  let { x, y } = from;
  let index = 0;
  while (index < from.path.length && budget > 0) {
    const target = from.path[index];
    if (!target) break;
    const d = Math.hypot(target.x - x, target.y - y);
    if (d <= budget) {
      x = target.x;
      y = target.y;
      budget -= d;
      index++;
    } else {
      x += ((target.x - x) / d) * budget;
      y += ((target.y - y) / d) * budget;
      budget = 0;
    }
  }
  return { x, y, path: index === 0 ? from.path : from.path.slice(index) };
};

/**
 * Moves every animal for `minutes`. Awake: wander over pasture near the shelter, with pauses (and
 * walk back when too far). At night: walk home and sleep inside. Fed animals produce; products go
 * to the shelter's stock (production waits while it is full, and slows on crowded pasture).
 */
export const stepAnimals = (state: GameState, minutes: number): GameState => {
  if (minutes <= 0 || state.animals.length === 0) return state;
  const awake = isAwake(state.gameMinutes);
  const tick = Math.floor(state.gameMinutes * 10);
  const crowd = crowdingFactor(state);
  let world = state;
  const animals = state.animals.map((a) => {
    const def = ANIMALS[a.kind];
    let { productMinutes, waitMinutes } = a;
    let spot: Pick<Animal, 'x' | 'y' | 'path'> = { x: a.x, y: a.y, path: a.path };
    const shelter = world.structures.find((s) => s.id === a.shelterId);
    const home = shelter ? shelterDoor(shelter) : { x: a.x, y: a.y };

    if (def.product && a.fed && shelter) {
      const needed = def.productionHours * 60;
      productMinutes = Math.min(needed, productMinutes + minutes * crowd);
      if (productMinutes >= needed && stockTotal(shelter.stock) < stockCap(shelter.type)) {
        world = addStock(world, shelter.id, def.product);
        productMinutes = 0;
      }
    }

    if (spot.path.length === 0) {
      const away = Math.hypot(home.x - spot.x, home.y - spot.y);
      if (!awake) {
        if (away > AT_DOOR) spot = { ...spot, path: findPath(world.tiles, spot, home) };
      } else if (away > LEASH_RADIUS + 1) {
        spot = { ...spot, path: findPath(world.tiles, spot, home) };
      } else if (waitMinutes > 0) {
        waitMinutes = Math.max(0, waitMinutes - minutes);
      } else {
        const target = pickTarget(world.tiles, a, home, a.id * 7919 + tick);
        if (target) spot = { ...spot, path: [target] };
        else waitMinutes = WANDER_PAUSE[0];
      }
    }
    if (spot.path.length > 0) {
      spot = followPath(spot, def.moveSpeed * minutes);
      if (spot.path.length === 0 && awake) {
        const [min, max] = WANDER_PAUSE;
        waitMinutes = min + hash01(a.id * 131 + tick) * (max - min);
      }
    }

    return { ...a, ...spot, waitMinutes, productMinutes };
  });
  return { ...world, animals };
};

export const productLabel = (kind: AnimalId): string | null => {
  const product = ANIMALS[kind].product;
  return product ? ANIMAL_PRODUCTS[product].label : null;
};
