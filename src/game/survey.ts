import { SOIL_SURVEY, type SoilId } from '../data/soil';
import { PLOT_SIZE } from '../data/world';
import { neighbourPlots, plotCoords, tileIndex, tilesInPlot } from './grid';
import { isWalkable } from './path';
import { soilAt } from './soil';
import { dropTasks } from './tasks';
import { fail, ok, type ActionResult, type GameState } from './types';

/** Soil surveys: an agronomist analyzes one plot (4×4) at a time; the result is kept in surveyedPlots. */

/** A plot of the farm, or one for sale next to it (to help decide what to buy). */
export const canSurvey = (state: Pick<GameState, 'unlockedPlots'>, plot: number): boolean =>
  state.unlockedPlots.includes(plot) || neighbourPlots(plot).some((n) => state.unlockedPlots.includes(n));

/**
 * Where the agronomist works: the walkable tile nearest the plot's center, inside it or at most one
 * tile outside its border (land for sale is not walkable, so its survey is done from the edge).
 */
export const surveySpot = (state: Pick<GameState, 'tiles'>, plot: number): number | null => {
  const { plotX, plotY } = plotCoords(plot);
  const x0 = plotX * PLOT_SIZE;
  const y0 = plotY * PLOT_SIZE;
  const cx = x0 + PLOT_SIZE / 2;
  const cy = y0 + PLOT_SIZE / 2;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let y = y0 - 1; y <= y0 + PLOT_SIZE; y++) {
    for (let x = x0 - 1; x <= x0 + PLOT_SIZE; x++) {
      if (!isWalkable(state.tiles, x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < bestDistance) {
        best = tileIndex(x, y);
        bestDistance = d;
      }
    }
  }
  return best;
};

const queuedSurvey = (state: GameState, plot: number) =>
  state.tasks.find((t) => t.job?.type === 'survey' && t.job.plot === plot);

/** Orders a survey (pays the sample kit); ordering a plot already in the queue cancels it and refunds. */
export const orderSurvey = (state: GameState, plot: number): ActionResult => {
  const queued = queuedSurvey(state, plot);
  if (queued) {
    return ok({ ...dropTasks(state, (t) => t.id === queued.id), money: state.money + SOIL_SURVEY.cost });
  }
  if (state.surveyedPlots.includes(plot)) return fail('already-surveyed');
  if (!canSurvey(state, plot)) return fail('cannot-survey');
  const tile = surveySpot(state, plot);
  if (tile === null) return fail('cannot-survey');
  if (state.money < SOIL_SURVEY.cost) return fail('not-enough-money');
  return ok({
    ...state,
    money: state.money - SOIL_SURVEY.cost,
    tasks: [...state.tasks, { id: state.nextId, kind: 'survey', tile, cropId: null, workerId: null, job: { type: 'survey', plot } }],
    nextId: state.nextId + 1,
  });
};

/** The survey is done: the plot's soil is known from now on. */
export const completeSurvey = (state: GameState, plot: number): ActionResult =>
  ok(state.surveyedPlots.includes(plot) ? state : { ...state, surveyedPlots: [...state.surveyedPlots, plot] });

export const hasAgronomist = (state: Pick<GameState, 'workers'>): boolean =>
  state.workers.some((w) => w.skills.includes('agronomy'));

/** Soil types found in a plot, most common first (for the toast). */
export const surveyedTypes = (state: Pick<GameState, 'soilSeed'>, plot: number): SoilId[] => {
  const counts = new Map<SoilId, number>();
  for (const i of tilesInPlot(plot)) {
    const soil = soilAt(state.soilSeed, i);
    if (soil) counts.set(soil, (counts.get(soil) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
};
