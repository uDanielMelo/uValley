/**
 * Seasons and daily weather, derived from the day number (never saved): the same day always has
 * the same weather. Rain waters every growing crop for the day; a storm also destroys some.
 */
import {
  FIRST_DAY_WEATHER,
  SEASONS,
  SNOW,
  SEASON_DAYS,
  SEASON_IDS,
  WEATHERS,
  WEATHER_IDS,
  type SeasonId,
  type WeatherId,
} from '../data/climate';
import { CROPS } from '../data/crops';
import { MINUTES_PER_DAY } from '../data/world';
import { isMature } from './crops';
import { hash01 } from './random';
import { startOfNextDay } from './time';
import type { GameState, Tile } from './types';

/** 1-based day number of a game minute. */
export const dayOf = (gameMinutes: number): number => Math.floor(Math.max(0, gameMinutes) / MINUTES_PER_DAY) + 1;

export const seasonOf = (day: number): SeasonId =>
  SEASON_IDS[Math.floor((Math.max(1, day) - 1) / SEASON_DAYS) % SEASON_IDS.length] ?? 'spring';

/** Day of the current season (1 to SEASON_DAYS). */
export const dayOfSeason = (day: number): number => ((Math.max(1, day) - 1) % SEASON_DAYS) + 1;

/** Year number (1-based). */
export const yearOf = (day: number): number => Math.floor((Math.max(1, day) - 1) / (SEASON_DAYS * SEASON_IDS.length)) + 1;

/** The weather of a day, drawn from its season's odds. */
export const weatherOf = (day: number): WeatherId => {
  if (day <= 1) return FIRST_DAY_WEATHER;
  const odds = SEASONS[seasonOf(day)].weather;
  let left = hash01(day * 2654435 + 97);
  for (const id of WEATHER_IDS) {
    left -= odds[id];
    if (left < 0) return id;
  }
  return 'sunny';
};

export const weatherAt = (gameMinutes: number): WeatherId => weatherOf(dayOf(gameMinutes));

/** Name and icon of a day's weather for the UI (rain is snow in winter). */
export const weatherLook = (day: number): { label: string; icon: string } => {
  const weather = WEATHERS[weatherOf(day)];
  return weather.id === 'rain' && seasonOf(day) === 'winter' ? SNOW : { label: weather.label, icon: weather.icon };
};

/** Crop growth multiplier of the season at a game minute. */
export const seasonGrowth = (gameMinutes: number): number => SEASONS[seasonOf(dayOf(gameMinutes))].growth;

export interface WeatherReport {
  day: number;
  weather: WeatherId;
  /** Crops the rain watered. */
  watered: number;
  /** Crops the storm destroyed. */
  destroyed: number;
}

/** Crops out in the weather (not under a greenhouse) that are still growing. */
const growing = (tile: Tile): boolean => !!tile.crop && !tile.structure && !tile.cover && !isMature(tile.crop);

/**
 * The weather of a new day hits the farm (at midnight): rain waters every growing crop until
 * the end of the day, and a storm destroys some of them (the tile stays tilled).
 */
export const applyDayWeather = (state: GameState, day: number): { state: GameState; report: WeatherReport } => {
  const weather = WEATHERS[weatherOf(day)];
  const report: WeatherReport = { day, weather: weather.id, watered: 0, destroyed: 0 };
  if (!weather.waters && weather.cropDamage <= 0) return { state, report };
  const until = startOfNextDay((day - 1) * MINUTES_PER_DAY);
  let changed = false;
  const tiles = state.tiles.map((tile, i) => {
    if (!growing(tile) || !tile.crop) return tile;
    if (weather.cropDamage > 0 && hash01(i * 7919 + day * 104729 + 13) < weather.cropDamage) {
      changed = true;
      report.destroyed++;
      return tile.fertilized ? { state: 'tilled' as const, fertilized: true as const } : { state: 'tilled' as const };
    }
    const rainFed = CROPS[tile.crop.cropId].kind === 'orchard';
    if (weather.waters && !rainFed && (tile.state !== 'watered' || (tile.wateredUntil ?? 0) < until)) {
      changed = true;
      report.watered++;
      return { ...tile, state: 'watered' as const, wateredUntil: until };
    }
    return tile;
  });
  return { state: changed ? { ...state, tiles } : state, report };
};
