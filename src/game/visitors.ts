import { ACCESS_ROAD_X, CAR } from '../data/roads';
import { START_STRUCTURES } from '../data/structures';
import { GRID_SIZE, MINUTES_PER_DAY } from '../data/world';
import { inBounds, tileCoords, tileIndex } from './grid';
import { accessRoadExit } from './roads';
import { frontPoint } from './structures';
import type { GridPoint, Tile } from './types';

/**
 * The visiting car. It is purely derived from the clock and the road network (never saved):
 * at each visit hour it drives in from far beyond the map edge along the roads, taking the bends
 * in arcs, parks at the road tile closest to the front of the shipping bin, waits, and drives back
 * out until it disappears.
 */

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Where the car tries to park: on the road in front of the shipping bin. */
const parkingGoal = (): GridPoint => {
  const bin = START_STRUCTURES.find((s) => s.id === 'shippingBin');
  if (!bin) return { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };
  return frontPoint({ type: bin.id, x: bin.x, y: bin.y, rotation: 0 }, 0.5);
};

/** Radius (tiles) of the turns on farm roads: the bend drawn on a corner road tile. */
const FARM_TURN_RADIUS = 0.5;
/** Arcs are drawn with a point every this many radians. */
const ARC_STEP = Math.PI / 12;

/**
 * Replaces each corner of a polyline with a circular arc tangent to both legs. `radius(i)` is the
 * wanted radius at point i; it shrinks so that an arc never takes more than half of a leg.
 */
export const roundCorners = (points: readonly GridPoint[], radius: (i: number) => number): GridPoint[] => {
  const result: GridPoint[] = [];
  points.forEach((p, i) => {
    const a = points[i - 1];
    const b = points[i + 1];
    if (!a || !b) {
      result.push(p);
      return;
    }
    const inLength = Math.hypot(p.x - a.x, p.y - a.y);
    const outLength = Math.hypot(b.x - p.x, b.y - p.y);
    if (inLength === 0 || outLength === 0) {
      result.push(p);
      return;
    }
    const d1 = { x: (p.x - a.x) / inLength, y: (p.y - a.y) / inLength };
    const d2 = { x: (b.x - p.x) / outLength, y: (b.y - p.y) / outLength };
    const turn = Math.acos(Math.min(1, Math.max(-1, d1.x * d2.x + d1.y * d2.y)));
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (turn < 1e-6 || Math.abs(Math.PI - turn) < 1e-6) {
      result.push(p);
      return;
    }
    const half = Math.tan(turn / 2);
    const tangent = Math.min(radius(i) * half, inLength / 2, outLength / 2);
    const r = tangent / half;
    const side = cross > 0 ? 1 : -1;
    const start = { x: p.x - d1.x * tangent, y: p.y - d1.y * tangent };
    const center = { x: start.x - d1.y * r * side, y: start.y + d1.x * r * side };
    const from = Math.atan2(start.y - center.y, start.x - center.x);
    const steps = Math.max(2, Math.ceil(turn / ARC_STEP));
    for (let k = 0; k <= steps; k++) {
      const angle = from + (side * turn * k) / steps;
      result.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
    }
  });
  return result;
};

/** Rounds a drive's corners: a wide turn where it meets the highway, the road bends on the farm. */
const smoothDrive = (points: readonly GridPoint[], junction: GridPoint): GridPoint[] =>
  roundCorners(points, (i) => (points[i] === junction ? CAR.junctionRadius : FARM_TURN_RADIUS));

const isRoad = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && !!tiles[tileIndex(x, y)]?.road;

/** Drops points that lie on a straight line between their neighbours. */
const simplify = (points: GridPoint[]): GridPoint[] =>
  points.filter((p, i) => {
    const a = points[i - 1];
    const b = points[i + 1];
    if (!a || !b) return true;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });

/** The car's two drives: in from the highway's east end, and back out to its west end. */
export interface CarRoutes {
  arrive: GridPoint[];
  leave: GridPoint[];
}

/**
 * The car's routes in tile space. It comes along the highway, turns into the access road at the
 * junction and follows road tiles (4-connected) from the map entry to the parking spot: the
 * reachable road tile closest to the shipping bin (ties: the shorter drive). It leaves the same
 * way back and turns the other way on the highway, so both drives have the same length.
 */
export const carRoutes = (tiles: readonly Tile[]): CarRoutes => {
  const exit = accessRoadExit();
  const entry = tileIndex(ACCESS_ROAD_X, exit.edgeRow);
  const { border: edge, turn: junction, highwayEast, highwayWest } = exit;
  if (!tiles[entry]?.road) {
    return {
      arrive: smoothDrive([highwayEast, junction, edge], junction),
      leave: smoothDrive([edge, junction, highwayWest], junction),
    };
  }

  const goal = parkingGoal();
  const parent = new Map<number, number>([[entry, -1]]);
  const queue = [entry];
  let best = entry;
  let bestDistance = Infinity;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === undefined) break;
    const { x, y } = tileCoords(current);
    const distance = Math.hypot(x + 0.5 - goal.x, y + 0.5 - goal.y);
    // BFS order means the first tile at a given distance is also the shortest drive.
    if (distance < bestDistance - 1e-9) {
      best = current;
      bestDistance = distance;
    }
    for (const [dx, dy] of DIRECTIONS) {
      if (!isRoad(tiles, x + dx, y + dy)) continue;
      const next = tileIndex(x + dx, y + dy);
      if (parent.has(next)) continue;
      parent.set(next, current);
      queue.push(next);
    }
  }

  const path: GridPoint[] = [];
  for (let node = best; node !== -1; node = parent.get(node) ?? -1) {
    const { x, y } = tileCoords(node);
    path.push({ x: x + 0.5, y: y + 0.5 });
  }
  path.reverse();
  return {
    arrive: smoothDrive(simplify([highwayEast, junction, edge, ...path]), junction),
    leave: smoothDrive(simplify([...path.slice().reverse(), edge, junction, highwayWest]), junction),
  };
};

export const routeLength = (route: readonly GridPoint[]): number => {
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
};

/** Point and heading at distance `s` along the route. Heading = atan2(dx, dy) of travel. */
const pointAt = (route: readonly GridPoint[], s: number): { x: number; y: number; heading: number } => {
  let left = Math.max(0, s);
  let heading = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    if (!a || !b) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d === 0) continue;
    heading = Math.atan2(b.x - a.x, b.y - a.y);
    if (left <= d) return { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d, heading };
    left -= d;
  }
  const last = route[route.length - 1] ?? { x: 0, y: 0 };
  return { x: last.x, y: last.y, heading };
};

/** Game minutes to drive the whole route (cruise, then brake to a stop). */
export const driveMinutes = (length: number): number => {
  const brake = Math.min(CAR.brakeDistance, length / 2);
  return (length + brake) / CAR.speed;
};

/** Distance covered `t` minutes after setting off: constant speed, then a linear brake to 0. */
const arrivalDistance = (length: number, t: number): number => {
  const v = CAR.speed;
  const brake = Math.min(CAR.brakeDistance, length / 2);
  const cruiseEnd = (length - brake) / v;
  if (t <= cruiseEnd) return Math.max(0, v * t);
  const tau = Math.min(t - cruiseEnd, (2 * brake) / v);
  return length - brake + v * tau - (v * v * tau * tau) / (4 * brake || 1);
};

export type CarPhase = 'arriving' | 'parked' | 'leaving' | 'away';

export interface CarState {
  phase: CarPhase;
  /** Position in tile space. */
  x: number;
  y: number;
  /** Direction the car's nose points: atan2(dx, dy) in tile space. */
  heading: number;
  /** Which visit of the day this is (for the car's look). */
  visit: number;
}

/** Where the car is at a given game time. */
export const carState = (gameMinutes: number, routes: CarRoutes): CarState => {
  const route = routes.arrive;
  const length = routeLength(route);
  const drive = driveMinutes(length);
  const minute = ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const start = route[0] ?? { x: 0, y: 0 };
  for (let visit = 0; visit < CAR.visitHours.length; visit++) {
    const t = minute - (CAR.visitHours[visit] ?? 0) * 60;
    if (t < 0) continue;
    if (t < drive) return { phase: 'arriving', visit, ...pointAt(route, arrivalDistance(length, t)) };
    if (t < drive + CAR.waitMinutes) return { phase: 'parked', visit, ...pointAt(route, length) };
    const back = t - drive - CAR.waitMinutes;
    if (back < drive) {
      // Leaving mirrors arriving in time: speed up from the parking spot, then cruise away.
      const leaveLength = routeLength(routes.leave);
      const p = pointAt(routes.leave, leaveLength - arrivalDistance(leaveLength, drive - back));
      return { phase: 'leaving', visit, x: p.x, y: p.y, heading: p.heading };
    }
  }
  return { phase: 'away', visit: 0, x: start.x, y: start.y, heading: -Math.PI / 2 };
};
