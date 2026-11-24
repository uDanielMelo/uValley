/**
 * Penned animals: where they stand in the pen, getting them in, what they are worth to a buyer and
 * selling them. Kept apart from pen.ts so tasks and shipments can use it without circular imports.
 */
import { PEN } from '../data/docks';
import { animalSalePrice } from './animals';
import { findPath } from './path';
import { frontPoint, isActive } from './structures';
import { fail, ok, type ActionResult, type Animal, type GameState, type GridPoint, type StructureInstance } from './types';

/** Where the n-th penned animal stands: a grid in the holding area (the left two thirds of the pen). */
export const penSlot = (pen: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>, n: number): GridPoint =>
  frontPoint(pen, -(0.35 + Math.floor(n / 4) * 0.55), 0.25 + (n % 4) * 0.4);

/** The gate of the holding area, just outside the pen's front. */
export const penGate = (pen: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): GridPoint => frontPoint(pen, 0.6, 0.8);

/** A herding task is done: the animal walks to the pen's gate and into its slot in the holding area. */
export const penAnimal = (state: GameState, animalId: number, penId: number): ActionResult => {
  const animal = state.animals.find((a) => a.id === animalId);
  const pen = state.structures.find((s) => s.id === penId);
  if (!animal) return fail('no-animal');
  if (!pen || !isActive(state, pen)) return fail('no-pen');
  if (animal.penned) return ok(state);
  const n = state.animals.filter((a) => a.penned?.penId === penId).length;
  if (n >= PEN.capacity) return fail('pen-full');
  const path = [...findPath(state.tiles, animal, penGate(pen)), penSlot(pen, n)];
  const penned: Animal = { ...animal, path, penned: { penId, since: state.gameMinutes } };
  return ok({ ...state, animals: state.animals.map((a) => (a.id === animalId ? penned : a)) });
};


/** Value kept after waiting in the pen: 1 for the first hours, then dropping to the floor. */
export const stressFactor = (gameMinutes: number, animal: Pick<Animal, 'penned'>): number => {
  if (!animal.penned) return 1;
  const hours = (gameMinutes - animal.penned.since) / 60;
  return Math.max(PEN.stress.floor, 1 - Math.max(0, hours - PEN.stress.graceHours) * PEN.stress.perHour);
};

/** What a buyer pays for an animal now (its price, less the stress of waiting). */
export const penPrice = (gameMinutes: number, animal: Animal): number =>
  Math.round(animalSalePrice(gameMinutes, animal) * stressFactor(gameMinutes, animal));

/** The truck is loaded: the buyer pays for the animals still in the pen and they leave the farm. */
export const sellPenned = (state: GameState, animalIds: readonly number[]): { state: GameState; paid: number; heads: number } => {
  const sold = state.animals.filter((a) => animalIds.includes(a.id) && a.penned);
  const paid = sold.reduce((s, a) => s + penPrice(state.gameMinutes, a), 0);
  const gone = new Set(sold.map((a) => a.id));
  return {
    state: { ...state, money: state.money + paid, animals: state.animals.filter((a) => !gone.has(a.id)) },
    paid,
    heads: sold.length,
  };
};
