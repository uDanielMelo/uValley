import { GROWTH_STEP_MINUTES, MINUTES_PER_DAY } from '../data/world';
import { growTiles } from './growth';
import { payFeed, stepAnimals } from './animals';
import type { GameState } from './types';
import { payWages, stepWorkers } from './workers';

export interface TickResult {
  state: GameState;
  /** Names of hired workers who left because their wage could not be paid. */
  workersLeft: string[];
  /** Animals that could not be fed at midnight. */
  hungryAnimals: number;
}

/**
 * Advances the game by dtMinutes: crop growth (in GROWTH_STEP_MINUTES steps, so the tiles array
 * only changes on step boundaries or when a task finishes), workers, animals, wages and feed.
 */
export const advanceGame = (state: GameState, dtMinutes: number): TickResult => {
  if (dtMinutes <= 0) return { state, workersLeft: [], hungryAnimals: 0 };
  const gameMinutes = state.gameMinutes + dtMinutes;
  const from = Math.floor(state.gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const to = Math.floor(gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const tiles = to > from ? growTiles(state.tiles, from, to) : state.tiles;
  let next = stepAnimals(stepWorkers({ ...state, gameMinutes, tiles }, dtMinutes), dtMinutes);

  const workersLeft: string[] = [];
  let hungryAnimals = 0;
  const days = Math.floor(gameMinutes / MINUTES_PER_DAY) - Math.floor(state.gameMinutes / MINUTES_PER_DAY);
  for (let d = 0; d < days; d++) {
    const paid = payWages(next);
    next = paid.state;
    workersLeft.push(...paid.left);
    const fed = payFeed(next);
    next = fed.state;
    hungryAnimals = fed.hungry;
  }
  return { state: next, workersLeft, hungryAnimals };
};

/** advanceGame without the events. */
export const tick = (state: GameState, dtMinutes: number): GameState => advanceGame(state, dtMinutes).state;
