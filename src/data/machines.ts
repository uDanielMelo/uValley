/** Farm machinery: the tractor and the harvester, their prices, rental, upkeep and repairs. */

export const MACHINE_IDS = ['tractor', 'harvester'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];

export interface MachineDef {
  id: MachineId;
  label: string;
  icon: string;
  /** The task kind the machine does (hoe: plow, hand: harvest). */
  task: 'hoe' | 'hand';
  /** Purchase price. */
  price: number;
  /** Rental price per day, before the multi-day discount. */
  rentPerDay: number;
  /** Multiplies the pace of the task. */
  workSpeed: number;
  /** Multiplies the walking speed while riding. */
  driveSpeed: number;
  /** Fuel in coins per full game hour away from its bay (owned machines only). */
  costPerHour: number;
  /** Condition points lost per game hour away from its bay (owned machines only). */
  wearPerHour: number;
  /** Model size in meters. */
  size: { length: number; width: number; height: number };
}

export const MACHINES: Record<MachineId, MachineDef> = {
  tractor: {
    id: 'tractor',
    label: 'Trator com arado',
    icon: '🚜',
    task: 'hoe',
    price: 1800,
    rentPerDay: 90,
    workSpeed: 5,
    driveSpeed: 2,
    costPerHour: 2,
    wearPerHour: 1.5,
    size: { length: 4.2, width: 2.2, height: 2.8 },
  },
  harvester: {
    id: 'harvester',
    label: 'Colheitadeira',
    icon: '🌾',
    task: 'hand',
    price: 3200,
    rentPerDay: 160,
    workSpeed: 5,
    driveSpeed: 2,
    costPerHour: 4,
    wearPerHour: 1.5,
    size: { length: 7.5, width: 3.5, height: 3.8 },
  },
};

/** Rental: possible lengths, the discount per length and the optional operator. */
export const RENTAL = {
  days: [1, 3, 7],
  discount: { 1: 1, 3: 0.9, 7: 0.8 },
  operatorPerDay: 40,
} as const;
export type RentalDays = 1 | 3 | 7;

/** Repairs: the farm workshop fixes machines overnight; the town mechanic is dearer and returns them at the given hour. */
export const REPAIR = { workshopPerNight: 40, costPerPoint: 3, mechanicMultiplier: 2, mechanicReadyHour: 6 } as const;

/** Condition: below `slowBelow` the machine drives and works at `slowFactor`; at 0 it is broken. */
export const CONDITION = { max: 100, slowBelow: 30, slowFactor: 0.7 } as const;

/** Resale price = price × (base + perCondition × condition / max). */
export const RESALE = { base: 0.3, perCondition: 0.4 } as const;

/**
 * Driving a machine yourself with WASD, just for fun (no effect on the farm). Speeds in m/s,
 * acceleration in m/s², steering in degrees per second at full lock and speed.
 */
export const JOYRIDE: Record<MachineId, { maxSpeed: number; reverseSpeed: number; accel: number; steerDeg: number }> = {
  tractor: { maxSpeed: 9, reverseSpeed: 3, accel: 3.5, steerDeg: 75 },
  harvester: { maxSpeed: 6, reverseSpeed: 2, accel: 2, steerDeg: 50 },
};
/** Braking (m/s²) when pressing against the motion, and rolling drag (m/s²) with no pedal. */
export const JOYRIDE_BRAKE = 9;
export const JOYRIDE_DRAG = 2.5;
/** Below this share of the top speed the steering weakens (a stopped machine does not turn). */
export const JOYRIDE_STEER_RAMP = 0.3;
