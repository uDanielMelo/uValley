/** Reads a user's public GitHub events (no login: the public API, rate limited per IP). */
import type { GitHubEvent } from '../game/social';

export type GitHubResult = { ok: true; events: GitHubEvent[] } | { ok: false; error: 'not-found' | 'rate-limited' | 'network' };

const isEvent = (v: unknown): v is GitHubEvent =>
  typeof v === 'object' && v !== null && 'type' in v && 'created_at' in v &&
  typeof (v as { type: unknown }).type === 'string' && typeof (v as { created_at: unknown }).created_at === 'string';

export const fetchPublicEvents = async (login: string): Promise<GitHubResult> => {
  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (response.status === 404) return { ok: false, error: 'not-found' };
    if (response.status === 403 || response.status === 429) return { ok: false, error: 'rate-limited' };
    if (!response.ok) return { ok: false, error: 'network' };
    const body: unknown = await response.json();
    return { ok: true, events: Array.isArray(body) ? body.filter(isEvent) : [] };
  } catch {
    return { ok: false, error: 'network' };
  }
};
