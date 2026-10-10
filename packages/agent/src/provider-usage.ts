/**
 * Each provider account's windows on this machine, read wherever the
 * provider exposes them, with the account's one credential: ChatGPT's
 * `wham/usage` (core usage/chatgpt.ts), OpenCode Go's `zen/go/v1/usage`
 * (core usage/opencode-go.ts). Every 5 minutes while the account is signed in
 * here, and shortly after each turn a session runs on it. Every other
 * provider exposes none: no windows, and so no dials and no at-limit moves,
 * though placement still works. A credential is read at call time for one
 * request and never logged.
 *
 * A read that fails keeps the last good windows, with their time, and says
 * why ({@link ProviderAccountReading.error}); the hub keeps that reading.
 */
import type { LimitWindow, ProviderAccountReading } from "@cawco/core";
import { credentialAccountIds } from "@cawco/core/paths";
import { chatgptClaims, readChatgptUsage } from "@cawco/core/usage/chatgpt";
import { fetchOpenCodeGoLimits } from "@cawco/core/usage/opencode-go";
import { freshen, readHeld } from "./provider-accounts";

/** How often a signed-in account's windows are read with nothing running on it. */
export const PROVIDER_READ_INTERVAL_MS = 5 * 60_000;

/** How long after a turn ends its account's windows are read: one read for a burst of turns. */
const AFTER_TURN_MS = 3000;

/** The providers whose windows CawCo can read. */
const METERED = new Set(["openai-codex", "opencode-go"]);

type Sink = (readings: ProviderAccountReading[]) => void;
let sink: Sink | undefined;

/** Where readings made after a turn go: the daemon's socket to the hub. */
export const setProviderReadingSink = (send: Sink): void => {
  sink = send;
};

const last = new Map<string, ProviderAccountReading>();
const attempted = new Map<string, number>();
const soon = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * OpenCode Go's windows as the windows placement and at-limit read: its
 * rolling 5-hour window is the `session` one, its weekly the `weekly_all`.
 */
const goWindows = (windows: LimitWindow[]): LimitWindow[] =>
  windows.map((window) => {
    if (window.kind === "rolling") {
      return { ...window, kind: "session" };
    }
    return window.kind === "weekly"
      ? { ...window, kind: "weekly_all" }
      : window;
  });

type Read =
  | { ok: true; plan: string | null; windows: LimitWindow[] }
  | { ok: false; error: string };

const readWindows = async (accountId: string): Promise<Read | undefined> => {
  const held = readHeld(accountId);
  if (!(held && METERED.has(held.provider))) {
    return undefined;
  }
  if (held.provider === "openai-codex") {
    await freshen(accountId, true).catch(() => undefined);
    const now = readHeld(accountId);
    if (now?.credential.type !== "oauth") {
      return { ok: false, error: "the account holds no ChatGPT sign-in here" };
    }
    const claims = chatgptClaims(now.credential.access);
    if (!claims.accountId) {
      return { ok: false, error: "the token names no ChatGPT account" };
    }
    return await readChatgptUsage(now.credential.access, claims.accountId);
  }
  if (held.credential.type !== "api_key") {
    return { ok: false, error: "the account holds no OpenCode Go key here" };
  }
  const go = await fetchOpenCodeGoLimits(held.credential.key ?? null);
  if (!go) {
    return { ok: false, error: "the account holds no OpenCode Go key here" };
  }
  return go.error && !go.stale
    ? { ok: false, error: go.error }
    : { ok: true, plan: "OpenCode Go", windows: goWindows(go.windows) };
};

/** Reads one account's windows now; undefined for a provider with none. */
const readOne = async (
  accountId: string
): Promise<ProviderAccountReading | undefined> => {
  attempted.set(accountId, Date.now());
  const read = await readWindows(accountId).catch(
    (error: unknown): Read => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  if (!read) {
    return undefined;
  }
  const prior = last.get(accountId);
  if (!read.ok) {
    return {
      accountId,
      windows: prior?.windows ?? [],
      plan: prior?.plan ?? null,
      readAt: prior?.readAt ?? 0,
      error: read.error,
    };
  }
  const reading: ProviderAccountReading = {
    accountId,
    windows: read.windows,
    plan: read.plan,
    readAt: Date.now(),
    error: null,
  };
  last.set(accountId, reading);
  return reading;
};

/** Every metered account whose last read is 5 minutes old or more, read now. */
export const readDueProviderAccounts = async (): Promise<
  ProviderAccountReading[]
> => {
  const due = credentialAccountIds().filter(
    (accountId) =>
      Date.now() - (attempted.get(accountId) ?? 0) >= PROVIDER_READ_INTERVAL_MS
  );
  const readings = await Promise.all(due.map(readOne));
  return readings.filter(
    (one): one is ProviderAccountReading => one !== undefined
  );
};

/** A turn on the account just ended: its windows are read shortly, once for a burst. */
export const readAccountSoon = (accountId: string): void => {
  clearTimeout(soon.get(accountId));
  const timer = setTimeout(() => {
    soon.delete(accountId);
    readOne(accountId)
      .then((reading) => {
        if (reading) {
          sink?.([reading]);
        }
      })
      .catch((error: unknown) =>
        console.warn(`[provider-usage] ${accountId}: ${String(error)}`)
      );
  }, AFTER_TURN_MS);
  timer.unref?.();
  soon.set(accountId, timer);
};

/** The machine's OpenCode Go key, for the usage screens' per-machine Go reading: its first Go account's. */
export const machineGoKey = (): string | null => {
  for (const accountId of credentialAccountIds()) {
    const held = readHeld(accountId);
    if (
      held?.provider === "opencode-go" &&
      held.credential.type === "api_key"
    ) {
      return held.credential.key ?? null;
    }
  }
  return null;
};
