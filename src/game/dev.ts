/**
 * Cheats for testing (dev panel and `window.dev`). Pure `(state, …) => state` functions;
 * they never fail: invalid input is clamped or ignored.
 */
import { ANIMAL_PRODUCT_IDS, GAME_MINUTES_PER_REAL_HOUR, type AnimalId } from '../data/animals';
import { CROP_IDS } from '../data/crops';
import { DISEASES, MEDICINE_IDS, type DiseaseId } from '../data/health';
import { STRUCTURES } from '../data/structures';
import { HOME_POSITION, MAX_WORKERS } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { addAnimal, animalProduct } from './animals';
import { raidShelter, type PredatorAttack } from './health';
import { addStock, sheltersFor } from './shelters';
import { findFreeSpot, placeStructure } from './structures';
import { growthMinutesNeeded } from './crops';
import { PLOT_COUNT } from './grid';
import { addCount } from './inventory';
import { advanceGame } from './simulation';
import { startOfNextDay } from './time';
import type { GameState } from './types';
import { homeSpot } from './home';
import { makeWorker, rollProfile } from './staff';
import { completeAllWork } from './construction';
import { applyTask } from './tasks';

export const addMoney = (state: GameState, amount: number): GameState => ({
  ...state,
  money: Math.max(0, state.money + amount),
});

export const setMoney = (state: GameState, amount: number): GameState => ({ ...state, money: Math.max(0, amount) });

/** Jumps to an hour of the current day (0–24, fractions allowed). */
export const setTimeOfDay = (state: GameState, hour: number): GameState => {
  const day = Math.floor(state.gameMinutes / MINUTES_PER_DAY);
  const h = Math.min(Math.max(hour, 0), 23.99);
  return { ...state, gameMinutes: day * MINUTES_PER_DAY + h * 60 };
};

/** Simulates time passing (growth, workers, animals, wages, feed) in 15-minute chunks. */
export const skipMinutes = (state: GameState, minutes: number): GameState => {
  let s = state;
  let left = Math.max(0, minutes);
  while (left > 0) {
    const step = Math.min(15, left);
    s = advanceGame(s, step).state;
    left -= step;
  }
  return s;
};

export const addSeeds = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    seeds: CROP_IDS.reduce((seeds, id) => addCount(seeds, id, amount), state.inventory.seeds),
  },
});

/** Adds `amount` of every crop and animal product. */
export const addProduce = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    produce: CROP_IDS.reduce((p, id) => addCount(p, id, amount), state.inventory.produce),
    products: ANIMAL_PRODUCT_IDS.reduce((p, id) => addCount(p, id, amount), state.inventory.products),
  },
});

/** Every planted crop becomes ready to harvest. */
export const growAll = (state: GameState): GameState => ({
  ...state,
  tiles: state.tiles.map((t) =>
    t.crop ? { ...t, crop: { ...t.crop, growthMinutes: growthMinutesNeeded(t.crop) } } : t,
  ),
});

/** Waters every planted tile until the end of the day. */
export const waterAll = (state: GameState): GameState => {
  const until = startOfNextDay(state.gameMinutes);
  return {
    ...state,
    tiles: state.tiles.map((t) =>
      t.crop && t.state === 'planted' ? { ...t, state: 'watered', wateredUntil: until } : t,
    ),
  };
};

/** Unlocks every plot for free. */
export const unlockAll = (state: GameState): GameState => ({
  ...state,
  tiles: state.tiles.map((t) => (t.state === 'locked' ? { ...t, state: 'grass' } : t)),
  unlockedPlots: Array.from({ length: PLOT_COUNT }, (_, i) => i),
});

/** Adds a random staff worker for free, even without a bed. */
export const hireFree = (state: GameState): GameState => {
  if (state.workers.length >= MAX_WORKERS) return state;
  const profile = rollProfile(state.nextId * 13 + 5, new Set(state.workers.map((w) => w.name)));
  const worker = makeWorker(state.nextId, 'staff', profile, homeSpot(state, state.workers.length));
  return { ...state, workers: [...state.workers, worker], nextId: state.nextId + 1 };
};

/** Finishes every construction site and demolition at once. */
export const finishWorks = (state: GameState): GameState => completeAllWork(state);

/** Completes the whole queue instantly, in order (sites and demolitions too). Tasks that turn out invalid are dropped. */
export const finishAllTasks = (state: GameState): GameState => {
  const built = completeAllWork(state);
  const done = built.tasks.reduce<GameState>((s, task) => {
    const result = applyTask(s, task);
    return result.ok ? result.state : s;
  }, built);
  return {
    ...done,
    tasks: [],
    workers: done.workers.map((w) => ({ ...w, taskId: null, path: [], progress: 0 })),
  };
};

/** A finished shelter for a species, placed for free near the house (null when nothing fits). */
const freeShelter = (state: GameState, kind: AnimalId): GameState | null => {
  const type = sheltersFor(kind)[0];
  const spot = type ? findFreeSpot(state, type, HOME_POSITION) : null;
  if (!type || !spot) return null;
  const cost = STRUCTURES[type].cost ?? 0;
  const placed = placeStructure({ ...state, money: state.money + cost }, type, spot.x, spot.y, spot.rotation);
  return placed.ok ? { ...placed.state, money: state.money } : null;
};

/** Adds animals for free, ignoring the pasture limit and building free shelters when they run out of room. */
export const spawnAnimals = (state: GameState, kind: AnimalId, count: number): GameState => {
  let s = state;
  for (let i = 0; i < count; i++) {
    let result = addAnimal(s, kind, { ignorePasture: true });
    if (!result.ok && (result.error === 'no-shelter' || result.error === 'shelter-full')) {
      const housed = freeShelter(s, kind);
      if (housed) result = addAnimal(housed, kind, { ignorePasture: true });
    }
    if (!result.ok) break;
    s = result.state;
  }
  return s;
};

/** Every producing animal leaves one product in its shelter; everyone is fed. */
export const readyAllProducts = (state: GameState): GameState => {
  const fed: GameState = { ...state, animals: state.animals.map((a) => ({ ...a, fed: true, productMinutes: 0 })) };
  return state.animals.reduce((s, a) => {
    const product = animalProduct(a);
    return product ? addStock(s, a.shelterId, product) : s;
  }, fed);
};

/** Ages every animal by real hours (at 1×): 12 makes a baby young, 72 makes an adult old. */
export const ageAnimals = (state: GameState, realHours: number): GameState => ({
  ...state,
  animals: state.animals.map((a) => ({ ...a, bornAt: a.bornAt - realHours * GAME_MINUTES_PER_REAL_HOUR })),
});

/**
 * Makes a healthy animal sick (the first one, or a given id) with symptoms showing now and the
 * farm aware of it.
 */
export const sickenAnimal = (state: GameState, disease: DiseaseId = 'flu', animalId?: number): GameState => {
  const target = state.animals.find((a) => (animalId === undefined ? !a.health : a.id === animalId));
  if (!target) return state;
  const since = state.gameMinutes - DISEASES[disease].incubationRealHours * GAME_MINUTES_PER_REAL_HOUR;
  return {
    ...state,
    animals: state.animals.map((a) => (a.id === target.id ? { ...a, health: { disease, since, noticed: true } } : a)),
  };
};

/** Every animal healthy again. */
export const healAll = (state: GameState): GameState => ({
  ...state,
  animals: state.animals.map(({ health: _health, ...a }) => a),
});

/** Adds doses of every medicine. */
export const addMedicine = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    medicine: MEDICINE_IDS.reduce((m, id) => addCount(m, id, Math.max(0, Math.floor(amount))), state.inventory.medicine),
  },
});

/** A predator raids the shelter with most animals right now. */
export const forceRaid = (state: GameState): { state: GameState; attack: PredatorAttack | null } => {
  const counts = new Map<number, number>();
  for (const a of state.animals) counts.set(a.shelterId, (counts.get(a.shelterId) ?? 0) + 1);
  const [shelterId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const shelter = state.structures.find((s) => s.id === shelterId);
  if (!shelter) return { state, attack: null };
  return raidShelter(state, shelter, (Math.floor(state.gameMinutes) % 97) / 97);
};
