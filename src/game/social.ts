/**
 * The farm's link to GitHub: active contribution days (from public events) become a capped
 * community bonus on crop growth and animal production. Pure: the fetching lives in services/.
 */
import { CONTRIBUTION_EVENTS, GITHUB_BONUS } from '../data/social';
import type { GameState, GitHubLink } from './types';

/** A public GitHub event, as far as the game cares. */
export interface GitHubEvent {
  type: string;
  created_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** GitHub logins: letters, digits and single hyphens, up to 39 characters. */
export const isValidLogin = (login: string): boolean => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login);

/** Distinct UTC days with a contribution in the last `windowDays` (counting today). */
export const activeDays = (events: readonly GitHubEvent[], now: number): number => {
  const since = now - GITHUB_BONUS.windowDays * DAY_MS;
  const days = new Set<string>();
  for (const e of events) {
    if (!CONTRIBUTION_EVENTS.includes(e.type)) continue;
    const at = Date.parse(e.created_at);
    if (!Number.isFinite(at) || at < since || at > now + DAY_MS) continue;
    days.add(new Date(at).toISOString().slice(0, 10));
  }
  return days.size;
};

/** Growth and production multiplier from the linked GitHub account (1 without one). */
export const communityBonus = (state: Pick<GameState, 'github'>): number => {
  const days = Math.min(state.github?.activeDays ?? 0, GITHUB_BONUS.maxDays);
  return 1 + days * GITHUB_BONUS.perActiveDay;
};

/** Whether the account may be synced again (the public API is rate limited). */
export const canSync = (link: GitHubLink | null, now: number): boolean =>
  !link || now - link.syncedAt >= GITHUB_BONUS.syncCooldownMinutes * 60 * 1000;

export const linkGitHub = (state: GameState, login: string, events: readonly GitHubEvent[], now: number): GameState => ({
  ...state,
  github: { login, activeDays: activeDays(events, now), syncedAt: now },
});

export const unlinkGitHub = (state: GameState): GameState => ({ ...state, github: null });
