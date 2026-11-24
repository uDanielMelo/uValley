/** Machine parking: the shed's owned slots, the lot's rented ones, and where machines stand and board. */
import { STRUCTURES, type ParkingDef, type ShelterLevel } from '../data/structures';
import { frontPoint, isActive } from './structures';
import type { GameState, GridPoint, Rotation, StructureInstance } from './types';

type Placed = Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>;

export const parkingDef = (s: Pick<StructureInstance, 'type'>): ParkingDef | null => STRUCTURES[s.type].parking ?? null;

/** The shed has its workshop from level 2. */
export const hasWorkshop = (s: Pick<StructureInstance, 'type' | 'level'>): boolean =>
  s.type === 'machineShed' && (s.level ?? 1) >= 2;

/** The level a shed upgrade would reach, or null at the top. */
export const nextShedLevel = (s: Pick<StructureInstance, 'level'>): ShelterLevel | null => ((s.level ?? 1) < 2 ? 2 : null);

/** Distance of a slot's center from the middle of the front wall, along the wall. */
const acrossOf = (s: Placed, slot: number): number => {
  const slots = parkingDef(s)?.slots ?? 1;
  const width = STRUCTURES[s.type].width;
  return ((slot + 0.5) * width) / slots - width / 2;
};

/** Center of a slot inside the structure, facing the front. */
export const slotPoint = (s: Placed, slot: number): { x: number; y: number; heading: Rotation } => ({
  ...frontPoint(s, -STRUCTURES[s.type].depth / 2, acrossOf(s, slot)),
  heading: s.rotation,
});

/** Where the driver boards: on the road ring in front of the slot. */
export const boardingPoint = (s: Placed, slot: number): GridPoint => frontPoint(s, 0.5, acrossOf(s, slot));

/**
 * The lowest free slot for a machine. Owned machines only use the shed; rented ones prefer the
 * parking lot, then the shed. Only structures that work (built and reached by road) count.
 */
export const freeSlot = (state: GameState, rented: boolean): { parkId: number; slot: number } | null => {
  const parks = state.structures.filter((s) => parkingDef(s) !== null && isActive(state, s));
  const eligible = parks.filter((s) => rented || parkingDef(s)?.owned);
  const ordered = rented
    ? [...eligible.filter((s) => !parkingDef(s)?.owned), ...eligible.filter((s) => parkingDef(s)?.owned)]
    : eligible;
  for (const park of ordered) {
    const slots = parkingDef(park)?.slots ?? 0;
    for (let slot = 0; slot < slots; slot++) {
      if (!state.machines.some((m) => m.parkId === park.id && m.slot === slot)) return { parkId: park.id, slot };
    }
  }
  return null;
};
