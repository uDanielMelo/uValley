import { STRUCTURES } from '../data/structures';
import { HOME_POSITION } from '../data/workers';
import { footprintOf, isOperational } from './structures';
import type { GameState, GridPoint, Rotation } from './types';

/** Direction a structure's front (+z in its model) faces in tile space, for each quarter turn. */
const FRONT: Record<Rotation, GridPoint> = {
  0: { x: 0, y: 1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: -1 },
  3: { x: -1, y: 0 },
};

/** Gap between the bunkhouse wall and where the workers rest. */
const DOOR_GAP = 0.4;

/**
 * Resting spot for the n-th worker: a small cluster in front of the first finished bunkhouse's
 * door (in front of the house when there is none).
 */
export const homeSpot = (state: Pick<GameState, 'structures'>, slot: number): GridPoint => {
  const bunkhouse = state.structures.find((s) => s.type === 'bunkhouse' && isOperational(s));
  const across = ((slot % 4) - 1.5) * 0.3;
  const back = Math.floor(slot / 4) * 0.25;
  if (!bunkhouse) return { x: HOME_POSITION.x + across, y: HOME_POSITION.y + back };
  const fp = footprintOf(bunkhouse.type, bunkhouse.x, bunkhouse.y, bunkhouse.rotation);
  const front = FRONT[bunkhouse.rotation];
  const reach = STRUCTURES.bunkhouse.depth / 2 + DOOR_GAP + back;
  return {
    x: fp.x + fp.width / 2 + front.x * reach - front.y * across,
    y: fp.y + fp.depth / 2 + front.y * reach + front.x * across,
  };
};
