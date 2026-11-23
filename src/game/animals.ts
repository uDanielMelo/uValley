import {
  ANIMALS,
  ANIMAL_PRODUCTS,
  ANIMAL_RESALE,
  ANIMAL_STARS,
  BABY_PRICE,
  BREEDS,
  GAME_MINUTES_PER_REAL_HOUR,
  LIFESPAN_REAL_HOURS,
  LIFE_STAGES,
  LIFE_STAGE_IDS,
  SPECIES_BREEDS,
  type AnimalProductId,
  type BreedId,
  type LifeStage,
  ANIMAL_SLEEP_HOUR,
  ANIMAL_WAKE_HOUR,
  LABOR_BONUS_CAP,
  LEASH_RADIUS,
  MAX_ANIMALS,
  WANDER_PAUSE,
  WANDER_RADIUS,
  type AnimalId,
} from '../data/animals';
import { BABY_MANURE, MANURE_PER_DAY } from '../data/fertilizer';
import { SICK_RESALE } from '../data/health';
import { MINUTES_PER_DAY } from '../data/world';
import { healthFactor, healthMoveSpeed, isKnownSick } from './disease';
import { findPath, segmentClear } from './path';
import { hash01 } from './random';
import {
  addManure,
  addStock,
  crowdingFactor,
  isPasture,
  pastureCapacity,
  pastureUsed,
  productionMultiplier,
  shelterDoor,
  shelterFor,
  stockCap,
  stockTotal,
} from './shelters';
import {
  fail,
  ok,
  type ActionResult,
  type Animal,
  type AnimalActivity,
  type GameState,
  type GridPoint,
  type Stars,
  type Tile,
} from './types';

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

// ---------- breed, stars and life cycle ----------

export type PurchaseAge = 'baby' | 'adult';

/** Age in game minutes. */
export const ageMinutes = (gameMinutes: number, animal: Pick<Animal, 'bornAt'>): number =>
  Math.max(0, gameMinutes - animal.bornAt);

/** Real hours (at speed 1×) to game minutes. */
const realHours = (hours: number): number => hours * GAME_MINUTES_PER_REAL_HOUR;

/** Life stage from the age (derived, never saved). */
export const lifeStage = (gameMinutes: number, animal: Pick<Animal, 'bornAt'>): LifeStage => {
  const age = ageMinutes(gameMinutes, animal);
  let stage: LifeStage = 'baby';
  for (const id of LIFE_STAGE_IDS) if (age >= realHours(LIFE_STAGES[id].startsAtRealHours)) stage = id;
  return stage;
};

/** Share of its whole life an animal has lived (0–1; 1 = dies of old age). */
export const lifeProgress = (gameMinutes: number, animal: Pick<Animal, 'bornAt'>): number =>
  Math.min(1, ageMinutes(gameMinutes, animal) / realHours(LIFESPAN_REAL_HOURS));

/** Game minutes left until it dies of old age. */
export const minutesToLive = (gameMinutes: number, animal: Pick<Animal, 'bornAt'>): number =>
  Math.max(0, realHours(LIFESPAN_REAL_HOURS) - ageMinutes(gameMinutes, animal));

/** What it produces: the breed's own product, or the species' one (null for draft animals). */
export const animalProduct = (animal: Pick<Animal, 'kind' | 'breed'>): AnimalProductId | null =>
  BREEDS[animal.breed].product ?? ANIMALS[animal.kind].product;

/** Production speed from breed, stars and life stage (shelter and pasture apply on top). */
export const productionRate = (gameMinutes: number, animal: Pick<Animal, 'breed' | 'stars' | 'bornAt'>): number =>
  BREEDS[animal.breed].production * ANIMAL_STARS[animal.stars].production * LIFE_STAGES[lifeStage(gameMinutes, animal)].production;

/** Draft strength (ox, horse) from breed, stars, life stage and health. */
export const draftStrength = (gameMinutes: number, animal: Pick<Animal, 'breed' | 'stars' | 'bornAt' | 'health'>): number =>
  BREEDS[animal.breed].labor *
  ANIMAL_STARS[animal.stars].production *
  LIFE_STAGES[lifeStage(gameMinutes, animal)].labor *
  healthFactor(gameMinutes, animal);

/** Price to buy one: species price × breed, half for a baby. */
export const purchasePrice = (kind: AnimalId, breed: BreedId, age: PurchaseAge): number =>
  Math.round(ANIMALS[kind].purchaseCost * BREEDS[breed].price * (age === 'baby' ? BABY_PRICE : 1));

/** What selling it gives back: breed, stars and life stage set the price (the old and the sick fetch little). */
export const animalSalePrice = (
  gameMinutes: number,
  animal: Pick<Animal, 'kind' | 'breed' | 'stars' | 'bornAt' | 'health'>,
): number =>
  Math.round(
    purchasePrice(animal.kind, animal.breed, 'adult') *
      ANIMAL_RESALE *
      ANIMAL_STARS[animal.stars].resale *
      LIFE_STAGES[lifeStage(gameMinutes, animal)].resale *
      (isKnownSick(animal) ? SICK_RESALE : 1),
  );

const STAR_IDS: readonly Stars[] = [1, 2, 3];

/** Stars of a new animal, rolled deterministically from its id. */
export const rollAnimalStars = (seed: number): Stars => {
  let left = hash01(seed * 7349 + 11);
  for (const stars of STAR_IDS) {
    left -= ANIMAL_STARS[stars].chance;
    if (left < 0) return stars;
  }
  return 3;
};

export const defaultBreed = (kind: AnimalId): BreedId => SPECIES_BREEDS[kind][0] ?? 'caipira';

export interface AddAnimalOptions {
  /** Breed (default: the species' common one). */
  breed?: BreedId;
  /** Bought as a baby or as a young adult (default). */
  age?: PurchaseAge;
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
  const breed = options.breed ?? defaultBreed(kind);
  if (BREEDS[breed].species !== kind) return fail('no-animal');
  const id = state.nextId;
  const door = shelterDoor(shelter);
  const bornAt = options.age === 'baby' ? state.gameMinutes : state.gameMinutes - realHours(LIFE_STAGES.adult.startsAtRealHours);
  const animal: Animal = {
    id,
    kind,
    breed,
    stars: rollAnimalStars(id),
    bornAt,
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

export const buyAnimal = (
  state: GameState,
  kind: AnimalId,
  breed: BreedId = defaultBreed(kind),
  age: PurchaseAge = 'adult',
): ActionResult => {
  const cost = purchasePrice(kind, breed, age);
  if (state.money < cost) return fail('not-enough-money');
  const added = addAnimal(state, kind, { breed, age });
  return added.ok ? ok({ ...added.state, money: added.state.money - cost }) : added;
};

/** Sells one animal; the price depends on its breed, stars and age. */
export const sellAnimal = (state: GameState, animalId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  if (!animal) return fail('no-animal');
  return ok({
    ...state,
    money: state.money + animalSalePrice(state.gameMinutes, animal),
    animals: state.animals.filter((a) => a.id !== animalId),
  });
};

/** Animals that died of old age leave the farm (and their shelter). */
export const removeDeadAnimals = (state: GameState): { state: GameState; died: Animal[] } => {
  const died = state.animals.filter((a) => minutesToLive(state.gameMinutes, a) <= 0);
  if (died.length === 0) return { state, died };
  const gone = new Set(died.map((a) => a.id));
  return { state: { ...state, animals: state.animals.filter((a) => !gone.has(a.id)) }, died };
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

/** Work speed multipliers from draft animals (ox: tilling, horse: walking), by breed, stars and age. */
export const laborMultipliers = (state: GameState): { hoe: number; walk: number } => {
  let hoe = 0;
  let walk = 0;
  for (const a of state.animals) {
    const labor = ANIMALS[a.kind].labor;
    if (!labor.hoe && !labor.walk) continue;
    const strength = draftStrength(state.gameMinutes, a);
    hoe += (labor.hoe ?? 0) * strength;
    walk += (labor.walk ?? 0) * strength;
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
 * to the shelter's stock (production waits while it is full, is faster in better shelters and
 * slows on crowded pasture and with sickness).
 */
export const stepAnimals = (state: GameState, minutes: number): GameState => {
  if (minutes <= 0 || state.animals.length === 0) return state;
  const awake = isAwake(state.gameMinutes);
  const tick = Math.floor(state.gameMinutes * 10);
  const crowd = crowdingFactor(state);
  let world = state;
  // Manure piles up at each shelter (added once for all its animals).
  const manure = new Map<number, number>();
  for (const a of state.animals) {
    const amount =
      (MANURE_PER_DAY[a.kind] * minutes * (lifeStage(state.gameMinutes, a) === 'baby' ? BABY_MANURE : 1)) / MINUTES_PER_DAY;
    manure.set(a.shelterId, (manure.get(a.shelterId) ?? 0) + amount);
  }
  world = addManure(world, manure);
  const animals = state.animals.map((a) => {
    const def = ANIMALS[a.kind];
    let { productMinutes, waitMinutes } = a;
    let spot: Pick<Animal, 'x' | 'y' | 'path'> = { x: a.x, y: a.y, path: a.path };
    const shelter = world.structures.find((s) => s.id === a.shelterId);
    const home = shelter ? shelterDoor(shelter) : { x: a.x, y: a.y };

    const product = animalProduct(a);
    if (product && a.fed && shelter) {
      const needed = def.productionHours * 60;
      const rate =
        crowd *
        productionMultiplier(shelter) *
        productionRate(state.gameMinutes, a) *
        healthFactor(state.gameMinutes, a);
      productMinutes = Math.min(needed, productMinutes + minutes * rate);
      if (productMinutes >= needed && stockTotal(shelter.stock) < stockCap(shelter)) {
        world = addStock(world, shelter.id, product);
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
      const pace = LIFE_STAGES[lifeStage(state.gameMinutes, a)].moveSpeed * healthMoveSpeed(state.gameMinutes, a);
      spot = followPath(spot, def.moveSpeed * pace * minutes);
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
