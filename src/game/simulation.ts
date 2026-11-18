import { WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { GROWTH_STEP_MINUTES } from '../data/world';
import { growTiles } from './growth';
import { payFeed, removeDeadAnimals, stepAnimals } from './animals';
import { queueShelterChores } from './shelters';
import { payHourlyWages, refreshCandidates, releaseTemps } from './staff';
import type { Animal, GameState, StructureInstance, StructureWorkKind } from './types';
import type { ShelterLevel, StructureId } from '../data/structures';
import { refundFor } from './structures';
import { stepWorkers } from './workers';

export interface TickResult {
  state: GameState;
  /** Names of staff who left because their wage could not be paid. */
  workersLeft: string[];
  /** Animals that could not be fed at midnight. */
  hungryAnimals: number;
  /** Day laborers who went home for good at the end of the shift. */
  tempsLeft: number;
  /** Sites and demolitions the crew finished. */
  worksFinished: FinishedWork[];
  /** Animals that died of old age. */
  animalsDied: Animal[];
}

export interface FinishedWork {
  type: StructureId;
  kind: StructureWorkKind;
  /** Upgrades: the level reached. */
  level?: ShelterLevel;
  /** Demolitions: what came back. */
  refund?: number;
}

/** Works under way before that are no longer (only the crew finishes work while time passes). */
const finishedWorks = (before: readonly StructureInstance[], after: readonly StructureInstance[]): FinishedWork[] => {
  if (before === after) return [];
  const result: FinishedWork[] = [];
  for (const s of before) {
    if (!s.work) continue;
    const now = after.find((x) => x.id === s.id);
    if (now?.work) continue;
    if (s.work.kind === 'upgrade') result.push({ type: s.type, kind: 'upgrade', level: now?.level ?? s.work.toLevel });
    else if (s.work.kind === 'demolish') result.push({ type: s.type, kind: 'demolish', refund: refundFor(s.type, s.level) });
    else result.push({ type: s.type, kind: 'build' });
  }
  return result;
};

/**
 * Advances the game by dtMinutes: crop growth (in GROWTH_STEP_MINUTES steps, so the tiles array
 * only changes on step boundaries or when a task finishes), workers (including construction) and animals,
 * then queues a collection at every shelter with products. Then, for each
 * full hour that ended: wages for the hours of the shift, day laborers leaving when it ends, and
 * at midnight the feed and a new hiring board.
 */
export const advanceGame = (state: GameState, dtMinutes: number): TickResult => {
  if (dtMinutes <= 0) return { state, workersLeft: [], hungryAnimals: 0, tempsLeft: 0, worksFinished: [], animalsDied: [] };
  const gameMinutes = state.gameMinutes + dtMinutes;
  const from = Math.floor(state.gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const to = Math.floor(gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const tiles = to > from ? growTiles(state.tiles, from, to) : state.tiles;
  const aged = removeDeadAnimals(stepAnimals(stepWorkers({ ...state, gameMinutes, tiles }, dtMinutes), dtMinutes));
  const animalsDied = aged.died;
  let next = queueShelterChores(aged.state);
  const worksFinished = finishedWorks(state.structures, next.structures);

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
  return { state: next, workersLeft, hungryAnimals, tempsLeft, worksFinished, animalsDied };
};

/** advanceGame without the events. */
export const tick = (state: GameState, dtMinutes: number): GameState => advanceGame(state, dtMinutes).state;
