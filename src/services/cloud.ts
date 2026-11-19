/**
 * Cloud saves and public farm profiles on Supabase, through its REST API (no SDK). Everything is
 * off unless VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see docs/supabase.md). Login is
 * GitHub OAuth through Supabase Auth: the session comes back in the URL hash after the redirect.
 */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export interface CloudSession {
  accessToken: string;
  /** Unix ms when the token expires. */
  expiresAt: number;
}

export interface FarmProfile {
  name: string;
  day: number;
  money: number;
  animals: number;
  updated_at?: string;
}

const SESSION_KEY = 'uvalley.cloud.session';

export const cloudConfig = (): CloudConfig | null => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof url === 'string' && url && typeof anonKey === 'string' && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null;
};

/** Where to send the player to log in with GitHub. */
export const loginUrl = (config: CloudConfig, returnTo: string): string =>
  `${config.url}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(returnTo)}`;

/** Reads the session Supabase put in the URL hash after the login redirect. */
export const sessionFromHash = (hash: string, now: number): CloudSession | null => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in'));
  if (!accessToken || !Number.isFinite(expiresIn)) return null;
  return { accessToken, expiresAt: now + expiresIn * 1000 };
};

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** The stored session, picking up a fresh one from the URL after a login. */
export const currentSession = (now = Date.now()): CloudSession | null => {
  const s = storage();
  if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
    const fresh = sessionFromHash(window.location.hash, now);
    if (fresh) s?.setItem(SESSION_KEY, JSON.stringify(fresh));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  const raw = s?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { accessToken, expiresAt } = parsed as Record<string, unknown>;
    if (typeof accessToken !== 'string' || typeof expiresAt !== 'number' || expiresAt <= now) return null;
    return { accessToken, expiresAt };
  } catch {
    return null;
  }
};

export const logout = (): void => storage()?.removeItem(SESSION_KEY);

const headers = (config: CloudConfig, session: CloudSession): Record<string, string> => ({
  apikey: config.anonKey,
  Authorization: `Bearer ${session.accessToken}`,
  'Content-Type': 'application/json',
});

/** Uploads the save (one row per user, replaced each time) and the public profile. */
export const uploadSave = async (config: CloudConfig, session: CloudSession, data: string, profile: FarmProfile): Promise<boolean> => {
  try {
    const prefer = { Prefer: 'resolution=merge-duplicates,return=minimal' };
    const save = await fetch(`${config.url}/rest/v1/saves?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...headers(config, session), ...prefer },
      body: JSON.stringify({ data }),
    });
    const card = await fetch(`${config.url}/rest/v1/profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...headers(config, session), ...prefer },
      body: JSON.stringify(profile),
    });
    return save.ok && card.ok;
  } catch {
    return false;
  }
};

/** Downloads the player's save, or null when there is none (or the request failed). */
export const downloadSave = async (config: CloudConfig, session: CloudSession): Promise<string | null> => {
  try {
    const response = await fetch(`${config.url}/rest/v1/saves?select=data&limit=1`, { headers: headers(config, session) });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    const first: unknown = Array.isArray(rows) ? rows[0] : undefined;
    const data = typeof first === 'object' && first !== null ? (first as { data?: unknown }).data : undefined;
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
};

/** Other players' public farm cards, most recently updated first. */
export const listProfiles = async (config: CloudConfig, session: CloudSession): Promise<FarmProfile[]> => {
  try {
    const query = 'select=name,day,money,animals,updated_at&order=updated_at.desc&limit=20';
    const response = await fetch(`${config.url}/rest/v1/profiles?${query}`, { headers: headers(config, session) });
    if (!response.ok) return [];
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((r: unknown) => {
      if (typeof r !== 'object' || r === null) return [];
      const { name, day, money, animals, updated_at } = r as Record<string, unknown>;
      if (typeof name !== 'string' || typeof day !== 'number' || typeof money !== 'number' || typeof animals !== 'number') return [];
      return [{ name, day, money, animals, ...(typeof updated_at === 'string' ? { updated_at } : {}) }];
    });
  } catch {
    return [];
  }
};
