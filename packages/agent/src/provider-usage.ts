/**
 * Each account's windows on this machine, read wherever the provider exposes
 * them, with the account's one credential: Claude's `api/oauth/usage`
 * (agent usage/anthropic.ts), ChatGPT's `wham/usage` (usage/chatgpt.ts),
 * OpenCode Go's `zen/go/v1/usage` (usage/opencode-go.ts). Every 5 minutes
 * while the account is signed in here, shortly after each turn a session
 * runs on it (at most once a minute), and when the hub asks for one account
 * now ({@link readAccountUsage}). Every other provider exposes none: no
 * windows, and so no dials and no at-limit moves, though placement still
 * works. A credential is read at call time for one request and never logged.
 *
 * A read that fails keeps the last good windows, with their time, and says
 * why ({@link ProviderAccountReading.error}); the hub keeps that reading.
 */
import type { ProviderAccountReading } from "@cawco/core/accounts";
import { failureOf } from "@cawco/core/detach";
import { makeJoin } from "@cawco/core/effect/join";
import { accountIds, credentialAccountIds } from "@cawco/core/paths/claude";
import type { SpawnPayload } from "@cawco/core/protocol";
import type { LimitWindow } from "@cawco/core/usage/types";
import { Cause, Clock, Duration, Effect, Fiber } from "effect";
import type { AgentPorts } from "./agent-ports";
import type { HarnessContext } from "./harness";
import { freshened, readHeld } from "./provider-accounts";
import { anthropicUsage } from "./usage/anthropic";
import { chatgptClaims, chatgptUsage } from "./usage/chatgpt";
import { openCodeGoLimits } from "./usage/opencode-go";

/** How often a signed-in account's windows are read with nothing running on it. */
const PROVIDER_READ_INTERVAL_MS = 5 * 60_000;

/** How long after a turn ends its account's windows are read: one read for a burst of turns. */
const AFTER_TURN_MS = 3000;

/**
 * The least time between an account's reads that turns set going: Claude
 * Code's own (it answers a usage read from a snapshot younger than a
 * minute, 2.1.325), so a busy account is not read at every turn's end.
 */
const TURN_READ_SPACING_MS = 60_000;

/** The providers of a pi-ai credential store whose windows CawCo can read. */
const METERED = new Set(["openai-codex", "opencode-go"]);

const last = new Map<string, ProviderAccountReading>();
const attempted = new Map<string, number>();
/** Each account's read set going by a turn's end, while it waits to start ({@link readAccountSoon}). */
const soon = new Map<string, Fiber.Fiber<void>>();
/** Each account's read under way: a second ask joins it. */
const inFlight = makeJoin<string, ProviderAccountReading | undefined>();

/**
 * OpenCode Go's windows as the windows placement and at-limit read: its
 * rolling window is the `session` one, its weekly the `weekly_all`.
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

const readWindows = Effect.fn("readWindows")(function* (
  accountId: string,
  ports: Pick<AgentPorts, "borrowAsk">
) {
  if (accountIds().includes(accountId)) {
    return yield* anthropicUsage(accountId);
  }
  const held = readHeld(accountId);
  if (!(held && METERED.has(held.provider))) {
    return;
  }
  if (held.provider === "openai-codex") {
    // A refresh that fails leaves the token as it is; the read says the rest.
    yield* freshened(accountId, ports, true).pipe(Effect.ignore);
    const now = readHeld(accountId);
    if (now?.credential.type !== "oauth") {
      return {
        ok: false,
        error: "the account holds no ChatGPT sign-in here",
      } satisfies Read;
    }
    const claims = chatgptClaims(now.credential.access);
    if (!claims.accountId) {
      return {
        ok: false,
        error: "the token names no ChatGPT account",
      } satisfies Read;
    }
    return yield* chatgptUsage(now.credential.access, claims.accountId);
  }
  if (held.credential.type !== "api_key") {
    return {
      ok: false,
      error: "the account holds no OpenCode Go key here",
    } satisfies Read;
  }
  const go = yield* openCodeGoLimits(held.credential.key ?? null);
  if (!go) {
    return {
      ok: false,
      error: "the account holds no OpenCode Go key here",
    } satisfies Read;
  }
  return go.error && !go.stale
    ? ({ ok: false, error: go.error } satisfies Read)
    : ({
        ok: true,
        plan: "OpenCode Go",
        windows: goWindows(go.windows),
      } satisfies Read);
});

/** One read of the account, kept as its last good one when it answered. */
const readOne = Effect.fn("readOne")(function* (
  accountId: string,
  ports: Pick<AgentPorts, "borrowAsk">
) {
  attempted.set(accountId, yield* Clock.currentTimeMillis);
  // Any way the read fails, a defect among them, is its answer: the last
  // good windows stand, with why.
  const failedRead = (error: unknown) =>
    Effect.succeed<Read>({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  const read: Read | undefined = yield* readWindows(accountId, ports).pipe(
    Effect.catch(failedRead),
    Effect.catchDefect(failedRead)
  );
  if (!read) {
    return;
  }
  const prior = last.get(accountId);
  if (!read.ok) {
    return {
      accountId,
      windows: prior?.windows ?? [],
      plan: prior?.plan ?? null,
      readAt: prior?.readAt ?? 0,
      error: read.error,
    } satisfies ProviderAccountReading;
  }
  const reading: ProviderAccountReading = {
    accountId,
    windows: read.windows,
    plan: read.plan,
    readAt: yield* Clock.currentTimeMillis,
    error: null,
  };
  last.set(accountId, reading);
  return reading;
});

/**
 * Reads one account's windows now, joining a read of it already under way;
 * undefined for an account whose provider has none, or that has no store
 * here. The hub's on-demand read (core accounts/controls.ts
 * `CONTROL_READ_ACCOUNT_USAGE`) and the beats alike.
 */
const accountUsage = (
  accountId: string,
  ports: Pick<AgentPorts, "borrowAsk">
): Effect.Effect<ProviderAccountReading | undefined> =>
  inFlight.run(accountId, readOne(accountId, ports));

/** The promise edge of {@link accountUsage}. */
export const readAccountUsage = (
  accountId: string,
  ports: Pick<AgentPorts, "borrowAsk">
): Promise<ProviderAccountReading | undefined> =>
  Effect.runPromise(accountUsage(accountId, ports));

/** Every metered account whose last read is 5 minutes old or more, read now. */
export const readDueProviderAccounts = async (
  ports: Pick<AgentPorts, "borrowAsk">
): Promise<ProviderAccountReading[]> => {
  const due = [...accountIds(), ...credentialAccountIds()].filter(
    (accountId) =>
      Date.now() - (attempted.get(accountId) ?? 0) >= PROVIDER_READ_INTERVAL_MS
  );
  const readings = await Promise.all(
    due.map((accountId) => readAccountUsage(accountId, ports))
  );
  return readings.filter(
    (one): one is ProviderAccountReading => one !== undefined
  );
};

/**
 * A turn on the account just ended: its windows are read shortly, once for a
 * burst and no sooner than {@link TURN_READ_SPACING_MS} after its last read,
 * and sent on `emit`, the session's line to the hub. The wait is a fiber of
 * its own, interrupted by the next turn's end while it still waits; once
 * the read starts, it runs to its end.
 */
const readAccountSoon = (
  accountId: string,
  emit: HarnessContext["emit"]
): void => {
  const waiting = soon.get(accountId);
  if (waiting) {
    Effect.runFork(Fiber.interrupt(waiting));
  }
  const spaced =
    (attempted.get(accountId) ?? 0) + TURN_READ_SPACING_MS - Date.now();
  const read = Effect.sleep(
    Duration.millis(Math.max(AFTER_TURN_MS, spaced))
  ).pipe(
    Effect.andThen(
      Effect.sync(() => {
        soon.delete(accountId);
      })
    ),
    Effect.andThen(
      accountUsage(accountId, {
        borrowAsk: (frame) =>
          emit({ verb: "frames", machineId: "", payload: frame }),
      }).pipe(
        Effect.tap((reading) =>
          Effect.sync(() => {
            if (reading) {
              emit({
                verb: "usage",
                machineId: "",
                payload: { accounts: [reading] },
              });
            }
          })
        ),
        // Once it has started, a later turn's end does not cut it short.
        Effect.uninterruptible
      )
    ),
    // A wait cut short by the next turn's end says nothing; a read that failed says why.
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.sync(() =>
            console.warn(
              `[provider-usage] ${accountId}: ${failureOf(Cause.squash(cause))}`
            )
          )
    ),
    Effect.asVoid
  );
  soon.set(accountId, Effect.runFork(read));
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

/** A session on an account: each turn's end reads the account's windows shortly after. */
export const withAccountReads = (
  spec: SpawnPayload,
  ctx: HarnessContext
): HarnessContext => {
  const account = spec.accountDir?.accountId;
  return account
    ? {
        ...ctx,
        busy: (active) => {
          ctx.busy(active);
          if (!active) {
            readAccountSoon(account, ctx.emit);
          }
        },
      }
    : ctx;
};
