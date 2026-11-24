import { describe, expect, it } from 'vitest';
import { SHED_LEVELS, STRUCTURES, type StructureId } from '../../data/structures';
import { checkUpgrade, completeAllWork, orderUpgrade } from '../construction';
import { footprintCells, footprintOf, checkDemolish, placeStructure, structureAt } from '../structures';
import { tileIndex } from '../grid';
import { boardingPoint, freeSlot, hasWorkshop, parkingDef, slotPoint } from '../parking';
import { createInitialState } from '../state';
import type { ActionResult, GameState, Machine, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const place = (s: GameState, type: StructureId, x: number, y: number, rotation: 0 | 1 | 2 | 3 = 0): GameState =>
  unwrap(placeStructure(s, type, x, y, rotation, { free: true }));

const last = (s: GameState): StructureInstance => {
  const found = s.structures[s.structures.length - 1];
  if (!found) throw new Error('no structure');
  return found;
};

const machineAt = (id: number, parkId: number, slot: number): Machine => ({
  id,
  type: 'tractor',
  parkId,
  slot,
  condition: 100,
});

const base = (): GameState => ({ ...createInitialState(), money: 10_000 });

describe('machine shed and parking lot', () => {
  it("offers the shed's three slots to owned machines", () => {
    const s = place(base(), 'machineShed', 20, 40);
    const shed = last(s);
    expect(parkingDef(shed)).toEqual({ slots: 3, owned: true });
    expect(freeSlot(s, false)).toEqual({ parkId: shed.id, slot: 0 });
    const two = { ...s, machines: [machineAt(1, shed.id, 0), machineAt(2, shed.id, 1)] };
    expect(freeSlot(two, false)).toEqual({ parkId: shed.id, slot: 2 });
    const full = { ...s, machines: [0, 1, 2].map((i) => machineAt(i + 1, shed.id, i)) };
    expect(freeSlot(full, false)).toBeNull();
  });

  it('keeps owned machines out of the parking lot', () => {
    const s = place(base(), 'parkingLot', 20, 40);
    const lot = last(s);
    expect(parkingDef(lot)).toEqual({ slots: 2, owned: false });
    expect(freeSlot(s, false)).toBeNull();
    expect(freeSlot(s, true)).toEqual({ parkId: lot.id, slot: 0 });
  });

  it('rented machines prefer the parking lot', () => {
    let s = place(base(), 'machineShed', 20, 40);
    s = place(s, 'parkingLot', 26, 40);
    const lot = last(s);
    expect(freeSlot(s, true)?.parkId).toBe(lot.id);
  });

  it('boards on the road ring in front', () => {
    const s = place(base(), 'machineShed', 20, 40);
    const shed = last(s);
    const p = boardingPoint(shed, 1);
    expect(s.tiles[tileIndex(Math.floor(p.x), Math.floor(p.y))]?.road).toBe(true);
    const cells = footprintCells(footprintOf(shed.type, shed.x, shed.y, shed.rotation)).map((c) => tileIndex(c.x, c.y));
    const xs = [0, 1, 2].map((i) => {
      const sp = slotPoint(shed, i);
      expect(cells).toContain(tileIndex(Math.floor(sp.x), Math.floor(sp.y)));
      return Math.floor(sp.x);
    });
    expect(new Set(xs).size).toBe(3);

    const turned = place(base(), 'machineShed', 20, 40, 1);
    const shed1 = last(turned);
    const cells1 = footprintCells(footprintOf(shed1.type, shed1.x, shed1.y, shed1.rotation)).map((c) => tileIndex(c.x, c.y));
    const ys = [0, 1, 2].map((i) => {
      const sp = slotPoint(shed1, i);
      expect(cells1).toContain(tileIndex(Math.floor(sp.x), Math.floor(sp.y)));
      return Math.floor(sp.y);
    });
    expect(new Set(ys).size).toBe(3);
  });

  it('blocks demolishing a shed with a machine', () => {
    const s = place(base(), 'machineShed', 20, 40);
    const shed = last(s);
    const tile = tileIndex(shed.x, shed.y);
    expect(structureAt(s, tile)?.id).toBe(shed.id);
    expect(typeof checkDemolish(s, tile)).not.toBe('string');
    const withMachine = { ...s, machines: [machineAt(1, shed.id, 0)] };
    expect(checkDemolish(withMachine, tile)).toBe('reserved');
  });

  it('upgrades the shed to a workshop', () => {
    const s = place(base(), 'machineShed', 20, 40);
    const shed = last(s);
    expect(hasWorkshop(shed)).toBe(false);
    expect(checkUpgrade(s, shed.id)).toBe(2);
    const ordered = unwrap(orderUpgrade(s, shed.id));
    expect(ordered.money).toBe(s.money - SHED_LEVELS[2].cost);
    expect(SHED_LEVELS[2].cost).toBe(450);
    expect(ordered.structures.find((x) => x.id === shed.id)?.work).toMatchObject({
      kind: 'upgrade',
      total: 600,
      toLevel: 2,
    });
    const done = completeAllWork(ordered);
    const upgraded = done.structures.find((x) => x.id === shed.id);
    expect(upgraded && hasWorkshop(upgraded)).toBe(true);
    expect(checkUpgrade(done, shed.id)).toBe('max-level');
    expect(STRUCTURES.machineShed.cost).toBe(600);
  });

  it('a cut-off shed has no free slot', () => {
    const s = place(base(), 'machineShed', 20, 40);
    expect(freeSlot(s, false)).not.toBeNull();
    const tiles = s.tiles.map((t) => {
      if (!t.road) return t;
      const { road: _road, ...rest } = t;
      return rest;
    });
    expect(freeSlot({ ...s, tiles }, false)).toBeNull();
  });
});
