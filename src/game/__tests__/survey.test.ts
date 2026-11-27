import { describe, expect, it } from 'vitest';
import { SOIL_SURVEY } from '../../data/soil';
import { AGRONOMY_WAGE, DEFAULT_PRIORITIES, STAR_LEVELS, type SkillId } from '../../data/workers';
import { cancelAllOrders } from '../construction';
import { neighbourPlots, plotIndex, tileCoords } from '../grid';
import { buyPlot } from '../economy';
import { isWalkable } from '../path';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { hourlyWageFor, refreshCandidates } from '../staff';
import { canSurvey, completeSurvey, orderSurvey, surveySpot } from '../survey';
import { createInitialState } from '../state';
import { lastTaskOn } from '../tasks';
import type { ActionResult, GameState, Task, Worker } from '../types';
import { applyArea, stepWorkers, unstaffedKinds } from '../workers';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const step = (s: GameState, minutes = 1): GameState => stepWorkers({ ...s, gameMinutes: s.gameMinutes + minutes }, minutes);

/** A plot inside the starting land, away from the yard. */
const PLOT = plotIndex(5, 10);

const crew = (s: GameState, skills: SkillId[][]): GameState => {
  const base = s.workers[0] as Worker;
  const workers = skills.map((sk, k): Worker => ({
    ...base,
    id: 600 + k,
    name: `A${k}`,
    skills: sk,
    specialty: null,
    priorities: DEFAULT_PRIORITIES.slice(),
    taskId: null,
    path: [],
    progress: 0,
    x: 22.5,
    y: 42.5,
  }));
  return { ...s, workers, gameMinutes: 8 * 60 };
};

const surveyTask = (s: GameState): Task => {
  const t = s.tasks.find((task) => task.kind === 'survey');
  if (!t) throw new Error('no survey task');
  return t;
};

/** A plot for sale right next to the starting land. */
const borderPlot = (s: GameState): number => {
  for (const p of s.unlockedPlots) {
    const free = neighbourPlots(p).find((n) => !s.unlockedPlots.includes(n));
    if (free !== undefined) return free;
  }
  throw new Error('no plot for sale');
};

describe('soil survey', () => {
  it('only agronomists take surveys', () => {
    let s = crew(createInitialState(), [['farming'], ['agronomy']]);
    s = unwrap(orderSurvey(s, PLOT));
    s = step(s, 0.1);
    expect(s.workers.find((w) => w.id === 600)?.taskId).toBeNull();
    expect(s.workers.find((w) => w.id === 601)?.taskId).toBe(surveyTask(s).id);
  });

  it('ordering a survey charges and queues', () => {
    const s0 = createInitialState();
    const s1 = unwrap(orderSurvey(s0, PLOT));
    expect(s1.money).toBe(s0.money - SOIL_SURVEY.cost);
    expect(surveyTask(s1).job).toEqual({ type: 'survey', plot: PLOT });
    const s2 = unwrap(orderSurvey(s1, PLOT));
    expect(s2.money).toBe(s0.money);
    expect(s2.tasks.some((t) => t.kind === 'survey')).toBe(false);
  });

  it('cannot survey twice or far away', () => {
    const s = createInitialState();
    expect(orderSurvey({ ...s, surveyedPlots: [PLOT] }, PLOT)).toEqual({ ok: false, error: 'already-surveyed' });
    expect(orderSurvey(s, plotIndex(0, 0))).toEqual({ ok: false, error: 'cannot-survey' });
    expect(canSurvey(s, plotIndex(0, 0))).toBe(false);
    expect(canSurvey(s, PLOT)).toBe(true);
  });

  it('surveying a plot for sale next to the farm', () => {
    let s = crew({ ...createInitialState(), money: 10_000 }, [['agronomy']]);
    const plot = borderPlot(s);
    expect(canSurvey(s, plot)).toBe(true);
    const spot = surveySpot(s, plot);
    expect(spot).not.toBeNull();
    const { x, y } = tileCoords(spot ?? 0);
    expect(isWalkable(s.tiles, x, y)).toBe(true);
    s = unwrap(orderSurvey(s, plot));
    for (let m = 0; m < 600 && !s.surveyedPlots.includes(plot); m++) s = step(s);
    expect(s.surveyedPlots).toContain(plot);
    const bought = unwrap(buyPlot(s, plot));
    expect(bought.surveyedPlots).toContain(plot);
  });

  it('survey does not wait for the tile queue', () => {
    let s = crew(createInitialState(), [['farming'], ['agronomy']]);
    s = unwrap(orderSurvey(s, PLOT));
    const tile = surveyTask(s).tile;
    s = applyArea(s, 'hoe', [tile], 'wheat', 'queue').state;
    expect(lastTaskOn(s.tasks, tile)?.kind).toBe('hoe');
    s = step(s, 0.1);
    expect(s.workers.every((w) => w.taskId !== null)).toBe(true);
  });

  it('cancel all refunds surveys', () => {
    const s0 = createInitialState();
    const s = unwrap(orderSurvey(unwrap(orderSurvey(s0, PLOT)), plotIndex(6, 10)));
    const cancelled = cancelAllOrders(s);
    expect(cancelled.money).toBe(s0.money);
    expect(cancelled.tasks).toEqual([]);
  });

  it('completeSurvey marks the plot', () => {
    const s = unwrap(completeSurvey(createInitialState(), PLOT));
    expect(s.surveyedPlots).toEqual([PLOT]);
  });

  it('a survey with no agronomist counts as unstaffed', () => {
    const s = unwrap(orderSurvey(crew(createInitialState(), [['farming']]), PLOT));
    expect(unstaffedKinds(s)).toContain('survey');
    const staffed = crew(s, [['agronomy']]);
    expect(unstaffedKinds({ ...staffed, tasks: s.tasks })).not.toContain('survey');
  });

  it('the board brings an agronomist', () => {
    for (let day = 1; day <= 10; day++) {
      const s = crew(createInitialState(), [['farming']]);
      const board = refreshCandidates({ ...s, gameMinutes: day * 1440 });
      expect(board.candidates.some((c) => c.skills.includes('agronomy'))).toBe(true);
      const agronomist = board.candidates.find((c) => c.skills.includes('agronomy'));
      expect(agronomist?.hourlyWage).toBe(hourlyWageFor(agronomist?.stars ?? 1, agronomist?.specialty ?? null, agronomist?.skills ?? []));
    }
    // With one on the staff, nothing is forced: some days have none.
    const days = Array.from({ length: 10 }, (_, k) => k + 1);
    const forced = days.filter((day) => {
      const s = crew(createInitialState(), [['agronomy']]);
      return refreshCandidates({ ...s, gameMinutes: day * 1440 }).candidates.some((c) => c.skills.includes('agronomy'));
    });
    expect(forced.length).toBeLessThan(days.length);
  });

  it('agronomists earn more', () => {
    expect(hourlyWageFor(2, null, ['agronomy'])).toBe(STAR_LEVELS[2].hourlyWage + AGRONOMY_WAGE);
  });

  it('survey tasks round-trip in the save', () => {
    const s = unwrap(orderSurvey(createInitialState(), PLOT));
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game.tasks).toEqual(s.tasks);
  });

  it('v24 workers gain the survey priority', () => {
    const raw = JSON.parse(serialize(createInitialState(), DEFAULT_SETTINGS)) as { saveVersion: number; game: { workers: { priorities: string[] }[] } };
    raw.saveVersion = 24;
    for (const w of raw.game.workers) w.priorities = w.priorities.filter((k) => k !== 'survey');
    const loaded = deserialize(JSON.stringify(raw))?.game;
    expect(loaded?.workers.every((w) => w.priorities.at(-1) === 'survey')).toBe(true);
  });
});

