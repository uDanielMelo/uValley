import { WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { GROWTH_STEP_MINUTES } from '../data/world';
import { applyDayWeather, type WeatherReport } from './climate';
import { growTiles } from './growth';
import { payFeed, removeDeadAnimals, stepAnimals } from './animals';
import { queueAnimalCare, stepHealth, type PredatorAttack } from './health';
import { expireOffers, generateOffers } from './listings';
import { autoOrderFeed, chargeHeld } from './purchases';
import { refreshOrders } from './market';
import { stepResearch } from './research';
import type { CropId } from '../data/crops';
import { queueShelterChores } from './shelters';
import { dockEvents, stepShipments, type DockEvent } from './shipments';
import { spoilGoods, type Spoiled } from './storage';
import { payHourlyWages, refreshCandidates, releaseTemps } from './staff';
import type { Animal, GameState, Offer, StructureInstance, StructureWorkKind } from './types';
import type { ShelterLevel, StructureId } from '../data/structures';
import { hasRoadAccess, refundFor } from './structures';
import { stepWorkers } from './workers';
import { endRentals, repairAtWorkshops, stepMachines, type MachineEvent } from './machines';

export interface TickResult {
  state: GameState;
  /** Names of staff who left because their wage could not be paid. */
  workersLeft: string[];
  /** Animals that could not be fed at midnight. */
  hungryAnimals: number;
  /** Day laborers who went home for good at the end of the shift. */
  tempsLeft: number;
  /** Sites and demolitions the crew finished. */
  worksFinished: FinishedWork[];
  /** Animals that died of old age. */
  animalsDied: Animal[];
  /** Sicknesses the farm just noticed. */
  sickNoticed: Animal[];
  /** Animals that died of a sickness or wound left untreated (their carcass stays). */
  diedOfSickness: Animal[];
  predatorAttacks: PredatorAttack[];
  /** The weather of each day that started (rain watered, storms destroyed). */
  weatherReports: WeatherReport[];
  /** Goods that spoiled at midnight (null when nothing did). */
  spoiled: Spoiled | null;
  /** Offers buyers just made on the farm's listings. */
  newOffers: Offer[];
  /** Feed (kg) ordered automatically. */
  feedOrdered: number;
  /** Crop whose research just finished. */
  researched: CropId | null;
  /** Vehicles that parked at the dock, were loaded and paid, or left without their load. */
  dockEvents: DockEvent[];
  /** Rented machines taken back at the end of the rental. */
  machineEvents: MachineEvent[];
}

export interface FinishedWork {
  type: StructureId;
  kind: StructureWorkKind;
  /** Upgrades: the level reached. */
  level?: ShelterLevel;
  /** Demolitions: what came back. */
  refund?: number;
  /** Buildings: finished, but no road links them to the access road yet (they stand idle). */
  cutOff?: boolean;
}

/** Works under way before that are no longer (only the crew finishes work while time passes). */
const finishedWorks = (before: readonly StructureInstance[], next: GameState): FinishedWork[] => {
  const after = next.structures;
  if (before === after) return [];
  const result: FinishedWork[] = [];
  for (const s of before) {
    if (!s.work) continue;
    const now = after.find((x) => x.id === s.id);
    if (now?.work) continue;
    if (s.work.kind === 'upgrade') result.push({ type: s.type, kind: 'upgrade', level: now?.level ?? s.work.toLevel });
    else if (s.work.kind === 'demolish') result.push({ type: s.type, kind: 'demolish', refund: refundFor(s.type, s.level) });
    else if (now && !hasRoadAccess(next.tiles, now)) result.push({ type: s.type, kind: 'build', cutOff: true });
    else result.push({ type: s.type, kind: 'build' });
  }
  return result;
};

/**
 * Advances the game by dtMinutes: crop growth (in GROWTH_STEP_MINUTES steps, so the tiles array
 * only changes on step boundaries or when a task finishes), workers (including construction) and animals,
 * then health (sickness, predators) and the standing orders: collecting at shelters with products,
 * medicating noticed sick animals and taking carcasses away, and the vehicles at the dock. Then, for each
 * full hour that ended: wages for the hours of the shift, day laborers leaving when it ends, and
 * buyers' offers on the listings and at midnight the feed, a new hiring board, the new day's weather
 * and spoilage.
 */
export const advanceGame = (state: GameState, dtMinutes: number): TickResult => {
  if (dtMinutes <= 0) {
    return {
      state,
      workersLeft: [],
      hungryAnimals: 0,
      tempsLeft: 0,
      worksFinished: [],
      animalsDied: [],
      sickNoticed: [],
      diedOfSickness: [],
      predatorAttacks: [],
      weatherReports: [],
      spoiled: null,
      newOffers: [],
      feedOrdered: 0,
      researched: null,
      dockEvents: [],
      machineEvents: [],
    };
  }
  const gameMinutes = state.gameMinutes + dtMinutes;
  const from = Math.floor(state.gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const to = Math.floor(gameMinutes / GROWTH_STEP_MINUTES) * GROWTH_STEP_MINUTES;
  const tiles = to > from ? growTiles(state.tiles, from, to) : state.tiles;
  const worked = stepWorkers({ ...state, gameMinutes, tiles }, dtMinutes);
  const rentals = endRentals(worked);
  const upkeep = stepMachines(rentals.state, dtMinutes);
  const aged = removeDeadAnimals(stepAnimals(upkeep.state, dtMinutes));
  const animalsDied = aged.died;
  const studied = stepResearch(aged.state, dtMinutes);
  const health = stepHealth(studied.state, state.gameMinutes);
  // Customers set off, park, run out of time and drive away (loading is done by the workers above).
  let next = stepShipments(queueAnimalCare(queueShelterChores(health.state)), state.gameMinutes);
  const worksFinished = finishedWorks(state.structures, next);

  const workersLeft: string[] = [];
  let hungryAnimals = 0;
  let feedOrdered = 0;
  let tempsLeft = 0;
  const weatherReports: WeatherReport[] = [];
  let spoiled: Spoiled | null = null;
  const nightMachineEvents: MachineEvent[] = [];
  const firstHour = Math.floor(state.gameMinutes / 60) + 1;
  const lastHour = Math.floor(gameMinutes / 60);
  for (let h = firstHour; h <= lastHour; h++) {
    const hourOfDay = h % 24;
    // The hour that just ended was part of the shift.
    if (hourOfDay > WORK_START_HOUR && hourOfDay <= WORK_END_HOUR) {
      const paid = payHourlyWages(next);
      next = paid.state;
      workersLeft.push(...paid.left);
    }
    if (hourOfDay === WORK_END_HOUR) {
      const before = next.workers.length;
      next = releaseTemps(next);
      tempsLeft += before - next.workers.length;
    }
    // Buyers look at the listings once an hour, and the feed is checked.
    next = generateOffers(next, h);
    const feed = autoOrderFeed(next);
    next = feed.state;
    feedOrdered += feed.ordered;
    if (hourOfDay === 0) {
      // Animals held in town are kept at the farm's cost.
      const fed = payFeed(chargeHeld(next));
      next = refreshCandidates(fed.state);
      const repaired = repairAtWorkshops(next);
      next = repaired.state;
      nightMachineEvents.push(...repaired.events);
      hungryAnimals = fed.hungry;
      // A new day: its weather hits the farm and stored goods spoil a little.
      const day = Math.floor(h / 24) + 1;
      const weather = applyDayWeather(next, day);
      weatherReports.push(weather.report);
      const spoil = spoilGoods(weather.state, day);
      next = refreshOrders(spoil.state, day);
      if (spoil.spoiled.total > 0) spoiled = spoil.spoiled;
    }
  }
  next = expireOffers(next);
  const known = new Set(state.offers.map((o) => o.id));
  return {
    state: next,
    newOffers: next.offers.filter((o) => !known.has(o.id)),
    feedOrdered,
    researched: studied.finished,
    dockEvents: dockEvents(state.shipments, next.shipments),
    machineEvents: [...rentals.events, ...upkeep.events, ...nightMachineEvents],
    workersLeft,
    hungryAnimals,
    tempsLeft,
    worksFinished,
    animalsDied,
    sickNoticed: health.noticed,
    diedOfSickness: health.died,
    predatorAttacks: health.attacks,
    weatherReports,
    spoiled,
  };
};

/** advanceGame without the events. */
export const tick = (state: GameState, dtMinutes: number): GameState => advanceGame(state, dtMinutes).state;
