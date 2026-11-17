/** Workers: the starting family and hired hands. All balancing for labor lives here. */

import type { ToolId } from '../game/types';

export interface WorkerTemplate {
  name: string;
  /** Short role label shown in the HUD (pt-BR). */
  role: string;
  /** Work speed multiplier (1 = normal). */
  efficiency: number;
  /** Standing height in meters (visual only; hired workers get a random one). */
  height?: number;
}

/** The family living in the house on a new game. They work for free. */
export const FAMILY: readonly WorkerTemplate[] = [
  { name: 'Antônio', role: 'Pai', efficiency: 1, height: 1.78 },
  { name: 'Helena', role: 'Mãe', efficiency: 1, height: 1.65 },
  { name: 'Lucas', role: 'Filho', efficiency: 0.8, height: 1.4 },
];

/** Names given to hired workers, in hiring order (cycled when exhausted). */
export const HIRED_NAMES: readonly string[] = [
  'Zé',
  'Rita',
  'Tião',
  'Clara',
  'Juca',
  'Marta',
  'Bento',
  'Luzia',
  'Chico',
  'Dora',
];

export const HIRED_EFFICIENCY = 1;
/** One-off cost to hire a worker. */
export const HIRE_COST = 150;
/** Paid to each hired worker at the start of every day; unpaid workers leave. */
export const DAILY_WAGE = 30;
/** Total workers (family included). */
export const MAX_WORKERS = 12;
/** Maximum number of queued tasks. */
export const MAX_TASKS = 300;

/** Workers only work between these game hours; outside them they go home. */
export const WORK_START_HOUR = 6;
export const WORK_END_HOUR = 20;

/** Walking speed in tiles per game minute (1× speed: about 1.4 tiles per real second). */
export const WALK_SPEED = 1.5;

/** Game minutes of work for each task at efficiency 1. */
export const TASK_MINUTES: Record<ToolId, number> = {
  hoe: 12,
  seed: 6,
  water: 4,
  hand: 8,
};

/** Where workers spawn and rest: in front of the house door, in tile coordinates (tile centers at +0.5). */
export const HOME_POSITION = { x: 15.7, y: 17.35 } as const;
