import { describe, expect, it } from 'vitest';
import { GITHUB_BONUS } from '../../data/social';
import { loginUrl, sessionFromHash } from '../../services/cloud';
import { plant, till, water } from '../actions';
import { tileIndex } from '../grid';
import { growTiles } from '../growth';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { activeDays, canSync, communityBonus, isValidLogin, linkGitHub, unlinkGitHub, type GitHubEvent } from '../social';
import { createInitialState } from '../state';
import type { ActionResult, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const NOW = Date.parse('2026-11-18T12:00:00Z');
const daysAgo = (d: number, type = 'PushEvent'): GitHubEvent => ({
  type,
  created_at: new Date(NOW - d * 24 * 3600 * 1000).toISOString(),
});

describe('GitHub activity', () => {
  it('counts distinct days with contributions in the last week, not the number of events', () => {
    const events = [daysAgo(0), daysAgo(0), daysAgo(0), daysAgo(1, 'PullRequestEvent'), daysAgo(3, 'IssuesEvent')];
    expect(activeDays(events, NOW)).toBe(3);
  });

  it('ignores old events and events that are not contributions', () => {
    expect(activeDays([daysAgo(10), daysAgo(2, 'WatchEvent'), daysAgo(1, 'ForkEvent')], NOW)).toBe(0);
  });

  it('turns active days into a capped bonus', () => {
    const s = createInitialState();
    expect(communityBonus(s)).toBe(1);
    const three = linkGitHub(s, 'octocat', [daysAgo(0), daysAgo(1), daysAgo(2)], NOW);
    expect(communityBonus(three)).toBeCloseTo(1 + 3 * GITHUB_BONUS.perActiveDay);
    const week = linkGitHub(s, 'octocat', [0, 1, 2, 3, 4, 5, 6].map((d) => daysAgo(d)), NOW);
    expect(week.github?.activeDays).toBe(7);
    expect(communityBonus(week)).toBeCloseTo(1 + GITHUB_BONUS.maxDays * GITHUB_BONUS.perActiveDay);
    expect(communityBonus(unlinkGitHub(week))).toBe(1);
  });

  it('speeds up crop growth', () => {
    const t = tileIndex(15, 19);
    const s = unwrap(water(unwrap(plant(unwrap(till(createInitialState(), t)), t, 'wheat')), t));
    const plain = growTiles(s.tiles, s.gameMinutes, s.gameMinutes + 60)[t]?.crop?.growthMinutes ?? 0;
    const boosted = growTiles(s.tiles, s.gameMinutes, s.gameMinutes + 60, 1.1)[t]?.crop?.growthMinutes ?? 0;
    expect(boosted).toBeCloseTo(plain * 1.1);
  });

  it('validates logins and waits between syncs', () => {
    expect(isValidLogin('octo-cat')).toBe(true);
    expect(isValidLogin('-bad')).toBe(false);
    expect(isValidLogin('a b')).toBe(false);
    const link = { login: 'octocat', activeDays: 1, syncedAt: NOW };
    expect(canSync(null, NOW)).toBe(true);
    expect(canSync(link, NOW + 60_000)).toBe(false);
    expect(canSync(link, NOW + GITHUB_BONUS.syncCooldownMinutes * 60_000)).toBe(true);
  });
});

describe('cloud client', () => {
  it('builds the GitHub login URL and reads the session from the redirect', () => {
    const config = { url: 'https://abc.supabase.co', anonKey: 'k' };
    expect(loginUrl(config, 'http://localhost:5173/')).toBe(
      'https://abc.supabase.co/auth/v1/authorize?provider=github&redirect_to=http%3A%2F%2Flocalhost%3A5173%2F',
    );
    expect(sessionFromHash('#access_token=t0k&expires_in=3600&token_type=bearer', NOW)).toEqual({
      accessToken: 't0k',
      expiresAt: NOW + 3600 * 1000,
    });
    expect(sessionFromHash('#error=access_denied', NOW)).toBeNull();
  });
});

describe('save', () => {
  it('keeps the linked account', () => {
    const s = linkGitHub(createInitialState(), 'octocat', [daysAgo(0)], NOW);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

  it('migrates v14 saves: no account linked', () => {
    const { github: _g, ...v14 } = createInitialState();
    const raw = JSON.stringify({ saveVersion: 14, savedAt: 0, game: v14, settings: DEFAULT_SETTINGS });
    expect(deserialize(raw)?.game.github).toBeNull();
  });
});
