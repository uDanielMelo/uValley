/** Farm machinery: buying, selling, renting and returning machines. */
import { CROPS } from '../data/crops';
import { CONDITION, MACHINES, RENTAL, REPAIR, RESALE, type MachineId, type RentalDays } from '../data/machines';
import { MAX_WORKERS, WORK_END_HOUR } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { homeSpot } from './home';
import { boardingPoint, freeSlot, hasWorkshop, parkingDef, slotPoint } from './parking';
import { makeWorker, removeWorkers, rollProfile } from './staff';
import { isActive } from './structures';
import { fail, ok, type ActionResult, type GameState, type GridPoint, type Machine, type Task, type Worker } from './types';

export interface MachineEvent {
  kind: 'arrived' | 'rental-ended' | 'broke' | 'repaired' | 'no-fuel';
  type: MachineId;
}

/** What a machine sells for; rented ones are worth nothing. */
export const resalePrice = (m: Machine): number =>
  m.rental ? 0 : Math.floor(MACHINES[m.type].price * (RESALE.base + (RESALE.perCondition * m.condition) / CONDITION.max));

export const rentalCost = (type: MachineId, days: RentalDays, withOperator: boolean): number =>
  Math.round(MACHINES[type].rentPerDay * days * RENTAL.discount[days]) + (withOperator ? RENTAL.operatorPerDay * days : 0);

/** The end of the last rented day (the end of the shift); after the shift, the first day is tomorrow. */
export const rentalEnd = (gameMinutes: number, days: RentalDays): number => {
  const day = Math.floor(gameMinutes / MINUTES_PER_DAY);
  const minute = gameMinutes - day * MINUTES_PER_DAY;
  const first = minute >= WORK_END_HOUR * 60 ? day + 1 : day;
  return (first + days - 1) * MINUTES_PER_DAY + WORK_END_HOUR * 60;
};

export const buyMachine = (state: GameState, type: MachineId): ActionResult => {
  const spot = freeSlot(state, false);
  if (!spot) return fail('no-shed');
  const price = MACHINES[type].price;
  if (state.money < price) return fail('not-enough-money');
  const machine: Machine = { id: state.nextId, type, parkId: spot.parkId, slot: spot.slot, condition: CONDITION.max };
  return ok({ ...state, money: state.money - price, machines: [...state.machines, machine], nextId: state.nextId + 1 });
};

export const sellMachine = (state: GameState, machineId: number): ActionResult => {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine || machine.rental) return fail('no-machine');
  if (machine.driverId !== undefined) return fail('machine-busy');
  return ok({ ...state, money: state.money + resalePrice(machine), machines: state.machines.filter((m) => m.id !== machineId) });
};

export const rentMachine = (state: GameState, type: MachineId, days: RentalDays, withOperator: boolean): ActionResult => {
  const spot = freeSlot(state, true);
  if (!spot) return fail('no-parking');
  const cost = rentalCost(type, days, withOperator);
  if (state.money < cost) return fail('not-enough-money');
  if (withOperator && state.workers.length >= MAX_WORKERS) return fail('max-workers');
  const id = state.nextId;
  const until = rentalEnd(state.gameMinutes, days);
  let workers = state.workers;
  let rental: Machine['rental'] = { until };
  if (withOperator) {
    const operatorId = id + 1;
    const profile = rollProfile(id * 31 + state.gameMinutes, new Set(state.workers.map((w) => w.name)));
    const base = makeWorker(
      operatorId,
      'temp',
      { ...profile, stars: 2, skills: ['machinery'], specialty: null, hourlyWage: 0 },
      homeSpot(state, state.workers.length),
    );
    const operator: Worker = { ...base, priorities: ['hoe', 'hand'], rentalId: id };
    workers = [...workers, operator];
    rental = { until, operatorId };
  }
  const machine: Machine = { id, type, parkId: spot.parkId, slot: spot.slot, condition: CONDITION.max, rental };
  return ok({
    ...state,
    money: state.money - cost,
    machines: [...state.machines, machine],
    workers,
    nextId: state.nextId + (withOperator ? 2 : 1),
  });
};

/** Removes machines and the operators of their rentals. */
const dropMachines = (state: GameState, ids: ReadonlySet<number>): GameState => {
  if (ids.size === 0) return state;
  const operators = new Set(state.workers.filter((w) => w.rentalId !== undefined && ids.has(w.rentalId)).map((w) => w.id));
  return removeWorkers({ ...state, machines: state.machines.filter((m) => !ids.has(m.id)) }, operators);
};

export const returnRental = (state: GameState, machineId: number): ActionResult => {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine?.rental) return fail('no-machine');
  if (machine.driverId !== undefined) return fail('machine-busy');
  return ok(dropMachines(state, new Set([machineId])));
};

/** Takes back rentals whose time is up (once nobody is driving them), and an operator who is no longer riding. */
export const endRentals = (state: GameState): { state: GameState; events: MachineEvent[] } => {
  const now = state.gameMinutes;
  const ending = state.machines.filter((m) => m.rental && m.rental.until <= now && m.driverId === undefined);
  const events: MachineEvent[] = ending.map((m) => ({ kind: 'rental-ended', type: m.type }));
  let next = dropMachines(state, new Set(ending.map((m) => m.id)));
  const late = new Set<number>();
  for (const w of next.workers) {
    if (w.rentalId === undefined || w.riding) continue;
    const m = next.machines.find((x) => x.id === w.rentalId);
    if (m?.rental && m.rental.until <= now) late.add(w.id);
  }
  if (late.size > 0) {
    next = removeWorkers(next, late);
    next = { ...next, machines: next.machines.map((m) => withoutOperator(m, late)) };
  }
  return { state: next, events };
};

/** The machine without its rental operator when he is in `gone`. */
const withoutOperator = (m: Machine, gone: ReadonlySet<number>): Machine =>
  m.rental?.operatorId !== undefined && gone.has(m.rental.operatorId) ? { ...m, rental: { until: m.rental.until } } : m;

/**
 * On load: every machine gets a valid slot (a structure that exists, takes its kind of ownership and
 * is not already used), else the owned one is sold and the rented one goes away with its operator.
 * Also cleans references to machines and workers that no longer exist.
 */
export const rehomeMachines = (state: GameState): GameState => {
  const taken = new Set<string>();
  const kept: Machine[] = [];
  const homeless: Machine[] = [];
  for (const m of state.machines) {
    const park = state.structures.find((s) => s.id === m.parkId);
    const def = park ? parkingDef(park) : null;
    const key = `${m.parkId}:${m.slot}`;
    if (def && (m.rental || def.owned) && Number.isInteger(m.slot) && m.slot >= 0 && m.slot < def.slots && !taken.has(key)) {
      taken.add(key);
      kept.push(m);
    } else homeless.push(m);
  }
  let next: GameState = { ...state, machines: kept };
  const lost = new Set<number>();
  for (const m of homeless) {
    const spot = freeSlot(next, m.rental !== undefined);
    if (spot) next = { ...next, machines: [...next.machines, { ...m, parkId: spot.parkId, slot: spot.slot }] };
    else if (m.rental) lost.add(m.id);
    else next = { ...next, money: next.money + resalePrice(m) };
  }
  next = dropMachines(next, lost);

  // Dangling references: operators of vanished rentals, riders of vanished machines, drivers who left.
  const machineIds = new Set(next.machines.map((m) => m.id));
  next = removeWorkers(
    next,
    new Set(next.workers.filter((w) => w.rentalId !== undefined && !machineIds.has(w.rentalId)).map((w) => w.id)),
  );
  const workerIds = new Set(next.workers.map((w) => w.id));
  return {
    ...next,
    workers: next.workers.map((w) => {
      if (w.machineId === undefined || machineIds.has(w.machineId)) return w;
      const { machineId: _machineId, riding: _riding, ...rest } = w;
      return rest;
    }),
    machines: next.machines.map((m) => {
      const gone = new Set([...(m.rental?.operatorId !== undefined ? [m.rental.operatorId] : [])].filter((id) => !workerIds.has(id)));
      const cleaned = withoutOperator(m, gone);
      if (cleaned.driverId === undefined || workerIds.has(cleaned.driverId)) return cleaned;
      const { driverId: _driverId, ...rest } = cleaned;
      return rest;
    }),
  };
};

// ---------- driving ----------

/** Workers with the Machinery skill drive the farm's machines. */
export const isOperator = (w: Pick<Worker, 'skills'>): boolean => w.skills.includes('machinery');

/**
 * Whether a machine can do a task: its own kind of task, on a tile outside a greenhouse; the
 * harvester only reaps field crops (not orchards).
 */
export const machineCanDo = (state: Pick<GameState, 'tiles'>, type: MachineId, task: Pick<Task, 'kind' | 'tile'>): boolean => {
  if (task.kind !== MACHINES[type].task) return false;
  const tile = state.tiles[task.tile];
  if (!tile || tile.cover) return false;
  if (task.kind !== 'hand') return true;
  return tile.crop !== undefined && CROPS[tile.crop.cropId].kind === 'field';
};

/** A machine that has to go back to its bay: broken, at the mechanic, rental over or no money for the diesel. */
export const mustPark = (state: Pick<GameState, 'gameMinutes' | 'money'>, m: Machine): boolean =>
  m.condition <= 0 ||
  (m.repairUntil !== undefined && m.repairUntil > state.gameMinutes) ||
  (m.rental !== undefined && m.rental.until <= state.gameMinutes) ||
  (m.rental === undefined && state.money < MACHINES[m.type].costPerHour);

/** Pace multiplier from the machine's condition. */
export const conditionFactor = (m: Pick<Machine, 'condition'>): number =>
  m.condition < CONDITION.slowBelow ? CONDITION.slowFactor : 1;

/** Where the driver of a machine gets on and off it (on the road in front of its bay). */
export const machineBoarding = (state: Pick<GameState, 'structures'>, m: Machine): GridPoint | null => {
  const park = state.structures.find((s) => s.id === m.parkId);
  return park ? boardingPoint(park, m.slot) : null;
};

/**
 * A parked machine the worker could take for the task: nobody driving it, fit to run, in a bay of
 * a working structure (reached by road) and able to do the task. The nearest one to the worker.
 */
export const availableMachine = (state: GameState, worker: Pick<Worker, 'x' | 'y'>, task: Task): Machine | undefined => {
  let best: Machine | undefined;
  let bestDistance = Infinity;
  for (const m of state.machines) {
    if (m.driverId !== undefined || mustPark(state, m) || !machineCanDo(state, m.type, task)) continue;
    const park = state.structures.find((s) => s.id === m.parkId);
    if (!park || !isActive(state, park)) continue;
    const p = boardingPoint(park, m.slot);
    const d = Math.hypot(p.x - worker.x, p.y - worker.y);
    if (d < bestDistance) {
      best = m;
      bestDistance = d;
    }
  }
  return best;
};

/**
 * Keeps drivers and machines pointing at each other: a machine whose driver is gone (or no longer
 * has it) goes back to its bay at once, and a worker whose machine is gone (or driven by someone
 * else) is back on foot.
 */
export const releaseOrphanMachines = (state: GameState): GameState => {
  const machines = state.machines.map((m): Machine => {
    if (m.driverId === undefined) return m;
    const driverId = m.driverId;
    if (state.workers.some((w) => w.id === driverId && w.machineId === m.id)) return m;
    const { driverId: _driverId, ...rest } = m;
    return rest;
  });
  const workers = state.workers.map((w): Worker => {
    if (w.machineId === undefined && !w.riding) return w;
    const machineId = w.machineId;
    if (machineId !== undefined && machines.some((m) => m.id === machineId && m.driverId === w.id)) return w;
    const { machineId: _machineId, riding: _riding, ...rest } = w;
    return rest;
  });
  const machinesChanged = machines.some((m, i) => m !== state.machines[i]);
  const workersChanged = workers.some((w, i) => w !== state.workers[i]);
  if (!machinesChanged && !workersChanged) return state;
  return { ...state, ...(machinesChanged ? { machines } : {}), ...(workersChanged ? { workers } : {}) };
};

// ---------- wear, diesel and repair ----------

/** Whether the machine has a rider on it (it is out of its bay). */
const isDriven = (state: Pick<GameState, 'workers'>, m: Machine): boolean =>
  m.driverId !== undefined && state.workers.some((w) => w.id === m.driverId && w.riding === true);

/**
 * Owned machines with a rider wear down and burn diesel (charged every 60 driven minutes while there
 * is money; without it `no-fuel` shows once and `mustPark` sends the driver home). Machines whose
 * mechanic is done come back at full condition.
 */
export const stepMachines = (state: GameState, minutes: number): { state: GameState; events: MachineEvent[] } => {
  const events: MachineEvent[] = [];
  let money = state.money;
  let changed = false;
  const machines = state.machines.map((m): Machine => {
    let next = m;
    if (!m.rental && m.repairUntil !== undefined && m.repairUntil <= state.gameMinutes) {
      const { repairUntil: _repairUntil, ...rest } = m;
      next = { ...rest, condition: CONDITION.max };
      events.push({ kind: 'repaired', type: m.type });
    }
    if (!next.rental && isDriven(state, next) && minutes > 0) {
      const def = MACHINES[next.type];
      const condition = Math.max(0, next.condition - (def.wearPerHour * minutes) / 60);
      if (next.condition > 0 && condition <= 0) events.push({ kind: 'broke', type: next.type });
      const owed = (next.unpaidMinutes ?? 0) >= 60;
      let unpaid = (next.unpaidMinutes ?? 0) + minutes;
      while (unpaid >= 60) {
        if (money < def.costPerHour) {
          if (!owed) events.push({ kind: 'no-fuel', type: next.type });
          unpaid = 60;
          break;
        }
        money -= def.costPerHour;
        unpaid -= 60;
      }
      next = { ...next, condition, unpaidMinutes: unpaid };
    }
    if (next !== m) changed = true;
    return next;
  });
  if (!changed) return { state, events };
  return { state: { ...state, money, machines }, events };
};

/** At midnight, owned machines parked in a shed with a workshop get `workshopPerNight` points, as far as the money goes. */
export const repairAtWorkshops = (state: GameState): { state: GameState; events: MachineEvent[] } => {
  const events: MachineEvent[] = [];
  let money = state.money;
  const machines = state.machines.map((m): Machine => {
    if (m.rental || m.condition >= CONDITION.max || isDriven(state, m)) return m;
    if (m.repairUntil !== undefined && m.repairUntil > state.gameMinutes) return m;
    const park = state.structures.find((s) => s.id === m.parkId);
    if (!park || !hasWorkshop(park)) return m;
    const points = Math.min(REPAIR.workshopPerNight, CONDITION.max - m.condition, Math.floor(money / REPAIR.costPerPoint));
    if (points <= 0) return m;
    money -= Math.ceil(points * REPAIR.costPerPoint);
    const condition = m.condition + points;
    if (condition >= CONDITION.max) events.push({ kind: 'repaired', type: m.type });
    return { ...m, condition };
  });
  if (machines.every((m, i) => m === state.machines[i])) return { state, events };
  return { state: { ...state, money, machines }, events };
};

export const mechanicCost = (m: Machine): number =>
  Math.ceil(CONDITION.max - m.condition) * REPAIR.costPerPoint * REPAIR.mechanicMultiplier;

/** Pays a mechanic who brings the machine back at 100 by six the next morning. */
export const callMechanic = (state: GameState, machineId: number): ActionResult => {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine || machine.rental) return fail('no-machine');
  if (machine.driverId !== undefined || (machine.repairUntil !== undefined && machine.repairUntil > state.gameMinutes)) {
    return fail('machine-busy');
  }
  if (machine.condition >= CONDITION.max) return ok(state);
  const cost = mechanicCost(machine);
  if (state.money < cost) return fail('not-enough-money');
  const day = Math.floor(state.gameMinutes / MINUTES_PER_DAY);
  const repairUntil = (day + 1) * MINUTES_PER_DAY + REPAIR.mechanicReadyHour * 60;
  return ok({
    ...state,
    money: state.money - cost,
    machines: state.machines.map((m) => (m.id === machineId ? { ...m, repairUntil } : m)),
  });
};

/** Where a machine is drawn: in its slot (facing out, in quarter turns), or under its driver (heading from movement). */
export interface MachinePose {
  x: number;
  y: number;
  /** Quarter turns when parked; null when driven (the scene turns it the way it moves). */
  heading: number | null;
  /** The driver is at a task (the harvester's reel turns). */
  working: boolean;
}

export const machinePose = (state: Pick<GameState, 'structures' | 'workers'>, m: Machine): MachinePose | null => {
  const driver = m.driverId === undefined ? undefined : state.workers.find((w) => w.id === m.driverId);
  if (driver?.riding) {
    return { x: driver.x, y: driver.y, heading: null, working: driver.taskId !== null && driver.path.length === 0 };
  }
  const park = state.structures.find((s) => s.id === m.parkId);
  if (!park) return null;
  const spot = slotPoint(park, m.slot);
  return { x: spot.x, y: spot.y, heading: spot.heading, working: false };
};
