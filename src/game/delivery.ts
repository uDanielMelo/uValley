/**
 * What a purchase brings, and the seats it keeps. Animals on their way (in a vehicle or held in
 * town) keep a seat in a shelter and their room on the pasture from the moment they are ordered,
 * so the farm cannot oversell its shelters while they travel.
 */
import { ANIMALS, MAX_ANIMALS, type AnimalId } from '../data/animals';
import { CROP_IDS } from '../data/crops';
import { HELD } from '../data/docks';
import { MEDICINE_IDS } from '../data/health';
import { MINUTES_PER_DAY } from '../data/world';
import { addAnimal } from './animals';
import { addCount } from './inventory';
import { hash01 } from './random';
import { freeSlots, housesKind, pastureCapacity, pastureUsed } from './shelters';
import { isActive, isOperational } from './structures';
import type { ActionError, AnimalAge, Delivery, GameState, Inventory, PendingAnimal, Stars, StructureInstance } from './types';
import type { BreedId } from '../data/animals';

export const emptyDelivery = (): Delivery => ({ seeds: {}, medicine: {}, fertilizer: 0, feed: 0, animals: [] });

/** Every delivery not in the inventory yet: on vehicles still coming (or being unloaded) and held in town. */
export const pendingDeliveries = (state: Pick<GameState, 'shipments' | 'held'>): Delivery[] => [
  ...state.shipments.flatMap((s) => (s.kind === 'purchase' && s.phase !== 'leaving' && s.delivery ? [s.delivery] : [])),
  ...state.held.map((h) => h.delivery),
];

/** Animals on their way, with their kept seats. */
export const pendingAnimals = (state: Pick<GameState, 'shipments' | 'held'>): PendingAnimal[] =>
  pendingDeliveries(state).flatMap((d) => d.animals);

/** Feed (kg) on its way. */
export const pendingFeed = (state: Pick<GameState, 'shipments' | 'held'>): number =>
  pendingDeliveries(state).reduce((sum, d) => sum + d.feed, 0);

/** Seats kept in a shelter for animals on their way. */
export const keptSeats = (state: Pick<GameState, 'shipments' | 'held'>, shelterId: number): number =>
  pendingAnimals(state).filter((a) => a.shelterId === shelterId).length;

/** Free seats in a shelter once the animals on their way move in. */
export const openSeats = (state: Pick<GameState, 'animals' | 'shipments' | 'held'>, s: StructureInstance): number =>
  freeSlots(state, s) - keptSeats(state, s.id);

/** Pasture units the animals on their way will take. */
export const keptPasture = (state: Pick<GameState, 'shipments' | 'held'>): number =>
  pendingAnimals(state).reduce((sum, a) => sum + ANIMALS[a.kind].pastureUnits, 0);

export interface AnimalOrder {
  kind: AnimalId;
  breed: BreedId;
  age: AnimalAge;
}

/**
 * Seats for a batch of animals: each goes to the working shelter of its species with the most
 * open seats (counting the ones already kept and the ones taken by this batch). Fails when a
 * species has no shelter, no road, no room, or the pasture or the farm's animal limit would
 * overflow.
 */
export const seatAnimals = (
  state: GameState,
  orders: readonly AnimalOrder[],
  rollStars: (i: number) => Stars,
  price: (order: AnimalOrder) => number,
): PendingAnimal[] | ActionError => {
  if (state.animals.length + pendingAnimals(state).length + orders.length > MAX_ANIMALS) return 'max-animals';
  const units = orders.reduce((sum, o) => sum + ANIMALS[o.kind].pastureUnits, 0);
  if (pastureUsed(state) + keptPasture(state) + units > pastureCapacity(state)) return 'pasture-full';
  const taken = new Map<number, number>();
  const seated: PendingAnimal[] = [];
  for (const [i, order] of orders.entries()) {
    const standing = state.structures.filter((s) => housesKind(s.type, order.kind) && isOperational(s));
    if (standing.length === 0) return 'no-shelter';
    const homes = standing.filter((s) => isActive(state, s));
    if (homes.length === 0) return 'shelter-no-road';
    let best: (typeof homes)[number] | null = null;
    let bestOpen = 0;
    for (const home of homes) {
      const open = openSeats(state, home) - (taken.get(home.id) ?? 0);
      if (open > bestOpen) {
        best = home;
        bestOpen = open;
      }
    }
    if (!best) return 'shelter-full';
    taken.set(best.id, (taken.get(best.id) ?? 0) + 1);
    seated.push({ ...order, stars: rollStars(i), shelterId: best.id, price: price(order) });
  }
  return seated;
};

const addSupplies = (inventory: Inventory, d: Delivery): Inventory => {
  let seeds = inventory.seeds;
  for (const id of CROP_IDS) if (d.seeds[id]) seeds = addCount(seeds, id, d.seeds[id] ?? 0);
  let medicine = inventory.medicine;
  for (const id of MEDICINE_IDS) if (d.medicine[id]) medicine = addCount(medicine, id, d.medicine[id] ?? 0);
  return { ...inventory, seeds, medicine, fertilizer: inventory.fertilizer + d.fertilizer, feed: inventory.feed + d.feed };
};

export interface Received {
  state: GameState;
  /** Animals that could not move in (their price came back). */
  refunded: number;
  /** Animals that arrived sick after waiting in town. */
  sick: number;
}

/**
 * The crew unloaded a delivery: supplies go to the stock and the animals move into the seats kept
 * for them (or any shelter with room). One that cannot move in is paid back. Animals that waited
 * in town for HELD.sickAfterDays or more may arrive with worms.
 */
export const receiveDelivery = (state: GameState, delivery: Delivery, seed: number): Received => {
  let next: GameState = { ...state, inventory: addSupplies(state.inventory, delivery) };
  let refunded = 0;
  let sick = 0;
  const waited = delivery.heldSince === undefined ? 0 : (state.gameMinutes - delivery.heldSince) / MINUTES_PER_DAY;
  delivery.animals.forEach((a, i) => {
    const ill = waited >= HELD.sickAfterDays && hash01(seed * 31 + i * 7 + 1) < HELD.sickChance;
    const added = addAnimal(next, a.kind, {
      breed: a.breed,
      age: a.age,
      stars: a.stars,
      shelterId: a.shelterId,
      ignorePasture: true,
      ...(ill ? { health: { disease: 'worms', since: next.gameMinutes, noticed: true } } : {}),
    });
    if (added.ok) {
      next = added.state;
      if (ill) sick++;
    } else {
      next = { ...next, money: next.money + a.price };
      refunded++;
    }
  });
  return { state: next, refunded, sick };
};
