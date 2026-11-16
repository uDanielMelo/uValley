import { MINUTES_PER_DAY } from '../data/world';

export interface ClockTime {
  /** 1-based day number. */
  day: number;
  hour: number;
  minute: number;
}

export const toClock = (gameMinutes: number): ClockTime => {
  const total = Math.max(0, Math.floor(gameMinutes));
  const minuteOfDay = total % MINUTES_PER_DAY;
  return {
    day: Math.floor(total / MINUTES_PER_DAY) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
};

export const formatClock = ({ hour, minute }: ClockTime): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** First minute of the next day. */
export const startOfNextDay = (gameMinutes: number): number =>
  (Math.floor(gameMinutes / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;

/** Fraction of the day in [0, 1). 0 = midnight, 0.5 = noon. */
export const dayFraction = (gameMinutes: number): number =>
  (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_DAY;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Daylight factor in [0, 1]: 0 at night, 1 during the day,
 * smooth dawn (4h–6h) and dusk (18h30–20h30).
 */
export const daylight = (gameMinutes: number): number => {
  const hour = dayFraction(gameMinutes) * 24;
  if (hour < 4 || hour >= 20.5) return 0;
  if (hour < 6) return smoothstep((hour - 4) / 2);
  if (hour < 18.5) return 1;
  return 1 - smoothstep((hour - 18.5) / 2);
};
