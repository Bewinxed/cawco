/**
 * The hand-back between a provider's sign-in and the CawCo hub that started it.
 *
 * The start page keeps the hub's address in this browser, keyed by the sign-in's
 * `state`, and the callback page reads it back. The address travels only in the
 * URL fragment and browser storage, so no server of ours ever receives it. The
 * one-time code that comes back is useless without the verifier, which never
 * leaves the hub, and goes on only to the hub this browser started the sign-in
 * from.
 */

/** Where on a hub the code is handed over: the dashboard page that finishes the sign-in. */
const HUB_RETURN_PATH = '/oauth/mcp';
const PENDING_PREFIX = 'cawco-oauth:';
const TRUSTED_KEY = 'cawco-oauth:trusted';
const PENDING_TTL_MS = 10 * 60 * 1000;

/** How long a remembered hub is shown "Returning…" before the code goes on. */
export const RETURN_AFTER_MS = 1200;

export interface Start {
  /** The hub's origin, as the browser knows it. */
  origin: string;
  /** The provider's authorization page. */
  auth: URL;
  state: string;
}

/** A hub origin is a bare http(s) origin: no path, no credentials. */
function hubOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new Error('The hub address is missing.');
  const url = new URL(value);
  const plain = url.protocol === 'http:' || url.protocol === 'https:';
  if (!plain || url.username || url.password || url.origin !== value) {
    throw new Error('The hub address is not a plain web origin.');
  }
  return url.origin;
}

const fromBase64Url = (text: string): string =>
  atob(text.replaceAll('-', '+').replaceAll('_', '/'));

/** Reads the start link's fragment. It throws on anything but a hub and a provider over https. */
export function readStart(hash: string): Start {
  const body: unknown = JSON.parse(fromBase64Url(hash.replace(/^#/, '')));
  if (typeof body !== 'object' || body === null) throw new Error('The start link is empty.');
  const { origin, auth } = body as { origin?: unknown; auth?: unknown };
  const url = new URL(typeof auth === 'string' ? auth : '');
  const state = url.searchParams.get('state');
  if (url.protocol !== 'https:' || !state) throw new Error('The provider link is not valid.');
  return { origin: hubOrigin(origin), auth: url, state };
}

export function remember(state: string, origin: string): void {
  localStorage.setItem(PENDING_PREFIX + state, JSON.stringify({ origin, at: Date.now() }));
}

/** The hub this browser started the sign-in `state` from, while it is still fresh. */
export function recall(state: string | null): string | null {
  if (!state) return null;
  try {
    const entry: unknown = JSON.parse(localStorage.getItem(PENDING_PREFIX + state) ?? 'null');
    const { origin, at } = (entry ?? {}) as { origin?: unknown; at?: unknown };
    if (typeof at !== 'number' || Date.now() - at > PENDING_TTL_MS) return null;
    return hubOrigin(origin);
  } catch {
    return null;
  }
}

export const forget = (state: string): void => localStorage.removeItem(PENDING_PREFIX + state);

function trustedHubs(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]');
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** A hub the person has approved once in this browser. */
export const isTrusted = (origin: string): boolean => trustedHubs().includes(origin);

export const trust = (origin: string): void =>
  localStorage.setItem(TRUSTED_KEY, JSON.stringify([...new Set([...trustedHubs(), origin])]));

/** The hub's own page that takes the provider's answer and finishes the sign-in. */
export function hubReturn(origin: string, answer: URLSearchParams): URL {
  const url = new URL(HUB_RETURN_PATH, origin);
  for (const key of ['code', 'state', 'iss']) {
    const value = answer.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return url;
}
