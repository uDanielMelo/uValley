/** Farm machinery: buying, selling, renting and returning machines. */
import { CONDITION, MACHINES, RENTAL, RESALE, type MachineId, type RentalDays } from '../data/machines';
import { MAX_WORKERS, WORK_END_HOUR } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { homeSpot } from './home';
import { freeSlot, parkingDef } from './parking';
import { makeWorker, removeWorkers, rollProfile } from './staff';
import { fail, ok, type ActionResult, type GameState, type Machine, type Worker } from './types';

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
