/** Workers: attributes, hiring, wages and work rules. All balancing for labor lives here. */

import type { Specialty, Stars, ToolId } from '../game/types';

// ---------- attributes ----------

export const SKILL_IDS = ['farming', 'animals', 'construction'] as const;
/** General skills: a worker doing a task of their skill works faster and better. */
export type SkillId = (typeof SKILL_IDS)[number];

export const SKILLS: Record<SkillId, { label: string; icon: string }> = {
  farming: { label: 'Plantio', icon: '🌱' },
  animals: { label: 'Tratar animais', icon: '🐄' },
  construction: { label: 'Construção', icon: '🔨' },
};

/** The general skill each task uses. Animal care and construction tasks come in later stages. */
export const TASK_SKILL: Record<ToolId, SkillId> = {
  hoe: 'farming',
  seed: 'farming',
  water: 'farming',
  hand: 'farming',
};

export interface AgeBand {
  /** First age of the band (the band lasts until the next one starts). */
  minAge: number;
  label: string;
  /** Multiplies how fast tasks are done. */
  speed: number;
  /** Multiplies how well tasks are done (see HARVEST_BONUS). */
  effectiveness: number;
}

/**
 * Younger workers are faster but less effective; 36–50 are slower and more effective.
 * 18–19 and 51+ lose effectiveness.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  { minAge: 18, label: 'Iniciante', speed: 1.05, effectiveness: 0.75 },
  { minAge: 20, label: 'Jovem', speed: 1.15, effectiveness: 0.9 },
  { minAge: 36, label: 'Experiente', speed: 0.9, effectiveness: 1.15 },
  { minAge: 51, label: 'Veterano', speed: 0.75, effectiveness: 0.95 },
];
export const MIN_AGE = 18;
export const MAX_AGE = 62;

export interface StarLevel {
  speed: number;
  effectiveness: number;
  /** Coins per hour of shift. */
  hourlyWage: number;
  /** One-off cost to hire a candidate. */
  hireCost: number;
  /** Chance that a generated worker has this level. */
  chance: number;
}

export const STAR_LEVELS: Record<Stars, StarLevel> = {
  1: { speed: 0.85, effectiveness: 0.85, hourlyWage: 1, hireCost: 60, chance: 0.5 },
  2: { speed: 1, effectiveness: 1, hourlyWage: 2, hireCost: 120, chance: 0.35 },
  3: { speed: 1.15, effectiveness: 1.15, hourlyWage: 3, hireCost: 220, chance: 0.15 },
};

/** Extra coins per hour for a worker with a specialty. */
export const SPECIALTY_WAGE = 1;

/** Bonus when the task uses one of the worker's general skills. */
export const SKILL_BONUS = { speed: 1.15, effectiveness: 1.1 } as const;
/** Extra bonus when the task is about the worker's specialty (a crop or an animal). */
export const SPECIALTY_BONUS = { speed: 1.1, effectiveness: 1.15 } as const;

/**
 * Effectiveness at harvest: chance of one extra unit of produce =
 * (effectiveness − baseline) × perPoint, between 0 and max.
 */
export const HARVEST_BONUS = { baseline: 0.8, perPoint: 1.25, max: 0.75 } as const;

// ---------- generated workers ----------

/** Candidates on the hiring board; the board is renewed every midnight. */
export const CANDIDATE_COUNT = 4;
/** Chance of a second general skill, by stars. */
export const SECOND_SKILL_CHANCE: Record<Stars, number> = { 1: 0.1, 2: 0.25, 3: 0.5 };
export const SPECIALTY_CHANCE = 0.4;
/** Relative weight of each general skill when generating a worker. */
export const SKILL_WEIGHTS: Record<SkillId, number> = { farming: 0.5, animals: 0.3, construction: 0.2 };

/** First names for generated workers (pt-BR). */
export const WORKER_NAMES: readonly string[] = [
  'Zé', 'Rita', 'Tião', 'Clara', 'Juca', 'Marta', 'Bento', 'Luzia', 'Chico', 'Dora',
  'Benedito', 'Cida', 'Joaquim', 'Nair', 'Raimundo', 'Tereza', 'Sebastião', 'Aparecida', 'Valdir', 'Neusa',
  'Gilberto', 'Rosa', 'Osmar', 'Fátima', 'Severino', 'Iracema', 'Expedito', 'Socorro', 'Damião', 'Lurdes',
];

/** Workers living in the bunkhouse on a new game. */
export interface WorkerTemplate {
  name: string;
  age: number;
  stars: Stars;
  skills: readonly SkillId[];
  specialty: Specialty | null;
}

export const STARTING_WORKERS: readonly WorkerTemplate[] = [
  { name: 'Antônio', age: 44, stars: 2, skills: ['farming'], specialty: { kind: 'crop', id: 'wheat' } },
  { name: 'Helena', age: 29, stars: 2, skills: ['farming', 'animals'], specialty: null },
  { name: 'Lucas', age: 19, stars: 1, skills: ['construction'], specialty: null },
];

// ---------- staff rules ----------

/** Beds per bunkhouse: hired (staff) workers need one. */
export const BUNKHOUSE_BEDS = 3;
/** Dismissing a staff worker costs this many hours of their wage (severance). */
export const SEVERANCE_HOURS = 14;

/** Day laborers: no bed needed, random attributes, gone at the end of the shift. */
export const TEMP_WORKERS = {
  /** Coins per remaining hour of the shift, paid up front (well above a staff wage). */
  hourlyRate: 6,
  max: 4,
  /** No new day laborers after this hour. */
  latestHireHour: 18,
} as const;

/** Total workers on the farm (staff and day laborers). */
export const MAX_WORKERS = 12;
/** Maximum number of queued tasks. */
export const MAX_TASKS = 300;

/** Order in which a new worker picks tasks (editable per worker). */
export const DEFAULT_PRIORITIES: readonly ToolId[] = ['water', 'hand', 'seed', 'hoe'];

/** Workers only work between these game hours; outside them they go home. Wages are paid per hour in between. */
export const WORK_START_HOUR = 6;
export const WORK_END_HOUR = 20;

/** Walking speed in tiles per game minute (1× speed: about 1.4 tiles per real second). */
export const WALK_SPEED = 1.5;

/** Game minutes of work for each task at speed 1. */
export const TASK_MINUTES: Record<ToolId, number> = {
  hoe: 12,
  seed: 6,
  water: 4,
  hand: 8,
};

/** Fallback resting spot (in front of the house door) when the farm has no bunkhouse. */
export const HOME_POSITION = { x: 15.7, y: 17.35 } as const;
