import { describe, expect, it } from 'vitest';
import { GAME_MINUTES_PER_REAL_HOUR } from '../../data/animals';
import { DISEASES, DISEASE_RISK, MEDICINES, PREDATOR_RISK } from '../../data/health';
import { addAnimal, animalSalePrice, sellAnimal } from '../animals';
import { addMedicine, setTimeOfDay, sickenAnimal } from '../dev';
import {
  buyMedicine,
  deathAt,
  exposure,
  freeMedicine,
  healthFactor,
  medicateAnimal,
  noticeAt,
  predatorActivity,
  queueAnimalCare,
  raidChance,
  raidShelter,
  sicknessRisk,
  stepHealth,
  symptomsAt,
} from '../health';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { shelterSafety } from '../shelters';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import { applyTask } from '../tasks';
import type { ActionResult, Animal, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const HOUR = GAME_MINUTES_PER_REAL_HOUR;

/** 7:00, lots of money, a finished coop (id 4 + n) and corral. */
const farm = (): GameState => {
  let s: GameState = { ...createInitialState(), money: 100_000 };
  s = unwrap(placeStructure(s, 'chickenCoop', 12, 12));
  s = unwrap(placeStructure(s, 'corral', 17, 12));
  return setTimeOfDay(s, 7);
};

const last = (s: GameState): Animal => {
  const a = s.animals[s.animals.length - 1];
  if (!a) throw new Error('no animal');
  return a;
};

const shelterOf = (s: GameState, a: Animal): StructureInstance => {
  const shelter = s.structures.find((x) => x.id === a.shelterId);
  if (!shelter) throw new Error('no shelter');
  return shelter;
};

const withAnimal = (s: GameState, id: number, change: Partial<Animal>): GameState => ({
  ...s,
  animals: s.animals.map((a) => (a.id === id ? { ...a, ...change } : a)),
});

/** Moves the clock without running the simulation (no rolls happen). */
const at = (s: GameState, minutes: number): GameState => ({ ...s, gameMinutes: minutes });

describe('sickness risk', () => {
  it('is the base risk for a fed adult alone in a basic shelter, and less in better shelters', () => {
    const s = unwrap(addAnimal(farm(), 'chicken'));
    const a = last(s);
    expect(sicknessRisk(s, a)).toBeCloseTo(DISEASE_RISK.basePerRealHour);
    const better = { ...s, structures: s.structures.map((x) => (x.id === a.shelterId ? { ...x, level: 3 as const } : x)) };
    expect(sicknessRisk(better, a)).toBeLessThan(sicknessRisk(s, a) / 2);
  });

  it('grows with hunger, old age, shelter mates and a carcass nearby', () => {
    const s = unwrap(addAnimal(farm(), 'chicken'));
    const a = last(s);
    const base = sicknessRisk(s, a);
    expect(sicknessRisk(s, { ...a, fed: false })).toBeCloseTo(base * DISEASE_RISK.hungry);
    expect(sicknessRisk(s, { ...a, bornAt: a.bornAt - 60 * HOUR })).toBeCloseTo(base * DISEASE_RISK.stage.old);
    const crowded = unwrap(addAnimal(unwrap(addAnimal(s, 'chicken')), 'chicken'));
    expect(sicknessRisk(crowded, a)).toBeGreaterThan(base);
    const dead = { id: 99, kind: 'chicken' as const, breed: 'caipira' as const, x: 0, y: 0, diedAt: 0, shelterId: a.shelterId };
    const carcass = { ...s, carcasses: [dead] };
    expect(sicknessRisk(carcass, a)).toBeCloseTo(base * DISEASE_RISK.carcass);
  });

  it('rarely makes anyone sick: about once in a life in a basic shelter', () => {
    let s = farm();
    for (let i = 0; i < 4; i++) s = unwrap(addAnimal(s, 'cow'));
    // Twelve real hours of rolls (the clock jumps, the rolls run for every game hour).
    const result = stepHealth(at(s, s.gameMinutes + 12 * HOUR), s.gameMinutes);
    const sick = result.state.animals.filter((a) => a.health && a.health.disease !== 'wound').length;
    expect(sick).toBeLessThanOrEqual(3);
  });
});

describe('disease course', () => {
  it('is hidden while incubating and noticed when the symptoms show (earlier with a skilled crew)', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const a = last(s);
    const health = { disease: 'flu' as const, since: s.gameMinutes, noticed: false };
    const sick = withAnimal({ ...s, workers: [] }, a.id, { health });
    const incubation = DISEASES.flu.incubationRealHours * HOUR;
    expect(symptomsAt(health)).toBe(s.gameMinutes + incubation);
    expect(noticeAt(health, true)).toBe(s.gameMinutes + incubation / 2);

    const early = stepHealth(at(sick, s.gameMinutes + incubation - 1), s.gameMinutes + incubation - 1);
    expect(early.noticed).toHaveLength(0);
    expect(healthFactor(early.state.gameMinutes, last(early.state))).toBe(1);

    const shown = stepHealth(at(sick, s.gameMinutes + incubation), s.gameMinutes + incubation);
    expect(shown.noticed.map((x) => x.id)).toEqual([a.id]);
    expect(last(shown.state).health?.noticed).toBe(true);
    expect(healthFactor(shown.state.gameMinutes, last(shown.state))).toBe(0);
  });

  it('a skilled hand on the crew notices it halfway through the incubation', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const a = last(s);
    const skilled = s.workers.map((w, i) => (i === 0 ? { ...w, skills: [...new Set([...w.skills, 'animals' as const])] } : w));
    const health = { disease: 'flu' as const, since: s.gameMinutes, noticed: false };
    const sick = withAnimal({ ...s, workers: skilled }, a.id, { health });
    const half = s.gameMinutes + (DISEASES.flu.incubationRealHours * HOUR) / 2;
    expect(stepHealth(at(sick, half), half).noticed).toHaveLength(1);
  });

  it('worms halve production and never kill; untreated infection kills and leaves a carcass', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const a = last(s);
    const wormy = sickenAnimal(s, 'worms', a.id);
    expect(healthFactor(wormy.gameMinutes, last(wormy))).toBe(DISEASES.worms.production);
    const worms = last(wormy).health;
    expect(worms && deathAt(worms)).toBeNull();

    const infected = sickenAnimal(s, 'infection', a.id);
    const health = last(infected).health;
    if (!health) throw new Error('not sick');
    const dies = deathAt(health) ?? 0;
    expect(dies).toBe(infected.gameMinutes + (DISEASES.infection.fatalAfterRealHours ?? 0) * HOUR);
    const before = stepHealth(at(infected, dies - 1), dies - 1);
    expect(before.died).toHaveLength(0);
    const after = stepHealth(at(infected, dies), dies);
    expect(after.died.map((x) => x.id)).toEqual([a.id]);
    expect(after.state.animals.some((x) => x.id === a.id)).toBe(false);
    expect(after.state.carcasses).toHaveLength(1);
    expect(after.state.carcasses[0]?.kind).toBe('cow');
  });

  it('flu spreads to shelter mates', () => {
    let s = farm();
    for (let i = 0; i < 8; i++) s = unwrap(addAnimal(s, 'chicken'));
    const first = s.animals[0];
    if (!first) throw new Error('no animal');
    s = sickenAnimal(s, 'flu', first.id);
    const result = stepHealth(at(s, s.gameMinutes + 6 * HOUR), s.gameMinutes);
    const flu = result.state.animals.filter((a) => a.health?.disease === 'flu').length;
    expect(flu).toBeGreaterThan(1);
  });

  it('a sick animal sells for less', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const a = last(s);
    const sick = last(sickenAnimal(s, 'worms', a.id));
    expect(animalSalePrice(s.gameMinutes, sick)).toBe(Math.round(animalSalePrice(s.gameMinutes, a) * 0.5));
  });
});

describe('medicine', () => {
  it('is bought in the shop', () => {
    const s = farm();
    const bought = unwrap(buyMedicine(s, 'antibiotic', 2));
    expect(bought.money).toBe(s.money - 2 * MEDICINES.antibiotic.price);
    expect(bought.inventory.medicine.antibiotic).toBe(2);
    expect(buyMedicine({ ...s, money: 0 }, 'dewormer', 1)).toEqual({ ok: false, error: 'not-enough-money' });
  });

  it('noticed sick animals get a medicate task while there are doses for them, the most urgent first', () => {
    let s = unwrap(addAnimal(unwrap(addAnimal(farm(), 'cow')), 'cow'));
    const [cowA, cowB] = s.animals;
    if (!cowA || !cowB) throw new Error('no cows');
    s = sickenAnimal(sickenAnimal(s, 'flu', cowA.id), 'infection', cowB.id);
    expect(queueAnimalCare(s).tasks.filter((t) => t.job?.type === 'medicate')).toHaveLength(0);

    s = { ...s, inventory: { ...s.inventory, medicine: { antibiotic: 1 } } };
    const queued = queueAnimalCare(s);
    const medicate = queued.tasks.filter((t) => t.job?.type === 'medicate');
    expect(medicate).toHaveLength(1);
    expect(medicate[0]?.kind).toBe('tend');
    // Infection kills sooner than flu.
    expect(medicate[0]?.job).toEqual({ type: 'medicate', animalId: cowB.id });
    expect(freeMedicine(queued, 'antibiotic')).toBe(0);
    // Queuing again adds nothing.
    expect(queueAnimalCare(queued).tasks).toHaveLength(queued.tasks.length);
  });

  it('medicating uses one dose and cures; a sold animal drops its task', () => {
    let s = unwrap(addAnimal(farm(), 'cow'));
    const a = last(s);
    s = queueAnimalCare(addMedicine(sickenAnimal(s, 'flu', a.id), 1));
    const task = s.tasks.find((t) => t.job?.type === 'medicate');
    if (!task) throw new Error('no task');
    const cured = unwrap(applyTask(s, task));
    expect(last(cured).health).toBeUndefined();
    expect(cured.inventory.medicine.antibiotic).toBeUndefined();
    expect(cured.inventory.medicine.dewormer).toBe(1);
    const empty = { ...s, inventory: { ...s.inventory, medicine: {} } };
    expect(medicateAnimal(empty, a.id)).toEqual({ ok: false, error: 'no-medicine' });

    const sold = queueAnimalCare(unwrap(sellAnimal(s, a.id)));
    expect(sold.tasks.some((t) => t.job?.type === 'medicate')).toBe(false);
  });
});

describe('predators', () => {
  it('hunt at night only', () => {
    expect(predatorActivity(12)).toBe(0);
    expect(predatorActivity(23)).toBe(1);
    expect(predatorActivity(20)).toBeGreaterThan(0);
  });

  it('animals asleep inside are safer, more so in a safer shelter; babies are likelier targets', () => {
    const s = setTimeOfDay(unwrap(addAnimal(unwrap(addAnimal(farm(), 'chicken')), 'chicken', { age: 'baby' })), 23);
    const [adult, baby] = s.animals;
    if (!adult || !baby) throw new Error('no chickens');
    const coop = shelterOf(s, adult);
    expect(exposure(s, adult, coop)).toBeCloseTo(1 - shelterSafety(coop));
    expect(exposure(s, baby, coop)).toBeCloseTo((1 - shelterSafety(coop)) * PREDATOR_RISK.baby);
    const outside = { ...adult, x: adult.x + 3 };
    expect(exposure(s, outside, coop)).toBe(PREDATOR_RISK.outside);
    const meshed = { ...coop, level: 2 as const };
    expect(exposure(s, adult, meshed)).toBeLessThan(exposure(s, adult, coop));
  });

  it('more animals draw more raids', () => {
    let s = setTimeOfDay(unwrap(addAnimal(farm(), 'chicken')), 23);
    const coop = shelterOf(s, last(s));
    const one = raidChance(s, coop);
    s = unwrap(addAnimal(unwrap(addAnimal(s, 'chicken')), 'chicken'));
    expect(raidChance(s, coop)).toBeCloseTo(one * 3);
  });

  it('eat small animals (the carcass stays) and wound large ones; a wounded one attacked again dies', () => {
    const s = setTimeOfDay(unwrap(addAnimal(farm(), 'chicken')), 23);
    const hen = last(s);
    const eaten = raidShelter(s, shelterOf(s, hen), 0.5);
    expect(eaten.attack).toMatchObject({ predator: 'fox', outcome: 'eaten' });
    expect(eaten.state.animals).toHaveLength(0);
    expect(eaten.state.carcasses).toHaveLength(1);
    expect(eaten.state.carcasses[0]?.shelterId).toBe(hen.shelterId);

    const c = setTimeOfDay(unwrap(addAnimal(farm(), 'cow')), 23);
    const cow = last(c);
    const wounded = raidShelter(c, shelterOf(c, cow), 0.5);
    expect(wounded.attack).toMatchObject({ predator: 'puma', outcome: 'wounded' });
    expect(last(wounded.state).health).toMatchObject({ disease: 'wound', noticed: true });
    expect(wounded.state.carcasses).toHaveLength(0);
    const again = raidShelter(wounded.state, shelterOf(c, cow), 0.5);
    expect(again.attack?.outcome).toBe('eaten');
    expect(again.state.animals).toHaveLength(0);

    const calf = setTimeOfDay(unwrap(addAnimal(farm(), 'cow', { age: 'baby' })), 23);
    expect(raidShelter(calf, shelterOf(calf, last(calf)), 0.5).attack?.outcome).toBe('eaten');
  });

  it('carcasses get a task to take them away', () => {
    const s = setTimeOfDay(unwrap(addAnimal(farm(), 'chicken')), 23);
    const raided = queueAnimalCare(raidShelter(s, shelterOf(s, last(s)), 0.5).state);
    const task = raided.tasks.find((t) => t.job?.type === 'carcass');
    if (!task) throw new Error('no task');
    expect(task.kind).toBe('tend');
    expect(unwrap(applyTask(raided, task)).carcasses).toHaveLength(0);
  });
});

describe('save', () => {
  it('keeps health, medicine and carcasses', () => {
    let s = setTimeOfDay(unwrap(addAnimal(unwrap(addAnimal(farm(), 'chicken')), 'cow')), 23);
    s = addMedicine(sickenAnimal(s, 'worms'), 2);
    const hen = s.animals[0];
    if (!hen) throw new Error('no hen');
    s = queueAnimalCare(raidShelter(s, shelterOf(s, hen), 0.1).state);
    expect(s.carcasses.length + s.animals.filter((a) => a.health).length).toBeGreaterThan(0);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

  it('migrates v10 saves: everyone healthy, no medicine, no carcasses', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const { carcasses: _c, ...v10 } = s;
    const { medicine: _m, ...inventory } = s.inventory;
    const raw = JSON.stringify({ saveVersion: 10, savedAt: 0, game: { ...v10, inventory }, settings: DEFAULT_SETTINGS });
    const loaded = deserialize(raw)?.game;
    expect(loaded?.carcasses).toEqual([]);
    expect(loaded?.inventory.medicine).toEqual({});
    expect(loaded?.animals[0]?.health).toBeUndefined();
  });
});
