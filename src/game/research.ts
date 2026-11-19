/**
 * Crop research: new crops are unlocked by paying for research that takes game time (one at a
 * time). Seeds of a crop are only sold once it is known.
 */
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { fail, ok, type ActionResult, type GameState } from './types';

/** Crops a new farm knows (those without research). */
export const STARTING_CROPS: readonly CropId[] = CROP_IDS.filter((id) => !CROPS[id].research);

export const isUnlocked = (state: Pick<GameState, 'research'>, cropId: CropId): boolean =>
  state.research.unlocked.includes(cropId);

/** Pays for researching a crop and starts it. */
export const startResearch = (state: GameState, cropId: CropId): ActionResult => {
  const research = CROPS[cropId].research;
  if (!research || isUnlocked(state, cropId)) return fail('already-researched');
  if (state.research.current) return fail('researching');
  if (state.money < research.cost) return fail('not-enough-money');
  return ok({
    ...state,
    money: state.money - research.cost,
    research: { ...state.research, current: { cropId, minutesLeft: research.hours * 60 } },
  });
};

/** Research advances with the clock; returns the crop it unlocked, if it finished. */
export const stepResearch = (state: GameState, minutes: number): { state: GameState; finished: CropId | null } => {
  const current = state.research.current;
  if (!current || minutes <= 0) return { state, finished: null };
  const minutesLeft = current.minutesLeft - minutes;
  if (minutesLeft > 0) {
    return { state: { ...state, research: { ...state.research, current: { ...current, minutesLeft } } }, finished: null };
  }
  return {
    state: { ...state, research: { unlocked: [...state.research.unlocked, current.cropId], current: null } },
    finished: current.cropId,
  };
};

/** Share of the current research done (0–1), or null when nothing is being researched. */
export const researchProgress = (state: Pick<GameState, 'research'>): number | null => {
  const current = state.research.current;
  const total = current ? (CROPS[current.cropId].research?.hours ?? 0) * 60 : 0;
  return current && total > 0 ? 1 - current.minutesLeft / total : null;
};
