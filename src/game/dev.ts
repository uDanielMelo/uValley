/**
 * Cheats for testing (dev panel and `window.dev`). Pure `(state, …) => state` functions;
 * they never fail: invalid input is clamped or ignored.
 */
import { ANIMAL_PRODUCT_IDS, GAME_MINUTES_PER_REAL_HOUR, type AnimalId } from '../data/animals';
import { CROPS, CROP_IDS } from '../data/crops';
import type { WeatherId } from '../data/climate';
import { DISEASES, MEDICINE_IDS, type DiseaseId } from '../data/health';
import { HOME_POSITION, MAX_WORKERS } from '../data/workers';
import { GRID_SIZE, MINUTES_PER_DAY } from '../data/world';
import { addAnimal, animalProduct } from './animals';
import { applyDayWeather, dayOf, weatherOf } from './climate';
import { raidShelter, type PredatorAttack } from './health';
import { addStock, manureCap, shelterDef, sheltersFor } from './shelters';
import { findFreeSpot, placeStructure } from './structures';
import { growthMinutesNeeded } from './crops';
import { PLOT_COUNT, inBounds, tileIndex } from './grid';
import { canSurvey } from './survey';
import type { SkillId } from '../data/workers';
import { fenceLine, layFence } from './fences';
import { addCount } from './inventory';
import { advanceGame } from './simulation';
import { startOfNextDay } from './time';
import type { GameState } from './types';
import { homeSpot } from './home';
import { hourlyWageFor, makeWorker, rollProfile } from './staff';
import { completeAllWork } from './construction';
import { applyTask } from './tasks';
import { applyArea } from './workers';
import { spawnWalkIn } from './shipments';
import { OFFERS } from '../data/docks';
import { CONDITION, type MachineId } from '../data/machines';
import { freeSlot } from './parking';
import { rentalEnd } from './machines';

export const addMoney = (state: GameState, amount: number): GameState => ({
  ...state,
  money: Math.max(0, state.money + amount),
});

export const setMoney = (state: GameState, amount: number): GameState => ({ ...state, money: Math.max(0, amount) });

/** Jumps to an hour of the current day (0–24, fractions allowed). */
export const setTimeOfDay = (state: GameState, hour: number): GameState => {
  const day = Math.floor(state.gameMinutes / MINUTES_PER_DAY);
  const h = Math.min(Math.max(hour, 0), 23.99);
  return { ...state, gameMinutes: day * MINUTES_PER_DAY + h * 60 };
};

/** Simulates time passing (growth, workers, animals, wages, feed) in 15-minute chunks. */
export const skipMinutes = (state: GameState, minutes: number): GameState => {
  let s = state;
  let left = Math.max(0, minutes);
  while (left > 0) {
    const step = Math.min(15, left);
    s = advanceGame(s, step).state;
    left -= step;
  }
  return s;
};

export const addSeeds = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    seeds: CROP_IDS.reduce((seeds, id) => addCount(seeds, id, amount), state.inventory.seeds),
  },
});

/** Adds `amount` of every crop and animal product. */
export const addProduce = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    produce: CROP_IDS.reduce((p, id) => addCount(p, id, amount), state.inventory.produce),
    products: ANIMAL_PRODUCT_IDS.reduce((p, id) => addCount(p, id, amount), state.inventory.products),
  },
});

/** Every planted crop becomes ready to harvest. */
export const growAll = (state: GameState): GameState => ({
  ...state,
  tiles: state.tiles.map((t) =>
    t.crop ? { ...t, crop: { ...t.crop, growthMinutes: growthMinutesNeeded(t.crop) } } : t,
  ),
});

/** Waters every planted tile until the end of the day. */
export const waterAll = (state: GameState): GameState => {
  const until = startOfNextDay(state.gameMinutes);
  return {
    ...state,
    tiles: state.tiles.map((t) =>
      t.crop && t.state === 'planted' ? { ...t, state: 'watered', wateredUntil: until } : t,
    ),
  };
};

/** Unlocks every plot for free. */
export const unlockAll = (state: GameState): GameState => ({
  ...state,
  tiles: state.tiles.map((t) => (t.state === 'locked' ? { ...t, state: 'grass' } : t)),
  unlockedPlots: Array.from({ length: PLOT_COUNT }, (_, i) => i),
});

/** Adds a random staff worker for free, even without a bed. */
export const hireFree = (state: GameState): GameState => {
  if (state.workers.length >= MAX_WORKERS) return state;
  const profile = rollProfile(state.nextId * 13 + 5, new Set(state.workers.map((w) => w.name)));
  const worker = makeWorker(state.nextId, 'staff', profile, homeSpot(state, state.workers.length));
  return { ...state, workers: [...state.workers, worker], nextId: state.nextId + 1 };
};

/** Finishes every construction site and demolition at once. */
export const finishWorks = (state: GameState): GameState => completeAllWork(state);

/** Completes the whole queue instantly, in order (sites and demolitions too). Tasks that turn out invalid are dropped. */
export const finishAllTasks = (state: GameState): GameState => {
  const built = completeAllWork(state);
  const done = built.tasks.reduce<GameState>((s, task) => {
    const result = applyTask(s, task);
    return result.ok ? result.state : s;
  }, built);
  return {
    ...done,
    tasks: [],
    workers: done.workers.map((w) => ({ ...w, taskId: null, path: [], progress: 0 })),
  };
};

/** A finished shelter for a species, placed for free near the house (null when nothing fits). */
const freeShelter = (state: GameState, kind: AnimalId): GameState | null => {
  const type = sheltersFor(kind)[0];
  const spot = type ? findFreeSpot(state, type, HOME_POSITION) : null;
  if (!type || !spot) return null;
  const placed = placeStructure(state, type, spot.x, spot.y, spot.rotation, { free: true });
  return placed.ok ? placed.state : null;
};

/** Adds animals for free, ignoring the pasture limit and building free shelters when they run out of room. */
export const spawnAnimals = (state: GameState, kind: AnimalId, count: number): GameState => {
  let s = state;
  for (let i = 0; i < count; i++) {
    let result = addAnimal(s, kind, { ignorePasture: true });
    if (!result.ok && (result.error === 'no-shelter' || result.error === 'shelter-full')) {
      const housed = freeShelter(s, kind);
      if (housed) result = addAnimal(housed, kind, { ignorePasture: true });
    }
    if (!result.ok) break;
    s = result.state;
  }
  return s;
};

/** Every producing animal leaves one product in its shelter; everyone is fed. */
export const readyAllProducts = (state: GameState): GameState => {
  const fed: GameState = { ...state, animals: state.animals.map((a) => ({ ...a, fed: true, productMinutes: 0 })) };
  return state.animals.reduce((s, a) => {
    const product = animalProduct(a);
    return product ? addStock(s, a.shelterId, product) : s;
  }, fed);
};

/** Ages every animal by real hours (at 1×): 12 makes a baby young, 72 makes an adult old. */
export const ageAnimals = (state: GameState, realHours: number): GameState => ({
  ...state,
  animals: state.animals.map((a) => ({ ...a, bornAt: a.bornAt - realHours * GAME_MINUTES_PER_REAL_HOUR })),
});

/**
 * Makes a healthy animal sick (the first one, or a given id) with symptoms showing now and the
 * farm aware of it.
 */
export const sickenAnimal = (state: GameState, disease: DiseaseId = 'flu', animalId?: number): GameState => {
  const target = state.animals.find((a) => (animalId === undefined ? !a.health : a.id === animalId));
  if (!target) return state;
  const since = state.gameMinutes - DISEASES[disease].incubationRealHours * GAME_MINUTES_PER_REAL_HOUR;
  return {
    ...state,
    animals: state.animals.map((a) => (a.id === target.id ? { ...a, health: { disease, since, noticed: true } } : a)),
  };
};

/** Jumps the clock (without simulating) to the same hour of the next day with this weather. */
export const skipToWeather = (state: GameState, weather: WeatherId): GameState => {
  const today = dayOf(state.gameMinutes);
  for (let day = today + 1; day < today + 200; day++) {
    if (weatherOf(day) !== weather) continue;
    // The day's rain or storm hits the farm, as it would at midnight.
    return applyDayWeather({ ...state, gameMinutes: state.gameMinutes + (day - today) * MINUTES_PER_DAY }, day).state;
  }
  return state;
};

/** Adds fertilizer units. */
export const addFertilizer = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: { ...state.inventory, fertilizer: state.inventory.fertilizer + Math.max(0, Math.floor(amount)) },
});

/** Every shelter full of manure. */
export const fillManure = (state: GameState): GameState => ({
  ...state,
  structures: state.structures.map((s) => (shelterDef(s.type) ? { ...s, manure: manureCap(s) } : s)),
});

/** Every animal healthy again. */
export const healAll = (state: GameState): GameState => ({
  ...state,
  animals: state.animals.map(({ health: _health, ...a }) => a),
});

/** Adds doses of every medicine. */
export const addMedicine = (state: GameState, amount: number): GameState => ({
  ...state,
  inventory: {
    ...state.inventory,
    medicine: MEDICINE_IDS.reduce((m, id) => addCount(m, id, Math.max(0, Math.floor(amount))), state.inventory.medicine),
  },
});

/** A walk-in customer sets off for the dock right now (when a bay is free), wanting something different each minute. */
export const callCustomer = (state: GameState): GameState =>
  spawnWalkIn(state, {
    at: state.gameMinutes,
    day: Math.floor(state.gameMinutes / MINUTES_PER_DAY),
    slot: Math.floor(state.gameMinutes) % 97,
  });

/** Adds feed (kg) to the stock. */
export const addFeed = (state: GameState, kg: number): GameState => ({
  ...state,
  inventory: { ...state.inventory, feed: state.inventory.feed + Math.max(0, kg) },
});

/** A buyer makes an offer right now on the first listing without one (up to 5 units). */
export const forceOffer = (state: GameState): GameState => {
  const listing = state.listings.find((l) => !state.offers.some((o) => o.listingId === l.id));
  if (!listing) return state;
  const offer = {
    id: state.nextId,
    listingId: listing.id,
    quantity: Math.min(5, listing.quantity),
    price: listing.price,
    expiresAt: state.gameMinutes + OFFERS.validMinutes,
  };
  return { ...state, offers: [...state.offers, offer], nextId: state.nextId + 1 };
};

/** A predator raids the shelter with most animals right now. */
export const forceRaid = (state: GameState): { state: GameState; attack: PredatorAttack | null } => {
  const counts = new Map<number, number>();
  for (const a of state.animals) counts.set(a.shelterId, (counts.get(a.shelterId) ?? 0) + 1);
  const [shelterId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const shelter = state.structures.find((s) => s.id === shelterId);
  if (!shelter) return { state, attack: null };
  return raidShelter(state, shelter, (Math.floor(state.gameMinutes) % 97) / 97);
};

/** Lays a finished fence line from (x0, y0) towards (x1, y1), snapped to 45°, for free (skips taken tiles). */
export const layFenceLine = (state: GameState, x0: number, y0: number, x1: number, y1: number): GameState => {
  if (!inBounds(x0, y0) || !inBounds(x1, y1)) return state;
  return fenceLine(tileIndex(x0, y0), tileIndex(x1, y1)).tiles.reduce((s, tile) => {
    const laid = layFence(s, tile, false);
    return laid.ok ? laid.state : s;
  }, state);
};

/**
 * Puts a machine in the first free slot (a rented one for 3 days when `rented`), building a
 * finished machine shed near the house first when there is no room.
 */
export const addMachine = (state: GameState, type: MachineId, rented = false): GameState => {
  let s = state;
  if (!freeSlot(s, rented)) {
    const spot = findFreeSpot(s, 'machineShed', HOME_POSITION);
    const placed = spot && placeStructure(s, 'machineShed', spot.x, spot.y, spot.rotation, { free: true });
    if (!placed?.ok) return state;
    s = placed.state;
  }
  const slot = freeSlot(s, rented);
  if (!slot) return state;
  const machine = {
    id: s.nextId,
    type,
    parkId: slot.parkId,
    slot: slot.slot,
    condition: CONDITION.max,
    ...(rented ? { rental: { until: rentalEnd(s.gameMinutes, 3) } } : {}),
  };
  return { ...s, machines: [...s.machines, machine], nextId: s.nextId + 1 };
};

/** Takes `points` of condition off every owned machine. */
export const wearMachines = (state: GameState, points: number): GameState => ({
  ...state,
  machines: state.machines.map((m) => (m.rental ? m : { ...m, condition: Math.max(0, m.condition - points) })),
});

/** Adds a free 2-star staff worker with the machinery skill. */
export const hireOperator = (state: GameState): GameState => {
  if (state.workers.length >= MAX_WORKERS) return state;
  const profile = rollProfile(state.nextId * 17 + 3, new Set(state.workers.map((w) => w.name)));
  const skills = profile.skills.includes('machinery') ? profile.skills : [...profile.skills, 'machinery' as const];
  const worker = makeWorker(
    state.nextId,
    'staff',
    { ...profile, stars: 2, skills, hourlyWage: hourlyWageFor(2, profile.specialty, skills) },
    homeSpot(state, state.workers.length),
  );
  return { ...state, workers: [...state.workers, worker], nextId: state.nextId + 1 };
};

/** Every owned machine back to full condition, and back from the town mechanic. */
export const repairMachines = (state: GameState): GameState => ({
  ...state,
  machines: state.machines.map((m) => {
    if (m.rental) return m;
    const { repairUntil: _done, ...rest } = m;
    return { ...rest, condition: CONDITION.max };
  }),
});

/** Every rental ends now (each one goes back once its driver parks it). */
export const expireRentals = (state: GameState): GameState => ({
  ...state,
  machines: state.machines.map((m) => (m.rental ? { ...m, rental: { ...m.rental, until: state.gameMinutes } } : m)),
});

const FIELD = { width: 8, height: 4 } as const;

/** Free farm grass: no structure, road, fence, greenhouse cover or queued task. */
const freeGrass = (state: GameState, busy: ReadonlySet<number>, x: number, y: number): boolean => {
  if (!inBounds(x, y)) return false;
  const i = tileIndex(x, y);
  const t = state.tiles[i];
  return !!t && t.state === 'grass' && !t.structure && !t.road && !t.fence && !t.cover && !busy.has(i);
};

/** The tiles of the `FIELD` block with its corner at (x, y), or null when one of them is not free grass. */
const fieldAt = (state: GameState, busy: ReadonlySet<number>, x: number, y: number): number[] | null => {
  const tiles: number[] = [];
  for (let dy = 0; dy < FIELD.height; dy++) {
    for (let dx = 0; dx < FIELD.width; dx++) {
      if (!freeGrass(state, busy, x + dx, y + dy)) return null;
      tiles.push(tileIndex(x + dx, y + dy));
    }
  }
  return tiles;
};

/** The free `FIELD`-sized block of grass closest to the house, as tile indices. */
const freeField = (state: GameState): number[] | null => {
  const busy = new Set(state.tasks.map((t) => t.tile));
  let best: { tiles: number[]; dist: number } | null = null;
  for (let y = 0; y + FIELD.height <= GRID_SIZE; y++) {
    for (let x = 0; x + FIELD.width <= GRID_SIZE; x++) {
      const dist = Math.hypot(x - HOME_POSITION.x, y - HOME_POSITION.y);
      if (best && dist >= best.dist) continue;
      const tiles = fieldAt(state, busy, x, y);
      if (tiles) best = { tiles, dist };
    }
  }
  return best?.tiles ?? null;
};

/**
 * A machine test field on the free grass closest to the house: 'hoe' queues plowing on grass
 * (for the tractor), 'hand' plants ripe wheat and queues the harvest (for the harvester).
 */
export const machineField = (state: GameState, work: 'hoe' | 'hand'): GameState => {
  const field = freeField(state);
  if (!field) return state;
  let s = state;
  if (work === 'hand') {
    const ripe = new Set(field);
    s = {
      ...s,
      tiles: s.tiles.map((t, i) =>
        ripe.has(i) ? { ...t, state: 'planted', crop: { cropId: 'wheat', growthMinutes: CROPS.wheat.growthHours * 60 } } : t,
      ),
    };
  }
  return applyArea(s, work, field, 'wheat', 'queue').state;
};

/** Every plot of the farm and every plot for sale next to it counts as analyzed. */
export const surveyAll = (state: GameState): GameState => {
  const plots: number[] = [];
  for (let p = 0; p < PLOT_COUNT; p++) if (canSurvey(state, p)) plots.push(p);
  return { ...state, surveyedPlots: plots };
};

/** Adds a free 2-star staff worker with the agronomy skill. */
export const hireAgronomist = (state: GameState): GameState => {
  if (state.workers.length >= MAX_WORKERS) return state;
  const profile = rollProfile(state.nextId * 23 + 5, new Set(state.workers.map((w) => w.name)));
  const skills: SkillId[] = profile.skills.includes('agronomy') ? profile.skills : [...profile.skills, 'agronomy'];
  const worker = makeWorker(
    state.nextId,
    'staff',
    { ...profile, stars: 2, skills, hourlyWage: hourlyWageFor(2, profile.specialty, skills) },
    homeSpot(state, state.workers.length),
  );
  return { ...state, workers: [...state.workers, worker], nextId: state.nextId + 1 };
};

/** Another soil map (null: uniform soil). */
export const setSoilSeed = (state: GameState, seed: number | null): GameState => ({ ...state, soilSeed: seed });
