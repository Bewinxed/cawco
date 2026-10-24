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
  configurePage,
  type HeldReason,
  keepsGoingOnExtraUsage,
  type LimitWindow,
  type MoveEnded,
  modelScope,
  type NeutralOrigin,
  namedAccount,
  type PlacementStrategy,
  type RebalanceNotice,
  tokenWords,
  type WaitReason,
  windowWords,
} from "@cawco/core";
import {
  RESTART_WAIT_CAP_MS,
  WORK_IN_FLIGHT,
} from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import {
  type Admission,
  type Ledger,
  movePctOf,
  NEXT_TURN_ALLOWANCE_USD,
  pricedTokens,
  projectedMove,
  roomAfterPct,
  usdWords,
} from "./admission";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import { type LimitHold, waitsLine } from "./db/at-limit";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  type AccountRow,
  type Arrival,
  accountRows,
  type PlacementInput,
  pinnedOf,
  runsOutBy,
  SESSION_WINDOW_MS,
  strategyOrder,
} from "./placement";
import { createRebalancer, readForecast, sessionBurn } from "./rebalance";
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
 * between turns. A session stopped at its limit, or on its refused sign-in,
 * runs no turn. When a person waits on it, nothing it holds for later (a
 * background command, a monitor, a wake-up) keeps it where it is: its move
 * ends that work and it is told on the new account what ended (server.ts
 * `moveRowsToAccount` with `stopped`), as a person's pick does. When nobody
 * does (a delegate's work), its move waits for that work until it has been
 * held `RESTART_WAIT_CAP_MS`, counted from its hold's start across a hub
 * restart, and ends it then.
 *
 * Where it goes, or whether it waits, is one pure pass over what the hub
 * already knows ({@link decideStop}): every account's readings, the moves
 * admitted onto each (admission.ts), organizations, the session's cache
 * expiry and real context, and who waits on it. No account is tried and
 * failed in turn. A move that fails for the target's part
 * ({@link Kept.target}) goes to the next account the same decision weighed.
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
 * when it carries on (epoch ms): the reset it waits for.
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
 * background task, a one-time wake-up), which a move of a running session
 * waits for up to `RESTART_WAIT_CAP_MS` and then ends (server.ts
 * `waitForLater`). A stopped session a person waits on never meets it, as
 * its move ends that work; any other's move waits for it until it has been
 * held that long, counted from its hold's start. That work, in its
 * machine's words ("waiting for work in flight to end: 1 command
 * running"), where `why` is the line's whole reason.
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

/* ------------------------------------------ the decision, one pure pass — */

const MINUTE_MS = 60_000;

/**
 * Who waits on a stopped session: a person (`watched`: a question or
 * permission of it pending, or a top-level session whose last turn a person
 * sent), the work it was given (`driven`: a live work item's session, or a
 * turn its parent sent), or nobody. A watched session never waits long or on
 * what its process holds for later; a driven one waits while waiting costs
 * nothing.
 */
export type Presence = "watched" | "driven" | "nobody";

/**
 * What stopped it: its account's limit refused a turn (`limit`), Claude Code
 * refused the account's credential for good (`refused-credential`), a turn
 * ran on the account's extra usage past a plan limit and the account says to
 * move then (`extra-usage`), or its account is forecast to run out before it
 * resets (`forecast`, the rebalance: a wait means it stays).
 */
export type StopCause =
  "limit" | "refused-credential" | "extra-usage" | "forecast";

/** Another account of the session's provider as the decision reads it: placement's row, the ledger's figures, and whether a turn on the session's machine proved its sign-in lately. */
export interface StopAccount extends AccountRow, Ledger {
  proven: boolean;
}

/** The stopped session as the decision reads it. */
export interface StopSession {
  /** Its expected burn, weighted tokens an hour (rebalance.ts `sessionBurn`); null when unmeasured. */
  burn: number | null;
  /** When its prompt cache lapses on its account, as measured; null when it is cold. */
  cacheExpiresAt: number | null;
  cacheTtl: string | null;
  /** Whether it takes the compaction's steps once moved (at-limit ports `compactable`). */
  compactable: boolean;
  /** The last request's prompt, as its harness last reported it; null when never. */
  context: number | null;
  /** A fork reads its origin's cache: it never moves on its own. */
  forked: boolean;
  /** The account a person moved it to and it has not reached yet; null when none is owed. */
  handMove: string | null;
  id: string;
  model: string | null;
  presence: Presence;
  /** The tokens one request to its model may send; null when unknown. */
  window: number | null;
}

/** The kind's strategy (core `StrategyChoice`): its pin, and the delegate type's preferred account. */
export interface StopStrategy {
  kind: PlacementStrategy;
  pinned: string | null;
  prefers: string | null;
}

export interface StopInput {
  /** Every other account of its provider. */
  accounts: readonly StopAccount[];
  cause: StopCause;
  current: {
    id: string;
    organization: string | null;
    /**
     * When it may go on there: the reset (or bench) that refused it; for a
     * forecast, when it runs out. Null when nothing said: the policy's wait.
     */
    resetAt: number | null;
  };
  now: number;
  policy: Pick<AtLimit, "move" | "moveWholeUnderK" | "waitMinutes">;
  session: StopSession;
  strategy: StopStrategy;
}

/** One account the session may move to, with what the move costs there and leaves. */
export interface StopTarget {
  accountId: string;
  /** One organization and its cache still warm: the move reads it from cache ({@link cacheCarries}). */
  carries: boolean;
  /** It files its open items and is compacted natively once there. */
  compact: boolean;
  /** It lasts to every reset with the session's burn and what already arrives there. */
  lasts: boolean;
  /** What this move takes of its window, percent, its next turn's allowance in; null when unmeasured or unpriced. */
  movePct: number | null;
  /** The re-read's own cost, dollars; null when its model is unpriced. */
  moveUsd: number | null;
  /** What its binding window has left once this move and those before it land, percent. */
  roomAfter: number;
  /** When it runs out with the session on it; null when it lasts. */
  runsOutAt: number | null;
  usdPerPct: number | null;
}

/** Why one other account didn't take the session, or that it could (core `HeldReason`). */
export interface StopReason {
  accountId: string;
  backAt?: number;
  reason: HeldReason;
}

/**
 * Why it waits: a fork, the policy off, its own reset near (`soon`), its
 * cache outlasting that reset (`free`), no account fits (`full`), the account
 * a person moved it to is full (`hand`), or, at a forecast, a warm cache that
 * moves at its limit instead (`warm`).
 */
export type StopWhy =
  "fork" | "off" | "soon" | "free" | "full" | "hand" | "warm";

interface Priced {
  /** Every other account and why it didn't take the session, or that it could. */
  accounts: StopReason[];
  /** What a move into a cold cache re-reads, dollars; null when unpriced. */
  coldUsd: number | null;
  /** The context priced: the last request's, capped at its model's window. */
  tokens: number;
  /** What waiting for its own reset re-reads: nothing when its cache outlasts it, else a cold write. */
  waitUsd: number | null;
}

export type StopDecision =
  | (Priced & {
      action: "move";
      /**
       * The accounts that fit, best first: the first is the target; the rest
       * are used only when the target's own part fails ({@link Kept.target}).
       */
      targets: StopTarget[];
    })
  | (Priced & {
      action: "wait";
      /** The account that frees first and takes it, when that comes before `until` would. */
      frees?: string;
      /** The earliest moment an account takes it again. */
      until: number;
      why: StopWhy;
    });

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

/** Two organizations as accounts name them: one, when both name the same. */
const oneOrganization = (a: string | null, b: string | null): boolean =>
  !!a && a === b;

/** Two accounts of one organization share its prompt cache and its thinking. */
export const sameOrganization = (a: Account, b: Account): boolean =>
  oneOrganization(
    a.identity?.organization || null,
    b.identity?.organization || null
  );

/**
 * Whether moving a session from `a` to `b` keeps its prompt cache: one
 * organization, whose carries read it, while the cache is still warm
 * (`warm`). A cold cache is written again on any account.
 */
export const cacheCarries = (a: Account, b: Account, warm: boolean): boolean =>
  warm &&
  sameOrganization(a, b) &&
  SAME_ORGANIZATION_CARRY_CACHE_READ >= CACHE_KEPT_AT;

/** A window's use at `now`: one whose reset has passed with no newer reading is a fresh one. */
const usedAt = (
  window: Pick<AccountRow["windows"][number], "resetsAt" | "utilization">,
  now: number
): number =>
  window.resetsAt && Date.parse(window.resetsAt) <= now
    ? 0
    : window.utilization;

/** The higher of an account's windows' use: what stops it first. */
const bindingOf = (account: Pick<AccountRow, "windows">, now: number): number =>
  Math.max(0, ...account.windows.map((window) => usedAt(window, now)));

/** When an account's 5-hour window resets; one not open yet counts as resetting 5 hours from now. */
const sessionResetOf = (account: Pick<AccountRow, "windows">, now: number) => {
  const window = account.windows.find((one) => one.kind === "session");
  const at = window?.resetsAt ? Date.parse(window.resetsAt) : null;
  return at !== null && at > now ? at : now + SESSION_WINDOW_MS;
};

/** One account weighed for the session: what a move there costs and leaves, and why it doesn't fit (none when it does). */
interface Weighed {
  account: StopAccount;
  binding: number;
  /** What it has left now, before this move, percent. */
  left: number;
  /** Why it doesn't take the session now; undefined when it fits. */
  out: HeldReason | undefined;
  target: StopTarget;
}

/** Whether a ledger leaves a move unmeasured: the account takes one at a time then. */
const unmeasured = (account: StopAccount, movePct: number | null): boolean =>
  movePct === null || account.spentPct === null || account.pendingPct === null;

/** Why `account` doesn't take the session now, in the order the rules read; undefined when it fits. */
const reasonOf = (
  input: StopInput,
  account: StopAccount,
  weighed: {
    binding: number;
    carries: boolean;
    left: number;
    movePct: number | null;
    roomAfter: number;
    runsOutAt: number | null;
  }
): HeldReason | undefined => {
  const { now, policy, strategy } = input;
  const { binding, carries, left, movePct, roomAfter, runsOutAt } = weighed;
  if (!account.signedIn) {
    return { kind: "signin" };
  }
  if (account.notAllowedBy) {
    return { kind: "allowed", by: account.notAllowedBy };
  }
  if (account.benchedUntil !== null) {
    return { kind: "benched" };
  }
  if (account.pastReserve !== null) {
    return { kind: "reserve", pct: account.pastReserve };
  }
  if (!account.read) {
    return { kind: "unread" };
  }
  if (binding >= 100) {
    return { kind: "limit" };
  }
  if (
    strategy.kind === "pinned" &&
    account.id !== strategy.pinned &&
    account.neverBackup
  ) {
    return { kind: "backup" };
  }
  if (unmeasured(account, movePct) && account.pendingMoves > 0) {
    return { kind: "alone" };
  }
  if (roomAfter <= 0) {
    return { kind: "room", leftPct: left, movePct: movePct ?? 0 };
  }
  // Ahead of a run-out, a move its cache carries goes only to an account
  // that lasts.
  if (
    runsOutAt !== null &&
    (runsOutAt - now <= policy.waitMinutes * MINUTE_MS ||
      (input.cause === "forecast" && carries))
  ) {
    return { kind: "runsOut", leftPct: left, at: runsOutAt };
  }
  return undefined;
};

const weigh = (
  input: StopInput,
  account: StopAccount,
  tokens: number,
  warm: boolean
): Weighed => {
  const { now, session, policy, current } = input;
  const carries =
    warm &&
    oneOrganization(current.organization, account.organization) &&
    SAME_ORGANIZATION_CARRY_CACHE_READ >= CACHE_KEPT_AT;
  const projected = projectedMove(session, tokens, carries, now);
  const movePct = movePctOf(projected, account.usdPerPct);
  const binding = bindingOf(account, now);
  const roomAfter = roomAfterPct(binding, account, movePct);
  const left = roomAfterPct(binding, account, null);
  const runsOutAt = runsOutBy(
    account.windows,
    session.burn ?? 0,
    account.arrivals,
    account.id,
    now
  );
  const reported =
    session.context === null
      ? null
      : Math.min(session.context, session.window ?? session.context);
  const target: StopTarget = {
    accountId: account.id,
    carries,
    compact:
      !carries &&
      input.cause !== "refused-credential" &&
      input.cause !== "forecast" &&
      session.compactable &&
      reported !== null &&
      reported >= policy.moveWholeUnderK * 1000,
    lasts: runsOutAt === null,
    moveUsd: projected.reReadUsd,
    movePct,
    roomAfter,
    runsOutAt,
    usdPerPct: account.usdPerPct,
  };
  const out = reasonOf(input, account, {
    binding,
    carries,
    left,
    movePct,
    roomAfter,
    runsOutAt,
  });
  return { account, binding, out, left, target };
};

/** The reasons a decision names: every other account, by its own reason, or that it could take the session. */
const reasonsOf = (weighed: readonly Weighed[]): StopReason[] =>
  weighed.map((one) => ({
    accountId: one.account.id,
    ...(one.out && one.account.backAt !== null && one.account.read
      ? { backAt: one.account.backAt }
      : {}),
    ...(one.out?.kind === "benched" && one.account.benchedUntil !== null
      ? { backAt: one.account.benchedUntil }
      : {}),
    reason: one.out ?? {
      kind: "fits",
      carries: one.target.carries,
      leftPct: one.left,
    },
  }));

/**
 * The accounts that fit, best first (rule 4): those its cache carries to
 * first, then within each, those that last before those that don't, then
 * the kind's strategy (the delegate type's account at its head, as placement
 * has it), then a sign-in a turn proved, as a tie-breaker only, then the most
 * room left after the move.
 */
const ordered = (input: StopInput, fit: readonly Weighed[]): Weighed[] => {
  const { strategy, now } = input;
  const order = strategyOrder(strategy.kind, strategy.pinned ?? undefined);
  const ranked = (one: Weighed) => ({
    id: one.account.id,
    order: one.account.order,
    createdAt: one.account.createdAt,
    binding: one.binding,
    sessionReset: sessionResetOf(one.account, now),
  });
  return [...fit].sort(
    (a, b) =>
      Number(b.target.carries) - Number(a.target.carries) ||
      Number(b.target.lasts) - Number(a.target.lasts) ||
      Number(b.account.id === strategy.prefers) -
        Number(a.account.id === strategy.prefers) ||
      order(ranked(a), ranked(b)) ||
      Number(b.account.proven) - Number(a.account.proven) ||
      b.target.roomAfter - a.target.roomAfter
  );
};

/**
 * What a session stopped at its account's limit does, from what the hub
 * already knows, in one pure pass: no account is tried and failed in turn.
 * Pure: the same input gives the same decision, and nothing is read or
 * written (prices are the listed rates of `input.now`).
 *
 * Per account: whether its cache carries there (one organization, its cache
 * warm), what the move re-reads (warm, else cold, of its last request's
 * context capped at its model's window), what that takes of the account's
 * window and what it leaves after the moves already admitted there, and
 * whether the account lasts to its resets with the session's burn and what
 * already arrives there. An account fits when it is read, signed in on the
 * session's machine, allowed, off its bench, inside its reserve, under its
 * limits, left with room after the move, and lasts, or runs out only past
 * the policy's wait.
 *
 * The rules, in order:
 * 1. a person's move: there only, or a wait until that account is back;
 * 2. a fork waits; 3. the policy off waits;
 * 4. the accounts that fit, ordered ({@link ordered});
 * 5. one its cache carries to: it moves there at once, whole;
 * 6. its own reset within the policy's wait: it waits (`soon`);
 * 7. its cache outlasting that reset: it waits, for nothing (`free`), unless a
 *    person waits on it, the reset is further than the policy's wait, and an
 *    account fits: then it moves cold;
 * 8. an account that fits: it moves cold, compacted there when its context is
 *    `moveWholeUnderK` or more;
 * 9. none fits: it waits until its own reset, or until the account that
 *    frees first and would take it does, when that is sooner, every
 *    account's reason named.
 *
 * A refused credential can't go on where it is at all: neither a fork, the
 * policy, nor a reset keeps it there (rules 2, 3, 6 and 7 pass it by), and it
 * is moved whole, never compacted. At a forecast (`forecast`, the rebalance)
 * a wait means it stays: a move its cache carries to goes only to an account
 * that lasts; a cold move only when its cache is cold already, or a person
 * waits on it and the move re-reads less than the policy's floor would; it
 * is never compacted.
 */
export const decideStop = (input: StopInput): StopDecision => {
  const { now, policy, session, current, cause } = input;
  const waitMs = policy.waitMinutes * MINUTE_MS;
  const resetAt = current.resetAt ?? now + waitMs;
  const tokens = pricedTokens(session.context, session.window);
  const warm = session.cacheExpiresAt !== null && session.cacheExpiresAt > now;
  const coldUsd = projectedMove(session, tokens, false, now).reReadUsd;
  // Waiting is free when its cache outlasts the reset; a context with
  // nothing to price re-reads nothing either way, which makes no wait free.
  const outlasts =
    session.cacheExpiresAt !== null && resetAt <= session.cacheExpiresAt;
  const waitUsd = outlasts ? 0 : coldUsd;
  const weighed = input.accounts.map((account) =>
    weigh(input, account, tokens, warm)
  );
  const priced: Priced = {
    accounts: reasonsOf(weighed),
    coldUsd,
    tokens,
    waitUsd,
  };
  const wait = (
    why: StopWhy,
    until = resetAt,
    frees?: string
  ): StopDecision => ({
    action: "wait",
    why,
    until,
    ...(frees ? { frees } : {}),
    ...priced,
  });
  const move = (targets: Weighed[]): StopDecision => ({
    action: "move",
    targets: targets.map((one) => one.target),
    ...priced,
  });

  // 1. A person's move: there only.
  if (session.handMove) {
    const hand = weighed.find((one) => one.account.id === session.handMove);
    if (!hand || hand.account.benchedUntil !== null || hand.binding >= 100) {
      return wait("hand", hand?.account.backAt ?? resetAt, session.handMove);
    }
    return move([hand]);
  }
  const refused = cause === "refused-credential";
  // 2, 3.
  if (!refused && session.forked) {
    return wait("fork");
  }
  if (!(refused || policy.move)) {
    return wait("off");
  }
  // 4.
  const fit = ordered(
    input,
    weighed.filter((one) => one.out === undefined)
  );
  const warmTier = fit.filter((one) => one.target.carries);
  const coldTier = fit.filter((one) => !one.target.carries);
  const cold = coldVerdict(input, priced, coldTier, {
    outlasts,
    resetAt,
    wait,
    warm,
  });
  // 5. Its cache carries: it moves at once; a cold move follows it only
  // where the rules below would have moved it cold.
  if (warmTier.length > 0) {
    return move([...warmTier, ...(cold === "move" ? coldTier : [])]);
  }
  if (cold !== "move") {
    return cold;
  }
  if (coldTier.length > 0) {
    return move(coldTier);
  }
  // 9. None fits.
  const back = soonestBack(input, weighed);
  return back && back.at < resetAt
    ? wait("full", back.at, back.accountId)
    : wait("full");
};

/**
 * Rules 6 to 8 with no account its cache carries to: `move` when it moves
 * cold to the first of `coldTier` (or, with none, falls to rule 9), else the
 * wait they say.
 */
const coldVerdict = (
  input: StopInput,
  priced: Priced,
  coldTier: readonly Weighed[],
  how: {
    /** Its cache outlasts its own reset: waiting re-reads nothing. */
    outlasts: boolean;
    resetAt: number;
    wait: (why: StopWhy) => StopDecision;
    warm: boolean;
  }
): StopDecision | "move" => {
  const { outlasts, resetAt, wait, warm } = how;
  const { now, policy, session, cause } = input;
  if (cause === "refused-credential") {
    return "move";
  }
  const waitMs = policy.waitMinutes * MINUTE_MS;
  const waitFor = resetAt - now;
  // 6.
  if (waitFor <= waitMs) {
    return wait("soon");
  }
  // 7.
  if (outlasts && !(session.presence === "watched" && coldTier.length > 0)) {
    return wait("free");
  }
  // 8, at a forecast: across organizations only cold, or watched and cheap.
  if (cause === "forecast" && coldTier.length > 0 && warm) {
    const floor = projectedMove(
      session,
      policy.moveWholeUnderK * 1000,
      false,
      now
    ).reReadUsd;
    const cheap =
      session.presence === "watched" &&
      priced.coldUsd !== null &&
      floor !== null &&
      priced.coldUsd < floor;
    if (!cheap) {
      return wait("warm");
    }
  }
  return "move";
};

/**
 * The account that frees soonest among those that would otherwise take the
 * session (signed in, allowed, read, a backup when the pin is out, and back
 * at a moment a reading names), and when.
 */
const soonestBack = (
  input: StopInput,
  weighed: readonly Weighed[]
): { accountId: string; at: number } | undefined => {
  let soonest: { accountId: string; at: number } | undefined;
  for (const one of weighed) {
    const { account } = one;
    const kind = one.out?.kind;
    if (
      !(
        (kind === "benched" || kind === "reserve" || kind === "limit") &&
        account.read
      ) ||
      account.backAt === null ||
      account.backAt <= input.now ||
      (input.strategy.kind === "pinned" &&
        account.id !== input.strategy.pinned &&
        account.neverBackup)
    ) {
      continue;
    }
    if (!soonest || account.backAt < soonest.at) {
      soonest = { accountId: account.id, at: account.backAt };
    }
  }
  return soonest;
};

/* ------------------------------------------------------ the controller — */

/** How often a held session is looked at again before its reset. */
const RECHECK_MS = 5 * MINUTE_MS;
/** How soon a refused session still mid-turn on its machine is looked at again… */
const SETTLE_MS = 5000;
/** …for this long: a session busy past it started a turn its account took. */
const SETTLE_FOR_MS = 2 * MINUTE_MS;

/**
 * Why the controller acts on a session: its limit refused a turn, Claude
 * Code refused the account's credential for good (either way it carries on
 * where it moves to), or a turn of it ran on its account's extra usage past
 * a plan limit and the account says to move at a plan limit (core
 * `AtPlanLimit`): that turn was answered, so it moves between turns and
 * waits there for its next message, and nothing holds it where it is.
 */
type Cause = Exclude<StopCause, "forecast">;

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

/** What one read of the accounts gives a decision ({@link AtLimitPorts.accountRows}). */
export interface AccountsRead {
  /** Every other account of the provider, as {@link decideStop} reads it. */
  accounts: StopAccount[];
  /** The session's expected burn, weighted tokens an hour; null when unmeasured. */
  burn: number | null;
  strategy: StopStrategy;
  /** The tokens one request to its model may send; null when unknown. */
  window: number | null;
}

/** What a carry that went did: what it ended of its process's work held for later (core `MoveEnded`), when anything. */
export interface Carried {
  ended?: MoveEnded;
}

/** What the hub does for the controller: the parts that reach machines. */
export interface AtLimitPorts {
  /** The account `row` runs on now. */
  accountOf: (row: LimitRow) => string | undefined;
  /**
   * Every other account of `leaving`'s provider as a decision for `row`
   * reads it (placement.ts `accountRows`, the ledger's figures, whether a
   * turn proved its sign-in on `row`'s machine lately), with `row`'s burn,
   * its kind's strategy and its model's window: the one read of the accounts
   * a decision makes.
   */
  accountRows: (row: LimitRow, leaving: string) => AccountsRead;
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
  /**
   * Whether `row` takes the compaction's steps once moved (its filing turn
   * and `/compact`): a session whose work item is finished takes the hub's
   * word from nobody (work-items.ts `refusal`), so it moves whole and is not
   * compacted, never held behind a step that can't be sent.
   */
  compactable: (row: LimitRow) => boolean;
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
   * carry on there, told what its move ended. What it holds for later (a
   * background task, a wake-up) ends with the move, unless `laterSince` is
   * given: then the move waits for that work until it has been held
   * {@link RESTART_WAIT_CAP_MS} since `laterSince` (its hold's start), and
   * ends it after. A session moved between turns before any limit waits for
   * its next message, and its move waits for what it holds for later. With
   * `compact` (the line `line` already written for it, which follows the
   * compaction), its first steps there are its filing turn and Claude Code's
   * `/compact`, before the carry-on and everything it is owed (server.ts
   * `compactions`). Answers `kept` and why when it did not move: `row` is
   * still on its account then.
   */
  move: (
    row: LimitRow,
    accountId: string,
    carryOn: false | "limit" | "signin",
    compact?: { line: string; move: AccountMove },
    laterSince?: number
  ) => Promise<{ kept: Kept } | Carried>;
  /** `row` as a line names it: its title. */
  named: (row: LimitRow) => string;
  /**
   * Writes one line into `row`'s transcript; under `id`, the line already
   * written there is what it says now. A move waiting for work in flight
   * ({@link waitsLine}) is said again in the place of the one standing, and
   * any other line takes that one's place.
   */
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
  /** Takes the line `id` out of `row`'s transcript. */
  unnote: (row: Pick<LimitRow, "id">, id: string) => void;
  /**
   * Whether a person waits on `row`: a question or permission of it is
   * pending, or it is a top-level session whose last turn a person sent.
   * Admission takes these first.
   */
  waitedOn: (row: LimitRow) => boolean;
}

/**
 * Every other account of `leaving`'s provider as a decision for `row` reads
 * it ({@link AtLimitPorts.accountRows}): placement's rows (placement.ts
 * `accountRows`) with the burn already arriving on each (`how.owed`: the
 * sessions on their way to an account), the ledger's figures (admission.ts),
 * and whether a turn on `row`'s machine proved its sign-in since
 * `how.provenSince`; `row`'s own burn, its kind's strategy (`how.asks`),
 * its model's window.
 */
export const accountsRead = (
  db: DbShape,
  admission: Pick<Admission, "ledger">,
  row: LimitRow,
  leaving: string,
  how: {
    asks: Pick<
      PlacementInput,
      "kind" | "projectAccounts" | "taskAccounts" | "typeAccount"
    >;
    machineName: string;
    owed: ReadonlyMap<string, string>;
    provenSince: number;
    window: number | null;
  }
): AccountsRead => {
  const provider = db.accounts.get(leaving)?.provider;
  const now = Date.now();
  const accounts = db.accounts
    .list()
    .filter((account) => account.provider === provider);
  const { asks } = how;
  const choice = provider
    ? db.accounts.routing(provider)[asks.kind]
    : { strategy: "fill-first" as const };
  const strategy = {
    kind: choice.strategy,
    pinned: pinnedOf(choice, accounts) ?? null,
    prefers: asks.typeAccount ?? null,
  };
  if (!provider) {
    return { accounts: [], burn: null, strategy, window: how.window };
  }
  const forecast = readForecast(db, provider, now, how.owed);
  const proven = db.turnUsage.accountsUsedOn(row.machineId, how.provenSince);
  const rows = accountRows(
    {
      accounts,
      signins: db.accounts.signins(),
      readings: db.accounts.readings(),
      bench: db.accounts.bench(),
      routing: db.accounts.routing(provider),
      machineId: row.machineId,
      machineName: how.machineName,
      ...(row.model ? { model: row.model } : {}),
      ...asks,
      paces: forecast.paces,
      arrivals: forecast.arrivals.filter((one) => one.instanceId !== row.id),
      now,
    },
    leaving
  );
  return {
    accounts: rows.map((one) => ({
      ...one,
      ...admission.ledger(one.id, row.id, now),
      proven: proven.has(one.id),
    })),
    burn: sessionBurn([...forecast.turns.values()].flat(), row.id, now),
    strategy,
    window: how.window,
  };
};

/** What a decision reads through the ports, apart from the accounts. */
type InputPorts = Pick<
  AtLimitPorts,
  | "accountRows"
  | "cacheExpiresAt"
  | "compactable"
  | "handMove"
  | "startedBy"
  | "waitedOn"
>;

/** Whether `row` is the session of a live work item (work-items.ts `isLive`). */
const liveWorkOf = (db: DbShape, row: LimitRow): boolean => {
  const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
  return item?.instanceId === row.id && isLive(item.state);
};

/** Who waits on `row` ({@link Presence}). */
export const presenceOf = (
  db: DbShape,
  ports: Pick<AtLimitPorts, "startedBy" | "waitedOn">,
  row: LimitRow
): Presence => {
  if (ports.waitedOn(row)) {
    return "watched";
  }
  if (liveWorkOf(db, row)) {
    return "driven";
  }
  const origin = ports.startedBy(row)?.origin;
  return row.parentInstanceId &&
    origin?.kind === "peer" &&
    origin.fromSession === row.parentInstanceId
    ? "driven"
    : "nobody";
};

/**
 * What {@link decideStop} reads for `row` off `current`, for `cause`, at
 * `now`: one read of the accounts (`landing`: the sessions this look already
 * sent somewhere, as they arrive there), its policy, and what holds it there:
 * its own account's reset or bench, else `resetAt` when the caller names it
 * (a forecast's run-out).
 */
export const stopInputOf = (
  db: DbShape,
  ports: InputPorts,
  row: LimitRow,
  current: Account,
  cause: StopCause,
  now: number,
  landing: readonly Arrival[] = [],
  resetAt?: number | null
): StopInput => {
  const read = ports.accountRows(row, current.id);
  const arriving = landing.filter((one) => one.instanceId !== row.id);
  const landed = new Set(arriving.map((one) => one.instanceId));
  const reading = db.accounts
    .readings()
    .find((one) => one.accountId === current.id);
  return {
    now,
    cause,
    policy: db.accounts.routing(current.provider).atLimit,
    strategy: read.strategy,
    session: {
      id: row.id,
      model: row.model,
      context: row.contextTokens,
      window: read.window,
      cacheTtl: row.cacheTtl,
      cacheExpiresAt: ports.cacheExpiresAt(row),
      burn: read.burn,
      forked: row.forkedFrom !== null,
      compactable: ports.compactable(row),
      presence: presenceOf(db, ports, row),
      handMove: ports.handMove(row) ?? null,
    },
    current: {
      id: current.id,
      organization: current.identity?.organization || null,
      resetAt:
        resetAt === undefined
          ? refusedUntil(
              db.accounts.bench(now),
              reading,
              current.id,
              row.model,
              now
            )
          : resetAt,
    },
    accounts: read.accounts.map((account) => ({
      ...account,
      arrivals: [
        ...account.arrivals.filter((one) => !landed.has(one.instanceId)),
        ...arriving.filter((one) => one.accountId === account.id),
      ],
    })),
  };
};

/** "1,003k tokens". */
const kWords = (tokens: number): string => tokenWords(tokens);

/**
 * What a move to `target` re-reads and leaves, as a journal line says it:
 * "re-reads 412k tokens cold for $3.30 (≈1.7% of jude@'s window, 74% after)".
 */
export const moveSideWords = (
  target: StopTarget,
  tokens: number,
  named: string
): string => {
  const how = target.carries ? "from its carried cache" : "cold";
  const share =
    target.movePct === null
      ? `${named}'s window isn't measured in dollars yet`
      : `≈${target.movePct.toFixed(1)}% of ${named}'s window, ${Math.round(100 - target.roomAfter)}% after`;
  return `re-reads ${kWords(tokens)} ${how} for ${usdWords(target.moveUsd)} (${share})`;
};

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

/** A decision that waits. */
type Waiting = Extract<StopDecision, { action: "wait" }>;

/** A wait's reason as its line says it: a person's move and a forecast's stay write no line of their own. */
const lineWhy = (why: StopWhy): WaitReason =>
  why === "hand" || why === "warm" ? "full" : why;

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
  /**
   * The sessions this look at the holds sent to another account, as they
   * arrive there: a later decision in the same look counts their burn on it
   * (each one's charge it reads from the ledger). Emptied as a look begins.
   */
  const landing = new Map<string, Arrival>();
  /**
   * Held sessions no person waits on whose move waits for work their process
   * holds for later: where it goes, that work in its machine's words, and
   * since when it is held (its hold's start), which the cap counts from
   * ({@link RESTART_WAIT_CAP_MS}), across a hub restart too.
   */
  const later = new Map<string, { since: number; to: string; why: string }>();

  /**
   * `instanceId`'s move no longer waits for work in flight, and nothing is
   * said in its place (it carries on where it is, or never runs again): its
   * one line of that wait goes. A line said instead takes its place itself
   * ({@link AtLimitPorts.note}).
   */
  const waitEnded = (instanceId: string): void => {
    const line = db.atLimit.waitingMove(instanceId);
    if (line) {
      ports.unnote({ id: instanceId }, line.id);
    }
  };

  const readingOf = (accountId: string): AccountReading | undefined =>
    db.accounts.readings().find((one) => one.accountId === accountId);

  /** The decision for `row` off `current`, for `cause`, now. */
  const decide = (
    row: LimitRow,
    current: Account,
    cause: Cause,
    now: number
  ): { decision: StopDecision; input: StopInput } => {
    const input = stopInputOf(db, ports, row, current, cause, now, [
      ...landing.values(),
    ]);
    return { input, decision: decideStop(input) };
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
   * moves (another account frees sooner, or a reading moved a reset). It
   * names every other account and why it didn't take the session, or that
   * it could.
   */
  const hold = (row: LimitRow, current: Account, decision: Waiting): void => {
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
    const named = decision.accounts.flatMap((one) => {
      const account = db.accounts.get(one.accountId);
      return account
        ? [
            {
              account: namedAccount(account, accounts),
              reason: one.reason,
              ...(one.backAt === undefined ? {} : { backAt: one.backAt }),
            },
          ]
        : [];
    });
    ports.note(row, {
      kind: "waiting",
      account: namedAccount(current, accounts),
      ...(frees ? { frees: namedAccount(frees, accounts) } : {}),
      accounts: named,
      until: decision.until,
      why: lineWhy(decision.why),
      tokens: decision.tokens,
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
   * `current` says to move at a plan limit, but the decision keeps it there:
   * nothing holds it, as its turns are answered there.
   */
  const stillOnExtraUsage = (
    row: LimitRow,
    current: Account,
    decision: Waiting
  ): void => {
    const named = accountNameAmong(current, db.accounts.list());
    const because: Record<StopWhy, string> = {
      fork: "a fork stays on the account its origin's cache is on",
      off: "moving to another account at the limit is switched off",
      full: "no other account it may run on can take it now",
      soon: `${named} resets at ${clockWords(decision.until)}, sooner than re-reading its context elsewhere is worth`,
      free: `its cache lasts past ${named}'s reset at ${clockWords(decision.until)}, so going on there costs nothing more`,
      hand: "a person moved it, and the account they chose is at its limit too",
      warm: "its cache is warm here",
    };
    sayOnExtraUsage(
      row,
      `ran its turn on ${named}'s extra usage, past its plan limit. ${named} says to move to an account with plan room then, but it keeps going on ${named}'s extra usage: ${because[decision.why]}. Each turn's end decides again.`
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
    await act(row, current, "extra-usage");
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
    if (liveWorkOf(db, row)) {
      console.info(
        `[at-limit] ${ports.named(row)}'s refused turn was the hub's own word, and it is a live work item's session, so it is answered as a person's turn is: moved to an account that can take it, else held until the earliest reset.`
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

  /** The line a move writes: what it re-read, as the decision priced it, and the window, or the refused sign-in, that sent it. */
  const movedNote = (
    row: LimitRow,
    current: Account,
    target: Account,
    weighed: StopTarget,
    tokens: number,
    now: number,
    cause: Cause
  ): Extract<AccountMove, { kind: "moved" }> => {
    const atLimit = cause !== "refused-credential";
    const full = atLimit
      ? fullWindow(readingOf(current.id), row.model, now)
      : undefined;
    const pct =
      weighed.carries || weighed.moveUsd === null || weighed.usdPerPct === null
        ? undefined
        : weighed.moveUsd / weighed.usdPerPct;
    const accounts = db.accounts.list();
    return {
      kind: "moved",
      from: namedAccount(current, accounts),
      to: namedAccount(target, accounts),
      sameOrganization: weighed.carries,
      ...(pct === undefined ? {} : { cost: { pct, window: "5-hour" } }),
      ...(cause === "refused-credential"
        ? { because: { kind: "refused" as const } }
        : {}),
      tokens,
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
   * `held`: it is held until its reset, each look deciding again whether to
   * wait or try once more; `since`, its hold's start, is kept, as the cap on
   * a move waiting for work held for later counts from it (`waits`). One
   * whose credential was refused (`refused`) has no reset: it is held until
   * a look finds it an account.
   */
  const unmoved = (
    row: LimitRow,
    current: Account,
    target: Account,
    reason: string,
    how: {
      held: boolean;
      refused: boolean;
      since: number | undefined;
      waits: boolean;
    }
  ): void => {
    // A move waiting for work in flight is one line, said again in its
    // place when its target or reason changes ({@link AtLimitPorts.note});
    // any other is said once for the same failure.
    const last = how.waits
      ? db.atLimit.waitingMove(row.id)?.move
      : db.atLimit.events([row.id]).at(-1)?.move;
    const repeated =
      last?.kind === "unmoved" &&
      last.action === "move" &&
      last.reason === reason &&
      last.to?.id === target.id &&
      last.from?.id === current.id;
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
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: how.refused ? null : holdUntil(row, current, Date.now()),
      ...(how.since === undefined ? {} : { since: how.since }),
    });
    ports.changed();
    plan();
  };

  /**
   * Moves `row` whole onto `target`, its line written once it has: one that
   * compacts once there gets its line first, which the compaction says
   * again as it goes. A move off a refused sign-in is also said to whoever
   * hears its reports. A move that ended work its process held for later
   * says so. Answers why it did not move.
   */
  const moveWhole = async (
    row: LimitRow,
    current: Account,
    target: Account,
    weighed: StopTarget,
    decision: StopDecision,
    now: number,
    cause: Cause,
    laterSince: number | undefined
  ): Promise<Kept | undefined> => {
    const refused = cause === "refused-credential";
    const moved: Extract<AccountMove, { kind: "moved" }> = {
      ...movedNote(row, current, target, weighed, decision.tokens, now, cause),
      ...(weighed.compact ? { compact: "filing" as const } : {}),
    };
    const line = crypto.randomUUID();
    // A turn extra usage answered is over: the session waits there for its
    // next message, as a move between turns does.
    const carryOn = {
      limit: "limit",
      "refused-credential": "signin",
      "extra-usage": false,
    } as const;
    const done = await ports.move(
      row,
      target.id,
      carryOn[cause],
      weighed.compact ? { line, move: moved } : undefined,
      laterSince
    );
    if ("kept" in done) {
      return done.kept;
    }
    const { ended } = done;
    ports.note(
      row,
      ended && (ended.tasks.length > 0 || ended.wakeups > 0)
        ? {
            ...moved,
            ended: { tasks: ended.tasks.length, wakeups: ended.wakeups },
          }
        : moved,
      line
    );
    if (refused) {
      ports.refusedMove(row, moved);
    }
    return undefined;
  };

  /**
   * The move a person asked of `row`, to `toId` ({@link AtLimitPorts.handMove}):
   * carried out once it is between turns, while that account can take it;
   * held until that account is back while it cannot (the decision's rule 1).
   * Nothing else is done to it at its limit meanwhile: it is not moved
   * elsewhere, as the person chose a move.
   */
  const carryByHand = async (
    row: LimitRow,
    current: Account,
    toId: string,
    decision: StopDecision,
    cause: Cause
  ): Promise<void> => {
    const target = db.accounts.get(toId);
    const accounts = db.accounts.list();
    const from = accountNameAmong(current, accounts);
    const to = target
      ? accountNameAmong(target, accounts)
      : "the account a person chose";
    if (decision.action === "wait") {
      settling.delete(row.id);
      // Held without a transcript line of its own: its account's "waiting"
      // line would name the wrong reset, and the person's move already says
      // where it goes.
      if (db.atLimit.hold(row.id)?.until !== decision.until) {
        console.info(
          `[at-limit] ${ports.named(row)} can't move from ${from} to ${to} yet, as a person asked: ${to} can't take it now, until ${clockWords(decision.until)}. It is held on ${from} and moves when ${to} is back; nothing else is done to it meanwhile.`
        );
      }
      db.atLimit.putHold({
        instanceId: row.id,
        accountId: current.id,
        until: decision.until,
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
      `[at-limit] ${ports.named(row)} moves from ${from} to ${to} now, as a person asked: it is between turns and ${to} can take it. Its conversation is copied whole and it carries on there.`
    );
    await ports.carryHandMove(row);
  };

  /**
   * Moves `row` off `current`, or holds it, as {@link decideStop} says; one
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
      const now = Date.now();
      const { input, decision } = decide(row, current, cause, now);
      const byHand = ports.handMove(row);
      if (byHand) {
        await carryByHand(row, current, byHand, decision, cause);
        return;
      }
      await carryOut(row, current, input, decision, cause);
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
   * One decision for `row` off `current`, carried out: held, or moved whole
   * to its first target. A target whose own part fails (its account's dir,
   * not the session's process: {@link Kept.target}) passes it to the next
   * one the decision weighed; any other failure holds it as it was, a look
   * deciding again.
   */
  const carryOut = async (
    row: LimitRow,
    current: Account,
    input: StopInput,
    decision: StopDecision,
    cause: Cause
  ): Promise<void> => {
    if (decision.action === "wait") {
      waits(row, current, input, decision, cause);
      return;
    }
    const { targets } = decision;
    for (const [at, weighed] of targets.entries()) {
      const target = db.accounts.get(weighed.accountId);
      if (!target) {
        continue;
      }
      const last = at === targets.length - 1;
      // biome-ignore lint/performance/noAwaitInLoops: the next target is tried only when this one's own part failed
      const failed = await moveTo(row, current, target, weighed, {
        input,
        decision,
        cause,
        last,
      });
      if (!failed) {
        return;
      }
      console.info(
        `[at-limit] ${ports.named(row)} couldn't move to ${accountNameAmong(target, db.accounts.list())} (${failed}), so it goes to the next account the same decision weighed${last ? "; none is left, so it is held" : ""}.`
      );
    }
  };

  /** What waiting on `current` costs, as a move's line says it beside what moving costs. */
  const waitSide = (
    current: Account,
    weighed: StopTarget,
    input: StopInput,
    cause: Cause
  ): string => {
    const from = accountNameAmong(current, db.accounts.list());
    if (weighed.carries) {
      return "one organization and its cache warm, so its cache carries";
    }
    if (cause === "refused-credential") {
      return `${from}'s sign-in is refused, so it can't go on there at all`;
    }
    if (cause === "extra-usage") {
      return `${from} says to leave its extra usage for an account with plan room`;
    }
    const reset = input.current.resetAt;
    const at = reset === null ? "" : ` at ${clockWords(reset)}`;
    const expires = input.session.cacheExpiresAt;
    if (expires !== null && reset !== null && reset <= expires) {
      return `waiting for ${from}'s reset${at} would cost nothing, its cache lasting until ${clockWords(expires)}, but a person waits on it and that reset is more than ${input.policy.waitMinutes} minutes away`;
    }
    return `waiting for ${from}'s reset${at} would re-read it cold too`;
  };

  /**
   * Reserves `row`'s move to `target` before any await, so a decision
   * meanwhile counts it: its charge on the ledger, its burn arriving there,
   * its chip on its way (one on extra usage was answered, not stopped: its
   * chip says nothing, as at a rebalance's move).
   */
  const reserve = (
    row: LimitRow,
    current: Account,
    target: Account,
    weighed: StopTarget,
    input: StopInput
  ): void => {
    ports.admission.charge(
      row.id,
      target.id,
      weighed.moveUsd === null
        ? null
        : weighed.moveUsd + NEXT_TURN_ALLOWANCE_USD
    );
    if (input.session.burn) {
      landing.set(row.id, {
        accountId: target.id,
        burn: input.session.burn,
        instanceId: row.id,
        since: input.now,
      });
    }
    if (input.cause !== "extra-usage") {
      towards.set(row.id, { from: current, to: target });
    }
    ports.changed();
  };

  /** A reserved move that did not go: its charge and its arrival go with it. */
  const unreserve = (row: LimitRow): void => {
    ports.admission.refund(row.id);
    landing.delete(row.id);
  };

  /**
   * A move whose carry left `row` where it was (`kept`): one on extra usage
   * goes on there, its next turn's end deciding again; any other is held,
   * its hold keeping its start (`since`), and one whose move waits for work
   * its process holds for later (`laterSince` given) says so. Answers why
   * when the target's own part failed, so the next target may take it.
   */
  const keptAt = (
    row: LimitRow,
    current: Account,
    target: Account,
    kept: Kept,
    how: {
      cause: Cause;
      last: boolean;
      laterSince: number | undefined;
      since: number | undefined;
    }
  ): string | undefined => {
    unreserve(row);
    if (how.cause === "extra-usage" && !kept.target) {
      sayOnExtraUsage(
        row,
        `ran its turn on ${accountNameAmong(current, db.accounts.list())}'s extra usage and isn't moved yet: ${kept.why}. Its next turn's end decides again.`
      );
      return;
    }
    const { laterSince } = how;
    const waits = kept.later !== undefined && laterSince !== undefined;
    if (kept.later !== undefined && laterSince !== undefined) {
      later.set(row.id, { to: target.id, why: kept.later, since: laterSince });
    }
    unmoved(row, current, target, kept.why, {
      held: !kept.target || how.last,
      refused: how.cause === "refused-credential",
      since: how.since ?? (waits ? laterSince : undefined),
      waits,
    });
    return kept.target ? kept.why : undefined;
  };

  /**
   * One move of `row` to `target`, as the decision weighed it: reserved
   * before any await ({@link reserve}); only between turns. Answers why when
   * the target's own part failed, so the next target may take it; held or
   * settling otherwise.
   */
  const moveTo = async (
    row: LimitRow,
    current: Account,
    target: Account,
    weighed: StopTarget,
    how: {
      cause: Cause;
      decision: StopDecision;
      input: StopInput;
      last: boolean;
    }
  ): Promise<string | undefined> => {
    const { cause, decision, input } = how;
    const { now } = input;
    reserve(row, current, target, weighed, input);
    // Only between turns: never inside a tool round, never over a turn
    // someone started since.
    if (!(await ports.idle(row))) {
      unreserve(row);
      settle(
        row,
        current,
        cause,
        actionWords(current, target, db.accounts.list())
      );
      return;
    }
    const was = settling.get(row.id);
    if (was) {
      lifetime.cancel(was.timer);
      settling.delete(row.id);
    }
    const held = db.atLimit.hold(row.id);
    // A person waiting on it never waits for what its process holds for
    // later: the move ends that work now. Any other's waits for it, up to
    // the cap from when it was first held.
    const laterSince =
      input.session.presence === "watched" || cause !== "limit"
        ? undefined
        : (held?.since ?? now);
    db.atLimit.dropHold(row.id);
    const accounts = db.accounts.list();
    const to = accountNameAmong(target, accounts);
    console.info(
      `[at-limit] ${ports.named(row)} moves from ${accountNameAmong(current, accounts)} to ${to}: moving ${moveSideWords(weighed, decision.tokens, to)}; ${waitSide(current, weighed, input, cause)}.`
    );
    if (cause === "extra-usage") {
      extraUsageSaid.delete(row.id);
      const named = accountNameAmong(current, accounts);
      console.info(
        `[at-limit] ${ports.named(row)} ran its turn on ${named}'s extra usage, past its plan limit, and ${named} says to move to an account with plan room then, so it moves whole to ${to} now, between turns. It waits there for its next message.`
      );
    }
    const kept = await moveWhole(
      row,
      current,
      target,
      weighed,
      decision,
      now,
      cause,
      laterSince
    );
    if (!kept) {
      later.delete(row.id);
      return;
    }
    return keptAt(row, current, target, kept, {
      cause,
      last: how.last,
      laterSince,
      since: held?.since,
    });
  };

  /**
   * A decision that keeps `row` where it is: held there, or, on extra usage,
   * left going; one whose credential was refused, held until an account can
   * take it. A wait its cache makes free, or its reset's nearness, is said
   * once in the log with both sides' costs.
   */
  const waits = (
    row: LimitRow,
    current: Account,
    input: StopInput,
    decision: Waiting,
    cause: Cause
  ): void => {
    settling.delete(row.id);
    // Whatever it waited for before, this decision keeps it here now.
    later.delete(row.id);
    waitEnded(row.id);
    if (cause === "extra-usage") {
      stillOnExtraUsage(row, current, decision);
      return;
    }
    if (cause === "refused-credential") {
      holdRefused(row, current);
      return;
    }
    if (
      (decision.why === "soon" || decision.why === "free") &&
      db.atLimit.hold(row.id)?.until !== decision.until
    ) {
      sayWait(row, current, input, decision);
    }
    hold(row, current, decision);
  };

  /** Says why `row` waits for its own reset, with what waiting and moving each cost. */
  const sayWait = (
    row: LimitRow,
    current: Account,
    input: StopInput,
    decision: Waiting
  ): void => {
    const from = accountNameAmong(current, db.accounts.list());
    const expires = input.session.cacheExpiresAt;
    const moving = `moving would re-read ${kWords(decision.tokens)} cold for ${usdWords(decision.coldUsd)}`;
    console.info(
      `[at-limit] ${ports.named(row)} waits on ${from} for its reset at ${clockWords(decision.until)}: ${decision.why === "free" && expires !== null ? `its prompt cache lasts until ${clockWords(expires)}, past the reset, so waiting costs nothing more than its next turn` : `the reset is within ${input.policy.waitMinutes} minutes`}, where ${moving}.`
    );
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
    waitEnded(row.id);
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
      await act(row, current, "refused-credential");
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
   * before either, a decision moves it to an account that can take it (or
   * holds it again). One held on its refused credential (`until` null)
   * carries on where it is once its account is signed in there again, and
   * until then moves as soon as another account can take it.
   */
  const lookAt = async (held: LimitHold, now: number): Promise<void> => {
    const row = rowOf(held.instanceId);
    const current = db.accounts.get(held.accountId);
    if (over(row) || !row || !current) {
      db.atLimit.dropHold(held.instanceId);
      later.delete(held.instanceId);
      waitEnded(held.instanceId);
      return;
    }
    // A person moved it: its hold ends at that move, not at its reset.
    if (ports.handMove(row)) {
      await act(
        row,
        current,
        held.until === null ? "refused-credential" : "limit"
      );
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
      later.delete(row.id);
      waitEnded(row.id);
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

  /**
   * One look at every hold, one decision each in admission order
   * ({@link admissionOrder}): each charges its move to the ledger and counts
   * its burn as arriving on its target before the next is decided.
   */
  const lookAtHolds = async (): Promise<void> => {
    const now = Date.now();
    landing.clear();
    for (const held of admissionOrder(db.atLimit.holds())) {
      // biome-ignore lint/performance/noAwaitInLoops: each held session needs its own idle receipt before it is sent on, and the next decision reads this one's charge
      await lookAt(held, now);
    }
  };

  const rebalancer = createRebalancer({
    db,
    lifetime,
    ports,
    acting,
    lookAtHolds,
    replan: () => plan(),
  });

  /** One look: every hold, then every provider on every machine rebalanced. */
  const tick = async (): Promise<void> => {
    await lookAtHolds();
    await rebalancer.everyPair();
  };

  /**
   * Arms the next look: the earliest moment a held session's account frees
   * (its own reset, or another's that comes first), or a move waiting for
   * work held for later reaches its cap, else the recheck, while anything is
   * held or two accounts could balance.
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
    const capped = holds.flatMap((one) =>
      later.has(one.instanceId) && one.since !== undefined
        ? [one.since + RESTART_WAIT_CAP_MS]
        : []
    );
    const at = Math.min(
      now + RECHECK_MS,
      ...holds.map((one) => one.until ?? Number.POSITIVE_INFINITY),
      ...capped
    );
    timer = lifetime.after(Math.max(1000, at - now), () => {
      detach(tick().finally(plan), "at-limit look");
    });
  };

  /**
   * A hold whose move waits on work in flight, as its stalled words say it:
   * where it moves, what it waits for, and the first moment the hub moves it
   * without that work ending, `until`: the cap from when it was first held,
   * or its own reset when that comes first, when it carries on where it is.
   */
  const carryStall = (
    from: string,
    carry: { since: number; to: string; why: string },
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

  rebalancer.accountsChanged();

  return {
    /**
     * `instanceId` stopped at its account's limit, in words, while it is:
     * on its way to an account that can take it (now, or once its turn
     * ends), its move waiting for work in flight (by the cap at the latest:
     * {@link carryStall}), held until the earliest reset (`until`, epoch ms;
     * its own account's, or another's that frees first and takes it), or
     * held on a refused sign-in until an account can take it. Undefined
     * while it runs.
     */
    stall(instanceId: string): Stall | undefined {
      const words = accountsWords.stalled;
      const held = db.atLimit.hold(instanceId);
      if (held) {
        const from = db.accounts.get(held.accountId);
        const name = from
          ? accountNameAmong(from, db.accounts.list())
          : "its account";
        if (held.until === null) {
          return { words: words.signedOut(name) };
        }
        const carry = later.get(instanceId);
        if (carry) {
          return carryStall(name, carry, held.until);
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
      later.delete(instanceId);
      waitEnded(instanceId);
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
    /**
     * Where `instanceId` would go off its account if Claude Code refused that
     * account's credential now: the first target of that decision, or none
     * when no account can take it.
     */
    credentialMoveTo(instanceId: string): string | undefined {
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      if (!(row && current)) {
        return;
      }
      const { decision } = decide(
        row,
        current,
        "refused-credential",
        Date.now()
      );
      return decision.action === "move"
        ? decision.targets[0]?.accountId
        : undefined;
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
        `[at-limit] ${ports.named(row)}'s turn was refused: ${accountNameAmong(current, db.accounts.list())} is at its limit${resets === null ? "" : ` until ${clockWords(resets)}`}. ${ports.handMove(row) ? "A person moved it, so that move is all the hub does with it." : "The hub decides now, from what it knows of every account, whether it moves whole or waits."}`
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
        `[at-limit] ${ports.named(row)}'s turn ended because Claude Code refused ${named}'s sign-in, so ${named} is signed out on its machine. It moves to another account and carries on there; with none free, it waits until ${named} is signed in again in ${configurePage("accounts")}.`
      );
      await act(row, current, "refused-credential");
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
