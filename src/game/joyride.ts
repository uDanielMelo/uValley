/**
 * Driving a machine yourself (WASD), just for fun: arcade physics on the grid, never saved and
 * with no effect on the farm. Positions are in tiles (like worker positions), the heading in
 * radians with forward = (sin h, cos h), so a larger heading turns left.
 */
import { JOYRIDE, JOYRIDE_BRAKE, JOYRIDE_DRAG, JOYRIDE_STEER_RAMP, MACHINES, type MachineId } from '../data/machines';
import { TILE_METERS } from '../data/scale';
import { inBounds, tileIndex } from './grid';
import { footprintCells, footprintOf } from './structures';
import type { ActionResult, GameState, Machine, StructureInstance, Tile } from './types';

export interface Ride {
  x: number;
  y: number;
  heading: number;
  /** m/s, negative in reverse. */
  speed: number;
}

/** Pedals: throttle 1 forward, −1 back; steer 1 left, −1 right. */
export interface RideInput {
  throttle: number;
  steer: number;
}

/** Whether the player can take this machine for a drive: parked, nobody driving it, not broken or at the mechanic. */
export const canJoyride = (state: GameState, machineId: number): ActionResult => {
  const m = state.machines.find((x) => x.id === machineId);
  if (!m) return { ok: false, error: 'no-machine' };
  if (m.driverId !== undefined) return { ok: false, error: 'machine-busy' };
  if (m.condition <= 0) return { ok: false, error: 'machine-broken' };
  if (m.repairUntil !== undefined && m.repairUntil > state.gameMinutes) return { ok: false, error: 'machine-busy' };
  return { ok: true, state };
};

/** Tiles of the machine's own shed or lot, which it may drive out of. */
export const ownBayTiles = (structures: readonly StructureInstance[], machine: Machine): Set<number> => {
  const park = structures.find((s) => s.id === machine.parkId);
  if (!park) return new Set();
  return new Set(footprintCells(footprintOf(park.type, park.x, park.y, park.rotation)).map((c) => tileIndex(c.x, c.y)));
};

/** A point the machine cannot be on: off the map, a building, a greenhouse or a fence (an open gate lets it through). */
export const blockedAt = (tiles: readonly Tile[], own: ReadonlySet<number>, x: number, y: number): boolean => {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return true;
  const i = tileIndex(tx, ty);
  if (own.has(i)) return false;
  const t = tiles[i];
  if (!t) return true;
  if (t.structure !== undefined || t.cover) return true;
  return t.fence !== undefined && !(t.fence.gate && t.fence.open);
};

/** Points along the machine's length (front, middle and back) that must all be clear. */
const bodyPoints = (type: MachineId, x: number, y: number, heading: number): Array<[number, number]> => {
  const half = MACHINES[type].size.length / 2 / TILE_METERS;
  const fx = Math.sin(heading) * half;
  const fy = Math.cos(heading) * half;
  return [
    [x + fx, y + fy],
    [x, y],
    [x - fx, y - fy],
  ];
};

const clear = (type: MachineId, tiles: readonly Tile[], own: ReadonlySet<number>, x: number, y: number, heading: number) =>
  bodyPoints(type, x, y, heading).every(([px, py]) => !blockedAt(tiles, own, px, py));

/** New speed after `dt` seconds of the given throttle. */
export const nextSpeed = (type: MachineId, speed: number, throttle: number, dt: number): number => {
  const def = JOYRIDE[type];
  if (throttle === 0) {
    const drag = JOYRIDE_DRAG * dt;
    return Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
  }
  // Pressing against the motion brakes first; then it accelerates the other way.
  const accel = speed !== 0 && Math.sign(speed) !== Math.sign(throttle) ? JOYRIDE_BRAKE : def.accel;
  const next = speed + throttle * accel * dt;
  return Math.min(def.maxSpeed, Math.max(-def.reverseSpeed, next));
};

/**
 * One step of the ride: speed from the throttle, turning in proportion to the speed (reverse
 * steers the other way, like a car), then the move. A blocked move slides along the free axis
 * or stops the machine.
 */
export const stepRide = (
  type: MachineId,
  ride: Ride,
  input: RideInput,
  dt: number,
  tiles: readonly Tile[],
  own: ReadonlySet<number>,
): Ride => {
  const def = JOYRIDE[type];
  const speed = nextSpeed(type, ride.speed, input.throttle, dt);
  const grip = Math.max(-1, Math.min(1, speed / (def.maxSpeed * JOYRIDE_STEER_RAMP)));
  const turned = ride.heading + input.steer * ((def.steerDeg * Math.PI) / 180) * grip * dt;
  const heading = clear(type, tiles, own, ride.x, ride.y, turned) ? turned : ride.heading;
  const step = (speed / TILE_METERS) * dt;
  const x = ride.x + Math.sin(heading) * step;
  const y = ride.y + Math.cos(heading) * step;
  if (clear(type, tiles, own, x, y, heading)) return { x, y, heading, speed };
  if (clear(type, tiles, own, x, ride.y, heading)) return { x, y: ride.y, heading, speed: speed * 0.7 };
  if (clear(type, tiles, own, ride.x, y, heading)) return { x: ride.x, y, heading, speed: speed * 0.7 };
  return { ...ride, heading, speed: 0 };
};
