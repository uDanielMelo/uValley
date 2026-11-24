/**
 * Animal health and predators: animals fall sick (hidden at first), the farm notices, the crew
 * medicates them with bought medicine, and at night predators raid shelters. Every roll is
 * deterministic (hash01 of ids and the game hour).
 */
import { GAME_MINUTES_PER_REAL_HOUR } from '../data/animals';
import {
  CARCASS_MINUTES,
  DISEASES,
  DISEASE_IDS,
  DISEASE_RISK,
  LARGE_ANIMALS,
  MEDICATE_MINUTES,
  MEDICINE_IDS,
  PREDATOR_RISK,
  SPECIES_PREDATOR,
  type DiseaseId,
  type MedicineId,
  type PredatorId,
} from '../data/health';
import { MANURE_SICKNESS } from '../data/fertilizer';
import { PEN } from '../data/docks';
import { MAX_TASKS } from '../data/workers';
import { GRID_SIZE } from '../data/world';
import { isAwake, isInside, lifeStage } from './animals';
import { deathAt, isKnownSick, noticeAt } from './disease';
import { inBounds, tileIndex } from './grid';
import { addCount } from './inventory';
import { hash01 } from './random';
import { crowdingFactor, effectiveSafety, manureFull, residents, shelterComfort, shelterDoor } from './shelters';
import {
  fail,
  ok,
  type ActionResult,
  type Animal,
  type Carcass,
  type GameState,
  type GridPoint,
  type MedicineCounts,
  type StructureInstance,
  type Task,
} from './types';

export * from './disease';

const GAME_HOURS_PER_REAL_HOUR = GAME_MINUTES_PER_REAL_HOUR / 60;

// ---------- sickness ----------

/** Someone on the crew has the animals skill (sickness is noticed earlier). */
export const skilledCrew = (state: Pick<GameState, 'workers'>): boolean =>
  state.workers.some((w) => w.skills.includes('animals'));

const shelterOf = (state: Pick<GameState, 'structures'>, animal: Animal): StructureInstance | undefined =>
  state.structures.find((s) => s.id === animal.shelterId);

const hasCarcassBy = (state: Pick<GameState, 'carcasses'>, shelterId: number): boolean =>
  state.carcasses.some((c) => c.shelterId === shelterId);

/** Out of the shelter while the others sleep. */
const outsideAtNight = (state: GameState, animal: Animal): boolean =>
  !isAwake(state.gameMinutes) && !isInside(state, animal);

/**
 * Chance per real hour (at 1×) that a healthy animal falls sick: low comfort, crowded pasture, a
 * full shelter, hunger, being a baby or old, staying out at night, a carcass nearby and a shelter
 * full of manure all raise it.
 */
export const sicknessRisk = (state: GameState, animal: Animal): number => {
  const r = DISEASE_RISK;
  const shelter = shelterOf(state, animal);
  const comfort = shelter ? shelterComfort(shelter) : 0;
  const mates = shelter ? Math.max(0, residents(state, shelter.id) - 1) : 0;
  return (
    r.basePerRealHour *
    ((1 - comfort) / (1 - r.referenceComfort)) *
    (1 + r.perShelterMate * mates) *
    (1 / crowdingFactor(state)) *
    (animal.fed ? 1 : r.hungry) *
    r.stage[lifeStage(state.gameMinutes, animal)] *
    (outsideAtNight(state, animal) ? r.outsideAtNight : 1) *
    (hasCarcassBy(state, animal.shelterId) ? r.carcass : 1) *
    (shelter && manureFull(shelter) ? MANURE_SICKNESS : 1)
  );
};

/** Which sickness a roll gives (a carcass nearby makes infection likelier). */
const pickDisease = (roll: number, carcass: boolean): DiseaseId => {
  const weight = (id: DiseaseId) =>
    DISEASES[id].weight * (carcass && id === 'infection' ? DISEASE_RISK.carcassInfectionWeight : 1);
  const total = DISEASE_IDS.reduce((sum, id) => sum + weight(id), 0);
  let left = roll * total;
  for (const id of DISEASE_IDS) {
    left -= weight(id);
    if (left < 0 && weight(id) > 0) return id;
  }
  return 'worms';
};

/** Real-hour chance to a chance for one game hour. */
const perGameHour = (perRealHour: number): number => perRealHour / GAME_HOURS_PER_REAL_HOUR;

const infect = (animal: Animal, disease: DiseaseId, since: number): Animal => ({
  ...animal,
  health: { disease, since, noticed: disease === 'wound' },
});

/** Healthy animals may fall sick in game hour `hour` (index since the start). */
const rollSickness = (state: GameState, hour: number): GameState => {
  let changed = false;
  const animals = state.animals.map((a) => {
    if (a.health) return a;
    if (hash01(a.id * 7919 + hour * 104729 + 17) >= perGameHour(sicknessRisk(state, a))) return a;
    changed = true;
    return infect(a, pickDisease(hash01(a.id * 6007 + hour * 3571 + 5), hasCarcassBy(state, a.shelterId)), hour * 60);
  });
  return changed ? { ...state, animals } : state;
};

/** Contagious sicknesses (flu) pass to healthy shelter mates. */
const spreadSickness = (state: GameState, hour: number): GameState => {
  const carriers = new Map<number, DiseaseId[]>();
  for (const a of state.animals) {
    if (a.health && DISEASES[a.health.disease].spreadPerRealHour > 0) {
      carriers.set(a.shelterId, [...(carriers.get(a.shelterId) ?? []), a.health.disease]);
    }
  }
  if (carriers.size === 0) return state;
  let changed = false;
  const animals = state.animals.map((a) => {
    const sources = carriers.get(a.shelterId);
    if (a.health || !sources) return a;
    const disease = sources[0];
    if (!disease) return a;
    const chance = perGameHour(DISEASES[disease].spreadPerRealHour) * sources.length;
    if (hash01(a.id * 2903 + hour * 7727 + 41) >= chance) return a;
    changed = true;
    return infect(a, disease, hour * 60);
  });
  return changed ? { ...state, animals } : state;
};

// ---------- predators ----------

export interface PredatorAttack {
  predator: PredatorId;
  victim: Animal;
  outcome: 'eaten' | 'wounded';
  /** Where it happened (the carcass lies there when eaten). */
  x: number;
  y: number;
}

const isLarge = (animal: Animal): boolean => LARGE_ANIMALS.includes(animal.kind);

/**
 * How exposed an animal is to a predator: asleep inside (1 − safety, lamps included) or out;
 * babies more, large animals less.
 */
export const exposure = (state: GameState, animal: Animal, shelter: StructureInstance): number =>
  (isInside(state, animal) ? 1 - effectiveSafety(state, shelter) : PREDATOR_RISK.outside) *
  (lifeStage(state.gameMinutes, animal) === 'baby' ? PREDATOR_RISK.baby : 1) *
  (isLarge(animal) ? PREDATOR_RISK.large : 1);

/** Predator activity in the game hour that starts at `hourOfDay` (0 by day). */
export const predatorActivity = (hourOfDay: number): number => PREDATOR_RISK.activity[hourOfDay] ?? 0;

/** Chance per game hour, at full activity, that a predator raids a shelter. */
export const raidChance = (state: GameState, shelter: StructureInstance): number =>
  PREDATOR_RISK.perHour *
  state.animals.reduce((sum, a) => (a.shelterId === shelter.id ? sum + exposure(state, a, shelter) : sum), 0);

/** Where a victim lies: where it stood, or by the door when it was inside. */
const victimSpot = (state: GameState, animal: Animal, shelter: StructureInstance, seed: number): GridPoint => {
  if (!isInside(state, animal)) return { x: animal.x, y: animal.y };
  const door = shelterDoor(shelter);
  return { x: door.x + (hash01(seed) - 0.5) * 0.6, y: door.y + (hash01(seed + 1) - 0.5) * 0.6 };
};

/**
 * A predator raids a shelter: the victim is drawn by exposure. Small animals, babies and animals
 * already sick or wounded are killed (the carcass stays); large ones are wounded.
 */
export const raidShelter = (
  state: GameState,
  shelter: StructureInstance,
  roll: number,
): { state: GameState; attack: PredatorAttack | null } => {
  const herd = state.animals.filter((a) => a.shelterId === shelter.id);
  const weights = herd.map((a) => exposure(state, a, shelter));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return { state, attack: null };
  let left = roll * total;
  let victim = herd[herd.length - 1];
  for (let i = 0; i < herd.length; i++) {
    left -= weights[i] ?? 0;
    if (left < 0) {
      victim = herd[i];
      break;
    }
  }
  if (!victim) return { state, attack: null };
  const predator = SPECIES_PREDATOR[victim.kind];
  const spot = victimSpot(state, victim, shelter, victim.id * 31 + Math.floor(state.gameMinutes));
  const wounded = isLarge(victim) && lifeStage(state.gameMinutes, victim) !== 'baby' && !victim.health;
  if (wounded) {
    const hurt = infect(victim, 'wound', state.gameMinutes);
    return {
      state: { ...state, animals: state.animals.map((a) => (a.id === victim.id ? hurt : a)) },
      attack: { predator, victim: hurt, outcome: 'wounded', ...spot },
    };
  }
  return {
    state: leaveCarcass(state, victim, spot),
    attack: { predator, victim, outcome: 'eaten', ...spot },
  };
};

/** Every shelter rolls for a raid in game hour `hour`. */
const rollPredators = (state: GameState, hour: number): { state: GameState; attacks: PredatorAttack[] } => {
  const activity = predatorActivity(((hour % 24) + 24) % 24);
  if (activity <= 0) return { state, attacks: [] };
  let next = state;
  const attacks: PredatorAttack[] = [];
  for (const shelter of state.structures) {
    if (!next.animals.some((a) => a.shelterId === shelter.id)) continue;
    if (hash01(shelter.id * 15485863 + hour * 7 + 101) >= activity * raidChance(next, shelter)) continue;
    const raid = raidShelter(next, shelter, hash01(shelter.id * 92821 + hour * 13 + 7));
    next = raid.state;
    if (raid.attack) attacks.push(raid.attack);
  }
  return { state: next, attacks };
};

// ---------- carcasses ----------

/** The animal leaves the farm and its carcass stays where it fell. */
export const leaveCarcass = (state: GameState, animal: Animal, at: GridPoint = animal): GameState => {
  const carcass: Carcass = {
    id: state.nextId,
    kind: animal.kind,
    breed: animal.breed,
    x: at.x,
    y: at.y,
    diedAt: state.gameMinutes,
    shelterId: animal.shelterId,
  };
  return {
    ...state,
    animals: state.animals.filter((a) => a.id !== animal.id),
    carcasses: [...state.carcasses, carcass],
    nextId: state.nextId + 1,
  };
};

/** What a finished carcass task does. */
export const removeCarcass = (state: GameState, carcassId: number): ActionResult =>
  ok({ ...state, carcasses: state.carcasses.filter((c) => c.id !== carcassId) });

// ---------- the hourly step ----------

export interface HealthStep {
  state: GameState;
  /** Animals whose sickness the farm just noticed. */
  noticed: Animal[];
  /** Animals that died of a sickness (or a wound) left untreated. */
  died: Animal[];
  attacks: PredatorAttack[];
}

/**
 * Advances health from `fromMinutes` to the state's clock: for every game hour that ended,
 * sickness, contagion and predator rolls; then sicknesses are noticed and untreated ones kill.
 */
export const stepHealth = (state: GameState, fromMinutes: number): HealthStep => {
  if (state.animals.length === 0) return { state, noticed: [], died: [], attacks: [] };
  let next = state;
  const attacks: PredatorAttack[] = [];
  const firstHour = Math.floor(fromMinutes / 60) + 1;
  const lastHour = Math.floor(state.gameMinutes / 60);
  for (let h = firstHour; h <= lastHour; h++) {
    // The rolls are for the game hour that just ended.
    const hour = h - 1;
    next = spreadSickness(rollSickness(next, hour), hour);
    const raid = rollPredators(next, hour);
    next = raid.state;
    attacks.push(...raid.attacks);
  }

  const now = next.gameMinutes;
  const early = skilledCrew(next);
  const noticed: Animal[] = [];
  let changed = false;
  const animals = next.animals.map((a) => {
    if (!a.health || a.health.noticed || now < noticeAt(a.health, early)) return a;
    changed = true;
    const known: Animal = { ...a, health: { ...a.health, noticed: true } };
    noticed.push(known);
    return known;
  });
  if (changed) next = { ...next, animals };

  const died = next.animals.filter((a) => {
    const at = a.health ? deathAt(a.health) : null;
    return at !== null && now >= at;
  });
  for (const animal of died) next = leaveCarcass(next, animal);
  return { state: next, noticed, died, attacks };
};

// ---------- medicine ----------

/** The medicine a sick animal needs, or null when healthy. */
export const medicineFor = (animal: Pick<Animal, 'health'>): MedicineId | null =>
  animal.health ? DISEASES[animal.health.disease].medicine : null;

/** What a finished medicate task does: uses one dose and cures the animal. */
export const medicateAnimal = (state: GameState, animalId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  // Sold, dead or already cured: nothing to do (like collecting at an empty shelter).
  if (!animal?.health) return ok(state);
  const medicine = DISEASES[animal.health.disease].medicine;
  if ((state.inventory.medicine[medicine] ?? 0) <= 0) return fail('no-medicine');
  const { health: _cured, ...healthy } = animal;
  return ok({
    ...state,
    inventory: { ...state.inventory, medicine: addCount(state.inventory.medicine, medicine, -1) },
    animals: state.animals.map((a) => (a.id === animalId ? healthy : a)),
  });
};

export const medicateTaskFor = (tasks: readonly Task[], animalId: number): Task | undefined =>
  tasks.find((t) => t.job?.type === 'medicate' && t.job.animalId === animalId);

/** Doses promised to queued medicate tasks. */
export const reservedMedicine = (state: Pick<GameState, 'tasks' | 'animals'>): MedicineCounts => {
  let reserved: MedicineCounts = {};
  for (const t of state.tasks) {
    if (t.job?.type !== 'medicate') continue;
    const animalId = t.job.animalId;
    const animal = state.animals.find((a) => a.id === animalId);
    const medicine = animal ? medicineFor(animal) : null;
    if (medicine) reserved = addCount(reserved, medicine, 1);
  }
  return reserved;
};

/** Doses in stock that no medicate task has claimed. */
export const freeMedicine = (state: Pick<GameState, 'tasks' | 'animals' | 'inventory'>, id: MedicineId): number =>
  (state.inventory.medicine[id] ?? 0) - (reservedMedicine(state)[id] ?? 0);

/** The tile under a point (clamped to the grid). */
const tileUnder = (p: GridPoint): number => {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (inBounds(x, y)) return tileIndex(x, y);
  const clamp = (n: number) => Math.min(GRID_SIZE - 1, Math.max(0, n));
  return tileIndex(clamp(x), clamp(y));
};

/**
 * Standing orders for animal care: every noticed sick animal gets a medicate task while there is
 * medicine for it (the most urgent first), and every carcass a task to take it away. Tasks whose
 * animal or carcass is gone (or cured) are dropped.
 */
export const queueAnimalCare = (state: GameState): GameState => {
  const stale = (t: Task): boolean => {
    const job = t.job;
    if (job?.type === 'medicate') return !state.animals.some((a) => a.id === job.animalId && isKnownSick(a));
    if (job?.type === 'carcass') return !state.carcasses.some((c) => c.id === job.carcassId);
    return false;
  };
  let next = state.tasks.some(stale) ? dropStale(state, stale) : state;

  const sick = next.animals
    .filter((a) => isKnownSick(a) && !medicateTaskFor(next.tasks, a.id))
    .sort((a, b) => urgency(next, a) - urgency(next, b));
  if (sick.length > 0) {
    const free = Object.fromEntries(MEDICINE_IDS.map((id) => [id, freeMedicine(next, id)])) as Record<MedicineId, number>;
    for (const animal of sick) {
      const medicine = medicineFor(animal);
      if (!medicine || free[medicine] <= 0 || next.tasks.length >= MAX_TASKS) continue;
      free[medicine]--;
      next = addCareTask(next, tileUnder(animal), { type: 'medicate', animalId: animal.id });
    }
  }
  for (const carcass of next.carcasses) {
    if (next.tasks.length >= MAX_TASKS) break;
    if (next.tasks.some((t) => t.job?.type === 'carcass' && t.job.carcassId === carcass.id)) continue;
    next = addCareTask(next, tileUnder(carcass), { type: 'carcass', carcassId: carcass.id });
  }
  return next;
};

/** Removes tasks (tasks.ts has the same helper, but importing it here would make a cycle). */
const dropStale = (state: GameState, drop: (task: Task) => boolean): GameState => {
  const removed = new Set(state.tasks.filter(drop).map((t) => t.id));
  return {
    ...state,
    tasks: state.tasks.filter((t) => !removed.has(t.id)),
    workers: state.workers.map((w) =>
      w.taskId !== null && removed.has(w.taskId) ? { ...w, taskId: null, path: [], progress: 0 } : w,
    ),
  };
};

/** Minutes before it dies (sickness that doesn't kill last). */
const urgency = (state: GameState, animal: Animal): number => {
  const at = animal.health ? deathAt(animal.health) : null;
  return at === null ? Infinity : at - state.gameMinutes;
};

const addCareTask = (state: GameState, tile: number, job: NonNullable<Task['job']>): GameState => {
  const task: Task = { id: state.nextId, kind: 'tend', tile, cropId: null, workerId: null, job };
  return { ...state, tasks: [...state.tasks, task], nextId: state.nextId + 1 };
};

/** Work minutes of an animal-care task. */
export const careMinutes = (job: Task['job']): number | null => {
  if (job?.type === 'medicate') return MEDICATE_MINUTES;
  if (job?.type === 'carcass') return CARCASS_MINUTES;
  if (job?.type === 'herd') return PEN.herdMinutes;
  return null;
};
