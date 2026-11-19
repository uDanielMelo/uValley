/**
 * What a sickness does to one animal, derived from its `health` and the clock (never saved):
 * when the symptoms show, how much it still produces and walks, and when it dies untreated.
 * Kept apart from health.ts so animals.ts can use it without an import cycle.
 */
import { GAME_MINUTES_PER_REAL_HOUR } from '../data/animals';
import { DISEASES, EARLY_NOTICE } from '../data/health';
import type { Animal, AnimalHealth } from './types';

const realHours = (hours: number): number => hours * GAME_MINUTES_PER_REAL_HOUR;

/** Game minute the symptoms show. */
export const symptomsAt = (health: AnimalHealth): number =>
  health.since + realHours(DISEASES[health.disease].incubationRealHours);

/** Game minute the farm notices it: when the symptoms show, or earlier with a skilled hand on the crew. */
export const noticeAt = (health: AnimalHealth, skilledCrew: boolean): number =>
  health.since + realHours(DISEASES[health.disease].incubationRealHours) * (skilledCrew ? EARLY_NOTICE : 1);

export const hasSymptoms = (gameMinutes: number, animal: Pick<Animal, 'health'>): boolean =>
  !!animal.health && gameMinutes >= symptomsAt(animal.health);

/** Sick (or wounded) and the farm knows it. */
export const isKnownSick = (animal: Pick<Animal, 'health'>): boolean => animal.health?.noticed === true;

/** Game minute an untreated animal dies of it, or null if it never kills. */
export const deathAt = (health: AnimalHealth): number | null => {
  const fatal = DISEASES[health.disease].fatalAfterRealHours;
  return fatal === null ? null : symptomsAt(health) + realHours(fatal);
};

/** Game minutes left before it dies untreated (null: healthy, or a sickness that doesn't kill). */
export const minutesToDeath = (gameMinutes: number, animal: Pick<Animal, 'health'>): number | null => {
  if (!animal.health) return null;
  const at = deathAt(animal.health);
  return at === null ? null : Math.max(0, at - gameMinutes);
};

/** Multiplies production and draft help (1 while healthy or still incubating). */
export const healthFactor = (gameMinutes: number, animal: Pick<Animal, 'health'>): number =>
  animal.health && hasSymptoms(gameMinutes, animal) ? DISEASES[animal.health.disease].production : 1;

/** Multiplies the walking speed. */
export const healthMoveSpeed = (gameMinutes: number, animal: Pick<Animal, 'health'>): number =>
  animal.health && hasSymptoms(gameMinutes, animal) ? DISEASES[animal.health.disease].moveSpeed : 1;
