import {
  type Account,
  type AccountBench,
  type AccountMove,
  type AccountReading,
  type AtLimit,
  type HeldReason,
  modelScope,
  type RebalanceNotice,
  type WaitReason,
} from "@cawco/core/accounts";
import type { PlacementStrategy } from "@cawco/core/accounts/kinds";
import { RESTART_WAIT_CAP_MS } from "@cawco/core/binary-updates";
import { type HarnessKind, harnessNamed } from "@cawco/core/harness/kinds";
import type { MoveEnded } from "@cawco/core/session/controls";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { MINUTE_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import {
  aheadOfWeek,
  bearing,
  earliestReset,
  spentWindow,
  windowResetAt,
  windowUsed,
  windowWords,
} from "@cawco/core/usage/windows";
import { tokenWords } from "@cawco/core/words/account-lines";
import {
  type Admission,
  type Figure,
  figuresOf,
  type Ledger,
  pricedTokens,
  projectedMove,
  usdWords,
} from "./admission";
import type { DbShape } from "./db";
import { waitsLine } from "./db/at-limit";
import type { HubLifetimeShape } from "./lifetime";
import {
  type AccountRow,
  type Arrival,
  pacedOrder,
  runsOutBy,
} from "./placement";
import { isLive } from "./work-item-state";

/**
 * What a session at its limit is decided on, and the decision itself: the
 * rows and accounts it reads, {@link decideStop}'s one pure pass over them,
 * the compaction a move plans, and the words its lines say. The controller
 * that acts on it (at-limit.ts `createAtLimit`) and its rebalancer
 * (rebalance.ts) both read this; it reads neither.
 */

export type LimitRow = ReturnType<DbShape["getInstancesByIds"]>[number];

/**
 * A session stopped at its account's limit, as its tray chip and
 * `delegate_list` say it (core `accountsWords.stalled`): the words, and
 * when it carries on (epoch ms): the reset it waits for.
 */
export interface Stall {
  /** Held past the cutoff: nothing carries it on until a person or its parent writes (at-limit.ts `goneStale`). */
  stale?: true;
  until?: number;
  words: string;
}

/**
 * Who wrote to a held session, of those that carry on a stale hold
 * (at-limit.ts `goneStale`): a person or its parent (`word`), whose turn reads the
 * carry-on with their message; or a Continue's filing turn (`continue`),
 * after which its work goes on in a new session, so nothing is carried on.
 */
export type TakenUpBy = "word" | "continue";

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

/**
 * Who waits on a stopped session: a person (`watched`: a question or
 * permission of it pending, or a top-level session whose last turn a person
 * sent), the work it was given (`driven`: a live work item's session, or a
 * turn its parent sent), or nobody. A watched session never waits long or on
 * what its process holds for later; a driven one waits while waiting costs
 * nothing.
 */
type Presence = "watched" | "driven" | "nobody";

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
interface StopAccount extends AccountRow {
  /** What admission holds of it for this session's move (admission.ts `ledger`). */
  ledger: Ledger;
  proven: boolean;
}

/** The stopped session as the decision reads it. */
interface StopSession {
  /** Its expected burn, weighted tokens an hour (rebalance.ts `sessionBurn`); null when unmeasured. */
  burn: number | null;
  /** When its prompt cache lapses on its account, as measured; null when it is cold. */
  cacheExpiresAt: number | null;
  cacheTtl: string | null;
  /** Whether it takes the hub's word to compact (at-limit ports `compactable`): one that doesn't moves whole. */
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
interface StopStrategy {
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
  policy: Pick<
    AtLimit,
    "compaction" | "move" | "moveWholeUnderK" | "waitMinutes"
  >;
  session: StopSession;
  strategy: StopStrategy;
}

/** One account the session may move to, with what the move costs there and leaves. */
export interface StopTarget {
  accountId: string;
  /** One organization and its cache still warm: the move reads it from cache ({@link cacheCarries}). */
  carries: boolean;
  /** It lasts to every reset with the session's burn and what already arrives there. */
  lasts: boolean;
  /** What this move takes of {@link window}, percent, its next turn's allowance in; null when unmeasured or unpriced. */
  movePct: number | null;
  /** The re-read's own cost, dollars; null when its model is unpriced. */
  moveUsd: number | null;
  /** How the move compacts it ({@link compactionPlan}). */
  plan: CompactionPlan;
  /** What {@link window} has left once this move and those before it land, percent. */
  roomAfter: number;
  /** When it runs out with the session on it; null when it lasts. */
  runsOutAt: number | null;
  /** Dollars per percent of {@link window}; null when unmeasured. */
  usdPerPct: number | null;
  /** The window the move is counted against: of those that bear, the one with the least room after it (admission.ts `figuresOf`); null when none is read. */
  window: Figure["window"];
}

/** Why one other account didn't take the session, or that it could (core `HeldReason`). */
interface StopReason {
  accountId: string;
  backAt?: number;
  reason: HeldReason;
}

/**
 * How one move makes the session small ({@link compactionPlan}): moved whole
 * (`chosen`: the policy said `whole` for a context it would otherwise
 * compact, so the move is announced and goes {@link WHOLE_MOVE_NOTICE_MS}
 * later unless a person stops the session), or compacted by `method`
 * `before` the move, on the account it leaves, or `after` it, on the one it
 * reaches.
 */
export type CompactionPlan =
  | { method: "whole"; chosen: boolean }
  | { method: "native" | "summary"; when: "before" | "after" };

/** Whether a cause leaves its session runnable where it is: anything but its limit or its refused sign-in. */
const runnable = (cause: StopCause | "hand"): boolean =>
  cause !== "limit" && cause !== "refused-credential";

/**
 * THE ONE COMPACTION RULE: how a move of a session compacts it, read by every
 * mover (a limit, a refused sign-in, extra usage, a forecast, a person's
 * move). A move its cache carries to, a context under the policy's
 * `moveWholeUnderK` thousand tokens or not reported, and a session that
 * takes no word of the hub's (`compactable` false: its work item finished)
 * move whole. Otherwise its provider's `compaction`: `beforeMove` while its
 * account can still run it, compacted `before` the move; `atLimit` when it
 * can't, compacted `after`.
 */
export const compactionPlan = (how: {
  carries: boolean;
  cause: StopCause | "hand";
  compactable: boolean;
  policy: Pick<AtLimit, "compaction" | "moveWholeUnderK">;
  /** Its context as its harness last reported it, capped at its model's window; null when never. */
  reported: number | null;
}): CompactionPlan => {
  const { compaction, moveWholeUnderK } = how.policy;
  if (
    how.carries ||
    !how.compactable ||
    how.reported === null ||
    how.reported < moveWholeUnderK * 1000
  ) {
    return { method: "whole", chosen: false };
  }
  const before = runnable(how.cause);
  const method = before ? compaction.beforeMove : compaction.atLimit;
  return method === "whole"
    ? { method, chosen: true }
    : { method, when: before ? "before" : "after" };
};

/**
 * THE ONE FILING RULE: whether a turn's end finds a session's context within
 * its policy's `fileRoom` of the point where its harness compacts it on its
 * own (core `NeutralResultMessage.compactsAt`), so that it files its open
 * items before that (compaction.ts `fileAtThreshold`, which sends it only
 * between turns, once per rise, and never beside a compaction, a
 * continuation or a hold at its limit, nor for a compaction's own result:
 * after a boundary it files only once a turn of the session's own work has
 * ended). A reading never reported, a point its harness did not say, and a
 * room of 0 file nothing: the point is never guessed. A reading past the
 * point files too (one turn overshot it).
 */
export const fileDue = (how: {
  /** Where its harness compacts it on its own; undefined when it said none. */
  compactsAt: number | undefined;
  /** Its context as its harness last reported it; null when never. */
  reported: number | null;
  /** The policy's room, in tokens, short of that point. */
  room: number;
}): boolean =>
  how.reported !== null &&
  how.compactsAt !== undefined &&
  how.compactsAt > 0 &&
  how.room > 0 &&
  how.reported >= how.compactsAt - how.room;

/**
 * How long a move whole the policy chose for a large context waits after it
 * is announced in the session's transcript (core `AccountMove` `moving`):
 * a person who stops the session meanwhile keeps it where it is.
 */
export const WHOLE_MOVE_NOTICE_MS = 5 * MINUTE_MS;

/**
 * Each harness as a moved line's stored `compactBy` names the one whose own
 * `/compact` ran: none for Claude Code, which a line without one means.
 */
const COMPACT_BY: Record<
  HarnessKind,
  Extract<AccountMove, { kind: "moved" }>["compactBy"]
> = { claude: undefined, opencode: "opencode", pi: "pi" };

/** The `compactBy` a moved line of `harness` stores, when it names one. */
const compactByOf = (harness: string) => {
  const kind = harnessNamed(harness);
  const by = kind ? COMPACT_BY[kind] : undefined;
  return by ? { compactBy: by } : {};
};

/**
 * `move`, a move's line, as one `plan` compacts says it: natively, its
 * stages from `filing`, before the move when the plan says so, by the
 * harness `harness` names when it is not Claude Code. A plan that doesn't
 * compact natively leaves it as it is.
 */
export const compactedLine = (
  move: Extract<AccountMove, { kind: "moved" }>,
  plan: CompactionPlan,
  harness: string
): Extract<AccountMove, { kind: "moved" }> =>
  plan.method === "native"
    ? {
        ...move,
        compact: "filing",
        ...(plan.when === "before" ? { compactFirst: true as const } : {}),
        ...compactByOf(harness),
      }
    : move;

/** A context as {@link compactionPlan} reads it: its last report, capped at its model's window. */
const reportedOf = (session: Pick<StopSession, "context" | "window">) =>
  session.context === null
    ? null
    : Math.min(session.context, session.window ?? session.context);

/**
 * Why it waits: a wait's reason as its line keeps it ({@link WaitReason}: a
 * fork, the policy off, its own reset near (`soon`), its cache outlasting
 * that reset (`free`), no account fits (`full`)), but the two kept only as
 * history; or the account a person moved it to is full (`hand`), or, at a
 * forecast, a warm cache that moves at its limit instead (`warm`).
 */
export type StopWhy = Exclude<WaitReason, "room" | "work"> | "hand" | "warm";

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
const sameOrganization = (a: Account, b: Account): boolean =>
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

/** The most used of an account's bearing windows: the one that stops it first. */
const bindingOf = (account: Pick<AccountRow, "windows">, now: number): number =>
  Math.max(0, ...account.windows.map((window) => windowUsed(window, now)));

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

/** Why `account` doesn't take the session now, in the order the rules read; undefined when it fits. */
const reasonOf = (
  input: StopInput,
  account: StopAccount,
  weighed: {
    binding: number;
    carries: boolean;
    figure: Figure;
    runsOutAt: number | null;
  }
): HeldReason | undefined => {
  const { now, policy, strategy } = input;
  const { binding, carries, figure, runsOutAt } = weighed;
  const { left, movePct, roomAfter } = figure;
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
  if (figure.unmeasured && account.ledger.pendingMoves > 0) {
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
  const figure = figuresOf(account.ledger, projected);
  const binding = bindingOf(account, now);
  const runsOutAt = runsOutBy(
    account.windows,
    session.burn ?? 0,
    account.arrivals,
    account.id,
    now
  );
  const target: StopTarget = {
    accountId: account.id,
    carries,
    plan: compactionPlan({
      carries,
      cause: input.cause,
      compactable: session.compactable,
      policy,
      reported: reportedOf(session),
    }),
    lasts: runsOutAt === null,
    moveUsd: projected.reReadUsd,
    movePct: figure.movePct,
    roomAfter: figure.roomAfter,
    runsOutAt,
    usdPerPct: figure.usdPerPct,
    window: figure.window,
  };
  const out = reasonOf(input, account, {
    binding,
    carries,
    figure,
    runsOutAt,
  });
  return { account, binding, out, left: figure.left, target };
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
 * has it; an account ahead of its week after every one that isn't, placement
 * `pacedOrder`), then a sign-in a turn proved, as a tie-breaker only, then the most
 * room left after the move.
 */
const ordered = (input: StopInput, fit: readonly Weighed[]): Weighed[] => {
  const { strategy, now } = input;
  const order = pacedOrder(strategy.kind, strategy.pinned ?? undefined);
  const ranked = (one: Weighed) => ({
    ahead: aheadOfWeek(one.account.windows, now) !== undefined,
    id: one.account.id,
    order: one.account.order,
    createdAt: one.account.createdAt,
    binding: one.binding,
    reset: earliestReset(one.account.windows, now),
    runsOut: one.target.runsOutAt,
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
 * 8. an account that fits: it moves cold, compacted as {@link compactionPlan}
 *    says;
 * 9. none fits: it waits until its own reset, or until the account that
 *    frees first and would take it does, when that is sooner, every
 *    account's reason named.
 *
 * A refused credential can't go on where it is at all: neither a fork, the
 * policy, nor a reset keeps it there (rules 2, 3, 6 and 7 pass it by). At a
 * forecast (`forecast`, the rebalance) a wait means it stays: a move its
 * cache carries to goes only to an account that lasts; a cold move that
 * compacts goes, its compaction small; a cold move whole only when its cache
 * is cold already, or a person waits on it and the move re-reads less than
 * the policy's floor would, as staying warm until its limit costs the same
 * re-read later.
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
  // 8, at a forecast: a move whole across organizations only cold, or
  // watched and cheap.
  const [first] = coldTier;
  if (cause === "forecast" && first?.target.plan.method === "whole" && warm) {
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

/**
 * The window at its limit that resets last, of those bearing on a session
 * on `model` (core `bearing`, `spentWindow`): the one that refused it.
 */
export const fullWindow = (
  reading: AccountReading | undefined,
  model: string | null,
  now: number
): LimitWindow | undefined =>
  spentWindow(
    bearing(
      reading?.windows ?? [],
      modelScope(model ?? undefined),
      now,
      reading?.windowKinds ?? null
    ),
    now
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
  const fullReset = full ? windowResetAt(full) : null;
  const latest = [...benched, ...(fullReset === null ? [] : [fullReset])];
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

/**
 * How a move compacts its session ({@link AtLimitPorts.move}): its plan, the
 * line its move writes (`move`, under the id `line`), which a compaction says
 * again as it goes, and what moved it.
 */
export interface MoveHow {
  cause: StopCause | "hand";
  line: string;
  move: Extract<AccountMove, { kind: "moved" }>;
  plan: CompactionPlan;
}

/** What a carry that went did: what it ended of its process's work held for later (core `MoveEnded`), when anything. */
interface Carried {
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
   * Whether `row` takes the compaction's steps (its filing turn and
   * `/compact`): a session whose work item is finished takes the hub's word
   * from nobody (work-items.ts `refusal`), so it moves whole and is not
   * compacted, never held behind a step that can't be sent.
   */
  compactable: (row: LimitRow) => boolean;
  db: DbShape;
  /**
   * Ends `row`'s compaction ahead of a move it no longer makes (its limit
   * refused a turn of it meanwhile), its line taken back: what its limit
   * decides now replaces it.
   */
  dropCompaction: (row: LimitRow) => void;
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
   * its next message, and its move waits for what it holds for later. `how`
   * compacts it as its plan says ({@link MoveHow}; absent, whole): natively
   * after the move, its first steps there its filing turn and its harness's
   * `/compact`, before the carry-on and everything it is owed; natively
   * before it, those steps on its account now and the move once they end;
   * or from a summary, the same session going on in a fresh conversation
   * there (server.ts `compactions`, `continueAsMove`). Answers `kept` and
   * why when it did not move: `row` is still on its account then; `later`
   * when the move goes once its compaction or summary is done, its lines
   * written as that goes.
   */
  move: (
    row: LimitRow,
    accountId: string,
    carryOn: false | "limit" | "signin",
    how?: MoveHow,
    laterSince?: number
  ) => Promise<{ kept: Kept } | Carried | { later: true }>;
  /**
   * Whether `row` is compacting or going on from a summary as its move now
   * (server.ts `compactions`, `continueAsMove`): the move is under way, and
   * nothing decides it again until that ends.
   */
  moving: (row: LimitRow) => boolean;
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
   * left it: its account's limit, or a sign-in failure. `quiet`: the
   * carry-on is a note its next turn reads and starts none, as the word of
   * a person or its parent that took up its stale hold starts that turn.
   */
  resume: (row: LimitRow, stopped: "limit" | "signin", quiet: boolean) => void;
  /**
   * `row`'s hold went stale (at-limit.ts `goneStale`): the person is told in Needs
   * you, in these words, until they act on it (fleet-watch.ts `tellYou`).
   */
  stale: (row: LimitRow, title: string, body: string) => void;
  /**
   * What `row`'s last turn read: the newest message it was handed, who sent
   * it. Undefined when it was handed none.
   */
  startedBy: (row: LimitRow) => Handed | undefined;
  /** Takes the line `id` out of `row`'s transcript. */
  unnote: (row: Pick<LimitRow, "id">, id: string) => void;
  /** `row`'s stale hold was taken up or ended: its Needs you notice goes. */
  unstale: (row: Pick<LimitRow, "id">) => void;
  /**
   * Whether a person waits on `row`: something of it waits on them (core
   * `waitingOnYou`: an ask parked, a card or canvas in Needs you), or it is
   * a top-level session whose last turn a person sent.
   * Admission takes these first.
   */
  waitedOn: (row: LimitRow) => boolean;
}

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

/** Whether `row` is the session of a live work item (work-item-state.ts `isLive`). */
export const liveWorkOf = (db: DbShape, row: LimitRow): boolean => {
  const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
  return item?.instanceId === row.id && isLive(item.state);
};

/** Who waits on `row` ({@link Presence}). */
const presenceOf = (
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

/** What a move to `target` re-reads, as its line's cost says it: a percent of the window it is counted against; none when its cache carries, or it is unpriced or counted against no window. */
export const costOf = (
  target: StopTarget
): { cost?: { pct: number; window: string } } =>
  target.carries ||
  target.moveUsd === null ||
  target.usdPerPct === null ||
  !target.window
    ? {}
    : {
        cost: {
          pct: target.moveUsd / target.usdPerPct,
          window: windowWords(target.window),
        },
      };

/** "1,003k tokens". */
export const kWords = (tokens: number): string => tokenWords(tokens);

/**
 * What a move to `target` re-reads and leaves, as a journal line says it:
 * "re-reads 412k tokens cold for $3.30 (≈0.1% of jude@'s weekly window,
 * leaving it 38%)", the window the move is counted against named.
 */
export const moveSideWords = (
  target: StopTarget,
  tokens: number,
  named: string
): string => {
  const how = target.carries ? "from its carried cache" : "cold";
  const name = target.window ? windowWords(target.window) : "";
  const window = `${named}'s ${name ? `${name} ` : ""}window`;
  const share =
    target.movePct === null
      ? `${window} isn't measured in dollars yet`
      : `≈${target.movePct.toFixed(1)}% of ${window}, leaving it ${Math.round(target.roomAfter)}%`;
  return `re-reads ${kWords(tokens)} ${how} for ${usdWords(target.moveUsd)} (${share})`;
};
