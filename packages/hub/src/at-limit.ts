import {
  type Account,
  type AccountBench,
  type AccountMove,
  type AccountProvider,
  type AccountReading,
  type AtLimit,
  accountName,
  type ContinueStep,
  clockWords,
  type LimitWindow,
  modelScope,
  type NeutralOrigin,
  namedAccount,
  type RebalanceNotice,
  type WaitReason,
  windowWords,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { createRebalancer, readForecast, reReadCost } from "./rebalance";

/**
 * A running Claude session whose account reached its limit: its turn was
 * refused. It is held until the reset, moved whole to another account, or
 * continued there from a summary, whichever costs less than waiting, by its
 * provider's `atLimit` routing. Moving means re-reading the context without
 * its cache, since caches are per organization and workspace
 * (platform.claude.com/docs/en/build-with-claude/prompt-caching: "Different
 * organizations never share caches"), unless both accounts are in one
 * organization. A context too large to re-read continues from a summary
 * written ahead of the limit, on the account that is about to run out, while
 * it still has room. Every outcome is one line in its transcript saying what
 * it cost (core `AccountMove`). Moves happen only between turns.
 *
 * The same controller rebalances before any limit: when an account signs in
 * or comes back from its bench, and at every look, running sessions on
 * accounts forecast to run out move to where placement would carry them,
 * when moving is free (their cache carries, or is cold) or cheap (under the
 * floor and affordable), and held sessions are looked at again at once.
 *
 * It also answers a Claude session whose turn died on its account's
 * credential. Refused for good (server.ts `settleRefusal` signed the account
 * out on its machine): the session moves whole the same way, to an account
 * of the same organization first, and carries on there; with none to take
 * it, it is held, what it is sent waiting at the hub, until its account is
 * signed in again or another comes free. A token refresh another Claude Code
 * process held: the session carries on where it is a minute later, once.
 */

export type LimitRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/**
 * Why a carry left a session's conversation where it was (server.ts
 * `moveRowsToAccount`), in words a line quotes after "can't move …: ".
 * `running`: its Claude Code process still runs there and keeps something
 * a stop would lose, so a move waits for its next turn's end rather than
 * failing.
 */
export interface Kept {
  running: boolean;
  why: string;
}

export type AtLimitDecision =
  /** Held until `until`: the reset, or the next look when none was named. */
  | { action: "wait"; until: number; why: WaitReason }
  | { action: "move"; sameOrganization: boolean; targetId: string }
  | { action: "continue"; targetId: string };

export interface DecideInput {
  /** The last context size its harness reported; null when none has been. */
  contextTokens: number | null;
  current: Account;
  /** A fork reads its origin's cache: it never moves on its own. */
  forked: boolean;
  now: number;
  policy: AtLimit;
  /** When the window that refused it resets; null when nothing said. */
  resetAt: number | null;
  /** Who placement would carry it on, excluding `current`; none has room. */
  target: Account | undefined;
}

const MINUTE_MS = 60_000;
/** How often a held session is looked at again before its reset. */
const RECHECK_MS = 5 * MINUTE_MS;
/** How soon a refused session still mid-turn on its machine is looked at again… */
const SETTLE_MS = 5000;
/** …for this long: a session busy past it started a turn its account took. */
const SETTLE_FOR_MS = 2 * MINUTE_MS;
/**
 * How long a turn a token refresh race cut waits before it goes again:
 * Claude Code's own words for it, "This is usually transient; retry in a
 * minute".
 */
const RACE_RETRY_MS = MINUTE_MS;

/**
 * Why a session leaves its account: its limit refused a turn, or Claude Code
 * refused the account's credential for good. Either way it carries on where
 * it moves to.
 */
type Cause = "limit" | "refused";

/** Two accounts of one organization share its prompt cache and its thinking. */
export const sameOrganization = (a: Account, b: Account): boolean =>
  !!a.identity?.organization &&
  a.identity.organization === b.identity?.organization;

/**
 * The share of its prompt a session's first request reads from cache after
 * it moves between two accounts of one organization, as measured: the
 * fleet's own transcripts (Claude Code 2.1.289, SDK), requests over 60k sent
 * under 50 minutes after the last, a new process on another account of the
 * same organization: 12 hits of 14, e.g. 305,611 prompt tokens with 294,539
 * read and 11,070 written (at-limit check 1, 2026-10-09). Measured again,
 * the new figure goes here and nothing else changes: below
 * {@link CACHE_KEPT_AT}, a move within one organization costs what one
 * across organizations does, and is decided as one.
 */
const SAME_ORGANIZATION_CARRY_CACHE_READ = 294_539 / 305_611;
/** A request reads its cache when nearly all its prompt comes from it (keep-alive's own test). */
const CACHE_KEPT_AT = 0.9;

/** Whether moving a session from `a` to `b` keeps its prompt cache: one organization, whose carries read it. */
export const cacheCarries = (a: Account, b: Account): boolean =>
  sameOrganization(a, b) && SAME_ORGANIZATION_CARRY_CACHE_READ >= CACHE_KEPT_AT;

/**
 * The policy's steps in order: a fork or the policy off waits; nothing to
 * move to waits; a move that keeps the cache ({@link cacheCarries}: one
 * organization) moves whole whatever the size; a reset
 * within `waitMinutes` waits; a context under `moveWholeUnderK` moves whole;
 * anything larger continues from a summary. A context never reported moves
 * whole: there is nothing to say a summary would be cheaper.
 */
export const decideAtLimit = (input: DecideInput): AtLimitDecision => {
  const { policy, now, resetAt, target, current, contextTokens } = input;
  const until = resetAt ?? now + policy.waitMinutes * MINUTE_MS;
  if (input.forked) {
    return { action: "wait", until, why: "fork" };
  }
  if (!policy.move) {
    return { action: "wait", until, why: "off" };
  }
  if (!target) {
    return { action: "wait", until, why: "full" };
  }
  if (cacheCarries(current, target)) {
    return { action: "move", targetId: target.id, sameOrganization: true };
  }
  if (resetAt !== null && resetAt - now <= policy.waitMinutes * MINUTE_MS) {
    return { action: "wait", until, why: "soon" };
  }
  if (contextTokens === null || contextTokens < policy.moveWholeUnderK * 1000) {
    return { action: "move", targetId: target.id, sameOrganization: false };
  }
  return { action: "continue", targetId: target.id };
};

/** The windows that limit a session on `model`: the 5-hour, the week, and its model's week. */
const windowsFor = (
  reading: AccountReading | undefined,
  model: string | null,
  now: number
): LimitWindow[] => {
  const scope = modelScope(model ?? undefined);
  return (reading?.windows ?? []).filter(
    (window) =>
      (window.kind === "session" ||
        window.kind === "weekly_all" ||
        (window.kind === "weekly_scoped" && window.scopeLabel === scope)) &&
      (!window.resetsAt || Date.parse(window.resetsAt) > now)
  );
};

/** The window at its limit that resets last: the one that refused the session. */
const fullWindow = (
  reading: AccountReading | undefined,
  model: string | null,
  now: number
): LimitWindow | undefined =>
  windowsFor(reading, model, now)
    .filter((window) => window.percent >= 100 && window.resetsAt)
    .reduce<LimitWindow | undefined>(
      (latest, window) =>
        !latest ||
        Date.parse(window.resetsAt as string) >
          Date.parse(latest.resetsAt as string)
          ? window
          : latest,
      undefined
    );

/**
 * When `accountId` takes a session on `model` again: the latest bench that
 * holds it, else the latest reset among its windows at their limit. Null when
 * nothing named one.
 */
export const refusedUntil = (
  bench: AccountBench[],
  reading: AccountReading | undefined,
  accountId: string,
  model: string | null,
  now: number
): number | null => {
  const scope = modelScope(model ?? undefined);
  const benched = bench
    .filter(
      (one) =>
        one.accountId === accountId &&
        one.until > now &&
        (one.scope === null || one.scope === scope)
    )
    .map((one) => one.until);
  const full = fullWindow(reading, model, now);
  const latest = [
    ...benched,
    ...(full ? [Date.parse(full.resetsAt as string)] : []),
  ];
  return latest.length > 0 ? Math.max(...latest) : null;
};

/** The window of `reading` nearest its limit for a session on `model`. */
export const nearestLimit = (
  reading: AccountReading | undefined,
  model: string | null,
  now: number
): LimitWindow | undefined =>
  windowsFor(reading, model, now).reduce<LimitWindow | undefined>(
    (nearest, window) =>
      !nearest || window.percent > nearest.percent ? window : nearest,
    undefined
  );

/**
 * A summary kept for a session at its limit, handed to its continuation:
 * used only if the conversation still ends its summarised part at `covers`.
 */
export interface KeptSummary {
  /** The last transcript entry it covers. */
  covers: string;
  /** The window's percent when it was written ahead of the limit; null: at a move. */
  percent: number | null;
  text: string;
  /** The account whose summariser wrote it. */
  writtenOn: string;
}

/** A summary its summariser wrote: the words, and the last transcript entry they cover. */
export interface Summarised {
  covers: string;
  text: string;
}

/** What the hub does for the controller: the parts that reach machines. */
export interface AtLimitPorts {
  /** The account `row` runs on now. */
  accountOf: (row: LimitRow) => string | undefined;
  /**
   * Carries out the move a person asked of `row` ({@link handMove}) now,
   * between its turns: its conversation carried whole to that account, and
   * once there it carries on past the limit that stopped it. Settled when
   * the carry has: a process that still runs owes the move again.
   */
  carryHandMove: (row: LimitRow) => Promise<void>;
  changed: () => void;
  /**
   * Continues `row` on `accountId` from a summary: the same session goes on
   * there in a fresh conversation seeded with it. `kept` when it still
   * covers the conversation as it stands, otherwise one written there and
   * kept for `row` until `keepUntil`, so a retry reads it again rather than
   * writing another. Throws when `row` cannot be read to start one; a later
   * step that fails comes back as {@link createAtLimit}'s
   * `continuationFailed`.
   */
  continueOn: (
    row: LimitRow,
    accountId: string,
    kept: KeptSummary | undefined,
    keepUntil: number
  ) => Promise<void>;
  /** Whether a continuation of `row` is under way: nothing else is done to it meanwhile. */
  continuing: (row: LimitRow) => boolean;
  db: DbShape;
  /**
   * The account a person moved `row` to and it has not reached yet (server.ts
   * `moveByHand`, owed to its turn's end): while there is one, the move is
   * the only thing done to it at its limit. Undefined when none is owed.
   */
  handMove: (row: LimitRow) => string | undefined;
  /** Whether `row` is between turns: nothing running and nothing waiting on it. */
  idle: (row: LimitRow) => Promise<boolean>;
  /** Runs the next look and each settling session's timer until the hub closes. */
  lifetime: HubLifetimeShape;
  /** A machine as a sentence names it. */
  machineName: (machineId: string) => string;
  /**
   * Relaunches `row` on `accountId`, its conversation with it, and, when
   * its limit or a sign-in failure stopped it (`carryOn` says which), has it
   * carry on; a session moved between turns before any limit waits for its
   * next message. Answers why when it did not move: `row` is still on its
   * account then.
   */
  move: (
    row: LimitRow,
    accountId: string,
    carryOn: false | "limit" | "signin"
  ) => Promise<Kept | undefined>;
  /** `row` as a line names it: its title. */
  named: (row: LimitRow) => string;
  /** Writes one line into `row`'s transcript; under `id`, the line already written there is what it says now. */
  note: (row: LimitRow, move: AccountMove, id?: string) => void;
  /** What adding an account set moving, for the Accounts page. */
  noticed: (notice: RebalanceNotice) => void;
  /**
   * Owes `row` a move to `accountId` at its turn's end, or its next start
   * (server.ts `relaunchAtTurnEnd`, the way a person's move mid-turn waits):
   * `move` is the line written once it has moved; `why` says why it waits.
   */
  owe: (
    row: LimitRow,
    accountId: string,
    move: AccountMove,
    why: string
  ) => void;
  /** The account each session owing a move, or with a launch on its way, goes to, by session. */
  owed: () => ReadonlyMap<string, string>;
  /** A move off a refused sign-in, said to whoever hears `row`'s reports. */
  refusedMove: (row: LimitRow, move: AccountMove) => void;
  /**
   * Has `row` carry on, on the account it is on, where what `stopped` it
   * left it: its account's limit, or a sign-in failure.
   */
  resume: (row: LimitRow, stopped: "limit" | "signin") => void;
  /**
   * Who sent what `row`'s last turn read: the newest message it was handed.
   * Undefined when it was handed none.
   */
  startedBy: (row: LimitRow) => NeutralOrigin | undefined;
  /**
   * A summary of `row` written on `accountId`, its own while it has room.
   * Undefined when nothing comes before its last turns.
   */
  summarise: (
    row: LimitRow,
    accountId: string
  ) => Promise<Summarised | undefined>;
  /**
   * Who would carry `row` off `accountId`: placement for its kind, excluding
   * that account, among the accounts `among` admits when it is given.
   */
  target: (
    row: LimitRow,
    accountId: string,
    among?: (account: Account) => boolean
  ) => string | null;
  /** Takes the line `id` out of `row`'s transcript. */
  unnote: (row: LimitRow, id: string) => void;
  /** Whether `row`'s prompt cache is still warm: a move off its account then re-reads it. */
  warm: (row: LimitRow) => boolean;
}

/** A move or continuation as a line says what waits: "move from A to B". */
const actionWords = (
  decision: Exclude<AtLimitDecision, { action: "wait" }>,
  current: Account,
  target: Account
): string =>
  decision.action === "move"
    ? `move from ${accountName(current)} to ${accountName(target)}`
    : `go on from a summary on ${accountName(target)}`;

/** What a failure said, as a line quotes it. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A session past caring: its process will not be woken by anything the hub does here. */
const over = (row: LimitRow | undefined): boolean =>
  !row || ["stopped", "discarded", "error"].includes(row.status);

/** The carry-on the hub sends at a reset: a turn the limit itself resumed. */
const CARRY_ON_ORIGIN = "limit";

/**
 * Whether a turn its account refused was started by the hub's own word
 * rather than a person's or a session's: such a turn asked nothing of the
 * session that is worth another account, so it is neither moved nor
 * continued, and waits for a person or its parent to write.
 */
const noticeTurn = (origin: NeutralOrigin | undefined): boolean =>
  origin?.kind === "system" && origin.name !== CARRY_ON_ORIGIN;

export const createAtLimit = (ports: AtLimitPorts) => {
  const { db, lifetime } = ports;
  const rowOf = (id: string): LimitRow | undefined =>
    db.getInstancesByIds([id])[0];
  let timer: HubTimer | undefined;
  /** Sessions being moved or continued right now: each is acted on once at a time. */
  const acting = new Set<string>();
  /** Refused sessions still mid-turn on their machine, by when they stop being looked at. */
  const settling = new Map<string, { timer: HubTimer; until: number }>();
  /**
   * Sessions whose turn a token refresh race cut, from then until a turn of
   * theirs ends on anything else: the timer that sends it again, gone once
   * it has gone. A second race meanwhile is the turn's end.
   */
  const raced = new Map<string, HubTimer | undefined>();

  const readingOf = (accountId: string): AccountReading | undefined =>
    db.accounts.readings().find((one) => one.accountId === accountId);

  /** The policy for `row` on `accountId`, and what decides it. */
  const decide = (row: LimitRow, current: Account, now: number) => {
    const policy = db.accounts.routing(current.provider).atLimit;
    const resetAt = refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    );
    const forked = row.forkedFrom !== null;
    const targetId =
      policy.move && !forked ? ports.target(row, current.id) : null;
    return decideAtLimit({
      policy,
      forked,
      current,
      target: targetId ? db.accounts.get(targetId) : undefined,
      contextTokens: row.contextTokens,
      resetAt,
      now,
    });
  };

  /**
   * Where `row` goes off `current`, whose credential Claude Code refused:
   * an account placement would carry it to in `current`'s organization
   * first, whose cache comes along, else any. Neither the limit's policy
   * nor a fork's tie to its origin's cache keeps it on an account that
   * cannot run it. Undefined when none can take it.
   */
  const refusedTarget = (
    row: LimitRow,
    current: Account
  ): { target: Account; sameOrganization: boolean } | undefined => {
    const targetId =
      ports.target(row, current.id, (one) => sameOrganization(one, current)) ??
      ports.target(row, current.id);
    const target = targetId ? db.accounts.get(targetId) : undefined;
    return target
      ? { target, sameOrganization: cacheCarries(current, target) }
      : undefined;
  };

  /** Whether `current` is signed in on `row`'s machine: not, once Claude Code refused its credential there. */
  const signedIn = (row: LimitRow, current: Account): boolean =>
    db.accounts
      .signins()
      .some(
        (one) =>
          one.accountId === current.id &&
          one.machineId === row.machineId &&
          one.state === "signed-in"
      );

  /** Holds `row` until `until`; the line is written once per hold. */
  const hold = (
    row: LimitRow,
    current: Account,
    decision: Extract<AtLimitDecision, { action: "wait" }>
  ): void => {
    const held = db.atLimit.hold(row.id);
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: decision.until,
    });
    if (!held) {
      ports.note(row, {
        kind: "waiting",
        account: namedAccount(current),
        until: decision.until,
        why: decision.why,
        tokens: row.contextTokens,
      });
    }
  };

  /**
   * Holds `row`, whose credential Claude Code refused and which no other
   * account can take, with no reset to wait for (`until` null): what it is
   * sent waits at the hub until `current` is signed in again or another
   * account comes free ({@link lookAt}). Its line, the one place the
   * refusal is told, is written once per hold.
   */
  const holdRefused = (row: LimitRow, current: Account): void => {
    const held = db.atLimit.hold(row.id);
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: null,
    });
    if (held?.until !== null) {
      ports.note(row, { kind: "signed-out", account: namedAccount(current) });
    }
  };

  /**
   * Looks at a refused session again shortly: its machine still had its turn
   * running when the refusal came. Given up once {@link SETTLE_FOR_MS} has
   * passed: a session busy that long is in a turn its account took.
   */
  const settle = (
    row: LimitRow,
    current: Account,
    cause: Cause,
    /** What waits for its turn's end, as a line says it: "move from A to B". */
    what: string
  ): void => {
    const was = settling.get(row.id);
    const until = was?.until ?? Date.now() + SETTLE_FOR_MS;
    if (was) {
      lifetime.cancel(was.timer);
    } else {
      console.info(
        `[at-limit] ${ports.named(row)} can't ${what} yet: it is inside a turn, and a session is moved or continued only between turns. The hub looks again every ${SETTLE_MS / 1000} s for ${SETTLE_FOR_MS / 60_000} minutes.`
      );
    }
    if (lifetime.closed() || Date.now() >= until) {
      settling.delete(row.id);
      console.info(
        `[at-limit] ${ports.named(row)} is still inside a turn ${SETTLE_FOR_MS / 60_000} minutes after ${accountName(current)} refused one, so the hub stops looking: a turn running that long is one ${accountName(current)} took. Its next refused turn is answered when it ends.`
      );
      return;
    }
    const next = lifetime.after(SETTLE_MS, () => {
      const fresh = rowOf(row.id);
      if (over(fresh) || !fresh) {
        settling.delete(row.id);
        return;
      }
      act(fresh, current, cause).catch((error: unknown) => {
        console.error(failedWords(fresh, current, error));
      });
    });
    settling.set(row.id, { timer: next, until });
  };

  /** The line a failure of the controller's own answer to `current`'s limit writes. */
  const failedWords = (
    row: LimitRow,
    current: Account,
    error: unknown
  ): string =>
    `[at-limit] ${ports.named(row)}: the hub's answer to ${accountName(current)}'s limit failed: ${messageOf(error)}. It stays on ${accountName(current)} as it was; the next look at the limit decides again.`;

  /** The line a move writes: what it cost, and the window, or the refused sign-in, that sent it. */
  const movedNote = (
    row: LimitRow,
    current: Account,
    target: Account,
    sameOrg: boolean,
    now: number,
    cause: Cause
  ): AccountMove => {
    const full =
      cause === "limit"
        ? fullWindow(readingOf(current.id), row.model, now)
        : undefined;
    const cost = sameOrg
      ? undefined
      : reReadCost(readForecast(db, target.provider, now), row, target);
    return {
      kind: "moved",
      from: namedAccount(current),
      to: namedAccount(target),
      sameOrganization: sameOrg,
      ...(cost ? { cost } : {}),
      ...(cause === "refused" ? { because: { kind: "refused" as const } } : {}),
      tokens: row.contextTokens,
      window: full ? windowWords(full) : null,
      resetsAt:
        cause === "limit"
          ? refusedUntil(
              db.accounts.bench(now),
              readingOf(current.id),
              current.id,
              row.model,
              now
            )
          : null,
    };
  };

  /** When `row` may go on on `current` again: the reset that refused it, else the next look the policy allows. */
  const holdUntil = (row: LimitRow, current: Account, now: number): number =>
    refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    ) ??
    now + db.accounts.routing(current.provider).atLimit.waitMinutes * MINUTE_MS;

  /**
   * Moving `row` whole to `target`, or continuing it there (`action`),
   * failed at `step`: it goes on in its conversation, still on `current`.
   * Its transcript says so in the words of what failed (once for the same
   * failure, however often a retry meets it again; in place of the
   * continuation's own "Summarising…" line, `line`, when it wrote one), and
   * it is held until its reset, each look deciding again whether to wait or
   * try once more. One whose credential was refused (`refused`) has no
   * reset: it is held until a look finds it an account.
   */
  const unmoved = (
    row: LimitRow,
    current: Account,
    target: Account,
    failed: { action: "move" | "continue"; step: ContinueStep },
    reason: string,
    line?: string,
    refused = false
  ): void => {
    const events = db.atLimit.events([row.id]);
    const last = events.filter((event) => event.id !== line).at(-1)?.move;
    const repeated =
      last?.kind === "unmoved" &&
      last.action === failed.action &&
      last.step === failed.step &&
      last.reason === reason &&
      last.to?.id === target.id;
    const move: AccountMove = {
      kind: "unmoved",
      action: failed.action,
      ...(refused ? { signedOut: true as const } : {}),
      from: namedAccount(current),
      to: namedAccount(target),
      step: failed.step,
      reason,
    };
    if (repeated) {
      // Said once, as the line written the first time logged itself: it
      // already says the hub tries again.
      if (line && events.some((event) => event.id === line)) {
        // Its "Summarising…" line goes, the first telling of it stands.
        ports.unnote(row, line);
      }
    } else {
      ports.note(row, move, line);
    }
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: refused ? null : holdUntil(row, current, Date.now()),
    });
    ports.changed();
    plan();
  };

  /**
   * Moves `row` whole onto `target`, its line written once it has; one that
   * did not move is held on `current` until its reset (or, its credential
   * refused, until a look finds it an account), and says why. A move off a
   * refused sign-in is also said to whoever hears its reports.
   */
  const moveWhole = async (
    row: LimitRow,
    current: Account,
    target: Account,
    oneOrganization: boolean,
    now: number,
    cause: Cause
  ): Promise<void> => {
    const refused = cause === "refused";
    const kept = await ports.move(row, target.id, refused ? "signin" : "limit");
    if (kept) {
      unmoved(
        row,
        current,
        target,
        { action: "move", step: "start" },
        kept.why,
        undefined,
        refused
      );
      return;
    }
    db.atLimit.dropSummary(row.id);
    const move = movedNote(row, current, target, oneOrganization, now, cause);
    ports.note(row, move);
    if (refused) {
      ports.refusedMove(row, move);
    }
  };

  /**
   * What is done with `row` off `current` for `cause`: at its limit, as
   * {@link decideAtLimit} says; its credential refused, a move whole to
   * {@link refusedTarget}, else a hold until there is one.
   */
  const decideFor = (
    row: LimitRow,
    current: Account,
    now: number,
    cause: Cause
  ): AtLimitDecision | undefined => {
    if (cause === "limit") {
      return decide(row, current, now);
    }
    const to = refusedTarget(row, current);
    return to
      ? {
          action: "move",
          targetId: to.target.id,
          sameOrganization: to.sameOrganization,
        }
      : undefined;
  };

  /**
   * The move a person asked of `row`, to `toId` ({@link AtLimitPorts.handMove}):
   * carried out once it is between turns, while that account can take it;
   * held until that account's reset while it cannot. Nothing else is done to
   * it at its limit meanwhile: it is neither moved elsewhere nor continued
   * from a summary, as the person chose a move.
   */
  const carryByHand = async (
    row: LimitRow,
    current: Account,
    toId: string,
    cause: Cause
  ): Promise<void> => {
    const now = Date.now();
    const target = db.accounts.get(toId);
    const full = refusedUntil(
      db.accounts.bench(now),
      readingOf(toId),
      toId,
      row.model,
      now
    );
    const from = accountName(current);
    const to = target ? accountName(target) : "the account a person chose";
    if (full !== null) {
      settling.delete(row.id);
      // Held without a transcript line of its own: its account's "waiting"
      // line would name the wrong reset, and the person's move already says
      // where it goes.
      if (db.atLimit.hold(row.id)?.until !== full) {
        console.info(
          `[at-limit] ${ports.named(row)} can't move from ${from} to ${to} yet, as a person asked: ${to} is at its limit too, until ${clockWords(full)}. It is held on ${from} and moves when ${to} resets; nothing else is done to it meanwhile.`
        );
      }
      db.atLimit.putHold({
        instanceId: row.id,
        accountId: current.id,
        until: full,
      });
      return;
    }
    // Only between turns: never inside a tool round, never over a turn
    // someone started since.
    if (!(await ports.idle(row))) {
      settle(
        row,
        current,
        cause,
        `move from ${from} to ${to}, as a person asked`
      );
      return;
    }
    const was = settling.get(row.id);
    if (was) {
      lifetime.cancel(was.timer);
      settling.delete(row.id);
    }
    console.info(
      `[at-limit] ${ports.named(row)} moves from ${from} to ${to} now, as a person asked: it is between turns and ${to} has room. Its conversation is copied whole and it carries on there.`
    );
    await ports.carryHandMove(row);
  };

  /**
   * Moves or continues `row` off `current`, or holds it, as {@link decideFor}
   * says; one a person moved, only as they asked ({@link carryByHand}).
   */
  const act = async (
    row: LimitRow,
    current: Account,
    cause: Cause = "limit"
  ): Promise<void> => {
    if (acting.has(row.id) || ports.continuing(row) || over(row)) {
      return;
    }
    acting.add(row.id);
    try {
      const byHand = ports.handMove(row);
      if (byHand) {
        await carryByHand(row, current, byHand, cause);
        return;
      }
      const now = Date.now();
      const decision = decideFor(row, current, now, cause);
      if (!decision || decision.action === "wait") {
        settling.delete(row.id);
        if (decision) {
          hold(row, current, decision);
        } else {
          holdRefused(row, current);
        }
        return;
      }
      const target = db.accounts.get(decision.targetId);
      if (!target) {
        return;
      }
      // Only between turns: never inside a tool round, never over a turn
      // someone started since.
      if (!(await ports.idle(row))) {
        settle(row, current, cause, actionWords(decision, current, target));
        return;
      }
      const was = settling.get(row.id);
      if (was) {
        lifetime.cancel(was.timer);
        settling.delete(row.id);
      }
      db.atLimit.dropHold(row.id);
      if (decision.action === "move") {
        await moveWhole(
          row,
          current,
          target,
          decision.sameOrganization,
          now,
          cause
        );
        return;
      }
      // The summary kept for it (ahead of the limit, or at a move that
      // failed), stays kept until it ends or its window resets: a retry
      // reads it again for as long as it covers the conversation.
      const kept = db.atLimit.summary(row.id);
      const summary =
        kept?.summary &&
        kept.covers &&
        kept.accountId === current.id &&
        Date.parse(kept.resetsAt) > now
          ? {
              text: kept.summary,
              covers: kept.covers,
              percent: kept.percent,
              writtenOn: kept.writtenOn,
            }
          : undefined;
      try {
        await ports.continueOn(
          row,
          target.id,
          summary,
          holdUntil(row, current, now)
        );
      } catch (error) {
        unmoved(
          row,
          current,
          target,
          { action: "continue", step: "prepare" },
          messageOf(error)
        );
      }
    } finally {
      acting.delete(row.id);
      ports.changed();
      plan();
    }
  };

  /** The account a refused session is on, when it runs on one the hub knows. */
  const currentOf = (row: LimitRow): Account | undefined => {
    const accountId = ports.accountOf(row);
    return accountId ? db.accounts.get(accountId) : undefined;
  };

  /**
   * Writes a summary ahead of the limit, on the account about to run out
   * while it still has room: the session's context is over
   * `moveWholeUnderK`, the window nearest its limit is at `prepareAtPct` and
   * resets later than `waitMinutes` from now, and no account of its
   * organization could take it whole.
   */
  const prepare = async (row: LimitRow, current: Account): Promise<void> => {
    const now = Date.now();
    const policy = db.accounts.routing(current.provider).atLimit;
    const window = nearestLimit(readingOf(current.id), row.model, now);
    if (
      !(policy.move && window?.resetsAt) ||
      row.forkedFrom !== null ||
      row.contextTokens === null ||
      row.contextTokens < policy.moveWholeUnderK * 1000 ||
      window.percent < policy.prepareAtPct ||
      Date.parse(window.resetsAt) - now <= policy.waitMinutes * MINUTE_MS
    ) {
      return;
    }
    const targetId = ports.target(row, current.id);
    const target = targetId ? db.accounts.get(targetId) : undefined;
    if (target && cacheCarries(current, target)) {
      return;
    }
    if (
      !db.atLimit.startSummary({
        instanceId: row.id,
        accountId: current.id,
        writtenOn: current.id,
        resetsAt: window.resetsAt,
        percent: Math.round(window.percent),
      })
    ) {
      return;
    }
    plan();
    try {
      const summary = await ports.summarise(row, current.id);
      if (summary) {
        db.atLimit.writeSummary(row.id, {
          covers: summary.covers,
          summary: summary.text,
        });
        console.info(
          `[at-limit] ${ports.named(row)}: its summary is written ahead of ${accountName(current)}'s limit, at ${Math.round(window.percent)}% of its ${windowWords(window)} window. If the limit refuses it, it goes on from that summary without waiting for one to be written.`
        );
      } else {
        db.atLimit.dropSummary(row.id);
      }
    } catch (error) {
      db.atLimit.dropSummary(row.id);
      console.warn(
        `[at-limit] ${ports.named(row)}: writing its summary ahead of ${accountName(current)}'s limit failed: ${messageOf(error)}. Nothing changes for it now; if the limit refuses it and it is continued, the summary is written then.`
      );
    }
  };

  /** Why a kept summary goes now, in words; nothing while it is still wanted. */
  const discardWhy = (
    kept: { accountId: string; resetsAt: string },
    row: LimitRow | undefined,
    named: string,
    now: number
  ): string | undefined => {
    if (!row || over(row)) {
      return "the session has ended";
    }
    if (Date.parse(kept.resetsAt) <= now) {
      return `${named}'s window reset before it was needed`;
    }
    return ports.accountOf(row) === kept.accountId
      ? undefined
      : `it runs on another account now, not ${named}`;
  };

  /** Drops each kept summary whose window reset first, or whose session left its account or ended. */
  const discardSummaries = (now: number): void => {
    for (const kept of db.atLimit.summaries()) {
      const row = rowOf(kept.instanceId);
      const account = db.accounts.get(kept.accountId);
      const named = account ? accountName(account) : "its account";
      const why = discardWhy(kept, row, named, now);
      if (why) {
        db.atLimit.dropSummary(kept.instanceId);
        console.info(
          `[at-limit] ${row ? ports.named(row) : "A session no longer recorded"}: the summary kept for it at ${named}'s limit is dropped: ${why}. A later limit writes a new one.`
        );
      }
    }
  };

  /**
   * Whether `row` stays at its limit with nothing carrying it on: Caw's own
   * work in a project whose Caw is off ({@link stoppedByCawOff}), as with
   * Caw off nothing wakes a model on his behalf (Projects §5.3), neither a
   * move to a free account nor a resume at the reset. Its hold goes, and its
   * transcript says so once per limit: the line stands in for a wait written
   * while Caw was on, which would otherwise read as carried on at the reset.
   */
  const stays = (row: LimitRow, current: Account): boolean => {
    const project = stoppedByCawOff(db, row);
    if (!project) {
      return false;
    }
    const now = Date.now();
    const resetsAt = refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    );
    const held = db.atLimit.hold(row.id);
    db.atLimit.dropHold(row.id);
    const last = db.atLimit.events([row.id]).at(-1)?.move;
    if (
      !(
        last?.kind === "stopped" &&
        last.account.id === current.id &&
        last.resetsAt === resetsAt
      )
    ) {
      // Its line says it, in the log too ({@link AtLimitPorts.note}).
      ports.note(row, {
        kind: "stopped",
        account: namedAccount(current),
        resetsAt,
      });
    }
    if (held) {
      ports.changed();
    }
    return true;
  };

  /**
   * One held on its refused credential: it carries on where it is once its
   * account is signed in there again, and until then moves as soon as
   * another account can take it.
   */
  const lookAtSignedOut = async (
    row: LimitRow,
    current: Account
  ): Promise<void> => {
    if (!signedIn(row, current)) {
      await act(row, current, "refused");
    } else if (await ports.idle(row)) {
      db.atLimit.dropHold(row.id);
      console.info(
        `[at-limit] ${ports.named(row)}: ${accountName(current)} is signed in again on its machine, so it carries on there.`
      );
      ports.resume(row, "signin");
    }
  };

  /**
   * One held session: past its reset, it carries on where it is once it is
   * between turns; before, another account may have come free for it. One
   * held on its refused credential (`until` null) carries on where it is
   * once its account is signed in there again, and until then moves as soon
   * as another account can take it.
   */
  const lookAt = async (held: LimitHold, now: number): Promise<void> => {
    const row = rowOf(held.instanceId);
    const current = db.accounts.get(held.accountId);
    if (over(row) || !row || !current) {
      db.atLimit.dropHold(held.instanceId);
      return;
    }
    // A person moved it: its hold ends at that move, not at its reset.
    if (ports.handMove(row)) {
      await act(row, current, held.until === null ? "refused" : "limit");
      return;
    }
    if (held.until === null) {
      await lookAtSignedOut(row, current);
      return;
    }
    if (stays(row, current)) {
      return;
    }
    if (held.until === null || held.until > now) {
      await act(row, current);
      return;
    }
    if (await ports.idle(row)) {
      db.atLimit.dropHold(row.id);
      console.info(
        `[at-limit] ${ports.named(row)}: ${accountName(current)}'s limit has reset, so it carries on there, told to pick up where the limit stopped it.`
      );
      ports.resume(row, "limit");
    }
  };

  /** One look at every kept summary and hold. */
  const lookAtHolds = async (): Promise<void> => {
    const now = Date.now();
    discardSummaries(now);
    for (const held of db.atLimit.holds()) {
      // biome-ignore lint/performance/noAwaitInLoops: each held session needs its own idle receipt before it is sent on
      await lookAt(held, now);
    }
  };

  const rebalancer = createRebalancer({
    db,
    lifetime,
    ports,
    acting,
    cacheCarries,
    lookAtHolds,
    replan: () => plan(),
  });

  /** One look: every hold and kept summary, then every provider on every machine rebalanced. */
  const tick = async (): Promise<void> => {
    await lookAtHolds();
    await rebalancer.everyPair();
  };

  /** Arms the next look: the earliest reset, else the recheck, while anything is held or kept or two accounts could balance. */
  const plan = (): void => {
    lifetime.cancel(timer);
    timer = undefined;
    if (lifetime.closed()) {
      return;
    }
    const now = Date.now();
    const holds = db.atLimit.holds();
    const summaries = db.atLimit.summaries();
    if (
      holds.length === 0 &&
      summaries.length === 0 &&
      rebalancer.pairs().length === 0
    ) {
      return;
    }
    const at = Math.min(
      now + RECHECK_MS,
      ...holds.map((one) => one.until ?? Number.POSITIVE_INFINITY),
      ...summaries.map((one) => Date.parse(one.resetsAt))
    );
    timer = lifetime.after(Math.max(1000, at - now), () => {
      detach(tick().finally(plan), "at-limit look");
    });
  };

  rebalancer.accountsChanged();

  return {
    /**
     * Whether `instanceId` is in this controller's hands now: held until a
     * reset, looked at again while its refused turn settles, or being moved
     * or continued. What it is told next is this controller's to send.
     */
    handling(instanceId: string): boolean {
      return (
        acting.has(instanceId) ||
        settling.has(instanceId) ||
        db.atLimit.hold(instanceId) !== undefined
      );
    },
    /** Whether a refused turn of `instanceId` is this controller's to answer. */
    manages(instanceId: string): boolean {
      const row = rowOf(instanceId);
      return !!row && !!currentOf(row);
    },
    /** A turn of `instanceId` was refused at its account's limit, and has ended. */
    async turnRefused(instanceId: string): Promise<void> {
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      if (!(row && current)) {
        return;
      }
      const now = Date.now();
      const resets = refusedUntil(
        db.accounts.bench(now),
        readingOf(current.id),
        current.id,
        row.model,
        now
      );
      console.info(
        `[at-limit] ${ports.named(row)}'s turn was refused: ${accountName(current)} is at its limit${resets === null ? "" : ` until ${clockWords(resets)}`}. ${ports.handMove(row) ? "A person moved it, so that move is all the hub does with it." : "The hub decides now whether it waits for the reset, moves whole to another account, or goes on from a summary."}`
      );
      // A person moved it: that move is all that is done, whoever started
      // the turn and whoever's work it is.
      if (ports.handMove(row)) {
        await act(row, current);
        return;
      }
      const origin = ports.startedBy(row);
      if (origin?.kind === "system" && noticeTurn(origin)) {
        console.info(
          `[at-limit] ${ports.named(row)}'s refused turn was started by the hub's own word (${origin.name ?? "a notice"}), not by a person or its parent, so it isn't moved or continued for it. It stays on ${accountName(current)} until a person or its parent writes to it.`
        );
        return;
      }
      if (!stays(row, current)) {
        await act(row, current);
      }
    },
    /**
     * A turn of `instanceId` ended on Claude Code refusing its account's
     * credential for good, and the account is signed out on its machine:
     * it moves whole to another account and carries on there; with none to
     * take it, it is held ({@link holdRefused}).
     */
    async signedOut(instanceId: string): Promise<void> {
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      if (!(row && current)) {
        return;
      }
      console.info(
        `[at-limit] ${ports.named(row)}'s turn ended because Claude Code refused ${accountName(current)}'s sign-in, so ${accountName(current)} is signed out on its machine. It moves to another account and carries on there; with none free, it waits until ${accountName(current)} is signed in again in Configure → Accounts.`
      );
      await act(row, current, "refused");
    },
    /** Whether a turn of `instanceId` a token refresh race cut goes again: not once one has since its last turn that ended otherwise. */
    retriesRace(instanceId: string): boolean {
      return !raced.has(instanceId);
    },
    /**
     * A turn of `instanceId` a token refresh another Claude Code process
     * held has ended: the session carries on where it is
     * {@link RACE_RETRY_MS} later, once.
     */
    turnRaced(instanceId: string): void {
      if (raced.has(instanceId) || lifetime.closed()) {
        return;
      }
      const retry = lifetime.after(RACE_RETRY_MS, () => {
        raced.set(instanceId, undefined);
        const row = rowOf(instanceId);
        if (over(row) || !row) {
          raced.delete(instanceId);
          return;
        }
        const current = currentOf(row);
        console.info(
          `[accounts] ${ports.named(row)}'s last turn was cut because another Claude Code process was refreshing ${current ? `${accountName(current)}'s` : "its account's"} token at the same moment. It is sent again now, ${RACE_RETRY_MS / 1000} s later, once; a second cut ends the turn as failed.`
        );
        ports.resume(row, "signin");
      });
      raced.set(instanceId, retry);
    },
    /** A turn of `instanceId` ended on anything but a refresh race: one waiting to go again went with it. */
    turnWent(instanceId: string): void {
      lifetime.cancel(raced.get(instanceId));
      raced.delete(instanceId);
    },
    /** A turn of `instanceId` ended as any turn does: maybe write a summary ahead of the limit. */
    async turnEnded(instanceId: string): Promise<void> {
      rebalancer.turnEnded(instanceId);
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      if (row && current) {
        await prepare(row, current);
      }
    },
    /**
     * A continuation of `instanceId` from `fromAccountId` to `toAccountId`
     * failed at `step`: it goes on in the conversation it has. `line`: the
     * continuation's "Summarising…" line, which says how it ended.
     */
    continuationFailed(
      instanceId: string,
      failure: {
        fromAccountId: string;
        toAccountId: string;
        step: ContinueStep;
        reason: string;
        line: string;
      }
    ): void {
      const row = rowOf(instanceId);
      const current = db.accounts.get(failure.fromAccountId);
      const target = db.accounts.get(failure.toAccountId);
      if (row && current && target) {
        unmoved(
          row,
          current,
          target,
          { action: "continue", step: failure.step },
          failure.reason,
          failure.line
        );
      }
    },
    /** Looks at every hold and kept summary now, then rebalances every provider on every machine. */
    look: () => tick().finally(plan),
    /**
     * The hub says an account moved (a sign-in, a reading, a bench): an
     * account newly signed in on a machine, or back from its bench, sets
     * its provider rebalancing there.
     */
    accountsChanged: rebalancer.accountsChanged,
    /** Rebalances `provider`'s accounts on `machineId` now, then looks at every hold. */
    rebalance: (provider: AccountProvider, machineId: string) =>
      rebalancer.rebalance(provider, machineId),
  };
};
