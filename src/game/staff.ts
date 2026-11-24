import { ANIMAL_IDS, type AnimalId } from '../data/animals';
import { CROP_IDS, MASTERY_LEVELS, type CropId } from '../data/crops';
import {
  AGE_BANDS,
  CANDIDATE_COUNT,
  DEFAULT_PRIORITIES,
  HARVEST_BONUS,
  MACHINERY_WAGE,
  MAX_AGE,
  MAX_WORKERS,
  MIN_AGE,
  SECOND_SKILL_CHANCE,
  SEVERANCE_HOURS,
  SKILL_BONUS,
  SKILL_IDS,
  SKILL_WEIGHTS,
  SPECIALTY_BONUS,
  SPECIALTY_CHANCE,
  SPECIALTY_WAGE,
  STAR_LEVELS,
  STARTING_WORKERS,
  TASK_SKILL,
  TEMP_WORKERS,
  WORK_END_HOUR,
  WORK_START_HOUR,
  WORKER_NAMES,
  type AgeBand,
  type SkillId,
  type WorkerTemplate,
} from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { addCount } from './inventory';
import { hash01 } from './random';
import { bedCount } from './structures';
import {
  fail,
  ok,
  type ActionResult,
  type Candidate,
  type GameState,
  type Specialty,
  type Stars,
  type Task,
  type TaskKind,
  type Worker,
  type WorkerKind,
  type WorkerProfile,
} from './types';
import { homeSpot } from './home';

// ---------- attributes ----------

export const ageBand = (age: number): AgeBand => {
  let band = AGE_BANDS[0] as AgeBand;
  for (const b of AGE_BANDS) if (age >= b.minAge) band = b;
  return band;
};

export const hourlyWageFor = (stars: Stars, specialty: Specialty | null, skills: readonly SkillId[] = []): number =>
  STAR_LEVELS[stars].hourlyWage + (specialty ? SPECIALTY_WAGE : 0) + (skills.includes('machinery') ? MACHINERY_WAGE : 0);

/** What a task is about, for skill and specialty matching. */
export interface TaskContext {
  kind: TaskKind;
  /** Crop being planted, watered or harvested, if any. */
  cropId: CropId | null;
  /** Animals being tended, if any. */
  animalId?: AnimalId | null;
}

const specialtyMatches = (specialty: Specialty | null, task: TaskContext): boolean => {
  if (!specialty) return false;
  if (specialty.kind === 'crop') return task.cropId !== null && specialty.id === task.cropId;
  return task.animalId != null && specialty.id === task.animalId;
};

const matches = (profile: WorkerProfile, task: TaskContext): { skill: boolean; specialty: boolean } => ({
  skill: profile.skills.includes(TASK_SKILL[task.kind]),
  specialty: specialtyMatches(profile.specialty, task),
});

/** Crop mastery level (index in MASTERY_LEVELS) of a person on a crop, or -1 below the first. */
export const masteryLevel = (profile: Pick<WorkerProfile, 'cropXp'>, cropId: CropId): number => {
  const done = profile.cropXp?.[cropId] ?? 0;
  let level = -1;
  MASTERY_LEVELS.forEach((l, i) => {
    if (done >= l.tasks) level = i;
  });
  return level;
};

const mastery = (profile: WorkerProfile, task: TaskContext) =>
  task.cropId ? MASTERY_LEVELS[masteryLevel(profile, task.cropId)] : undefined;

/** One more task done on a crop (seed, water, harvest or fertilize). */
export const gainMastery = <T extends WorkerProfile>(profile: T, cropId: CropId): T => ({
  ...profile,
  cropXp: addCount(profile.cropXp ?? {}, cropId, 1),
});

/** Multiplier on work speed for a task (1 = normal): age, stars, skill, specialty and crop mastery. */
export const workSpeed = (profile: WorkerProfile, task: TaskContext): number => {
  const m = matches(profile, task);
  return (
    ageBand(profile.age).speed *
    STAR_LEVELS[profile.stars].speed *
    (m.skill ? SKILL_BONUS.speed : 1) *
    (m.specialty ? SPECIALTY_BONUS.speed : 1) *
    (mastery(profile, task)?.speed ?? 1)
  );
};

/** How well a task is done (1 = normal): age, stars, skill and specialty. */
export const workEffectiveness = (profile: WorkerProfile, task: TaskContext): number => {
  const m = matches(profile, task);
  return (
    ageBand(profile.age).effectiveness *
    STAR_LEVELS[profile.stars].effectiveness *
    (m.skill ? SKILL_BONUS.effectiveness : 1) *
    (m.specialty ? SPECIALTY_BONUS.effectiveness : 1) *
    (mastery(profile, task)?.effectiveness ?? 1)
  );
};

/** Chance that a harvest gives one extra unit. */
export const harvestBonusChance = (effectiveness: number): number =>
  Math.min(HARVEST_BONUS.max, Math.max(0, (effectiveness - HARVEST_BONUS.baseline) * HARVEST_BONUS.perPoint));

// ---------- generation ----------

/** Deterministic random stream from a seed. */
const stream = (seed: number) => {
  let k = 0;
  return () => hash01(seed * 7919 + ++k * 104729);
};

const pickWeighted = <T extends string>(weights: Record<T, number>, keys: readonly T[], r: number): T => {
  const total = keys.reduce((sum, key) => sum + weights[key], 0);
  let left = r * total;
  for (const key of keys) {
    left -= weights[key];
    if (left < 0) return key;
  }
  return keys[keys.length - 1] as T;
};

const rollStars = (r: number): Stars => {
  const one = STAR_LEVELS[1].chance;
  const two = one + STAR_LEVELS[2].chance;
  return r < one ? 1 : r < two ? 2 : 3;
};

const freeName = (used: ReadonlySet<string>, r: number): string => {
  const start = Math.floor(r * WORKER_NAMES.length);
  for (let i = 0; i < WORKER_NAMES.length; i++) {
    const name = WORKER_NAMES[(start + i) % WORKER_NAMES.length];
    if (name && !used.has(name)) return name;
  }
  return `${WORKER_NAMES[start % WORKER_NAMES.length] ?? 'Ajudante'} ${used.size + 1}`;
};

/** A random person (deterministic for a seed), avoiding names already in use. */
export const rollProfile = (seed: number, usedNames: ReadonlySet<string>): WorkerProfile => {
  const r = stream(seed);
  const stars = rollStars(r());
  const age = MIN_AGE + Math.floor(r() * (MAX_AGE - MIN_AGE + 1));
  const first = pickWeighted(SKILL_WEIGHTS, SKILL_IDS, r());
  const skills: SkillId[] = [first];
  if (r() < SECOND_SKILL_CHANCE[stars]) {
    const others = SKILL_IDS.filter((s) => s !== first);
    const second = pickWeighted(SKILL_WEIGHTS, others, r());
    skills.push(second);
  }
  let specialty: Specialty | null = null;
  if (r() < SPECIALTY_CHANCE) {
    // Specialties follow the skills: crops for farming, animals for animal care.
    const pick = r();
    if (skills.includes('animals') && (!skills.includes('farming') || pick < 0.5)) {
      specialty = { kind: 'animal', id: ANIMAL_IDS[Math.floor(r() * ANIMAL_IDS.length)] ?? ANIMAL_IDS[0] };
    } else if (skills.includes('farming')) {
      specialty = { kind: 'crop', id: CROP_IDS[Math.floor(r() * CROP_IDS.length)] ?? CROP_IDS[0] };
    }
  }
  return { name: freeName(usedNames, r()), age, stars, skills, specialty, hourlyWage: hourlyWageFor(stars, specialty, skills) };
};

const namesInUse = (state: Pick<GameState, 'workers' | 'candidates'>): Set<string> =>
  new Set([...state.workers.map((w) => w.name), ...state.candidates.map((c) => c.name)]);

/** A fresh hiring board, with ids starting at `firstId`, avoiding names already in use. */
export const rollCandidates = (day: number, firstId: number, usedNames: Iterable<string>): Candidate[] => {
  const used = new Set(usedNames);
  const result: Candidate[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const profile = rollProfile(day * 131 + i * 17 + firstId, used);
    used.add(profile.name);
    result.push({ ...profile, id: firstId + i, hireCost: STAR_LEVELS[profile.stars].hireCost });
  }
  return result;
};

/** Renews the hiring board (at midnight). */
export const refreshCandidates = (state: GameState): GameState => {
  const day = Math.floor(state.gameMinutes / MINUTES_PER_DAY);
  const candidates = rollCandidates(day, state.nextId, state.workers.map((w) => w.name));
  return { ...state, candidates, nextId: state.nextId + candidates.length };
};

// ---------- workers ----------

export const makeWorker = (id: number, kind: WorkerKind, profile: WorkerProfile, at: { x: number; y: number }): Worker => ({
  id,
  kind,
  name: profile.name,
  age: profile.age,
  stars: profile.stars,
  skills: profile.skills.slice(),
  specialty: profile.specialty,
  hourlyWage: profile.hourlyWage,
  priorities: DEFAULT_PRIORITIES.slice(),
  x: at.x,
  y: at.y,
  taskId: null,
  path: [],
  progress: 0,
});

const fromTemplate = (t: WorkerTemplate): WorkerProfile => ({
  name: t.name,
  age: t.age,
  stars: t.stars,
  skills: t.skills.slice(),
  specialty: t.specialty,
  hourlyWage: hourlyWageFor(t.stars, t.specialty),
});

/** The starting crew, with ids starting at `firstId`, resting at `home(slot)`. */
export const createStartingWorkers = (firstId: number, home: (slot: number) => { x: number; y: number }): Worker[] =>
  STARTING_WORKERS.map((t, i) => makeWorker(firstId + i, 'staff', fromTemplate(t), home(i)));

export const staffCount = (state: GameState): number => state.workers.filter((w) => w.kind === 'staff').length;
export const tempCount = (state: GameState): number =>
  state.workers.filter((w) => w.kind === 'temp' && w.rentalId === undefined).length;
export const freeBeds = (state: GameState): number => bedCount(state) - staffCount(state);

/** Releases a worker's task back to the queue. */
export const unassign = (tasks: readonly Task[], workerId: number): Task[] =>
  tasks.map((t) => (t.workerId === workerId ? { ...t, workerId: null } : t));

export const removeWorkers = (state: GameState, leaving: ReadonlySet<number>): GameState => {
  if (leaving.size === 0) return state;
  let tasks = state.tasks;
  for (const id of leaving) tasks = unassign(tasks, id);
  // A machine whose driver leaves goes straight back to its slot.
  const machines = state.machines.some((m) => m.driverId !== undefined && leaving.has(m.driverId))
    ? state.machines.map((m) => {
        if (m.driverId === undefined || !leaving.has(m.driverId)) return m;
        const { driverId: _gone, ...rest } = m;
        return rest;
      })
    : state.machines;
  return { ...state, tasks, machines, workers: state.workers.filter((w) => !leaving.has(w.id)) };
};

/** Hires a candidate from the board as staff: needs a free bed and the hiring cost. */
export const hireCandidate = (state: GameState, candidateId: number): ActionResult => {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) return fail('no-candidate');
  if (state.workers.length >= MAX_WORKERS) return fail('max-workers');
  if (freeBeds(state) <= 0) return fail('no-bed');
  if (state.money < candidate.hireCost) return fail('not-enough-money');
  const worker = makeWorker(candidate.id, 'staff', candidate, homeSpot(state, state.workers.length));
  return ok({
    ...state,
    money: state.money - candidate.hireCost,
    workers: [...state.workers, worker],
    candidates: state.candidates.filter((c) => c.id !== candidateId),
  });
};

const minuteOfDay = (gameMinutes: number): number =>
  ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** Up-front price of a day laborer for the rest of today's shift, or null when it is too late or too early. */
export const tempHireCost = (gameMinutes: number): number | null => {
  const minute = minuteOfDay(gameMinutes);
  if (minute < WORK_START_HOUR * 60 || minute >= TEMP_WORKERS.latestHireHour * 60) return null;
  const hoursLeft = Math.ceil((WORK_END_HOUR * 60 - minute) / 60);
  return hoursLeft * TEMP_WORKERS.hourlyRate;
};

/** Hires a day laborer with random attributes: no bed needed, paid up front, gone at the end of the shift. */
export const hireTemp = (state: GameState): ActionResult => {
  const cost = tempHireCost(state.gameMinutes);
  if (cost === null) return fail('not-work-time');
  if (state.workers.length >= MAX_WORKERS) return fail('max-workers');
  if (tempCount(state) >= TEMP_WORKERS.max) return fail('max-temps');
  if (state.money < cost) return fail('not-enough-money');
  const profile = rollProfile(state.nextId * 31 + state.gameMinutes, namesInUse(state));
  const worker = makeWorker(state.nextId, 'temp', { ...profile, hourlyWage: TEMP_WORKERS.hourlyRate }, homeSpot(state, state.workers.length));
  return ok({ ...state, money: state.money - cost, workers: [...state.workers, worker], nextId: state.nextId + 1 });
};

/** Severance owed when dismissing a worker (day laborers: nothing). */
export const severanceFor = (worker: Worker): number =>
  worker.kind === 'staff' ? worker.hourlyWage * SEVERANCE_HOURS : 0;

export const dismissWorker = (state: GameState, workerId: number): ActionResult => {
  const worker = state.workers.find((w) => w.id === workerId);
  if (!worker) return fail('no-worker');
  const cost = severanceFor(worker);
  if (state.money < cost) return fail('not-enough-money');
  return ok({ ...removeWorkers(state, new Set([workerId])), money: state.money - cost });
};

/** Coins per hour of shift for the whole staff. */
export const hourlyPayroll = (state: GameState): number =>
  state.workers.reduce((sum, w) => sum + (w.kind === 'staff' ? w.hourlyWage : 0), 0);

/** Pays one hour of shift to every staff worker; those who can't be paid leave. Returns who left. */
export const payHourlyWages = (state: GameState): { state: GameState; left: string[] } => {
  let money = state.money;
  const leaving = new Set<number>();
  const left: string[] = [];
  for (const w of state.workers) {
    if (w.kind !== 'staff') continue;
    if (money >= w.hourlyWage) {
      money -= w.hourlyWage;
    } else {
      leaving.add(w.id);
      left.push(w.name);
    }
  }
  if (money === state.money && leaving.size === 0) return { state, left };
  return { state: { ...removeWorkers(state, leaving), money }, left };
};

/** Day laborers go home for good at the end of the shift. */
export const releaseTemps = (state: GameState): GameState =>
  removeWorkers(state, new Set(state.workers.filter((w) => w.kind === 'temp' && w.rentalId === undefined).map((w) => w.id)));

/** Replaces a worker's task list (unknown or repeated kinds are dropped). */
export const setPriorities = (state: GameState, workerId: number, priorities: readonly TaskKind[]): ActionResult => {
  const worker = state.workers.find((w) => w.id === workerId);
  if (!worker) return fail('no-worker');
  const clean = [...new Set(priorities)].filter((k) => DEFAULT_PRIORITIES.includes(k));
  const current = state.tasks.find((t) => t.id === worker.taskId);
  const dropped = current !== undefined && !clean.includes(current.kind);
  return ok({
    ...state,
    tasks: dropped ? unassign(state.tasks, workerId) : state.tasks,
    workers: state.workers.map((w) =>
      w.id !== workerId ? w : { ...w, priorities: clean, ...(dropped ? { taskId: null, path: [], progress: 0 } : {}) },
    ),
  });
};
