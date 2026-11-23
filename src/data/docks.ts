/** The dock: bays where vehicles park, customers who drive in, loading by the crew. Balancing only. */

/** Dock levels (reached by upgrades in a later stage): how many vehicles can park at once. */
export type DockLevel = 1;

export interface DockLevelDef {
  label: string;
  /** Car bays (one vehicle each). */
  carBays: number;
}

export const DOCK_LEVELS: Record<DockLevel, DockLevelDef> = {
  1: { label: 'Doca simples', carBays: 1 },
};

export const DOCK = {
  /** Game minutes a vehicle waits at the dock before driving off, loaded or not. */
  waitMinutes: 120,
  /**
   * Share of a lot lost when the deadline runs out during loading: the crew unloads it again and
   * this much is damaged (rounded, at least one unit).
   */
  damage: 0.15,
  /** Most workers loading one vehicle (each takes a spot along the bay). */
  crewMax: 3,
  /** Work minutes (at speed 1) to load a vehicle: a fixed part plus a part per kg. */
  loadMinutes: { base: 15, perKg: 0.25 },
} as const;

/** Customers who drive in on their own to buy one good, paying on the spot (no freight). */
export const WALK_IN = {
  /** Hours of the day when a customer may set off for the farm. */
  hours: [8, 11, 14, 17],
  /** Chance a customer comes at each of those hours (when a bay is free). */
  chance: 0.6,
  /** A customer sets off up to this many minutes after the hour. */
  jitterMinutes: 40,
  /** Units asked, scaled by how cheap the good is (cheap goods in bigger lots). */
  quantity: [3, 10] as const,
  /** Pays the shipping price × this range per unit. */
  price: [0.95, 1.2] as const,
  /** Most kg a customer's car takes. */
  capacityKg: 200,
} as const;
