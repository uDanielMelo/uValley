import { describe, expect, it } from 'vitest';
import { BUNKHOUSE_BEDS, CANDIDATE_COUNT, SEVERANCE_HOURS, STARTING_WORKERS, TEMP_WORKERS, WORK_END_HOUR } from '../../data/workers';
import { MINUTES_PER_DAY } from '../../data/world';
import { tileIndex } from '../grid';
import { homeSpot } from '../home';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { advanceGame, tick } from '../simulation';
import {
  ageBand,
  dismissWorker,
  harvestBonusChance,
  hireCandidate,
  hireTemp,
  hourlyPayroll,
  setPriorities,
  severanceFor,
  tempHireCost,
  workEffectiveness,
  workSpeed,
} from '../staff';
import { createInitialState } from '../state';
import { bedCount, demolishStructure, placeStructure } from '../structures';
import type { ActionResult, GameState, Tile, Worker, WorkerProfile } from '../types';
import { toggleTask, unstaffedKinds, type QueueResult } from '../workers';

const unwrap = (result: ActionResult | QueueResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const rich = (s: GameState): GameState => ({ ...s, money: 100_000 });
/** A second bunkhouse north of the house (2×1 at 28–29, 44). */
const withBunkhouse = (s: GameState): GameState => unwrap(placeStructure(rich(s), 'bunkhouse', 28, 44));
const at = (s: GameState, hour: number): GameState => ({ ...s, gameMinutes: hour * 60 });

const profile = (over: Partial<WorkerProfile>): WorkerProfile => ({
  name: 'Teste',
  age: 30,
  stars: 2,
  skills: [],
  specialty: null,
  hourlyWage: 2,
  ...over,
});

describe('worker attributes', () => {
  it('maps ages to bands: young are faster, 36–50 more effective', () => {
    expect([18, 19, 20, 35, 36, 50, 51, 60].map((a) => ageBand(a).label)).toEqual([
      'Iniciante',
      'Iniciante',
      'Jovem',
      'Jovem',
      'Experiente',
      'Experiente',
      'Veterano',
      'Veterano',
    ]);
    const task = { kind: 'hoe', cropId: null } as const;
    const young = profile({ age: 25 });
    const experienced = profile({ age: 45 });
    expect(workSpeed(young, task)).toBeGreaterThan(workSpeed(experienced, task));
    expect(workEffectiveness(experienced, task)).toBeGreaterThan(workEffectiveness(young, task));
    // 18–19 and 51+ are the least effective.
    expect(workEffectiveness(profile({ age: 18 }), task)).toBeLessThan(workEffectiveness(young, task));
    expect(workEffectiveness(profile({ age: 55 }), task)).toBeLessThan(workEffectiveness(experienced, task));
  });

  it('rewards stars, matching skills and the specialty crop', () => {
    const hoe = { kind: 'hoe', cropId: null } as const;
    expect(workSpeed(profile({ stars: 3 }), hoe)).toBeGreaterThan(workSpeed(profile({ stars: 1 }), hoe));
    const farmer = profile({ skills: ['farming'] });
    expect(workSpeed(farmer, hoe)).toBeGreaterThan(workSpeed(profile({ skills: ['construction'] }), hoe));
    const wheatExpert = profile({ skills: ['farming'], specialty: { kind: 'crop', id: 'wheat' } });
    const harvestWheat = { kind: 'hand', cropId: 'wheat' } as const;
    const harvestCorn = { kind: 'hand', cropId: 'corn' } as const;
    expect(workEffectiveness(wheatExpert, harvestWheat)).toBeGreaterThan(workEffectiveness(wheatExpert, harvestCorn));
    expect(workEffectiveness(wheatExpert, harvestCorn)).toBeCloseTo(workEffectiveness(farmer, harvestCorn));
  });

  it('turns effectiveness into a capped chance of extra produce', () => {
    expect(harvestBonusChance(0.7)).toBe(0);
    expect(harvestBonusChance(1.2)).toBeCloseTo(0.5);
    expect(harvestBonusChance(3)).toBe(0.75);
  });

  it('harvests extra produce with an effective worker', () => {
    const tiles = [12, 13, 14, 15].flatMap((x) => [tileIndex(x, 12), tileIndex(x, 13)]);
    const base = createInitialState();
    const mature: Tile = { state: 'planted', crop: { cropId: 'wheat', growthMinutes: 10_000 } };
    let s: GameState = {
      ...base,
      gameMinutes: 7 * 60,
      tiles: base.tiles.map((t, i) => (tiles.includes(i) ? mature : t)),
      // Antônio: 44 years, farming and wheat specialist.
      workers: base.workers.slice(0, 1),
    };
    for (const tile of tiles) s = unwrap(toggleTask(s, 'hand', tile, 'wheat'));
    for (let m = 0; m < 240 && s.tasks.length > 0; m++) s = tick(s, 1);
    expect(s.tasks).toEqual([]);
    expect(s.inventory.produce.wheat ?? 0).toBeGreaterThan(tiles.length);
  });
});

describe('bunkhouse and hiring', () => {
  it('starts with a full bunkhouse and a board of candidates', () => {
    const s = createInitialState();
    expect(bedCount(s)).toBe(BUNKHOUSE_BEDS);
    expect(s.workers).toHaveLength(STARTING_WORKERS.length);
    expect(s.candidates).toHaveLength(CANDIDATE_COUNT);
    const ids = [...s.workers, ...s.candidates, ...s.structures].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeLessThan(s.nextId);
    const names = [...s.workers, ...s.candidates].map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('rests the crew in front of the bunkhouse door', () => {
    const s = createInitialState();
    const spot = homeSpot(s, 0);
    // Bunkhouse at 27–28, 57, front facing south onto the street (row 58).
    expect(spot.x).toBeGreaterThan(27);
    expect(spot.x).toBeLessThan(29);
    expect(spot.y).toBeGreaterThan(58);
    expect(spot.y).toBeLessThan(59);
  });

  it('needs a free bed to hire a candidate', () => {
    const s = rich(createInitialState());
    const candidate = s.candidates[0];
    if (!candidate) throw new Error('no candidate');
    expect(hireCandidate(s, candidate.id)).toEqual({ ok: false, error: 'no-bed' });

    const roomy = withBunkhouse(s);
    const hired = unwrap(hireCandidate(roomy, candidate.id));
    expect(hired.money).toBe(roomy.money - candidate.hireCost);
    expect(hired.candidates.some((c) => c.id === candidate.id)).toBe(false);
    const worker = hired.workers.at(-1);
    expect(worker?.id).toBe(candidate.id);
    expect(worker?.kind).toBe('staff');
    expect(worker?.age).toBe(candidate.age);
    expect(hireCandidate(hired, candidate.id)).toEqual({ ok: false, error: 'no-candidate' });
  });

  it('cannot demolish a bunkhouse whose beds are in use', () => {
    const s = withBunkhouse(createInitialState());
    const first = s.structures.find((x) => x.type === 'bunkhouse');
    if (!first) throw new Error('no bunkhouse');
    expect(demolishStructure(createInitialState(), tileIndex(first.x, first.y))).toEqual({ ok: false, error: 'beds-in-use' });
    expect(demolishStructure(s, tileIndex(first.x, first.y)).ok).toBe(true);
  });

  it('renews the hiring board at midnight', () => {
    const s = { ...createInitialState(), gameMinutes: MINUTES_PER_DAY - 1 };
    const next = tick(s, 2);
    expect(next.candidates).toHaveLength(CANDIDATE_COUNT);
    expect(next.candidates.map((c) => c.id)).not.toEqual(s.candidates.map((c) => c.id));
  });
});

describe('day laborers', () => {
  it('cost the remaining shift up front and only during the day', () => {
    expect(tempHireCost(6 * 60)).toBe((WORK_END_HOUR - 6) * TEMP_WORKERS.hourlyRate);
    expect(tempHireCost(14 * 60 + 30)).toBe(6 * TEMP_WORKERS.hourlyRate);
    expect(tempHireCost(TEMP_WORKERS.latestHireHour * 60)).toBeNull();
    expect(tempHireCost(3 * 60)).toBeNull();
    expect(hireTemp(at(rich(createInitialState()), 22))).toEqual({ ok: false, error: 'not-work-time' });
  });

  it('need no bed, are capped and leave at the end of the shift', () => {
    let s = at(rich(createInitialState()), 8);
    for (let i = 0; i < TEMP_WORKERS.max; i++) s = unwrap(hireTemp(s));
    expect(hireTemp(s)).toEqual({ ok: false, error: 'max-temps' });
    expect(s.workers.filter((w) => w.kind === 'temp')).toHaveLength(TEMP_WORKERS.max);

    const evening = advanceGame({ ...s, gameMinutes: WORK_END_HOUR * 60 - 1 }, 2);
    expect(evening.tempsLeft).toBe(TEMP_WORKERS.max);
    expect(evening.state.workers.every((w) => w.kind === 'staff')).toBe(true);
  });
});

describe('wages and dismissal', () => {
  it('pays staff every hour of the shift and nothing at night', () => {
    const s = at(createInitialState(), 6);
    const payroll = hourlyPayroll(s);
    expect(payroll).toBeGreaterThan(0);
    expect(advanceGame(s, 3 * 60).state.money).toBe(s.money - 3 * payroll);
    const night = at(s, 21);
    expect(advanceGame(night, 2 * 60).state.money).toBe(night.money);
    // A whole day = one payment per shift hour.
    expect(advanceGame(at(s, 0), MINUTES_PER_DAY).state.money).toBe(s.money - 14 * payroll);
  });

  it('loses staff it cannot pay', () => {
    const s = { ...at(createInitialState(), 9), money: 0 };
    const result = advanceGame(s, 61);
    expect(result.workersLeft).toEqual(s.workers.map((w) => w.name));
    expect(result.state.workers).toEqual([]);
  });

  it('charges severance to dismiss staff, nothing for day laborers', () => {
    const s = at(rich(createInitialState()), 8);
    const worker = s.workers[0] as Worker;
    expect(severanceFor(worker)).toBe(worker.hourlyWage * SEVERANCE_HOURS);
    const after = unwrap(dismissWorker(s, worker.id));
    expect(after.money).toBe(s.money - severanceFor(worker));
    expect(after.workers.some((w) => w.id === worker.id)).toBe(false);
    expect(dismissWorker({ ...s, money: 0 }, worker.id)).toEqual({ ok: false, error: 'not-enough-money' });

    const withTemp = unwrap(hireTemp(s));
    const temp = withTemp.workers.at(-1) as Worker;
    expect(unwrap(dismissWorker(withTemp, temp.id)).money).toBe(withTemp.money);
    expect(dismissWorker(s, 9999)).toEqual({ ok: false, error: 'no-worker' });
  });
});

describe('priorities', () => {
  /** One worker standing between a tile to till (west) and a crop to water (east). */
  const setup = (priorities: Worker['priorities']): GameState => {
    const base = at(createInitialState(), 8);
    const crop: Tile = { state: 'planted', crop: { cropId: 'wheat', growthMinutes: 0 } };
    let s: GameState = {
      ...base,
      tiles: base.tiles.map((t, i) => (i === tileIndex(35, 45) ? crop : t)),
      workers: base.workers.slice(0, 1).map((w) => ({ ...w, x: 28.5, y: 45.5, priorities })),
    };
    s = unwrap(toggleTask(s, 'hoe', tileIndex(28, 45), 'wheat'));
    return unwrap(toggleTask(s, 'water', tileIndex(35, 45), 'wheat'));
  };
  const takenKind = (s: GameState) => {
    const next = tick(s, 0.1);
    return next.tasks.find((t) => t.id === next.workers[0]?.taskId)?.kind;
  };

  it('takes the first kind in the list that has work, even if it is farther', () => {
    expect(takenKind(setup(['water', 'hoe']))).toBe('water');
    expect(takenKind(setup(['hoe', 'water']))).toBe('hoe');
  });

  it('ignores kinds left out of the list and reports tasks nobody does', () => {
    const s = setup(['hoe']);
    expect(takenKind(s)).toBe('hoe');
    expect(unstaffedKinds(s)).toEqual(['water']);
  });

  it('frees the current task when its kind is removed', () => {
    const busy = tick(setup(['water', 'hoe']), 0.1);
    const worker = busy.workers[0] as Worker;
    const next = unwrap(setPriorities(busy, worker.id, ['hoe', 'hoe']));
    expect(next.workers[0]?.priorities).toEqual(['hoe']);
    expect(next.workers[0]?.taskId).toBeNull();
    expect(next.tasks.every((t) => t.workerId === null)).toBe(true);
  });
});

describe('save v6', () => {
  it('round-trips staff, day laborers and the hiring board', () => {
    const s = tick(unwrap(hireTemp(at(rich(createInitialState()), 8))), 1);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

});
