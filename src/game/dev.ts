/**
 * Cheats for testing (dev panel and `window.dev`). Pure `(state, …) => state` functions;
 * they never fail: invalid input is clamped or ignored.
 */
import { ANIMALS, ANIMAL_PRODUCT_IDS, type AnimalId } from '../data/animals';
import { CROP_IDS } from '../data/crops';
import { HIRE_COST } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { addAnimal } from './animals';
import { growthMinutesNeeded } from './crops';
import { PLOT_COUNT } from './grid';
import { addCount } from './inventory';
import { advanceGame } from './simulation';
import { startOfNextDay } from './time';
import type { GameState } from './types';
import { applyTask, hireWorker } from './workers';

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

export const hireFree = (state: GameState): GameState => {
  const result = hireWorker({ ...state, money: state.money + HIRE_COST });
  return result.ok ? { ...result.state, money: state.money } : state;
};

/** Completes the whole queue instantly, in order. Tasks that turn out invalid are dropped. */
export const finishAllTasks = (state: GameState): GameState => {
  const done = state.tasks.reduce<GameState>((s, task) => {
    const result = applyTask(s, task);
    return result.ok ? result.state : s;
  }, state);
  return {
    ...done,
    tasks: [],
    workers: done.workers.map((w) => ({ ...w, taskId: null, path: [], progress: 0 })),
  };
};

export const spawnAnimals = (state: GameState, kind: AnimalId, count: number): GameState => {
  let s = state;
  for (let i = 0; i < count; i++) {
    const result = addAnimal(s, kind);
    if (!result.ok) break;
    s = result.state;
  }
  return s;
};

/** Every producing animal gets its product ready; everyone is fed. */
export const readyAllProducts = (state: GameState): GameState => ({
  ...state,
  animals: state.animals.map((a) => ({
    ...a,
    hasProduct: ANIMALS[a.kind].product !== null,
    fed: true,
    productMinutes: 0,
  })),
});
