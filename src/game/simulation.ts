import { WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { GROWTH_STEP_MINUTES } from '../data/world';
import { growTiles } from './growth';
import { payFeed, stepAnimals } from './animals';
import { payHourlyWages, refreshCandidates, releaseTemps } from './staff';
import type { GameState } from './types';
import { stepWorkers } from './workers';

export interface TickResult {
  state: GameState;
  /** Names of staff who left because their wage could not be paid. */
  workersLeft: string[];
  /** Animals that could not be fed at midnight. */
  hungryAnimals: number;
  /** Day laborers who went home for good at the end of the shift. */
  tempsLeft: number;
}

/**
 * Advances the game by dtMinutes: crop growth (in GROWTH_STEP_MINUTES steps, so the tiles array
 * only changes on step boundaries or when a task finishes), workers and animals. Then, for each
 * full hour that ended: wages for the hours of the shift, day laborers leaving when it ends, and
 * at midnight the feed and a new hiring board.
 */
export const advanceGame = (state: GameState, dtMinutes: number): TickResult => {
  if (dtMinutes <= 0) return { state, workersLeft: [], hungryAnimals: 0, tempsLeft: 0 };
  const gameMinutes = state.gameMinutes + dtMinutes;
  const from = Math.floor(state.gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const to = Math.floor(gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const tiles = to > from ? growTiles(state.tiles, from, to) : state.tiles;
  let next = stepAnimals(stepWorkers({ ...state, gameMinutes, tiles }, dtMinutes), dtMinutes);

  const workersLeft: string[] = [];
  let hungryAnimals = 0;
  let tempsLeft = 0;
  const firstHour = Math.floor(state.gameMinutes / 60) + 1;
  const lastHour = Math.floor(gameMinutes / 60);
  for (let h = firstHour; h <= lastHour; h++) {
    const hourOfDay = h % 24;
    // The hour that just ended was part of the shift.
    if (hourOfDay > WORK_START_HOUR && hourOfDay <= WORK_END_HOUR) {
      const paid = payHourlyWages(next);
      next = paid.state;
      workersLeft.push(...paid.left);
    }
    if (hourOfDay === WORK_END_HOUR) {
      const before = next.workers.length;
      next = releaseTemps(next);
      tempsLeft += before - next.workers.length;
    }
    if (hourOfDay === 0) {
      const fed = payFeed(next);
      next = refreshCandidates(fed.state);
      hungryAnimals = fed.hungry;
    }
  }
  return { state: next, workersLeft, hungryAnimals, tempsLeft };
};

/** advanceGame without the events. */
export const tick = (state: GameState, dtMinutes: number): GameState => advanceGame(state, dtMinutes).state;
