import { describe, expect, it } from 'vitest';
import { LIVESTOCK, PEN } from '../../data/docks';
import { setTimeOfDay, spawnAnimals } from '../dev';
import { tileIndex } from '../grid';
import {
  callBuyer,
  checkBuyer,
  livestockFreight,
  markForSale,
  penAnimal,
  penPrice,
  saleStatus,
  stressFactor,
  unmarkForSale,
} from '../pen';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { dismissShipment } from '../shipments';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import { checkDemolish, placeStructure } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** A rich farm at 9:00 with feed, 3 chickens in a coop and (optionally) a loading pen. */
const farm = (withPen = true): GameState => {
  let s = setTimeOfDay({ ...createInitialState(), money: 100_000 }, 9);
  s = spawnAnimals(s, 'chicken', 3);
  s = { ...s, inventory: { ...s.inventory, feed: 500 } };
  return withPen ? unwrap(placeStructure(s, 'loadingPen', 36, 44)) : s;
};

const penOf = (s: GameState): StructureInstance => {
  const pen = s.structures.find((x) => x.type === 'loadingPen');
  if (!pen) throw new Error('no pen');
  return pen;
};

const run = (state: GameState, minutes: number) => {
  let s = state;
  const events: string[] = [];
  for (let t = 0; t < minutes; t++) {
    const tick = advanceGame(s, 1);
    s = tick.state;
    events.push(...tick.dockEvents.map((e) => `${e.kind}:${e.shipment.kind}`));
  }
  return { state: s, events };
};

/** Puts animals straight in the pen (as if the crew had led them there `hoursAgo` hours ago). */
const penned = (s: GameState, n: number, hoursAgo = 0): GameState => {
  const pen = penOf(s);
  let next = s;
  for (const a of s.animals.slice(0, n)) next = unwrap(penAnimal(next, a.id, pen.id));
  return {
    ...next,
    animals: next.animals.map((a) => (a.penned ? { ...a, penned: { ...a.penned, since: s.gameMinutes - hoursAgo * 60 } } : a)),
  };
};

describe('marking animals for sale', () => {
  it('needs a working loading pen; the crew leads the animal there', () => {
    const noPen = farm(false);
    const first = noPen.animals[0];
    if (!first) throw new Error('no animal');
    expect(markForSale(noPen, first.id)).toEqual({ ok: false, error: 'no-pen' });

    const s = farm();
    const a = s.animals[0];
    if (!a) throw new Error('no animal');
    const marked = unwrap(markForSale(s, a.id));
    expect(marked.tasks.filter((t) => t.job?.type === 'herd')).toHaveLength(1);
    expect(saleStatus(marked, a)).toBe('herding');
    // Marking twice changes nothing; unmarking calls the herding off.
    expect(unwrap(markForSale(marked, a.id)).tasks).toHaveLength(1);
    expect(unwrap(unmarkForSale(marked, a.id)).tasks).toHaveLength(0);

    const { state } = run(marked, 120);
    const inPen = state.animals.find((x) => x.id === a.id);
    expect(inPen?.penned?.penId).toBe(penOf(state).id);
    expect(inPen?.path).toHaveLength(0);
    // Penned animals wait: no production.
    const later = run(state, 60).state.animals.find((x) => x.id === a.id);
    expect(later?.productMinutes).toBe(inPen?.productMinutes);
  });

  it('a pen holds PEN.capacity heads, counting the ones on their way', () => {
    let s = spawnAnimals(farm(), 'chicken', PEN.capacity);
    for (const a of s.animals.slice(0, PEN.capacity)) s = unwrap(markForSale(s, a.id));
    const extra = s.animals[PEN.capacity];
    if (!extra) throw new Error('no animal');
    expect(markForSale(s, extra.id)).toEqual({ ok: false, error: 'pen-full' });
  });

  it('a penned animal taken off sale goes back home', () => {
    const s = penned(farm(), 1);
    const a = s.animals.find((x) => x.penned);
    if (!a) throw new Error('none penned');
    const free = unwrap(unmarkForSale(s, a.id));
    expect(free.animals.find((x) => x.id === a.id)?.penned).toBeUndefined();
    // And it can no longer be demolished while animals wait in it.
    const pen = penOf(s);
    expect(checkDemolish(s, tileIndex(pen.x, pen.y))).toBe('shelter-in-use');
  });
});

describe('waiting in the pen', () => {
  it('lowers the price after the grace hours, down to a floor', () => {
    const fresh = { penned: { penId: 1, since: 0 } };
    expect(stressFactor(0, {})).toBe(1);
    expect(stressFactor(PEN.stress.graceHours * 60, fresh)).toBe(1);
    expect(stressFactor((PEN.stress.graceHours + 10) * 60, fresh)).toBeCloseTo(1 - 10 * PEN.stress.perHour, 5);
    expect(stressFactor(1000 * 60, fresh)).toBe(PEN.stress.floor);
    const s = penned(farm(), 1, PEN.stress.graceHours + 10);
    const a = s.animals.find((x) => x.penned);
    if (!a) throw new Error('none penned');
    const { penned: _p, ...calm } = a;
    expect(penPrice(s.gameMinutes, a)).toBeLessThan(penPrice(s.gameMinutes, { ...calm, penned: { penId: 1, since: s.gameMinutes } }));
  });
});

describe('the livestock buyer', () => {
  it('is called for the penned animals: the truck comes to the pen, the crew loads, the buyer pays', () => {
    expect(checkBuyer(farm(), penOf(farm()).id)).toBe('not-penned');
    const s = penned(farm(), 2);
    const animals = s.animals.filter((a) => a.penned);
    const freight = livestockFreight(animals);
    expect(freight).toBe(LIVESTOCK.base + 2 * LIVESTOCK.perHead.chicken);
    const called = unwrap(callBuyer(s, penOf(s).id));
    expect(called.money).toBe(s.money - freight);
    const truck = called.shipments[0];
    expect(truck).toMatchObject({ kind: 'livestock', dockId: penOf(s).id, vehicle: 3, phase: 'scheduled' });
    expect(truck?.animals).toEqual(animals.map((a) => a.id));
    // Once on the truck's list they cannot be taken off sale.
    expect(unmarkForSale(called, animals[0]?.id ?? -1)).toEqual({ ok: false, error: 'on-truck' });

    const value = animals.reduce((sum, a) => sum + penPrice(s.gameMinutes, a), 0);
    const { state: done, events } = run(called, 150);
    expect(events).toContain('arrived:livestock');
    expect(events).toContain('sold:livestock');
    expect(done.animals).toHaveLength(1);
    expect(done.money).toBeGreaterThan(called.money + value * 0.9 - 50); // minus wages
  });

  it('parks at the pen own truck bay, without a truck bay at the dock', () => {
    const called = unwrap(callBuyer(penned(farm(), 1), penOf(farm()).id));
    const off = advanceGame(called, 1).state;
    expect(off.shipments[0]).toMatchObject({ phase: 'enroute', bay: 0, dockId: penOf(off).id });
  });

  it('a sale called off keeps the animals in the pen (the freight is not refunded)', () => {
    const s = unwrap(callBuyer(penned(farm(), 2), penOf(farm()).id));
    const off = unwrap(dismissShipment(s, s.shipments[0]?.id ?? -1));
    expect(off.animals.filter((a) => a.penned)).toHaveLength(2);
    expect(off.money).toBe(s.money);
  });
});

describe('pen saves', () => {
  it('round-trip penned animals, herding and the livestock truck', () => {
    let s = penned(farm(), 1);
    const free = s.animals.find((a) => !a.penned);
    if (!free) throw new Error('no free animal');
    s = unwrap(markForSale(s, free.id));
    s = unwrap(callBuyer(s, penOf(s).id));
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS))?.game;
    expect(loaded?.animals).toEqual(s.animals);
    expect(loaded?.tasks.filter((t) => t.job?.type === 'herd')).toEqual(s.tasks.filter((t) => t.job?.type === 'herd'));
    expect(loaded?.shipments).toEqual(s.shipments);
  });

  it('migrate v20 as is', () => {
    const v20 = JSON.parse(serialize(farm(), DEFAULT_SETTINGS)) as { saveVersion: number };
    v20.saveVersion = 20;
    expect(deserialize(JSON.stringify(v20))?.game.structures.some((x) => x.type === 'loadingPen')).toBe(true);
  });
});
