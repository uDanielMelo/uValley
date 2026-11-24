/**
 * Selling live animals through the loading pen. The player marks an animal for sale; someone with
 * Tratar animais leads it to the pen ('tend' task, `job.type = 'herd'`), where it waits in the
 * holding area, not producing. Calling a buyer hires a livestock truck (freight per head) that
 * parks at the pen's truck bay; the crew loads the penned animals (shipments.ts, kind
 * 'livestock') and the buyer pays what they are worth then. Animals lose value the longer they
 * wait in the pen (PEN.stress), and the pen is open at night (predators).
 */
import { LIVESTOCK, PEN } from '../data/docks';
import { MAX_TASKS } from '../data/workers';
import { isPen } from './dock';
import { tileIndex } from './grid';
import { scheduleFreight } from './shipments';
import { isActive } from './structures';
import { dropTasks } from './tasks';
import { fail, ok, type ActionError, type ActionResult, type Animal, type GameState, type StructureInstance, type Task } from './types';

export const pensOf = (state: Pick<GameState, 'structures'>): StructureInstance[] => state.structures.filter(isPen);

const herdOf = (animalId: number) => (t: Task) => t.job?.type === 'herd' && t.job.animalId === animalId;

/** Animals in a pen, or on their way to it. */
export const penHeads = (state: Pick<GameState, 'animals' | 'tasks'>, penId: number): number =>
  state.animals.filter((a) => a.penned?.penId === penId).length +
  state.tasks.filter((t) => t.job?.type === 'herd' && t.job.penId === penId).length;

/** A working pen with room for one more, or why there is none. */
const penWithRoom = (state: GameState): StructureInstance | ActionError => {
  const pens = pensOf(state).filter((p) => isActive(state, p));
  if (pens.length === 0) return 'no-pen';
  return pens.find((p) => penHeads(state, p.id) < PEN.capacity) ?? 'pen-full';
};

/** The animal is on a livestock truck's list (hired, coming or being loaded). */
export const onTruck = (state: Pick<GameState, 'shipments'>, animalId: number): boolean =>
  state.shipments.some((s) => s.kind === 'livestock' && s.phase !== 'leaving' && s.animals?.includes(animalId));

/** Where an animal stands in its sale: led to the pen, penned, on a truck's list, or not for sale. */
export type SaleStatus = 'none' | 'herding' | 'penned' | 'on-truck';

export const saleStatus = (state: Pick<GameState, 'tasks' | 'shipments'>, animal: Pick<Animal, 'id' | 'penned'>): SaleStatus => {
  if (onTruck(state, animal.id)) return 'on-truck';
  if (animal.penned) return 'penned';
  return state.tasks.some(herdOf(animal.id)) ? 'herding' : 'none';
};

/** Marks an animal for sale: the crew leads it to a pen with room. */
export const markForSale = (state: GameState, animalId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  if (!animal) return fail('no-animal');
  if (saleStatus(state, animal) !== 'none') return ok(state);
  const pen = penWithRoom(state);
  if (typeof pen === 'string') return fail(pen);
  if (state.tasks.length >= MAX_TASKS) return fail('queue-full');
  const task: Task = {
    id: state.nextId,
    kind: 'tend',
    tile: tileIndex(Math.floor(animal.x), Math.floor(animal.y)),
    cropId: null,
    workerId: null,
    job: { type: 'herd', animalId, penId: pen.id },
  };
  return ok({ ...state, tasks: [...state.tasks, task], nextId: state.nextId + 1 });
};

/** Takes an animal off sale: the herding is called off, or it leaves the pen and goes home (not once a truck is coming for it). */
export const unmarkForSale = (state: GameState, animalId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  if (!animal) return fail('no-animal');
  if (onTruck(state, animalId)) return fail('on-truck');
  if (!animal.penned) return ok(dropTasks(state, herdOf(animalId)));
  const { penned: _penned, ...free } = animal;
  return ok({ ...state, animals: state.animals.map((a) => (a.id === animalId ? { ...free, path: [] } : a)) });
};

export { penAnimal, penGate, penPrice, penSlot, stressFactor } from './penValue';

/** Penned animals waiting for a truck (not on one yet), oldest first, up to a truckload. */
export const waitingInPen = (state: GameState, penId: number): Animal[] =>
  state.animals
    .filter((a) => a.penned?.penId === penId && !onTruck(state, a.id))
    .sort((a, b) => (a.penned?.since ?? 0) - (b.penned?.since ?? 0))
    .slice(0, LIVESTOCK.maxHeads);

/** The freight for a livestock truck taking these animals. */
export const livestockFreight = (animals: readonly Pick<Animal, 'kind'>[]): number =>
  LIVESTOCK.base + animals.reduce((s, a) => s + LIVESTOCK.perHead[a.kind], 0);

/** Why a buyer cannot be called to a pen now, or null. */
export const checkBuyer = (state: GameState, penId: number): ActionError | null => {
  const pen = state.structures.find((s) => s.id === penId);
  if (!pen || !isPen(pen) || !isActive(state, pen)) return 'no-pen';
  const animals = waitingInPen(state, penId);
  if (animals.length === 0) return 'not-penned';
  return state.money < livestockFreight(animals) ? 'not-enough-money' : null;
};

/** Calls a buyer: pays the livestock truck's freight and schedules it for the waiting animals (up to a load). */
export const callBuyer = (state: GameState, penId: number): ActionResult => {
  const error = checkBuyer(state, penId);
  if (error) return fail(error);
  const animals = waitingInPen(state, penId);
  const freight = livestockFreight(animals);
  const paid = { ...state, money: state.money - freight };
  // The truck goes to this pen, not to the dock.
  return ok(scheduleFreight(paid, { kind: 'livestock', goods: [], payment: 0, freight, vehicle: 3, animals: animals.map((a) => a.id) }, Infinity, penId));
};
