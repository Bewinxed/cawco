import {
  type Account,
  type AccountBench,
  type AccountMove,
  type AccountProvider,
  type AccountReading,
  type AtLimit,
  accountNameAmong,
  accountsWords,
  clockWords,
  keepsGoingOnExtraUsage,
  type LimitWindow,
  modelScope,
  type NeutralOrigin,
  namedAccount,
  type RebalanceNotice,
  type WaitReason,
  windowWords,
} from "@cawco/core";
import {
  RESTART_WAIT_CAP_MS,
  WORK_IN_FLIGHT,
} from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import { type Admission, usdWords } from "./admission";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { createRebalancer, readForecast, reReadCost } from "./rebalance";
import { isLive } from "./work-items";

/**
 * A running Claude session whose account reached its limit: its turn was
 * refused. It moves whole to another account known to have room, in the same
 * chat, or, when no account has room, is held until the earliest moment one
 * does (its own account's reset, or another's that comes sooner), by its
 * provider's `atLimit` routing. Moving means re-reading the context without
 * its cache, since caches are per organization and workspace
 * (platform.claude.com/docs/en/build-with-claude/prompt-caching: "Different
 * organizations never share caches"), unless both accounts are in one
 * organization. A context of `moveWholeUnderK` or more moved to another
 * organization then files its open items and is compacted by Claude Code's
 * own `/compact` as its first steps there (server.ts `compactions`): that
 * compaction is the one uncached read the move pays anyway, and a context
 * small enough to carry on cheaply follows it. Nothing here summarises a
 * session or starts a fresh conversation. Every outcome is one line in its
 * transcript saying what it cost (core `AccountMove`). Moves happen only
 * between turns.
 *
 * Where it goes: placement for its kind among the accounts known to have
 * room now (a reading under every limit, never one unread or benched), those
 * whose sign-in a turn on its machine proved lately first (placement.ts
 * `proven`). A move that fails for want of the target tries the next one in
 * the same decision.
 *
 * The same controller rebalances before any limit: when an account signs in
 * or comes back from its bench, and at every look, running sessions on
 * accounts forecast to run out move to where placement would carry them,
 * when moving is free (their cache carries, or is cold) or cheap (under the
 * floor and affordable), and held sessions are looked at again at once.
 *
 * A turn that ran on its account's extra usage past a plan limit was not
 * refused: Claude Code answered it on the account's credits. What happens
 * next is the account's own setting (core `AtPlanLimit`): it keeps going
 * there, or, by default, moves between turns to an account with plan room,
 * decided as above, and goes on where it is when none has room.
 *
 * It also answers a Claude session whose turn died on its account's
 * credential. Refused for good (server.ts `settleRefusal` signed the account
 * out on its machine): the session moves whole the same way, to an account
 * of the same organization first, and carries on there; with none to take
 * it, it is held, what it is sent waiting at the hub, until its account is
 * signed in again or another comes free.
 *
 * A turn the hub's own word started is not moved for: it asked nothing worth
 * another account, and a stopped session is woken only by a person or its
 * parent. A live work item's session is the exception, whoever started its
 * refused turn (the hub's "still open", the sleep sweep's wake, a wait's
 * end, a person, its parent): a delegate's work never sits at its limit as
 * if it ran. It moves to an account with room, else is held until the
 * earliest reset and carries on then by itself; what it is sent meanwhile
 * waits at the hub and goes once it runs. While it is stopped, its tray chip
 * and `delegate_list` say so ({@link stall}).
 */

export type LimitRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/**
 * A session stopped at its account's limit, as its tray chip and
 * `delegate_list` say it (core `accountsWords.stalled`): the words, and
 * when it carries on (epoch ms): the reset it waits for, or, while its move
 * waits on work in flight, the first moment the hub acts without that work
 * ending (`carryStall`).
 */
export interface Stall {
  until?: number;
  words: string;
}

/** The message a session's last turn read: who sent it. */
export interface Handed {
  origin: NeutralOrigin;
}

/**
 * Why a carry left a session's conversation where it was (server.ts
 * `moveRowsToAccount`), in words a line quotes after "can't move …: ".
 * `running`: its Claude Code process still runs there and keeps something
 * a stop would lose, so a move waits for its next turn's end rather than
 * failing. `later`: what it keeps is only work it holds for later (a
 * background task, a one-time wake-up), which the hub waits for up to
 * `RESTART_WAIT_CAP_MS` and then ends with the move (server.ts
 * `moveRowsToAccount`); that work, in its machine's words ("waiting for
 * work in flight to end: 1 command running"), where `why` is the line's
 * whole reason.
 */
export interface Kept {
  later?: string;
  running: boolean;
  /**
   * The target account's part failed (its conversation couldn't be put in
   * that account's dir), not the session's or its machine's: another
   * account may take it.
   */
  target?: true;
  why: string;
}

export type AtLimitDecision =
  /**
   * Held until `until`: the earliest moment an account takes it again (its
   * own reset, or `frees`'s when that comes sooner), else the next look
   * when none was named.
   */
  | { action: "wait"; frees?: string; until: number; why: WaitReason }
  | {
      action: "move";
      /** It files its open items and is compacted natively once there. */
      compact: boolean;
      sameOrganization: boolean;
      targetId: string;
    };

/** Another account that takes the session again at `at`, though none has room now. */
export interface Frees {
  accountId: string;
  at: number;
}

export interface DecideInput {
  /**
   * When its prompt cache lapses on its own account, as measured (keep-alive.ts
   * `promptCacheExpiresAt`: its last request plus the TTL its cache was
   * written with): null when it is cold already or no lifetime was measured.
   */
  cacheExpiresAt: number | null;
  /** The last context size its harness reported; null when none has been. */
  contextTokens: number | null;
  current: Account;
  /** A fork reads its origin's cache: it never moves on its own. */
  forked: boolean;
  /** The other account that frees soonest for it, when none has room now. */
  frees: Frees | undefined;
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
 * Why a session leaves its account: its limit refused a turn, or Claude Code
 * refused the account's credential for good (either way it carries on where
 * it moves to), or a turn of it ran on its account's extra usage past a plan
 * limit and the account says to move at a plan limit (core `AtPlanLimit`):
 * that turn was answered, so it moves between turns and waits there for its
 * next message, and nothing holds it where it is.
 */
type Cause = "limit" | "refused" | "credits";

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
 * The policy's steps in order: a fork or the policy off waits; nothing with
 * room to move to waits until the earliest moment an account takes it again
 * (its own reset, or another's that comes first); a move that keeps the
 * cache ({@link cacheCarries}: one organization) moves whole whatever the
 * size; a reset within `waitMinutes`, or one that comes before its prompt
 * cache lapses, waits: waiting then costs nothing, where a move re-reads
 * its whole context cold. Anything else moves whole, as waiting would also
 * be a cold re-read, and a context of `moveWholeUnderK` or more is
 * compacted once there. A context never reported is not compacted: nothing
 * says it is large. Whether the target still has room for it after the
 * moves already admitted there is the admission's (admission.ts).
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
    const { frees } = input;
    return frees && frees.at < until
      ? { action: "wait", until: frees.at, frees: frees.accountId, why: "full" }
      : { action: "wait", until, why: "full" };
  }
  if (cacheCarries(current, target)) {
    return {
      action: "move",
      targetId: target.id,
      sameOrganization: true,
      compact: false,
    };
  }
  if (
    resetAt !== null &&
    (resetAt - now <= policy.waitMinutes * MINUTE_MS ||
      (input.cacheExpiresAt !== null && resetAt <= input.cacheExpiresAt))
  ) {
    return { action: "wait", until, why: "soon" };
  }
  return {
    action: "move",
    targetId: target.id,
    sameOrganization: false,
    compact:
      contextTokens !== null && contextTokens >= policy.moveWholeUnderK * 1000,
  };
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

/** What the hub does for the controller: the parts that reach machines. */
export interface AtLimitPorts {
  /** The account `row` runs on now. */
  accountOf: (row: LimitRow) => string | undefined;
  /** The one ledger every move onto an account is charged against (admission.ts), shared with the wake path. */
  admission: Admission;
  /** When `row`'s prompt cache lapses on its account, as measured; null when it is cold or no lifetime was measured (keep-alive.ts `promptCacheExpiresAt`). */
  cacheExpiresAt: (row: LimitRow) => number | null;
  /**
   * Carries out the move a person asked of `row` ({@link handMove}) now,
   * between its turns: its conversation carried whole to that account, and
   * once there it carries on past the limit that stopped it. Settled when
   * the carry has: a process that still runs owes the move again.
   */
  carryHandMove: (row: LimitRow) => Promise<void>;
  changed: () => void;
  db: DbShape;
  /**
   * The account a person moved `row` to and it has not reached yet (server.ts
   * `moveByHand`, owed to its turn's end): while there is one, the move is
   * the only thing done to it at its limit. Undefined when none is owed.
   */
  handMove: (row: LimitRow) => string | undefined;
  /** Whether `row` is between turns: nothing running and nothing waiting on it. */
  idle: (row: LimitRow) => Promise<boolean>;
  /**
   * Since when `instanceId`'s move has waited on work its process holds for
   * later (server.ts `waitForLater`); undefined when it does not wait so.
   */
  laterSince: (instanceId: string) => number | undefined;
  /** Runs the next look and each settling session's timer until the hub closes. */
  lifetime: HubLifetimeShape;
  /** A machine as a sentence names it. */
  machineName: (machineId: string) => string;
  /**
   * Relaunches `row` on `accountId`, its conversation with it, and, when
   * its limit or a sign-in failure stopped it (`carryOn` says which), has it
   * carry on; a session moved between turns before any limit waits for its
   * next message. With `compact` (the line `line` already written for it,
   * which follows the compaction), its first steps there are its filing
   * turn and Claude Code's `/compact`, before the carry-on and everything
   * it is owed (server.ts `compactions`). Answers why when it did not move:
   * `row` is still on its account then.
   */
  move: (
    row: LimitRow,
    accountId: string,
    carryOn: false | "limit" | "signin",
    compact?: { line: string; move: AccountMove }
  ) => Promise<Kept | undefined>;
  /** `row` as a line names it: its title. */
  named: (row: LimitRow) => string;
  /**
   * The account other than `accountId` that takes `row` again soonest, and
   * when, among those it may run on on its machine; none when no reading
   * names such a moment. Read when no account has room for it now.
   */
  nextFree: (row: LimitRow, accountId: string) => Frees | undefined;
  /** Writes one line into `row`'s transcript; under `id`, the line already written there is what it says now. */
  note: (row: LimitRow, move: AccountMove, id?: string) => void;
  /** What adding an account set moving, for the Accounts page. */
  noticed: (notice: RebalanceNotice) => void;
  /**
   * Owes `row` a move to `accountId` at its turn's end, or its next start
   * (server.ts `owedMoves`, the way a person's move mid-turn waits):
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
  /**
   * The accounts whose sign-in on `row`'s machine a turn proved lately: one
   * ran there within an access token's lifetime. A carry tries these first.
   */
  proven: (row: LimitRow) => ReadonlySet<string>;
  /** A move off a refused sign-in, said to whoever hears `row`'s reports. */
  refusedMove: (row: LimitRow, move: AccountMove) => void;
  /**
   * Has `row` carry on, on the account it is on, where what `stopped` it
   * left it: its account's limit, or a sign-in failure.
   */
  resume: (row: LimitRow, stopped: "limit" | "signin") => void;
  /**
   * What `row`'s last turn read: the newest message it was handed, who sent
   * it. Undefined when it was handed none.
   */
  startedBy: (row: LimitRow) => Handed | undefined;
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
  /**
   * Whether a person waits on `row`: a question or permission of it is
   * pending, or it is a top-level session whose last turn a person sent.
   * Admission takes these first.
   */
  waitedOn: (row: LimitRow) => boolean;
  /** Whether `row`'s prompt cache is still warm: a move off its account then re-reads it. */
  warm: (row: LimitRow) => boolean;
}

/** A move as a line says what waits: "move from A to B", each named beside `accounts`. */
const actionWords = (
  current: Account,
  target: Account,
  accounts: readonly Account[]
): string =>
  `move from ${accountNameAmong(current, accounts)} to ${accountNameAmong(target, accounts)}`;

/** What a failure said, as a line quotes it. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * A session past caring: its process will not be woken by anything the hub
 * does here. One a continuation took the work item of (`continuedInto`)
 * never runs again: no hold of its is kept and no reset resumes it.
 */
const over = (row: LimitRow | undefined): boolean =>
  !row ||
  row.continuedInto !== null ||
  ["stopping", "stopped", "discarded", "error"].includes(row.status);

/** The carry-on the hub sends at a reset: a turn the limit itself resumed. */
const CARRY_ON_ORIGIN = "limit";

/**
 * Whether a turn its account refused was started by the hub's own word
 * rather than a person's or a session's: such a turn asked nothing of the
 * session that is worth another account, so it is not moved, and waits for
 * a person or its parent to write.
 */
const noticeTurn = (origin: NeutralOrigin | undefined): boolean =>
  origin?.kind === "system" && origin.name !== CARRY_ON_ORIGIN;

export const createAtLimit = (ports: AtLimitPorts) => {
  const { db, lifetime } = ports;
  const rowOf = (id: string): LimitRow | undefined =>
    db.getInstancesByIds([id])[0];
  let timer: HubTimer | undefined;
  /** Sessions being moved right now: each is acted on once at a time. */
  const acting = new Set<string>();
  /** Refused sessions still mid-turn on their machine, by when they stop being looked at. */
  const settling = new Map<string, { timer: HubTimer; until: number }>();
  /**
   * Sessions stopped at their account's limit and on their way to another
   * account, being moved now or once their turn ends: the account each
   * leaves and the one it goes to ({@link stall}).
   */
  const towards = new Map<string, { from: Account; to: Account }>();

  const readingOf = (accountId: string): AccountReading | undefined =>
    db.accounts.readings().find((one) => one.accountId === accountId);

  /**
   * Where `row` goes off `current`, for a limit or a refused credential
   * alike, among the accounts placement knows have room now: one whose
   * sign-in a turn on its machine proved lately ({@link AtLimitPorts.proven})
   * before any whose token is merely present, since Claude Code reports a
   * dir signed in while its refresh token is already spent and a fresh
   * process there is refused; within each, `current`'s organization first,
   * whose prompt cache comes along ("Caches are isolated between
   * organizations. Different organizations never share caches",
   * platform.claude.com/docs/en/build-with-claude/prompt-caching), else any.
   * Never one in `skip`: a move to it already failed in this decision.
   * Undefined when none can take it.
   */
  const targetFor = (
    row: LimitRow,
    current: Account,
    skip: ReadonlySet<string> = new Set()
  ): Account | undefined => {
    const proven = ports.proven(row);
    const tiers: ((one: Account) => boolean)[] = [
      (one) => proven.has(one.id) && sameOrganization(one, current),
      (one) => proven.has(one.id),
      (one) => sameOrganization(one, current),
      () => true,
    ];
    for (const tier of tiers) {
      const targetId = ports.target(
        row,
        current.id,
        (one) => !skip.has(one.id) && tier(one)
      );
      if (targetId) {
        return db.accounts.get(targetId);
      }
    }
    return undefined;
  };

  /** The policy for `row` on `accountId`, and what decides it; never a target in `skip`. */
  const decide = (
    row: LimitRow,
    current: Account,
    now: number,
    skip: ReadonlySet<string> = new Set()
  ) => {
    const policy = db.accounts.routing(current.provider).atLimit;
    const resetAt = refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    );
    const forked = row.forkedFrom !== null;
    const target =
      policy.move && !forked ? targetFor(row, current, skip) : undefined;
    return decideAtLimit({
      policy,
      forked,
      current,
      target,
      frees:
        policy.move && !forked && !target
          ? ports.nextFree(row, current.id)
          : undefined,
      contextTokens: row.contextTokens,
      cacheExpiresAt: ports.cacheExpiresAt(row),
      resetAt,
      now,
    });
  };

  /**
   * Where `row` goes off `current`, whose credential Claude Code refused
   * ({@link targetFor}). Neither the limit's policy nor a fork's tie to its
   * origin's cache keeps it on an account that cannot run it.
   */
  const refusedTarget = (
    row: LimitRow,
    current: Account,
    skip: ReadonlySet<string>
  ): { target: Account; sameOrganization: boolean } | undefined => {
    const target = targetFor(row, current, skip);
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

  /**
   * Holds `row` until `until`, the earliest moment an account takes it
   * again; the line is written once per hold, and again when that moment
   * moves (another account frees sooner, or a reading moved a reset).
   */
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
    if (held?.until === decision.until) {
      return;
    }
    const frees = decision.frees ? db.accounts.get(decision.frees) : undefined;
    const accounts = db.accounts.list();
    ports.note(row, {
      kind: "waiting",
      account: namedAccount(current, accounts),
      ...(frees ? { frees: namedAccount(frees, accounts) } : {}),
      until: decision.until,
      why: decision.why,
      tokens: row.contextTokens,
    });
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
      ports.note(row, {
        kind: "signed-out",
        account: namedAccount(current, db.accounts.list()),
      });
    }
  };

  /**
   * Why each session on extra usage past its plan limit stays there, as last
   * logged: said once per reason, not at every turn's end.
   */
  const extraUsageSaid = new Map<string, string>();

  /** Logs why `row` stays on `current`'s extra usage, once while the reason holds. */
  const sayOnExtraUsage = (row: LimitRow, reason: string): void => {
    if (extraUsageSaid.get(row.id) === reason) {
      return;
    }
    extraUsageSaid.set(row.id, reason);
    console.info(`[at-limit] ${ports.named(row)} ${reason}`);
  };

  /**
   * `row` ran its turn on `current`'s extra usage past a plan limit, and
   * `current` says to move at a plan limit, but the decision (`why`) keeps it
   * there: nothing holds it, as its turns are answered there.
   */
  const stillOnExtraUsage = (
    row: LimitRow,
    current: Account,
    why: WaitReason | undefined
  ): void => {
    const named = accountNameAmong(current, db.accounts.list());
    const reset = refusedUntil(
      db.accounts.bench(Date.now()),
      readingOf(current.id),
      current.id,
      row.model,
      Date.now()
    );
    const because: Record<WaitReason, string> = {
      fork: "a fork stays on the account its origin's cache is on",
      off: "moving to another account at the limit is switched off",
      full: "no other account it may run on has plan room for it now",
      soon: `${named} resets${reset === null ? "" : ` at ${clockWords(reset)}`}, sooner than re-reading its context elsewhere is worth`,
      work: "its work item carries on here",
    };
    sayOnExtraUsage(
      row,
      `ran its turn on ${named}'s extra usage, past its plan limit. ${named} says to move to an account with plan room then, but it keeps going on ${named}'s extra usage: ${because[why ?? "full"]}. Each turn's end decides again.`
    );
  };

  /**
   * A turn of `row` ended on its account's extra usage past a plan limit:
   * the account's last reading says extra usage is in use, and a window that
   * bears on the session's model is spent (or the account is benched for
   * it). The account's setting (core `AtPlanLimit`) decides: it keeps going
   * there, or moves between turns to an account with plan room, as at a
   * refused turn, except that nothing holds it when none has room. One a
   * person or a rebalance already moves, one held or being decided, and Caw's
   * own work with Caw off ({@link stoppedByCawOff}) are left as they are.
   */
  const extraUsageTurn = async (instanceId: string): Promise<void> => {
    const row = rowOf(instanceId);
    const current = row ? currentOf(row) : undefined;
    const now = Date.now();
    const reading = current ? readingOf(current.id) : undefined;
    if (
      over(row) ||
      !(row && current && reading?.overage?.inUse) ||
      refusedUntil(
        db.accounts.bench(now),
        reading,
        current.id,
        row.model,
        now
      ) === null
    ) {
      extraUsageSaid.delete(instanceId);
      return;
    }
    if (keepsGoingOnExtraUsage(current, reading)) {
      const named = accountNameAmong(current, db.accounts.list());
      sayOnExtraUsage(
        row,
        `ran its turn on ${named}'s extra usage, past its plan limit, and stays there: ${named} says to keep going on extra usage at a plan limit.`
      );
      return;
    }
    if (
      ports.handMove(row) ||
      ports.owed().has(row.id) ||
      acting.has(row.id) ||
      settling.has(row.id) ||
      db.atLimit.hold(row.id) ||
      stoppedByCawOff(db, row)
    ) {
      return;
    }
    await act(row, current, "credits");
  };

  /** Whether `row` is the session of a live work item (work-items.ts `isLive`). */
  const liveWork = (row: LimitRow): boolean => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    return item?.instanceId === row.id && isLive(item.state);
  };

  /**
   * A refused turn the hub's own word started ({@link noticeTurn}), of a
   * session with no live work item: left alone until a person or its parent
   * writes. A live work item's session is never left so: its refused turn
   * is answered as a person's is, whoever started it.
   */
  const leftAlone = (
    row: LimitRow,
    current: Account,
    word: Handed
  ): boolean => {
    if (liveWork(row)) {
      console.info(
        `[at-limit] ${ports.named(row)}'s refused turn was the hub's own word, and it is a live work item's session, so it is answered as a person's turn is: moved to an account with room, else held until the earliest reset.`
      );
      return false;
    }
    const name = word.origin.kind === "system" ? word.origin.name : undefined;
    console.info(
      `[at-limit] ${ports.named(row)}'s refused turn was started by the hub's own word (${name ?? "a notice"}), not by a person or its parent, so it isn't moved for it. It stays on ${accountNameAmong(current, db.accounts.list())} until a person or its parent writes to it.`
    );
    return true;
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
        `[at-limit] ${ports.named(row)} can't ${what} yet: it is inside a turn, and a session moves only between turns. The hub looks again every ${SETTLE_MS / 1000} s for ${SETTLE_FOR_MS / 60_000} minutes.`
      );
    }
    if (lifetime.closed() || Date.now() >= until) {
      settling.delete(row.id);
      towards.delete(row.id);
      const named = accountNameAmong(current, db.accounts.list());
      console.info(
        `[at-limit] ${ports.named(row)} is still inside a turn ${SETTLE_FOR_MS / 60_000} minutes after ${named} refused one, so the hub stops looking: a turn running that long is one ${named} took. Its next refused turn is answered when it ends.`
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
  ): string => {
    const named = accountNameAmong(current, db.accounts.list());
    return `[at-limit] ${ports.named(row)}: the hub's answer to ${named}'s limit failed: ${messageOf(error)}. It stays on ${named} as it was; the next look at the limit decides again.`;
  };

  /** The line a move writes: what it cost, and the window, or the refused sign-in, that sent it. */
  const movedNote = (
    row: LimitRow,
    current: Account,
    target: Account,
    sameOrg: boolean,
    now: number,
    cause: Cause
  ): AccountMove => {
    const atLimit = cause !== "refused";
    const full = atLimit
      ? fullWindow(readingOf(current.id), row.model, now)
      : undefined;
    const cost = sameOrg
      ? undefined
      : reReadCost(readForecast(db, target.provider, now), row, target);
    const accounts = db.accounts.list();
    return {
      kind: "moved",
      from: namedAccount(current, accounts),
      to: namedAccount(target, accounts),
      sameOrganization: sameOrg,
      ...(cost ? { cost } : {}),
      ...(cause === "refused" ? { because: { kind: "refused" as const } } : {}),
      tokens: row.contextTokens,
      window: full ? windowWords(full) : null,
      resetsAt: atLimit
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
   * Moving `row` whole to `target` failed: it goes on in its conversation,
   * still on `current`. Its transcript says so in the words of what failed
   * (once for the same failure, however often a retry meets it again).
   * `held`: the failure was its process's, not the target's, so no other
   * account would fare better; it is held until its reset, each look
   * deciding again whether to wait or try once more. One whose credential
   * was refused (`refused`) has no reset: it is held until a look finds it
   * an account.
   */
  const unmoved = (
    row: LimitRow,
    current: Account,
    target: Account,
    reason: string,
    how: {
      held: boolean;
      refused: boolean;
      /** Only work its process holds for later kept it ({@link Kept.later}), that work: the hub moves it once that ends, or past its bound. */
      waits: string | undefined;
    }
  ): void => {
    const last = db.atLimit.events([row.id]).at(-1)?.move;
    const repeated =
      last?.kind === "unmoved" &&
      last.action === "move" &&
      last.reason === reason &&
      last.to?.id === target.id;
    if (!repeated) {
      // Said once, as the line written the first time logged itself: it
      // already says the hub tries again.
      const accounts = db.accounts.list();
      ports.note(row, {
        kind: "unmoved",
        action: "move",
        ...(how.refused ? { signedOut: true as const } : {}),
        from: namedAccount(current, accounts),
        to: namedAccount(target, accounts),
        step: "start",
        reason,
        ...(how.waits ? { waits: true as const } : {}),
      });
    }
    if (!how.held) {
      return;
    }
    // Waiting on work in flight: what that work is and since when, so its
    // stalled words name it ({@link stall}); the line says why it waits.
    const since = how.waits ? ports.laterSince(row.id) : undefined;
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: how.refused ? null : holdUntil(row, current, Date.now()),
      ...(since === undefined || how.waits === undefined
        ? {}
        : { carry: { to: target.id, why: how.waits, since } }),
    });
    ports.changed();
    plan();
  };

  /**
   * Moves `row` whole onto `target`, its line written once it has: one that
   * compacts once there gets its line first, which the compaction says
   * again as it goes. A move off a refused sign-in is also said to whoever
   * hears its reports. Answers why it did not move.
   */
  const moveWhole = async (
    row: LimitRow,
    current: Account,
    target: Account,
    decision: Extract<AtLimitDecision, { action: "move" }>,
    now: number,
    cause: Cause
  ): Promise<Kept | undefined> => {
    const refused = cause === "refused";
    const moved: AccountMove = {
      ...movedNote(row, current, target, decision.sameOrganization, now, cause),
      ...(decision.compact ? { compact: "filing" as const } : {}),
    };
    const line = crypto.randomUUID();
    // A turn extra usage answered is over: the session waits there for its
    // next message, as a move between turns does.
    const carryOn = {
      limit: "limit",
      refused: "signin",
      credits: false,
    } as const;
    const kept = await ports.move(
      row,
      target.id,
      carryOn[cause],
      decision.compact ? { line, move: moved } : undefined
    );
    if (kept) {
      return kept;
    }
    ports.note(row, moved, line);
    if (refused) {
      ports.refusedMove(row, moved);
    }
    return undefined;
  };

  /**
   * What is done with `row` off `current` for `cause`, never moving it to an
   * account in `skip`: at its limit, refused or on extra usage, as
   * {@link decideAtLimit} says; its credential refused, a move whole to
   * {@link refusedTarget}, else a hold until there is one.
   */
  const decideFor = (
    row: LimitRow,
    current: Account,
    now: number,
    cause: Cause,
    skip: ReadonlySet<string>
  ): AtLimitDecision | undefined => {
    if (cause !== "refused") {
      return decide(row, current, now, skip);
    }
    const to = refusedTarget(row, current, skip);
    return to
      ? {
          action: "move",
          targetId: to.target.id,
          sameOrganization: to.sameOrganization,
          compact: false,
        }
      : undefined;
  };

  /**
   * The move a person asked of `row`, to `toId` ({@link AtLimitPorts.handMove}):
   * carried out once it is between turns, while that account can take it;
   * held until that account's reset while it cannot. Nothing else is done to
   * it at its limit meanwhile: it is not moved elsewhere, as the person
   * chose a move.
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
    const accounts = db.accounts.list();
    const from = accountNameAmong(current, accounts);
    const to = target
      ? accountNameAmong(target, accounts)
      : "the account a person chose";
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
    if (target) {
      towards.set(row.id, { from: current, to: target });
    }
    console.info(
      `[at-limit] ${ports.named(row)} moves from ${from} to ${to} now, as a person asked: it is between turns and ${to} has room. Its conversation is copied whole and it carries on there.`
    );
    await ports.carryHandMove(row);
  };

  /**
   * Moves `row` off `current`, or holds it, as {@link decideFor} says; one
   * a person moved, only as they asked ({@link carryByHand}).
   */
  const act = async (
    row: LimitRow,
    current: Account,
    cause: Cause = "limit"
  ): Promise<void> => {
    if (acting.has(row.id) || over(row)) {
      return;
    }
    acting.add(row.id);
    try {
      const byHand = ports.handMove(row);
      if (byHand) {
        await carryByHand(row, current, byHand, cause);
        return;
      }
      await decideAndMove(row, current, cause);
    } finally {
      acting.delete(row.id);
      // On its way still only while its turn's end is awaited.
      if (!settling.has(row.id)) {
        towards.delete(row.id);
      }
      ports.changed();
      plan();
    }
  };

  /**
   * One decision for `row` off `current`: held when no account has room, or
   * moved whole. A move the target failed (its account's dir, not the
   * session's process: {@link Kept.target}) tries the next account with room
   * at once, in the same decision, and the session is held only when none is
   * left. A move its process kept from going is held as it was.
   */
  const decideAndMove = async (
    row: LimitRow,
    current: Account,
    cause: Cause
  ): Promise<void> => {
    const skip = new Set<string>();
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: each try follows the one before it failed
      const failed = await tryOnce(row, current, cause, skip);
      if (!failed) {
        return;
      }
      console.info(
        `[at-limit] ${ports.named(row)} couldn't move to ${accountNameAmong(failed.target, db.accounts.list())} (${failed.why}), so the same decision tries the next account with room now.`
      );
      skip.add(failed.target.id);
    }
  };

  /** The target each session was last said to have no room for, so a held one's line is said once a target. */
  const roomSaid = new Map<string, string>();

  /** What waiting costs `row` on `current`, as a move's line says it beside what moving costs. */
  const waitSide = (
    row: LimitRow,
    current: Account,
    carries: boolean,
    cause: Cause,
    now: number
  ): string => {
    const from = accountNameAmong(current, db.accounts.list());
    if (carries) {
      return "one organization, so its cache carries and the move re-reads nothing cold";
    }
    if (cause === "refused") {
      return `${from}'s sign-in is refused, so it can't go on there at all`;
    }
    if (cause === "credits") {
      return `${from} says to leave its extra usage for an account with plan room`;
    }
    const reset = refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    );
    const expires = ports.cacheExpiresAt(row);
    const cold = ports.admission.check(row, current, false, now).projected;
    return `waiting for ${from}'s reset${reset === null ? "" : ` at ${clockWords(reset)}`} would re-read it cold too (${usdWords(cold.reReadUsd)}), as its cache ${expires === null || expires <= now ? "is cold already, or no lifetime of it was measured" : `lapses at ${clockWords(expires)}, before that`}`;
  };

  /** Says why `row` waits for its own reset: it comes before its cache lapses, so waiting costs nothing. */
  const sayWarmWait = (
    row: LimitRow,
    current: Account,
    until: number,
    now: number
  ): void => {
    const from = accountNameAmong(current, db.accounts.list());
    const expires = ports.cacheExpiresAt(row);
    const cold = ports.admission.check(row, current, false, now).projected;
    console.info(
      `[at-limit] ${ports.named(row)} waits on ${from} for its reset at ${clockWords(until)}: ${expires !== null && until <= expires ? `its prompt cache lasts until ${clockWords(expires)}, past the reset, so waiting costs nothing more than its next turn` : "the reset is that close"}, where moving would re-read it cold for ${usdWords(cold.reReadUsd)}.`
    );
  };

  /**
   * `row` would move to `target`, but `target` has no room left for its
   * re-read after the moves admitted there already: it stays held on
   * `current` (until its own reset, each look deciding again), one whose
   * sign-in was refused held as such, one on extra usage left going there.
   */
  const notAdmitted = (
    row: LimitRow,
    current: Account,
    target: Account,
    words: string,
    cause: Cause,
    now: number
  ): void => {
    if (cause === "credits") {
      stillOnExtraUsage(row, current, "full");
      return;
    }
    if (cause === "refused") {
      holdRefused(row, current);
    } else {
      hold(row, current, {
        action: "wait",
        until: holdUntil(row, current, now),
        why: "full",
      });
    }
    if (roomSaid.get(row.id) === target.id) {
      return;
    }
    roomSaid.set(row.id, target.id);
    const accounts = db.accounts.list();
    const from = accountNameAmong(current, accounts);
    console.info(
      `[at-limit] ${ports.named(row)} stays held on ${from}, not moved to ${accountNameAmong(target, accounts)}: ${words}. ${waitSide(row, current, false, cause, now)}, and it waits for the next account with room, or ${from}'s reset, whichever the next look finds first.`
    );
  };

  /** A decision that keeps `row` where it is: held there, or, on extra usage, left going. */
  const waits = (
    row: LimitRow,
    current: Account,
    decision: Extract<AtLimitDecision, { action: "wait" }> | undefined,
    cause: Cause,
    now: number
  ): void => {
    settling.delete(row.id);
    if (cause === "credits") {
      stillOnExtraUsage(row, current, decision?.why);
      return;
    }
    if (!decision) {
      holdRefused(row, current);
      return;
    }
    if (
      decision.why === "soon" &&
      db.atLimit.hold(row.id)?.until !== decision.until
    ) {
      sayWarmWait(row, current, decision.until, now);
    }
    hold(row, current, decision);
  };

  /**
   * One try of {@link decideAndMove}, never to an account in `skip`: held,
   * left to settle, moved, or kept by its process (held as it was). The
   * target and why when the target's part failed, so another account may
   * take it.
   */
  const tryOnce = async (
    row: LimitRow,
    current: Account,
    cause: Cause,
    skip: ReadonlySet<string>
  ): Promise<{ target: Account; why: string } | undefined> => {
    const now = Date.now();
    const decision = decideFor(row, current, now, cause, skip);
    if (!decision || decision.action === "wait") {
      waits(row, current, decision, cause, now);
      return undefined;
    }
    const target = db.accounts.get(decision.targetId);
    if (!target) {
      return undefined;
    }
    const verdict = ports.admission.check(
      row,
      target,
      decision.sameOrganization,
      now
    );
    if (!verdict.ok) {
      settling.delete(row.id);
      notAdmitted(row, current, target, verdict.words, cause, now);
      return undefined;
    }
    // Reserved now, before any await, so a second decision meanwhile counts it.
    ports.admission.charge(row, target, verdict);
    // One on extra usage was answered, not stopped: its chip says nothing,
    // as at a rebalance's move.
    if (cause !== "credits") {
      towards.set(row.id, { from: current, to: target });
    }
    ports.changed();
    // Only between turns: never inside a tool round, never over a turn
    // someone started since.
    if (!(await ports.idle(row))) {
      ports.admission.refund(row.id);
      settle(
        row,
        current,
        cause,
        actionWords(current, target, db.accounts.list())
      );
      return undefined;
    }
    const was = settling.get(row.id);
    if (was) {
      lifetime.cancel(was.timer);
      settling.delete(row.id);
    }
    db.atLimit.dropHold(row.id);
    roomSaid.delete(row.id);
    console.info(
      `[at-limit] ${ports.named(row)} moves from ${accountNameAmong(current, db.accounts.list())} to ${accountNameAmong(target, db.accounts.list())}: ${waitSide(row, current, decision.sameOrganization, cause, now)}; moving, ${verdict.words}.`
    );
    if (cause === "credits") {
      extraUsageSaid.delete(row.id);
      const accounts = db.accounts.list();
      const named = accountNameAmong(current, accounts);
      console.info(
        `[at-limit] ${ports.named(row)} ran its turn on ${named}'s extra usage, past its plan limit, and ${named} says to move to an account with plan room then, so it moves whole to ${accountNameAmong(target, accounts)} now, between turns. It waits there for its next message.`
      );
    }
    const kept = await moveWhole(row, current, target, decision, now, cause);
    if (!kept) {
      return undefined;
    }
    ports.admission.refund(row.id);
    unmoved(row, current, target, kept.why, {
      // One on extra usage goes on there: nothing holds it.
      held: !kept.target && cause !== "credits",
      refused: cause === "refused",
      waits: kept.later,
    });
    return kept.target ? { target, why: kept.why } : undefined;
  };

  /** The account a refused session is on, when it runs on one the hub knows. */
  const currentOf = (row: LimitRow): Account | undefined => {
    const accountId = ports.accountOf(row);
    return accountId ? db.accounts.get(accountId) : undefined;
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
    if (!(
      last?.kind === "stopped" &&
      last.account.id === current.id &&
      last.resetsAt === resetsAt
    )) {
      // Its line says it, in the log too ({@link AtLimitPorts.note}).
      ports.note(row, {
        kind: "stopped",
        account: namedAccount(current, db.accounts.list()),
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
        `[at-limit] ${ports.named(row)}: ${accountNameAmong(current, db.accounts.list())} is signed in again on its machine, so it carries on there.`
      );
      ports.resume(row, "signin");
    }
  };

  /**
   * One held session: past its own account's reset, it carries on where it
   * is once it is between turns; past the moment another account frees, or
   * before either, a decision moves it to an account with room (or holds it
   * again). One held on its refused credential (`until` null) carries on
   * where it is once its account is signed in there again, and until then
   * moves as soon as another account can take it.
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
    const ownReset = refusedUntil(
      db.accounts.bench(now),
      readingOf(current.id),
      current.id,
      row.model,
      now
    );
    if (held.until > now || (ownReset !== null && ownReset > now)) {
      await act(row, current);
      return;
    }
    if (await ports.idle(row)) {
      db.atLimit.dropHold(row.id);
      console.info(
        `[at-limit] ${ports.named(row)}: ${accountNameAmong(current, db.accounts.list())}'s limit has reset, so it carries on there, told to pick up where the limit stopped it.`
      );
      ports.resume(row, "limit");
    }
  };

  /**
   * The holds in the order admission takes them: sessions a person waits
   * on first, then orchestrators with live children, then the rest; each
   * group by how long it has been held.
   */
  const admissionOrder = (holds: LimitHold[]): LimitHold[] => {
    const rows = db.listInstances();
    const parents = new Set(
      rows.flatMap((one) =>
        one.parentInstanceId && !over(one) ? [one.parentInstanceId] : []
      )
    );
    const byId = new Map(rows.map((one) => [one.id, one]));
    const rank = (held: LimitHold): number => {
      const row = byId.get(held.instanceId);
      if (!row) {
        return 3;
      }
      if (ports.waitedOn(row)) {
        return 0;
      }
      return parents.has(row.id) ? 1 : 2;
    };
    return holds
      .map((held) => ({ held, rank: rank(held) }))
      .sort(
        (a, b) => a.rank - b.rank || (a.held.since ?? 0) - (b.held.since ?? 0)
      )
      .map((one) => one.held);
  };

  /** One look at every hold, in admission order ({@link admissionOrder}). */
  const lookAtHolds = async (): Promise<void> => {
    const now = Date.now();
    for (const held of admissionOrder(db.atLimit.holds())) {
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

  /** One look: every hold, then every provider on every machine rebalanced. */
  const tick = async (): Promise<void> => {
    await lookAtHolds();
    await rebalancer.everyPair();
  };

  /**
   * A hold whose move waits on work in flight, as its stalled words say it:
   * where it moves, what it waits for, and the first moment the hub acts
   * without it, `until`. That is the restart bound from when it began to
   * wait (core `RESTART_WAIT_CAP_MS`), when the move goes and ends that work
   * (server.ts `waitForLater`), never the reset the move beats; or the
   * hold's own `until` when that comes first, when it carries on where it
   * is ({@link lookAt}).
   */
  const carryStall = (
    from: string,
    carry: NonNullable<LimitHold["carry"]>,
    resets: number | null
  ): Stall => {
    const to = db.accounts.get(carry.to);
    const toName = to
      ? accountNameAmong(to, db.accounts.list())
      : "another account";
    const by = carry.since + RESTART_WAIT_CAP_MS;
    const work = carry.why.startsWith(WORK_IN_FLIGHT)
      ? carry.why.slice(WORK_IN_FLIGHT.length)
      : carry.why;
    if (resets !== null && resets <= by) {
      return {
        words: accountsWords.stalled.carryingUntilReset(
          from,
          toName,
          work,
          clockWords(resets)
        ),
        until: resets,
      };
    }
    return {
      words: accountsWords.stalled.carrying(from, toName, work, clockWords(by)),
      until: by,
    };
  };

  /**
   * Arms the next look: the earliest moment a held session's account frees
   * (its own reset, or another's that comes first), else the recheck, while
   * anything is held or two accounts could balance.
   */
  const plan = (): void => {
    lifetime.cancel(timer);
    timer = undefined;
    if (lifetime.closed()) {
      return;
    }
    const now = Date.now();
    const holds = db.atLimit.holds();
    if (holds.length === 0 && rebalancer.pairs().length === 0) {
      return;
    }
    const at = Math.min(
      now + RECHECK_MS,
      ...holds.map((one) => one.until ?? Number.POSITIVE_INFINITY)
    );
    timer = lifetime.after(Math.max(1000, at - now), () => {
      detach(tick().finally(plan), "at-limit look");
    });
  };

  rebalancer.accountsChanged();

  return {
    /**
     * `instanceId` stopped at its account's limit, in words, while it is:
     * on its way to an account with room (now, or once its turn ends), its
     * move waiting on work in flight (when that ends, by the restart bound
     * at the latest, as the hub's line says: {@link carryStall}), held
     * until the earliest reset (`until`, epoch ms; its own account's, or
     * another's that frees first and takes it), or held on a refused sign-in
     * until an account can take it. Undefined while it runs.
     */
    stall(instanceId: string): Stall | undefined {
      const words = accountsWords.stalled;
      const held = db.atLimit.hold(instanceId);
      if (held) {
        const from = db.accounts.get(held.accountId);
        const name = from
          ? accountNameAmong(from, db.accounts.list())
          : "its account";
        if (held.carry) {
          return carryStall(name, held.carry, held.until);
        }
        if (held.until === null) {
          return { words: words.signedOut(name) };
        }
        const last = db.atLimit.events([instanceId]).at(-1)?.move;
        const frees =
          last?.kind === "waiting" && last.until === held.until
            ? last.frees
            : undefined;
        const clock = clockWords(held.until);
        return {
          words: frees
            ? words.waitingOn(name, frees.name, clock)
            : words.waiting(name, clock),
          until: held.until,
        };
      }
      const moving = towards.get(instanceId);
      if (!moving) {
        return undefined;
      }
      const accounts = db.accounts.list();
      return {
        words: words.moving(
          accountNameAmong(moving.from, accounts),
          accountNameAmong(moving.to, accounts)
        ),
      };
    },
    /** Every session {@link stall} says is stopped now: held, or on its way to another account. */
    stalled(): string[] {
      return [
        ...new Set([
          ...db.atLimit.holds().map((one) => one.instanceId),
          ...towards.keys(),
        ]),
      ];
    },
    /**
     * Whether `instanceId` is in this controller's hands now: held until a
     * reset, looked at again while its refused turn settles, or being
     * moved. What it is told next is this controller's to send.
     */
    handling(instanceId: string): boolean {
      return (
        acting.has(instanceId) ||
        settling.has(instanceId) ||
        db.atLimit.hold(instanceId) !== undefined
      );
    },
    /**
     * `instanceId`'s hold looked at now rather than at the next recheck
     * ({@link RECHECK_MS}): its machine is back, or a message to it is held
     * at its limit. The move a person asked is carried out, or the move this
     * controller decides goes, as at any look; `why` is
     * logged with it. Nothing for a session held by nothing, or being acted on.
     */
    async lookNow(instanceId: string, why: string): Promise<void> {
      const held = db.atLimit.hold(instanceId);
      if (!held || acting.has(instanceId)) {
        return;
      }
      const row = rowOf(instanceId);
      console.info(
        `[at-limit] ${row ? ports.named(row) : instanceId} is looked at again now, not at the next recheck: ${why}.`
      );
      await lookAt(held, Date.now());
      plan();
    },
    /**
     * `instanceId` never runs again (a continuation took its work item on):
     * its hold goes, and with it the resume at its reset; a look still
     * waiting on its turn's end is cancelled, and it is on its way nowhere.
     */
    forget(instanceId: string): void {
      const was = settling.get(instanceId);
      if (was) {
        lifetime.cancel(was.timer);
        settling.delete(instanceId);
      }
      towards.delete(instanceId);
      extraUsageSaid.delete(instanceId);
      const held = db.atLimit.hold(instanceId);
      db.atLimit.dropHold(instanceId);
      if (held || was) {
        console.info(
          `[at-limit] ${instanceId.slice(0, 8)} was continued in a new session, so its ${held ? `hold${held.until === null ? "" : ` until ${clockWords(held.until)}`}` : "look at its turn's end"} is dropped: nothing resumes it.`
        );
      }
      ports.changed();
      plan();
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
        `[at-limit] ${ports.named(row)}'s turn was refused: ${accountNameAmong(current, db.accounts.list())} is at its limit${resets === null ? "" : ` until ${clockWords(resets)}`}. ${ports.handMove(row) ? "A person moved it, so that move is all the hub does with it." : "The hub decides now whether it moves whole to an account with room or waits for the earliest reset."}`
      );
      // A person moved it: that move is all that is done, whoever started
      // the turn and whoever's work it is.
      if (ports.handMove(row)) {
        await act(row, current);
        return;
      }
      const word = ports.startedBy(row);
      if (word && noticeTurn(word.origin) && leftAlone(row, current, word)) {
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
      const named = accountNameAmong(current, db.accounts.list());
      console.info(
        `[at-limit] ${ports.named(row)}'s turn ended because Claude Code refused ${named}'s sign-in, so ${named} is signed out on its machine. It moves to another account and carries on there; with none free, it waits until ${named} is signed in again in Configure → Accounts.`
      );
      await act(row, current, "refused");
    },
    /**
     * A turn of `instanceId` ended as any turn does: the rebalancer may look
     * at it again, and one its account's extra usage answered past a plan
     * limit moves, or stays, as that account says ({@link extraUsageTurn}).
     */
    turnEnded(instanceId: string): void {
      rebalancer.turnEnded(instanceId);
      detach(extraUsageTurn(instanceId), "at-limit extra usage");
    },
    /** Looks at every hold now, then rebalances every provider on every machine. */
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
