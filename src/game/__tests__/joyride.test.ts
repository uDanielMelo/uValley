import { describe, expect, it } from 'vitest';
import { JOYRIDE } from '../../data/machines';
import { tileIndex } from '../grid';
import { blockedAt, canJoyride, nextSpeed, ownBayTiles, stepRide, type Ride } from '../joyride';
import { createInitialState } from '../state';
import type { Tile } from '../types';

const NONE = new Set<number>();
const open = (): Tile[] => createInitialState().tiles.map((t) => ({ state: t.state }));

const drive = (ride: Ride, throttle: number, steer: number, seconds: number, tiles = open()): Ride => {
  let r = ride;
  for (let t = 0; t < seconds; t += 0.05) r = stepRide('tractor', r, { throttle, steer }, 0.05, tiles, NONE);
  return r;
};

describe('joyride physics', () => {
  it('speeds up to the top speed, brakes against the motion and rolls to a stop', () => {
    const top = JOYRIDE.tractor.maxSpeed;
    let v = 0;
    for (let i = 0; i < 200; i++) v = nextSpeed('tractor', v, 1, 0.05);
    expect(v).toBe(top);
    expect(nextSpeed('tractor', top, -1, 0.1)).toBeLessThan(top - JOYRIDE.tractor.accel * 0.1);
    let coast = top;
    for (let i = 0; i < 200; i++) coast = nextSpeed('tractor', coast, 0, 0.05);
    expect(coast).toBe(0);
    let back = 0;
    for (let i = 0; i < 200; i++) back = nextSpeed('tractor', back, -1, 0.05);
    expect(back).toBe(-JOYRIDE.tractor.reverseSpeed);
  });

  it('drives forward along its heading and turns left with positive steer only while moving', () => {
    const start: Ride = { x: 30, y: 40, heading: 0, speed: 0 };
    const ahead = drive(start, 1, 0, 1);
    expect(ahead.y).toBeGreaterThan(40);
    expect(ahead.x).toBeCloseTo(30);
    expect(stepRide('tractor', start, { throttle: 0, steer: 1 }, 0.5, open(), NONE).heading).toBe(0);
    const left = drive(start, 1, 1, 1);
    expect(left.heading).toBeGreaterThan(0);
    expect(left.x).toBeGreaterThan(30);
  });

  it('stops at buildings, closed fences and the map edge, and passes open gates', () => {
    const tiles = open();
    const wall = tileIndex(30, 42);
    tiles[wall] = { state: 'grass', structure: 'house' };
    const stopped = drive({ x: 30.5, y: 40.5, heading: 0, speed: 0 }, 1, 0, 3, tiles);
    expect(stopped.y).toBeLessThan(42);
    expect(blockedAt(tiles, NONE, -0.1, 10)).toBe(true);
    expect(blockedAt(tiles, NONE, 10, 64.2)).toBe(true);
    tiles[tileIndex(5, 5)] = { state: 'grass', fence: {} };
    tiles[tileIndex(6, 5)] = { state: 'grass', fence: { gate: true, open: true } };
    expect(blockedAt(tiles, NONE, 5.5, 5.5)).toBe(true);
    expect(blockedAt(tiles, NONE, 6.5, 5.5)).toBe(false);
    expect(blockedAt(tiles, new Set([wall]), 30.5, 42.5)).toBe(false);
  });
});

describe('joyride start', () => {
  it('takes a parked machine, its own shed passable, but not one in use, broken or at the mechanic', async () => {
    const { addMachine } = await import('../dev');
    const s = addMachine(createInitialState(), 'tractor');
    const m = s.machines[0];
    if (!m) throw new Error('no machine');
    expect(canJoyride(s, m.id).ok).toBe(true);
    expect(ownBayTiles(s.structures, m).size).toBeGreaterThan(0);
    const busy = { ...s, machines: [{ ...m, driverId: 1 }] };
    expect(canJoyride(busy, m.id)).toEqual({ ok: false, error: 'machine-busy' });
    const broken = { ...s, machines: [{ ...m, condition: 0 }] };
    expect(canJoyride(broken, m.id)).toEqual({ ok: false, error: 'machine-broken' });
    const away = { ...s, machines: [{ ...m, repairUntil: s.gameMinutes + 60 }] };
    expect(canJoyride(away, m.id)).toEqual({ ok: false, error: 'machine-busy' });
    expect(canJoyride(s, 999)).toEqual({ ok: false, error: 'no-machine' });
  });
});
