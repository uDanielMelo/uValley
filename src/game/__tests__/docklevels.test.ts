import { describe, expect, it } from 'vitest';
import { DOCK, DOCK_LEVELS } from '../../data/docks';
import { ROAD_COST } from '../../data/roads';
import { till } from '../actions';
import { cancelWork, checkUpgrade, orderUpgrade, upgradeTotal } from '../construction';
import { bayRoadTiles, bayUsable, dockBays, dockLevel, docksOf } from '../dock';
import { finishAllTasks, setTimeOfDay } from '../dev';
import { tileIndex } from '../grid';
import { postListing } from '../listings';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { freeBay, maxFreightKg, pickVehicle, scheduleSale, spawnWalkIn, stepShipments } from '../shipments';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const dockOf = (s: GameState): StructureInstance => {
  const dock = docksOf(s)[0];
  if (!dock) throw new Error('no dock');
  return dock;
};

/** A rich farm at 9:00 with the dock upgraded (instantly) to a level. */
const farmAt = (level: 1 | 2 | 3): GameState => {
  let s = setTimeOfDay({ ...createInitialState(), money: 100_000 }, 9);
  for (let l = 2; l <= level; l++) s = finishAllTasks(unwrap(orderUpgrade(s, dockOf(s).id)));
  return s;
};

const withWheat = (s: GameState, n: number): GameState => ({ ...s, inventory: { ...s.inventory, produce: { wheat: n } } });

describe('dock levels', () => {
  it('start with one car bay; each upgrade adds bays and opens the street they need', () => {
    const s = farmAt(1);
    const dock = dockOf(s);
    expect(dockBays(dock)).toHaveLength(1);
    const toLevel = checkUpgrade(s, dock.id);
    expect(toLevel).toBe(2);
    const ordered = unwrap(orderUpgrade(s, dock.id));
    // The second car bay needs the street tile two to the right of the dock.
    const newRoads = ordered.tasks.filter((t) => t.job?.type === 'road');
    expect(newRoads.map((t) => t.tile)).toEqual([tileIndex(35, 58)]);
    expect(ordered.money).toBe(s.money - DOCK_LEVELS[2].cost - ROAD_COST);
    expect(upgradeTotal(s, dock, 2)).toBe(DOCK_LEVELS[2].cost + ROAD_COST);
    expect(dockOf(ordered).work).toMatchObject({ kind: 'upgrade', toLevel: 2, total: DOCK_LEVELS[2].buildMinutes });

    const done = finishAllTasks(ordered);
    const upgraded = dockOf(done);
    expect(dockLevel(upgraded)).toBe(2);
    expect(dockBays(upgraded).every((b) => bayUsable(done.tiles, upgraded, b))).toBe(true);

    const top = farmAt(3);
    const truck = dockBays(dockOf(top)).find((b) => b.size === 'truck');
    expect(truck && bayRoadTiles(dockOf(top), truck)).toEqual([36, 37, 38].map((x) => tileIndex(x, 58)));
    expect(checkUpgrade(top, dockOf(top).id)).toBe('max-level');
  });

  it('cannot add a bay where the street is blocked', () => {
    const s = farmAt(2);
    const blocked = unwrap(till(s, tileIndex(37, 58)));
    expect(checkUpgrade(blocked, dockOf(blocked).id)).toBe('no-room-for-road');
  });

  it('an upgrade called off gives back the price and the road still queued', () => {
    const s = farmAt(1);
    const ordered = unwrap(orderUpgrade(s, dockOf(s).id));
    const off = unwrap(cancelWork(ordered, dockOf(ordered).id));
    expect(off.money).toBe(s.money);
    expect(off.tasks).toHaveLength(0);
  });

  it('each vehicle takes its own bay', () => {
    let s = farmAt(2);
    s = spawnWalkIn(s, { at: s.gameMinutes, day: 3, slot: 1 });
    s = spawnWalkIn(s, { at: s.gameMinutes, day: 3, slot: 2 });
    expect(s.shipments.map((x) => x.bay)).toEqual([0, 1]);
    expect(spawnWalkIn(s, { at: s.gameMinutes, day: 3, slot: 3 }).shipments).toHaveLength(2);
  });
});

describe('freight vehicles', () => {
  it('come in the smallest contracted vehicle that fits, and the truck needs a truck bay', () => {
    const contracted = { ...farmAt(1), vehicleLevel: 3 as const };
    expect(pickVehicle(contracted, 100)).toBe(1);
    expect(pickVehicle(contracted, 400)).toBe(2);
    expect(pickVehicle(contracted, 1000)).toBe('no-truck-bay');
    expect(maxFreightKg(contracted)).toBe(600);
    const withTruckBay = { ...farmAt(3), vehicleLevel: 3 as const };
    expect(pickVehicle(withTruckBay, 1000)).toBe(3);
    expect(pickVehicle(withTruckBay, 5000)).toBe('vehicle-full');
    // A fixed choice is used for every load (and must fit it).
    expect(pickVehicle({ ...withTruckBay, freightVehicle: 2 }, 100)).toBe(2);
    expect(pickVehicle({ ...withTruckBay, freightVehicle: 1 }, 400)).toBe('vehicle-full');
    // Without the contract, only the pickup.
    expect(pickVehicle(farmAt(3), 400)).toBe('vehicle-full');
  });

  it('a truck parks at the truck bay and is loaded there', () => {
    const s = withWheat({ ...farmAt(3), vehicleLevel: 3 }, 100);
    const sold = unwrap(scheduleSale(s, [{ good: { kind: 'crop', id: 'wheat' }, quantity: 100 }], 3000));
    const sale = sold.shipments[0];
    expect(sale?.vehicle).toBe(3);
    const off = stepShipments({ ...sold, gameMinutes: sold.gameMinutes + 1 }, sold.gameMinutes);
    expect(off.shipments[0]).toMatchObject({ phase: 'enroute', bay: 2 });
    expect(freeBay(off, dockOf(off).id, 'truck')).toBeNull();
    expect(freeBay(off, dockOf(off).id, 'car')).toBe(0);
  });

  it('two vehicles are loaded side by side, each by its own crew', () => {
    let s = withWheat(farmAt(2), 40);
    const lot = [{ good: { kind: 'crop' as const, id: 'wheat' as const }, quantity: 10 }];
    s = unwrap(scheduleSale(s, lot, 400));
    s = unwrap(scheduleSale(s, lot, 400));
    let sold = 0;
    let loaders = 0;
    for (let t = 0; t < 150; t++) {
      const tick = advanceGame(s, 1);
      s = tick.state;
      loaders = Math.max(loaders, s.tasks.filter((x) => x.kind === 'haul').length);
      sold += tick.dockEvents.filter((e) => e.kind === 'sold').length;
    }
    expect(loaders).toBe(2 * DOCK.crewMax);
    expect(sold).toBe(2);
  });

  it('listings are offered up to what the biggest usable vehicle takes', () => {
    const s = unwrap(postListing({ ...farmAt(1), vehicleLevel: 3 }, { kind: 'crop', id: 'wheat' }, 1, 500));
    expect(maxFreightKg(s)).toBe(600);
  });
});

describe('dock level saves', () => {
  it('migrate v19: vehicles under way hold the first bay and the freight picks by weight', () => {
    const s = withWheat(farmAt(1), 40);
    const walkIn = spawnWalkIn(s, { at: s.gameMinutes, day: 3, slot: 1 });
    const v19 = JSON.parse(serialize(walkIn, DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
    v19.saveVersion = 19;
    delete v19.game.freightVehicle;
    const shipments = v19.game.shipments as Array<Record<string, unknown>>;
    for (const x of shipments) delete x.bay;
    const loaded = deserialize(JSON.stringify(v19))?.game;
    expect(loaded?.freightVehicle).toBe('auto');
    expect(loaded?.shipments[0]?.bay).toBe(0);
  });

  it('round-trip the dock level, bays and the freight choice', () => {
    const s = { ...farmAt(2), freightVehicle: 1 as const };
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS))?.game;
    expect(loaded && dockLevel(dockOf(loaded))).toBe(2);
    expect(loaded?.freightVehicle).toBe(1);
  });
});
