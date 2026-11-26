import { modelScope } from "@cawco/core/accounts";
import type { HubEnvelope } from "@cawco/core/envelopes";
import { traitsOf } from "@cawco/core/harness/traits";
import { type KeepAlive, OVER_STATUSES } from "@cawco/core/protocol";
import {
  cacheHit,
  type NeutralResultMessage,
  type NeutralUserMessage,
  promptCacheUsage,
} from "@cawco/core/session-messages";
import { HOUR_MS } from "@cawco/core/time";
import { resolveRates } from "@cawco/core/usage/pricing";
import type { ClaudeLimits } from "@cawco/core/usage/types";
import { bearing, headroom } from "@cawco/core/usage/windows";
import { Effect, type Fiber } from "effect";
import type { DbShape } from "./db";
import type { HubLifetimeShape } from "./lifetime";

export type KeepAliveRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/** What a session's keep-alive facts are read from: the columns of its row that say them. */
type KeepAliveColumns = Pick<
  KeepAliveRow,
  | "cacheColdAt"
  | "cacheColdReason"
  | "cacheColdUnread"
  | "cacheTtl"
  | "contextReadAt"
  | "contextTokens"
  | "harness"
  | "keepAliveEnabled"
  | "keepAliveSent"
  | "keepAliveStopped"
  | "keepAliveTurn"
  | "lastRequestAt"
  | "model"
  | "status"
>;

export const isKeepAlive = (
  message: NeutralUserMessage | null | undefined
): boolean =>
  message?.origin?.kind === "system" && message.origin.name === "keepalive";

const keepAliveCap = (
  row: Pick<KeepAliveColumns, "cacheTtl" | "model">
): number => {
  // A ratio of two rates of one moment: the provider's clock cancels out.
  const rates = row.model ? resolveRates(row.model, Date.now()) : null;
  if (!rates || rates.cacheRead <= 0) {
    return row.cacheTtl === "1h" ? 20 : 12;
  }
  return Math.floor(
    (row.cacheTtl === "1h" ? rates.cacheWrite1h : rates.cacheWrite) /
      rates.cacheRead
  );
};

/**
 * Whether the hub measured `row`'s cache cold: a keep-alive ping missed it
 * since the last real turn (`cacheColdAt`), or such a reading is kept as not
 * read (`cacheColdUnread`, migration 0425), which only a miss wrote.
 */
const measuredCold = (
  row: Pick<KeepAliveRow, "cacheColdAt" | "cacheColdUnread">
): boolean => row.cacheColdAt !== null || row.cacheColdUnread !== null;

/** What the hub measured of `row`'s cold cache, as the wire says it; null when none reads. */
const coldReading = (
  row: Pick<KeepAliveRow, "cacheColdAt" | "cacheColdReason">
): KeepAlive["cold"] =>
  row.cacheColdAt !== null && row.cacheColdReason !== null
    ? { reason: row.cacheColdReason, at: row.cacheColdAt }
    : null;

/**
 * A session's prompt cache as every reader of it decides (hub decide.ts,
 * the cold check, keep-alive): warm until a moment, cold, or unknown. It
 * lives from the session's last request, inside a turn as between turns: a
 * working turn's requests write it every few seconds, and a turn parked on
 * the person's answer (an ask, a permission prompt) makes none, so it goes
 * cold there as anywhere. Cold is proven only by a measurement: a
 * keep-alive ping that missed (`measuredCold`), or a measured lifetime (its
 * TTL from its last request) that has run out, or its harness's longest
 * lifetime past since its last request or turn. Anything else is unknown,
 * and unknown is never priced as warm or as free (decide.ts).
 */
export type CacheState =
  | { kind: "warm"; inTurn: boolean; until: number }
  | { kind: "cold" }
  | { kind: "unknown" };

/** A measured TTL's lifetime, ms. */
const ttlMs = (ttl: string | null): number | null => {
  if (ttl === "1h") {
    return HOUR_MS;
  }
  return ttl === "5m" ? 300_000 : null;
};

/** The shortest lifetime any harness's prompt cache holds: a request this recent left it warm, its lifetime measured or not. */
const SHORTEST_LIFE_MS = 300_000;

/**
 * The cache of a session inside a turn, from that turn's last request
 * (`requestAt`): warm for its lifetime (`life`, or the shortest any cache
 * holds when unmeasured) after it, cold once a measured lifetime or its
 * harness's longest has run out, else unknown. Unknown too when this hub
 * heard none of the turn's requests (it started before the hub did).
 * Never the measured-cold reading between turns: a working turn wrote the
 * cache again since.
 */
const turnCache = (
  harness: KeepAliveRow["harness"],
  life: number | null,
  requestAt: number | null,
  now: number
): CacheState => {
  if (requestAt === null) {
    return { kind: "unknown" };
  }
  const until = requestAt + (life ?? SHORTEST_LIFE_MS);
  if (until > now) {
    return { kind: "warm", inTurn: true, until };
  }
  const longest = life ?? traitsOf(harness).promptCacheMaxMs;
  return longest !== null && requestAt + longest <= now
    ? { kind: "cold" }
    : { kind: "unknown" };
};

/**
 * How a session's turns stand, as {@link cacheState} reads them: whether a
 * turn is under way (`midTurn`, read off its process), when that turn last
 * sent a request (`requestAt`, epoch ms, turn-state.ts; null when this hub
 * heard none of it), and when its last turn ended (`lastTurnAt`, ISO) when
 * the caller knows it.
 */
export interface TurnReading {
  lastTurnAt?: string | null;
  midTurn: boolean;
  requestAt?: number | null;
}

/**
 * THE ONE CACHE TEST ({@link CacheState}): `row`'s prompt cache at `now`,
 * from how its turns stand (`how`).
 */
export const cacheState = (
  row: Pick<
    KeepAliveRow,
    "cacheColdAt" | "cacheColdUnread" | "cacheTtl" | "harness" | "lastRequestAt"
  >,
  how: TurnReading,
  now: number
): CacheState => {
  const life = ttlMs(row.cacheTtl);
  if (how.midTurn) {
    return turnCache(row.harness, life, how.requestAt ?? null, now);
  }
  if (measuredCold(row)) {
    return { kind: "cold" };
  }
  if (life !== null && row.lastRequestAt) {
    const until = row.lastRequestAt.getTime() + life;
    return until > now
      ? { kind: "warm", inTurn: false, until }
      : { kind: "cold" };
  }
  // Without a measured lifetime only its harness's longest proves expiry.
  const longest = traitsOf(row.harness).promptCacheMaxMs;
  if (longest !== null && how.lastTurnAt) {
    return new Date(how.lastTurnAt).getTime() + longest <= now
      ? { kind: "cold" }
      : { kind: "unknown" };
  }
  return { kind: "unknown" };
};

/**
 * The cold check (`handoff`'s, delegation-actions.ts `checkCold`) by
 * {@link cacheState}: a session is refused for cold only when cold is
 * proven. Never measured is not cold here (c262ee706): a session nothing
 * timed is never refused for it. A session it calls cold is one the hub
 * hands no work to without asking, and one whose artifacts its project
 * takes up (artifacts/service.ts `leftFor`).
 */
export const provenCold = (row: KeepAliveRow, how: TurnReading): boolean =>
  cacheState(row, how, Date.now()).kind === "cold";

/** How long before its cache expires a session is pinged. */
const pingMargin = (row: Pick<KeepAliveColumns, "cacheTtl">): number =>
  row.cacheTtl === "1h" ? 600_000 : 60_000;

/**
 * When `row`'s next ping is due, from its facts alone: its measured cache's
 * expiry (its TTL from its last request) less the margin; null while none is
 * planned (off, asleep, measured cold, or no measured lifetime). A time
 * already past is one that came due.
 */
const pingDue = (row: KeepAliveColumns): number | null => {
  const life = ttlMs(row.cacheTtl);
  return row.keepAliveEnabled &&
    row.status !== "sleeping" &&
    !measuredCold(row) &&
    life !== null &&
    row.lastRequestAt
    ? row.lastRequestAt.getTime() + life - pingMargin(row)
    : null;
};

/**
 * A session's keep-alive as the board carries it (core `KeepAlive`): its
 * facts and the deadline of its next ping, never a state read off the
 * clock, so its row moves only when one of these does.
 */
const keepAliveFacts = (row: KeepAliveColumns): KeepAlive => ({
  on: row.keepAliveEnabled,
  stopped: row.keepAliveStopped ?? null,
  nextAt: pingDue(row),
  sent: row.keepAliveSent,
  cap: keepAliveCap(row),
  ttl: row.cacheTtl,
  cold: coldReading(row),
  contextTokens: row.contextTokens,
  contextReadAt: row.contextReadAt?.getTime() ?? null,
});

/**
 * `row` as a reader is handed it: the columns its keep-alive is read from
 * left out, and its keep-alive facts ({@link keepAliveFacts}) in their place.
 */
export const withKeepAliveFacts = <Row extends KeepAliveColumns>(row: Row) => {
  const {
    keepAliveEnabled: _enabled,
    keepAliveSent: _sent,
    keepAliveStopped: _stopped,
    cacheColdAt: _coldAt,
    cacheColdReason: _coldReason,
    cacheColdUnread: _coldUnread,
    keepAliveTurn: _turn,
    cacheTtl: _ttl,
    contextTokens: _contextTokens,
    contextReadAt: _contextReadAt,
    ...visible
  } = row;
  return { ...visible, keepAlive: keepAliveFacts(row) };
};

/** What the scheduler reads of a session's keep-alive now: whether a ping is due, and when. */
interface KeepAliveDue {
  nextAt: number | null;
  state: "off" | "waiting" | "cold" | "paused-usage" | "asleep" | "stopped-cap";
}

/** Clock and account reading are explicit: this function sends and writes nothing. */
export const keepAliveState = (
  row: KeepAliveRow,
  usage: ClaudeLimits | undefined,
  now: number
): KeepAliveDue => {
  if (!row.keepAliveEnabled) {
    return { state: row.keepAliveStopped ?? "off", nextAt: null };
  }
  if (row.status === "sleeping") {
    return { state: "asleep", nextAt: null };
  }
  if (measuredCold(row)) {
    return { state: "cold", nextAt: null };
  }
  // Paused while the window that binds the session (core `headroom` over
  // its bearing windows, whichever the account has) is critical.
  const binds = headroom(
    bearing(usage?.windows ?? [], modelScope(row.model), now, null),
    now
  )?.window;
  if (binds?.severity === "critical") {
    return { state: "paused-usage", nextAt: null };
  }
  const cache = cacheState(row, { midTurn: false }, now);
  return cache.kind === "warm"
    ? { state: "waiting", nextAt: cache.until - pingMargin(row) }
    : { state: "cold", nextAt: null };
};

/** Usage counts include uncached input plus cache reads and writes, as Claude reports them. */
export const keepAliveUsage = promptCacheUsage;

/**
 * What a turn's result says of a session's cache. `context`: the tokens its
 * last request sent, the session's context as it stood (uncached input plus
 * cache reads and writes of that one request); undefined leaves the context
 * as it was. Never the result's own usage for a real turn: Claude Code's
 * result sums every request of the turn, so a turn of 30 tool calls reads 30
 * contexts there (2026-10-22: "re-reading 242,373k tokens" for one session).
 */
export const keepAliveResult = (
  row: KeepAliveRow,
  result: NeutralResultMessage,
  ping: boolean,
  context: number | undefined
) => {
  const { cache = { read: 0, write: 0 } } = result;
  const usage = keepAliveUsage(result);
  const { input, read } = usage;
  const at = Date.now();
  // Cold is measured: a ping that missed its cache (a changed prefix) is
  // cold, and a real turn, whose requests wrote whatever they missed, is warm.
  // Either replaces a reading kept as not read; anything else leaves it.
  let cold: Pick<
    Parameters<DbShape["updateKeepAlive"]>[1],
    "cacheColdAt" | "cacheColdReason" | "cacheColdUnread"
  > = {};
  if (ping && !cacheHit(usage)) {
    cold = {
      cacheColdAt: at,
      cacheColdReason:
        input > 0
          ? `ping read ${Math.round((read / input) * 100)}%`
          : "ping reported no cache usage",
      cacheColdUnread: null,
    };
  } else if (
    !ping &&
    result.cache &&
    result.lastRequestAt !== undefined &&
    input > 0
  ) {
    cold = { cacheColdAt: null, cacheColdReason: null, cacheColdUnread: null };
  }
  const sent = ping ? row.keepAliveSent + 1 : 0;
  // An unknown lifetime remains unknown. Cache reads retain the last observed write lifetime.
  let ttl = row.cacheTtl;
  if ((cache.write1h ?? 0) > 0) {
    ttl = "1h";
  }
  if ((cache.write5m ?? 0) > 0) {
    ttl = "5m";
  }
  let stopped = row.keepAliveStopped;
  if (ping && sent >= keepAliveCap({ ...row, cacheTtl: ttl })) {
    stopped = "stopped-cap";
  }
  if (OVER_STATUSES.has(row.status)) {
    stopped = null;
  }
  return {
    cacheTtl: ttl,
    ...(context === undefined
      ? {}
      : { contextTokens: context, contextReadAt: new Date() }),
    ...(result.lastRequestAt === undefined
      ? {}
      : { lastRequestAt: new Date(result.lastRequestAt) }),
    keepAliveSent: sent,
    ...cold,
    keepAliveTurn: null,
    keepAliveStopped: stopped,
    ...(stopped ? { keepAliveEnabled: false } : {}),
  } satisfies Parameters<DbShape["updateKeepAlive"]>[1];
};

interface KeepAlivePorts {
  idle: (row: KeepAliveRow) => boolean | Promise<boolean>;
  /** Runs the scheduler's one timer until the hub closes. */
  lifetime: HubLifetimeShape;
  /**
   * Reads the accounts once and answers the limits each session runs under
   * (its account's). Taken once per pass over the rows, not once per row.
   */
  limits: () => (row: KeepAliveRow) => ClaudeLimits | undefined;
  /** One session's row, read again by its key. */
  row: (id: string) => KeepAliveRow | undefined;
  /**
   * The sessions whose keep-alive is on, and no others: a row with it off is
   * neither sent to nor planned for. Read on every wake, and a wake follows
   * every session's turn: all 2,600 rows each time held the hub's thread for
   * seconds when twenty turns ended together (2026-10-09).
   */
  rows: () => KeepAliveRow[];
  send: (envelope: HubEnvelope<"send">) => unknown;
}

const tickKeepAlive = async (
  ports: KeepAlivePorts,
  now = Date.now()
): Promise<void> => {
  for (const row of ports.rows()) {
    if (!(
      row.keepAliveEnabled &&
      traitsOf(row.harness).promptCacheMaxMs !== null &&
      row.status === "running" &&
      !row.keepAliveTurn
    )) {
      continue;
    }
    // A process reading can await a machine. Re-read the stored schedule after
    // it answers: a real send, toggle or result may have moved it meanwhile.
    if (!(await ports.idle(row))) {
      continue;
    }
    const fresh = ports.row(row.id);
    if (!(
      fresh?.keepAliveEnabled &&
      fresh.status === "running" &&
      !fresh.keepAliveTurn
    )) {
      continue;
    }
    const limits = ports.limits();
    const due = keepAliveState(fresh, limits(fresh), Date.now());
    if (
      due.state !== "waiting" ||
      due.nextAt === null ||
      Date.now() < due.nextAt
    ) {
      continue;
    }
    console.info(
      `[keepalive] ${fresh.id}: send due ${new Date(due.nextAt).toISOString()} at ${new Date().toISOString()}`
    );
    const state = keepAliveState(row, limits(row), now);
    if (
      state.state !== "waiting" ||
      state.nextAt === null ||
      now < state.nextAt
    ) {
      continue;
    }
    ports.send({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          keepAlive: true,
          origin: { kind: "system", name: "keepalive" },
          parent_tool_use_id: null,
          message: {
            role: "user",
            // @limit measured: 4 hex characters of a random UUID are 16 bits; one hub's ids of this kind share the namespace, so two collide after about 2^8 ids
            content: `Keep-alive ${crypto.randomUUID().slice(0, 4)}: automatic message that keeps this session's prompt cache warm. Do not use any tool and do not continue any work. Reply with exactly: ok`,
          },
        },
      },
    });
  }
};

/**
 * One wait at a time, for the next due time: every deadline is re-derived
 * from the stored request, so the wait is let go and armed again whenever a
 * pass ends or a wake is asked.
 */
export const createKeepAliveScheduler = (ports: KeepAlivePorts) => {
  const { lifetime } = ports;
  /** The armed wait for the next pass; none while a pass runs. */
  let next: Fiber.Fiber<void> | undefined;
  let running = false;
  const plan = () => {
    next?.interruptUnsafe();
    const now = Date.now();
    // Retry due-but-busy/unreachable sessions, while a future due time gets an
    // exact wake even when it falls between those retry ticks.
    let at = now + 30_000;
    const limits = ports.limits();
    for (const row of ports.rows()) {
      const state = keepAliveState(row, limits(row), now);
      if (
        state.state === "waiting" &&
        state.nextAt !== null &&
        state.nextAt > now
      ) {
        at = Math.min(at, state.nextAt);
      }
    }
    next = lifetime.fork(
      "keep-alive wake",
      Effect.sleep(Math.max(0, at - now)).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            // This wait is over: the pass below is no longer it to let go.
            next = undefined;
            return pass;
          })
        )
      )
    );
  };
  /** One pass over the sessions, unless one runs; the next wait armed as it ends. */
  const pass: Effect.Effect<void> = Effect.suspend(() => {
    if (running || lifetime.closed()) {
      return Effect.void;
    }
    running = true;
    next?.interruptUnsafe();
    next = undefined;
    return Effect.tryPromise({
      try: () => tickKeepAlive(ports),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          console.error("[keepalive] schedule wake failed:", error);
        })
      ),
      Effect.ensuring(
        Effect.sync(() => {
          running = false;
          // A pass cut by close arms nothing.
          if (!lifetime.closed()) {
            plan();
          }
        })
      )
    );
  });
  // Boot and reconnect use this same path: an overdue warm schedule runs as
  // soon as its machine can supply an idle receipt, not after another margin.
  // Startup does not wait for machines to reconnect.
  lifetime.fork("keep-alive wake", pass);
  return {
    /** The promise edge of a pass now ({@link pass}). */
    wake: (): Promise<void> => lifetime.run(pass),
  };
};
