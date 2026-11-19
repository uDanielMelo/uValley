/** Seasons and weather. All balancing for the climate lives here. */

export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonId = (typeof SEASON_IDS)[number];

export const WEATHER_IDS = ['sunny', 'cloudy', 'rain', 'storm'] as const;
export type WeatherId = (typeof WEATHER_IDS)[number];

/** Game days in each season (a year is four seasons). */
export const SEASON_DAYS = 7;

export interface SeasonDef {
  id: SeasonId;
  label: string;
  icon: string;
  /** Multiplies crop growth while watered. */
  growth: number;
  /** Multiplies how fast stored goods spoil. */
  spoilage: number;
  /** Chance of each weather on a day of this season (they add up to 1). */
  weather: Record<WeatherId, number>;
}

export const SEASONS: Record<SeasonId, SeasonDef> = {
  spring: {
    id: 'spring',
    label: 'Primavera',
    icon: '🌸',
    growth: 1.15,
    spoilage: 1,
    weather: { sunny: 0.45, cloudy: 0.25, rain: 0.25, storm: 0.05 },
  },
  summer: {
    id: 'summer',
    label: 'Verão',
    icon: '☀️',
    growth: 1.1,
    spoilage: 1.5,
    weather: { sunny: 0.55, cloudy: 0.15, rain: 0.15, storm: 0.15 },
  },
  autumn: {
    id: 'autumn',
    label: 'Outono',
    icon: '🍂',
    growth: 1,
    spoilage: 1,
    weather: { sunny: 0.35, cloudy: 0.35, rain: 0.25, storm: 0.05 },
  },
  winter: {
    id: 'winter',
    label: 'Inverno',
    icon: '❄️',
    growth: 0.6,
    spoilage: 0.6,
    weather: { sunny: 0.3, cloudy: 0.45, rain: 0.2, storm: 0.05 },
  },
};

export interface WeatherDef {
  id: WeatherId;
  label: string;
  icon: string;
  /** Waters every growing crop for the day. */
  waters: boolean;
  /** Chance that a storm destroys each crop that is not ready yet. */
  cropDamage: number;
  /** How gray the sky is (0 clear, 1 dark), for the scene. */
  overcast: number;
}

export const WEATHERS: Record<WeatherId, WeatherDef> = {
  sunny: { id: 'sunny', label: 'Ensolarado', icon: '☀️', waters: false, cropDamage: 0, overcast: 0 },
  cloudy: { id: 'cloudy', label: 'Nublado', icon: '☁️', waters: false, cropDamage: 0, overcast: 0.45 },
  /** In winter it falls as snow (same effect on the crops). */
  rain: { id: 'rain', label: 'Chuva', icon: '🌧️', waters: true, cropDamage: 0, overcast: 0.7 },
  storm: { id: 'storm', label: 'Tempestade', icon: '⛈️', waters: true, cropDamage: 0.12, overcast: 0.9 },
};

/** How rain looks and is called in winter. */
export const SNOW = { label: 'Neve', icon: '🌨️' } as const;

/** The first day of a new game is always clear. */
export const FIRST_DAY_WEATHER: WeatherId = 'sunny';
