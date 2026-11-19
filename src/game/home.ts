import { HOME_POSITION } from '../data/workers';
import { frontPoint, isActive } from './structures';
import type { GameState, GridPoint } from './types';

/** Gap between the bunkhouse wall and where the workers rest. */
const DOOR_GAP = 0.4;

/**
 * Resting spot for the n-th worker: a small cluster in front of the first working bunkhouse's
 * door (in front of the house when there is none).
 */
export const homeSpot = (state: Pick<GameState, 'structures' | 'tiles'>, slot: number): GridPoint => {
  const bunkhouse = state.structures.find((s) => s.type === 'bunkhouse' && isActive(state, s));
  const across = ((slot % 4) - 1.5) * 0.3;
  const back = Math.floor(slot / 4) * 0.25;
  if (!bunkhouse) return { x: HOME_POSITION.x + across, y: HOME_POSITION.y + back };
  return frontPoint(bunkhouse, DOOR_GAP + back, across);
};
