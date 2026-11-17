import {
  ANIMALS,
  ANIMAL_PRODUCTS,
  ANIMAL_RESALE,
  ANIMAL_SLEEP_HOUR,
  ANIMAL_WAKE_HOUR,
  LABOR_BONUS_CAP,
  MAX_ANIMALS,
  WANDER_PAUSE,
  WANDER_RADIUS,
  type AnimalId,
} from '../data/animals';
import { HOME_POSITION } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { inBounds, tileCoords, tileIndex } from './grid';
import { addCount } from './inventory';
import { segmentClear } from './path';
import { hash01 } from './random';
import { fail, ok, type ActionResult, type Animal, type AnimalActivity, type GameState, type GridPoint, type Tile } from './types';

/** Animals graze on unlocked grass without structures or roads; tilled land is off limits. */
export const isPasture = (tiles: readonly Tile[], x: number, y: number): boolean => {
  if (!inBounds(x, y)) return false;
  const tile = tiles[tileIndex(x, y)];
  return !!tile && tile.state === 'grass' && !tile.structure && !tile.road;
};

export const isAwake = (gameMinutes: number): boolean => {
  const hour = (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
  return hour >= ANIMAL_WAKE_HOUR && hour < ANIMAL_SLEEP_HOUR;
};

export const animalActivity = (state: GameState, animal: Animal): AnimalActivity => {
  if (!isAwake(state.gameMinutes)) return 'sleeping';
  return animal.target ? 'walking' : 'grazing';
};

/** Ideal distance (tiles) from the house door for new animals: close, but out of the doorway. */
const SPAWN_DISTANCE = 3;

/** Drop-off point for a new animal: pasture a few tiles from the house, avoiding crowded tiles. */
const spawnPoint = (state: GameState, salt: number): GridPoint => {
  const crowd = new Map<number, number>();
  for (const a of state.animals) {
    const index = tileIndex(Math.floor(a.x), Math.floor(a.y));
    crowd.set(index, (crowd.get(index) ?? 0) + 1);
  }
  let best: GridPoint | null = null;
  let bestScore = Infinity;
  state.tiles.forEach((_, i) => {
    const { x, y } = tileCoords(i);
    if (!isPasture(state.tiles, x, y)) return;
    const distance = Math.hypot(x + 0.5 - HOME_POSITION.x, y + 0.5 - HOME_POSITION.y);
    const score =
      Math.abs(distance - SPAWN_DISTANCE) + (crowd.get(i) ?? 0) * 2.5 + hash01(salt * 31 + i) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = { x: x + 0.5, y: y + 0.5 };
    }
  });
  return best ?? { x: HOME_POSITION.x, y: HOME_POSITION.y };
};

/** Adds an animal without charging anything (used by buying and dev tools). */
export const addAnimal = (state: GameState, kind: AnimalId): ActionResult => {
  if (state.animals.length >= MAX_ANIMALS) return fail('max-animals');
  const id = state.nextId;
  const at = spawnPoint(state, id);
  const animal: Animal = {
    id,
    kind,
    x: at.x,
    y: at.y,
    target: null,
    waitMinutes: 5,
    productMinutes: 0,
    hasProduct: false,
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

/** Collects an animal's ready product into the inventory. */
export const collectProduct = (state: GameState, animalId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  if (!animal) return fail('no-animal');
  const product = ANIMALS[animal.kind].product;
  if (!product || !animal.hasProduct) return fail('no-product');
  return ok({
    ...state,
    animals: state.animals.map((a) => (a.id === animalId ? { ...a, hasProduct: false } : a)),
    inventory: { ...state.inventory, products: addCount(state.inventory.products, product, 1) },
  });
};

export const collectAllProducts = (state: GameState): GameState =>
  state.animals.reduce((s, a) => {
    const result = collectProduct(s, a.id);
    return result.ok ? result.state : s;
  }, state);

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

/** Picks a nearby pasture spot reachable in a straight line over pasture, or null. */
const pickTarget = (tiles: readonly Tile[], animal: Animal, seed: number): GridPoint | null => {
  const fx = Math.floor(animal.x);
  const fy = Math.floor(animal.y);
  const onPasture = isPasture(tiles, fx, fy);
  const pasture = (x: number, y: number) => isPasture(tiles, x, y);
  for (let k = 0; k < 8; k++) {
    const dx = Math.round((hash01(seed + k * 7) * 2 - 1) * WANDER_RADIUS);
    const dy = Math.round((hash01(seed + k * 11 + 3) * 2 - 1) * WANDER_RADIUS);
    // Off-pasture animals (their tile was tilled) look further to find grass.
    const tx = fx + dx * (onPasture ? 1 : 2);
    const ty = fy + dy * (onPasture ? 1 : 2);
    if (!pasture(tx, ty)) continue;
    const target = {
      x: tx + 0.2 + hash01(seed + k * 13 + 5) * 0.6,
      y: ty + 0.2 + hash01(seed + k * 17 + 9) * 0.6,
    };
    if (!onPasture || segmentClear(animal, target, pasture)) return target;
  }
  return null;
};

/**
 * Moves every animal for `minutes`: wander between pasture spots with pauses while awake,
 * sleep at night, and accumulate production while fed.
 */
export const stepAnimals = (state: GameState, minutes: number): GameState => {
  if (minutes <= 0 || state.animals.length === 0) return state;
  const awake = isAwake(state.gameMinutes);
  const tick = Math.floor(state.gameMinutes * 10);
  const animals = state.animals.map((a) => {
    const def = ANIMALS[a.kind];
    let { productMinutes, hasProduct, waitMinutes, target, x, y } = a;

    if (def.product && a.fed && !hasProduct) {
      productMinutes += minutes;
      if (productMinutes >= def.productionHours * 60) {
        productMinutes = 0;
        hasProduct = true;
      }
    }

    if (awake) {
      if (!target && waitMinutes > 0) {
        waitMinutes = Math.max(0, waitMinutes - minutes);
      } else if (!target) {
        target = pickTarget(state.tiles, a, a.id * 7919 + tick);
        if (!target) waitMinutes = WANDER_PAUSE[0];
      }
      if (target) {
        const dx = target.x - x;
        const dy = target.y - y;
        const d = Math.hypot(dx, dy);
        const step = def.moveSpeed * minutes;
        if (d <= step) {
          x = target.x;
          y = target.y;
          target = null;
          const [min, max] = WANDER_PAUSE;
          waitMinutes = min + hash01(a.id * 131 + tick) * (max - min);
        } else {
          x += (dx / d) * step;
          y += (dy / d) * step;
        }
      }
    }

    return { ...a, x, y, target, waitMinutes, productMinutes, hasProduct };
  });
  return { ...state, animals };
};

export const productLabel = (kind: AnimalId): string | null => {
  const product = ANIMALS[kind].product;
  return product ? ANIMAL_PRODUCTS[product].label : null;
};
