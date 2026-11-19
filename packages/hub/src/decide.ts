import type {
  AtPlanLimit,
  HeldReason,
  MovePrice,
  MovePriceOption,
} from "@cawco/core/accounts";
import type { ColdMove, CompactMethod } from "@cawco/core/accounts/kinds";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import type { CacheState } from "./keep-alive";

/**
 * THE ONE DECISION (2026-11-19, tsk-400; the audit move-audit.md section 3,
 * with the owner's picks on decisions/move-redesign and
 * move-compaction-mode): every move of a session between accounts, and
 * every turn the hub starts by itself, is `decide(facts, trigger)`. Pure:
 * the same facts and trigger give the same choice; nothing is read or
 * written. It lists every option, prices each one in dollars from the
 * session's measured costs ({@link SessionCosts}), drops any option that
 * leaves a window of an account it touches under that account's floor
 * ({@link holdsOn}) or makes it run short ({@link runsShort}), and takes the
 * cheapest that holds, the strategy's order breaking ties within a margin
 * ({@link MARGIN_USD}); ahead of a limit, only when it beats staying.
 *
 * Only a choice this module makes reaches the carry: a {@link DecidedMove}
 * is branded, constructed here alone, and goes stale after
 * {@link CHOICE_FRESH_MS} (the carry refuses it, limit-moves.ts `moveAs`).
 * Unknown is a value: a cache is warm until a moment, cold, or unknown
 * (keep-alive.ts `cacheState`); a context is known or unknown
 * ({@link ContextSize}). Unknown never prices as free, and never as the
 * model's whole window.
 */

/** A choice older than this is decided again before it is carried out. */
export const CHOICE_FRESH_MS = 2 * MINUTE_MS;

/**
 * How far ahead an account is read for running short: five hours. A source
 * runs short within it; a target must not, with the session on it, within
 * twice it (the one test, {@link runsShort}, both sides).
 */
export const LOOK_AHEAD_MS = 5 * HOUR_MS;

/**
 * The margin a cheaper option must clear: options within it of the
 * cheapest are taken in the strategy's order, and a move ahead of a limit
 * must beat staying by it. The larger of a few cents and a tenth.
 */
const MARGIN_USD = 0.05;
const MARGIN_SHARE = 0.1;

/**
 * What a hub-started turn may cost and still run unasked: past it, the
 * hub's word waits as a note the session's next turn reads, unless someone
 * waits on its answer.
 */
const HUB_TURN_THRESHOLD_USD = 0.5;

/**
 * Start values for what is not measured per session yet: the requests of a
 * filing turn (`k`), a compaction summary's tokens (`s`), and the context
 * left after a compaction (19 Nov: 521k became 76k).
 */
const FILING_REQUESTS = 6;
const SUMMARY_TOKENS = 15_000;
const COMPACTED_SHARE = 76_000 / 521_000;

/**
 * The share of its prompt a session's first request reads from cache after
 * it moves between two accounts of one organization, as measured: the
 * fleet's own transcripts, 305,611 prompt tokens with 294,539 read
 * (at-limit check 1, 2026-10-09). Below {@link CACHE_KEPT_AT} a move within
 * one organization is priced as one across organizations.
 */
const CARRY_READ_SHARE = 294_539 / 305_611;
const CACHE_KEPT_AT = 0.9;

/** A context: its last request's prompt in tokens, or unknown. Never a default. */
export type ContextSize =
  { kind: "known"; tokens: number } | { kind: "unknown" };

/** Dollars per token, at the session's cache lifetime's write price: measured where it has turns ({@link SessionCosts}). */
export interface Rates {
  input: number;
  output: number;
  read: number;
  write: number;
}

/**
 * What a session's tokens cost: its rates (`measured` when its own turns'
 * `turn_usage.cost_usd` scaled the listed ones), its usual requests per
 * turn, and what its next turn costs, dollars (its recent turns' average;
 * null when unpriced).
 */
export interface SessionCosts {
  measured: boolean;
  nextTurnUsd: number | null;
  rates: Rates | null;
  requestsPerTurn: number;
}

/** One window of an account as the decision reads it. */
export interface FactWindow {
  /** Spend arriving there its pace does not count yet, weighted tokens an hour. */
  arriving: number;
  /** The percent that must stay free of it: the account's floor (core `Account.reservePct`); 0 for none. */
  floorPct: number;
  /** When it opened, epoch ms; null when unknown. */
  openedAt: number | null;
  /** Percent an hour; 0 where nothing runs, null where unmeasured. */
  pace: number | null;
  /** Moves admitted there and not landed yet, percent; null when unpriced or unmeasured. */
  pendingPct: number | null;
  resetAt: number | null;
  /** Spend recorded since its reading, percent; null when unpriced or unmeasured. */
  spentPct: number | null;
  /** Weighted tokens one percent takes; null when unmeasured. */
  tokensPerPct: number | null;
  /** Dollars one percent takes; null when unmeasured. */
  usdPerPct: number | null;
  usedPct: number;
  window: Pick<LimitWindow, "group" | "kind" | "scopeLabel">;
}

/** An account as the decision reads it. */
export interface FactAccount {
  /** When it takes sessions again once out, epoch ms; null when nothing names it. */
  backAt: number | null;
  id: string;
  /** The organization's id (core `AccountIdentity.orgId`); null when none was read. */
  orgId: string | null;
  /** Why it can't take the session whatever the price (signed out, not allowed, benched, …); null when it can. */
  out: HeldReason | null;
  /** Moves admitted there and not landed yet. */
  pendingMoves: number;
  /** Its place in the kind's strategy order, best first. */
  rank: number;
  /** When its 5-hour window opened, epoch ms; null when it has none open. */
  sessionOpenedAt: number | null;
  windows: FactWindow[];
}

/** What one decision reads. */
export interface DecideFacts {
  /** Every other account the session's provider has. */
  accounts: readonly FactAccount[];
  current: FactAccount & {
    /** What its plan limit says (core `AtPlanLimit`). */
    atPlanLimit: AtPlanLimit;
    /** When it may go on there again: its refusing reset or bench; null when nothing said. */
    resetAt: number | null;
  };
  now: number;
  policy: {
    atLimit: CompactMethod;
    coldMove: ColdMove;
    move: boolean;
    moveWholeUnderK: number;
    waitMinutes: number;
  };
  session: {
    /** Its expected burn, weighted tokens an hour; null when unmeasured. */
    burn: number | null;
    cache: CacheState;
    /** It takes the hub's word to compact (its work item is not finished). */
    compactable: boolean;
    context: ContextSize;
    costs: SessionCosts;
    /**
     * Its work item ended (it reported, or another session took the item
     * up): it runs no turn until a person or its parent writes, and that
     * send decides it again (trigger `wake`). A forecast moves it nowhere.
     */
    ended: boolean;
    /** A fork reads its origin's cache: it never moves on its own. */
    forked: boolean;
    id: string;
    /**
     * The hub's last move of it, with when each account it touched opened
     * its 5-hour window: it is not moved by the hub again until both have
     * reset (a guard against bouncing), except when its account refuses it.
     */
    lastHubMove: {
      at: number;
      opened: readonly (number | null)[];
    } | null;
    /** A person waits on it: their last message unanswered, or a question of it pending. */
    personWaiting: boolean;
    /** What the summariser's tokens cost, when a summary may be priced. */
    summarizerRates: Rates | null;
  };
}

/** What a hub-started turn is decided on: the session's cache, context and prices. */
export interface TurnFacts {
  now: number;
  session: Pick<DecideFacts["session"], "cache" | "context" | "costs">;
}

/** Why the decision is asked. */
export type MoveTrigger =
  | { kind: "limit" }
  | { kind: "refused-credential" }
  | { kind: "extra-usage" }
  /** Its account runs short ({@link runsShort}), and the session is between turns. */
  | { kind: "forecast"; runsOutAt: number }
  /** Its process is gone and a send wakes it. */
  | { kind: "wake" }
  /** A person moved it to `to`; `stopped`: its limit or refused sign-in stops it where it is. */
  | { kind: "hand"; stopped: boolean; to: string };

/**
 * A turn the hub starts by itself, by what it is: a recap on the person's
 * return (`recap`); the notes a session writes before its cache goes cold
 * while the person is away (`notes`); one that runs whatever its price, as
 * its session waits on it or it is warm by construction (`always`: a
 * carry-on, a compaction's step, a cut turn handed back, a keep-alive, a
 * work item's "still open"); any other notice (`notice`).
 */
export type HubTurn = "always" | "notes" | "notice" | "recap";

export interface TurnTrigger {
  kind: "hub-turn";
  turn: HubTurn;
  /** A person or a deadline waits on what it answers. */
  waitedOn: boolean;
}

/** How a move makes the session small. */
export type Shape = "whole" | "compact-after" | "compact-before" | "summary";

const brand: unique symbol = Symbol("decided move");

/**
 * A move the decision took: only {@link decide} constructs one, and the
 * carry takes nothing else. `at`: when it was decided ({@link
 * CHOICE_FRESH_MS}).
 */
export interface DecidedMove {
  /** A whole move the policy names for a large context at a limit: announced before it goes. */
  announce: boolean;
  at: number;
  carries: boolean;
  /** What this move takes of {@link window}, percent; null when unpriced or unmeasured. */
  movePct: number | null;
  price: MovePrice;
  /** What {@link window} keeps after it, percent. */
  roomAfter: number;
  shape: Shape;
  to: string;
  trigger: MoveTrigger["kind"];
  /** The move's own dollars on the target; null when unpriced. */
  usd: number | null;
  usdPerPct: number | null;
  /** The target's window with the least room after it; null when none is read. */
  window: FactWindow["window"] | null;
  readonly [brand]: true;
}

/** Whether `move` was decided too long ago to be carried out ({@link CHOICE_FRESH_MS}). */
export const staleChoice = (move: DecidedMove, now: number): boolean =>
  now - move.at > CHOICE_FRESH_MS;

/** Every other account as the choice weighed it: why it didn't take the session, or that it could. */
export interface AccountVerdict {
  accountId: string;
  backAt?: number;
  reason: HeldReason;
}

/** Why a session waits at its limit (core `WaitReason`), or `hand`: the account a person chose is full. */
export type WaitWhy = "fork" | "off" | "full" | "free" | "soon" | "hand";

/** Why a session stays where it is ahead of any limit. */
export type StayWhy =
  | "fork"
  | "off"
  | "waiting"
  | "ended"
  | "bounce"
  | "unknown"
  | "dearer"
  | "full"
  | "holds"
  | "credits";

interface Common {
  accounts: AccountVerdict[];
  /** The context priced; null when unknown. */
  tokens: number | null;
}

export type MoveChoice =
  | (Common & {
      kind: "move";
      /** The move, then the others that hold, in order: a target whose own part fails passes it to the next. */
      moves: DecidedMove[];
    })
  | (Common & {
      kind: "wait";
      /** The account that frees first and takes it, when that comes first. */
      frees?: string;
      /** What waiting re-reads, dollars; null when unpriced. */
      stayUsd: number | null;
      until: number;
      why: WaitWhy;
      /** The cheapest move, dollars, when one was priced. */
      moveUsd: number | null;
    })
  | (Common & {
      kind: "stay";
      moveUsd: number | null;
      stayUsd: number | null;
      why: StayWhy;
    });

export interface TurnChoice {
  kind: "run" | "note" | "skip";
  /** What the turn costs, dollars; null when unknown. */
  usd: number | null;
  why: "always" | "warm" | "cold" | "unknown" | "waited" | "cheap" | "dear";
}

/** One priced option of moving to one account. */
interface MoveOption {
  account: FactAccount;
  carries: boolean;
  /** Its cost less the next turn's saving from a smaller context: what options are compared by. */
  effective: number | null;
  /** Whether it holds, and why not. */
  held: Held;
  onSource: number | null;
  onTarget: number | null;
  shape: Shape;
}

type Held =
  | {
      ok: true;
      movePct: number | null;
      roomAfter: number;
      usdPerPct: number | null;
      window: FactWindow["window"] | null;
      leftPct: number;
    }
  | { ok: false; reason: HeldReason };

const tokensOf = (context: ContextSize): number | null =>
  context.kind === "known" ? context.tokens : null;

const warm = (cache: CacheState): boolean => cache.kind === "warm";

/** Two organizations, by id: one only when both name the same. */
const oneOrganization = (a: string | null, b: string | null): boolean =>
  a !== null && a !== "" && a === b;

/**
 * When `windows` run out within `lookAheadMs` and more than `waitMs` before
 * their reset, at each window's pace with `addedBurn` (weighted tokens an
 * hour; negative for burn that leaves) and what arrives there on top; null
 * when none does. THE ONE TEST of running short: a forecast's source, every
 * target, and placement read it.
 */
export const runsShort = (
  windows: readonly FactWindow[],
  addedBurn: number,
  lookAheadMs: number,
  waitMs: number,
  now: number
): number | null => {
  let soonest: number | null = null;
  for (const window of windows) {
    const reset = window.resetAt;
    if (reset === null || reset <= now) {
      continue;
    }
    const added = window.tokensPerPct
      ? (addedBurn + window.arriving) / window.tokensPerPct
      : 0;
    const rate = (window.pace ?? 0) + added;
    if (rate <= 0) {
      continue;
    }
    const out = now + (Math.max(100 - window.usedPct, 0) / rate) * HOUR_MS;
    if (
      out - now <= lookAheadMs &&
      out < reset - waitMs &&
      (soonest === null || out < soonest)
    ) {
      soonest = out;
    }
  }
  return soonest;
};

/**
 * When `windows` run short with `burn` (weighted tokens an hour) added: the
 * test a target is held to ({@link runsShort} over twice the look-ahead,
 * `waitMs` before each reset). Every account a forecast's source test
 * ({@link LOOK_AHEAD_MS}, no burn added) flags, this flags too, so no
 * account is both a source and a target, and placement, which reads it for
 * every strategy, never starts a session on an account a forecast moves
 * sessions off. Null when they last.
 */
export const runsShortWith = (
  windows: readonly FactWindow[],
  burn: number,
  waitMs: number,
  now: number
): number | null => runsShort(windows, burn, 2 * LOOK_AHEAD_MS, waitMs, now);

/**
 * THE FLOOR TEST: whether landing `landingPct` percent on a window with
 * `leftPct` left takes it under its account's floor, which keeps `floorPct`
 * percent of it free (core `Account.reservePct`, `sessionReservePct`).
 * `landingPct` null is a new session, whose spend is not priced but is more
 * than nothing: a window at its floor has no room for it (placement.ts
 * `Usage.crossed`, `Usage.backAt`). A move lands its priced percent, or 0
 * for what was there before it ({@link windowHeld}): landing exactly on the
 * floor holds.
 */
export const breaksFloor = (
  leftPct: number,
  landingPct: number | null,
  floorPct: number
): boolean =>
  landingPct === null ? leftPct <= floorPct : leftPct - landingPct < floorPct;

/** What a window has left before anything new lands, percent. */
const leftOf = (window: FactWindow): number =>
  100 - window.usedPct - (window.spentPct ?? 0) - (window.pendingPct ?? 0);

/**
 * Whether `usd` (null: unpriced) landing on `account` leaves every window
 * at or above its floor: the room the account keeps after the move (decided
 * 2026-11-19, move-redesign "room"), read as a start reads it (placement.ts
 * `Usage.crossed`). What the session burns there after it lands is the
 * run-out test's ({@link runsShort}), never the floor's: counted against the
 * floor over the next five hours, it refused every account a heavy session
 * could burn through, those with all their room left among them. Unpriced
 * or unmeasured, a move holds only alone (no other move landing there) and
 * where the floor holds before it.
 */
const holdsOn = (
  account: Pick<FactAccount, "pendingMoves" | "windows">,
  usd: number | null
): Held => {
  let least: Extract<Held, { ok: true }> | null = null;
  let left = 100;
  for (const window of account.windows) {
    const one = windowHeld(window, usd, account.pendingMoves);
    if (!one.ok) {
      return one;
    }
    left = Math.min(left, leftOf(window));
    if (!least || one.roomAfter < least.roomAfter) {
      least = one;
    }
  }
  return least
    ? { ...least, leftPct: left }
    : {
        ok: true,
        movePct: null,
        roomAfter: 100,
        usdPerPct: null,
        window: null,
        leftPct: 100,
      };
};

/** {@link holdsOn} on one window: what the move takes of it and leaves, or why it doesn't hold. */
const windowHeld = (
  window: FactWindow,
  usd: number | null,
  pendingMoves: number
): Held => {
  const pct =
    usd === null || window.usdPerPct === null ? null : usd / window.usdPerPct;
  if (pct === null && usd !== 0 && pendingMoves > 0) {
    return { ok: false, reason: { kind: "alone" } };
  }
  const before = leftOf(window);
  if (breaksFloor(before, 0, window.floorPct)) {
    return {
      ok: false,
      reason: { kind: "reserve", pct: Math.round(100 - window.floorPct) },
    };
  }
  const after = before - (pct ?? 0);
  if (breaksFloor(before, pct ?? 0, window.floorPct)) {
    return {
      ok: false,
      reason: {
        kind: "room",
        leftPct: before,
        movePct: pct ?? 0,
        keepsPct: Math.round(window.floorPct),
      },
    };
  }
  return {
    ok: true,
    movePct: pct,
    roomAfter: after,
    usdPerPct: window.usdPerPct,
    window: window.window,
    leftPct: before,
  };
};

/** What staying where it is costs at its next request: a warm read, a cold write, or unknown. */
const stayPrice = (facts: TurnFacts): number | null => {
  const { cache, context, costs } = facts.session;
  const tokens = tokensOf(context);
  if (tokens === null || !costs.rates || cache.kind === "unknown") {
    return null;
  }
  return (
    tokens * (cache.kind === "warm" ? costs.rates.read : costs.rates.write)
  );
};

/** Whether a trigger leaves the session runnable where it is (it can take a turn on its account). */
const runnable = (trigger: MoveTrigger): boolean =>
  trigger.kind !== "limit" &&
  trigger.kind !== "refused-credential" &&
  !(trigger.kind === "hand" && trigger.stopped);

/**
 * The ways a move to an account may make the session small. Whole when
 * its context is unknown, small, carried or not the hub's to compact. A
 * cold cache moves as the policy's `coldMove` says (whole, or priced
 * against compacting after the move; never compacted on the account it
 * leaves, never a summary). A warm one priced: ahead of a limit whole,
 * compacted before or after; at a limit as the policy's `atLimit` names it.
 * An unknown cache is not priced as warm: whole.
 */
const shapesFor = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  carries: boolean
): Shape[] => {
  const { session, policy } = facts;
  const tokens = tokensOf(session.context);
  if (
    tokens === null ||
    carries ||
    !session.compactable ||
    tokens < policy.moveWholeUnderK * 1000
  ) {
    return ["whole"];
  }
  if (session.cache.kind === "cold") {
    return policy.coldMove === "cheapest"
      ? ["whole", "compact-after"]
      : ["whole"];
  }
  if (session.cache.kind === "unknown") {
    return ["whole"];
  }
  if (runnable(trigger)) {
    return ["whole", "compact-before", "compact-after"];
  }
  const named: Record<CompactMethod, Shape> = {
    summary: "summary",
    native: "compact-after",
    whole: "whole",
  };
  return [named[policy.atLimit]];
};

/**
 * One shape's dollars (audit 3.4): on the account it leaves, on the one it
 * reaches, and the next turn's saving from a smaller context, counted over
 * the session's own requests per turn (decided 2026-11-19). Null when its
 * context or its model's prices are unknown.
 */
const shapePrice = (
  facts: DecideFacts,
  shape: Shape,
  carries: boolean
): { onSource: number; onTarget: number; saving: number } | null => {
  const { context, costs, summarizerRates } = facts.session;
  const c = tokensOf(context);
  const { rates } = costs;
  if (c === null || !rates) {
    return null;
  }
  const { read: r, write: w, output: o } = rates;
  const k = FILING_REQUESTS;
  const s = SUMMARY_TOKENS;
  const c2 = c * COMPACTED_SHARE;
  const saving = costs.requestsPerTurn * (c - c2) * r;
  switch (shape) {
    case "whole":
      return {
        onSource: 0,
        onTarget: carries
          ? c * (CARRY_READ_SHARE * r + (1 - CARRY_READ_SHARE) * w)
          : c * w,
        saving: 0,
      };
    case "compact-after":
      return {
        onSource: 0,
        onTarget: c * w + (k - 1) * c * r + c * r + s * o + c2 * w,
        saving,
      };
    case "compact-before":
      return { onSource: k * c * r + c * r + s * o, onTarget: c2 * w, saving };
    case "summary": {
      const by = summarizerRates ?? rates;
      return {
        onSource: 0,
        onTarget: c * by.input + s * by.output + c2 * w,
        saving,
      };
    }
  }
};

/** Every option of moving the session to `account`, each priced and tested. */
const optionsOn = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  account: FactAccount
): MoveOption[] => {
  const { session, current } = facts;
  const carries =
    warm(session.cache) &&
    oneOrganization(current.orgId, account.orgId) &&
    CARRY_READ_SHARE >= CACHE_KEPT_AT;
  return shapesFor(facts, trigger, carries).map((shape) => {
    const priced = shapePrice(facts, shape, carries);
    return {
      account,
      carries,
      shape,
      onSource: priced?.onSource ?? null,
      onTarget: priced?.onTarget ?? null,
      effective: priced
        ? priced.onSource + priced.onTarget - priced.saving
        : null,
      held: heldOf(facts, trigger, account, priced),
    };
  });
};

/**
 * Whether a move to `account` priced `priced` holds: the account can take
 * the session at all, every window of it keeps its floor with the move and
 * the session's burn, a compaction on the account it leaves keeps that
 * one's floor, and the account does not run short with it (over twice the
 * look-ahead at a forecast or a wake; within the policy's wait at a limit,
 * a refused sign-in or extra usage).
 */
const heldOf = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  account: FactAccount,
  priced: { onSource: number; onTarget: number } | null
): Held => {
  const { session, current, now, policy } = facts;
  if (account.out) {
    return { ok: false, reason: account.out };
  }
  const target = holdsOn(account, priced?.onTarget ?? null);
  if (!target.ok) {
    return target;
  }
  if (priced && priced.onSource > 0) {
    const source = holdsOn(current, priced.onSource);
    if (!source.ok) {
      return source;
    }
  }
  const wide = trigger.kind === "forecast" || trigger.kind === "wake";
  const waitMs = policy.waitMinutes * MINUTE_MS;
  const out = wide
    ? runsShortWith(account.windows, session.burn ?? 0, waitMs, now)
    : runsShort(account.windows, session.burn ?? 0, waitMs, 0, now);
  return out === null
    ? target
    : {
        ok: false,
        reason: { kind: "runsOut", at: out, leftPct: target.leftPct },
      };
};

/** A shape as a move's price names it (core `MovePriceOption`). */
const optionWord = (shape: Shape): MovePriceOption => shape;

/**
 * The options that hold, in the order they are taken: by dollars (an
 * unpriced one last), those within the margin of the cheapest by the
 * strategy's order. One per account, its cheapest shape.
 */
const ordered = (options: readonly MoveOption[]): MoveOption[] => {
  const byCost = (a: MoveOption, b: MoveOption) =>
    (a.effective ?? Number.POSITIVE_INFINITY) -
      (b.effective ?? Number.POSITIVE_INFINITY) ||
    a.account.rank - b.account.rank;
  const best = new Map<string, MoveOption>();
  for (const one of [...options].sort(byCost)) {
    if (one.held.ok && !best.has(one.account.id)) {
      best.set(one.account.id, one);
    }
  }
  const holding = [...best.values()];
  const [cheapest] = holding;
  if (!cheapest || cheapest.effective === null) {
    return holding.sort((a, b) => a.account.rank - b.account.rank);
  }
  const least = cheapest.effective;
  const margin = Math.max(MARGIN_USD, MARGIN_SHARE * least);
  const near = holding.filter(
    (one) => one.effective !== null && one.effective <= least + margin
  );
  const far = holding.filter((one) => !near.includes(one));
  return [...near.sort((a, b) => a.account.rank - b.account.rank), ...far];
};

/** One account's reason, from its options: that it could take the session, else why its first option doesn't hold. */
const reasonOf = (mine: readonly MoveOption[]): HeldReason => {
  for (const one of mine) {
    if (one.held.ok) {
      return { kind: "fits", carries: one.carries, leftPct: one.held.leftPct };
    }
  }
  const [first] = mine;
  return first && !first.held.ok ? first.held.reason : { kind: "unread" };
};

/** Each other account's verdict: its best option's reason, or that it could take it. */
const verdictsOf = (
  facts: DecideFacts,
  options: readonly MoveOption[]
): AccountVerdict[] =>
  facts.accounts.map((account) => {
    const reason = reasonOf(
      options.filter((one) => one.account.id === account.id)
    );
    return {
      accountId: account.id,
      reason,
      ...(reason.kind !== "fits" && account.backAt !== null
        ? { backAt: account.backAt }
        : {}),
    };
  });

/** The move `option` as the carry takes it, its price beside the next best (`next`). */
const decided = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  option: MoveOption,
  next: MovePrice["next"]
): DecidedMove => {
  const held = option.held.ok
    ? option.held
    : { movePct: null, roomAfter: 0, usdPerPct: null, window: null };
  const tokens = tokensOf(facts.session.context);
  return {
    [brand]: true,
    at: facts.now,
    to: option.account.id,
    shape: option.shape,
    carries: option.carries,
    trigger: trigger.kind,
    usd: option.onTarget,
    movePct: held.movePct,
    roomAfter: held.roomAfter,
    usdPerPct: held.usdPerPct,
    window: held.window,
    announce:
      option.shape === "whole" &&
      !runnable(trigger) &&
      facts.policy.atLimit === "whole" &&
      !option.carries &&
      facts.session.compactable &&
      tokens !== null &&
      tokens >= facts.policy.moveWholeUnderK * 1000 &&
      facts.policy.moveWholeUnderK > 0,
    price: {
      usd:
        option.onTarget === null || option.onSource === null
          ? null
          : option.onTarget + option.onSource,
      next,
    },
  };
};

/**
 * The move, and those after it that hold: each priced beside the next best
 * (`staying`: what staying, waiting or keeping on credits costs, when that
 * was an option).
 */
const movesOf = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  holding: readonly MoveOption[],
  staying: { usd: number | null; what: MovePriceOption } | null
): DecidedMove[] =>
  holding.map((option, at) => {
    const after = holding[at + 1];
    const others = [
      ...(staying ? [staying] : []),
      ...(after
        ? [
            {
              what: optionWord(after.shape),
              usd: after.effective,
              to: after.account.id,
            },
          ]
        : []),
    ].sort(
      (a, b) =>
        (a.usd ?? Number.POSITIVE_INFINITY) -
        (b.usd ?? Number.POSITIVE_INFINITY)
    );
    return decided(facts, trigger, option, others[0] ?? null);
  });

/** The account that frees soonest and would take it, among those out only for room. */
const soonestBack = (
  facts: DecideFacts,
  verdicts: readonly AccountVerdict[]
): { accountId: string; at: number } | undefined => {
  let soonest: { accountId: string; at: number } | undefined;
  for (const one of verdicts) {
    const { kind } = one.reason;
    if (
      !(
        kind === "benched" ||
        kind === "reserve" ||
        kind === "limit" ||
        kind === "room"
      ) ||
      one.backAt === undefined ||
      one.backAt <= facts.now
    ) {
      continue;
    }
    if (!soonest || one.backAt < soonest.at) {
      soonest = { accountId: one.accountId, at: one.backAt };
    }
  }
  return soonest;
};

/** Whether the hub moved it lately, and an account it touched has not reset its 5-hour window since. */
const bounces = (facts: DecideFacts): boolean => {
  const last = facts.session.lastHubMove;
  return (
    last?.opened.some((opened) => opened !== null && opened <= last.at) === true
  );
};

/** A turn the hub starts by itself (audit 3.7), priced at what its first request re-reads. */
const decideTurn = (facts: TurnFacts, trigger: TurnTrigger): TurnChoice => {
  const usd = stayPrice(facts);
  const { cache } = facts.session;
  switch (trigger.turn) {
    case "always":
      return { kind: "run", usd, why: "always" };
    case "recap":
    case "notes":
      // A recap or the notes before cold run warm only: a cold session's
      // notes are shown, and it is woken by the person writing to it.
      if (cache.kind === "warm") {
        return { kind: "run", usd, why: "warm" };
      }
      return {
        kind: "skip",
        usd,
        why: cache.kind === "cold" ? "cold" : "unknown",
      };
    case "notice":
      if (trigger.waitedOn) {
        return { kind: "run", usd, why: "waited" };
      }
      if (cache.kind === "warm") {
        return { kind: "run", usd, why: "warm" };
      }
      return usd !== null && usd <= HUB_TURN_THRESHOLD_USD
        ? { kind: "run", usd, why: "cheap" }
        : { kind: "note", usd, why: usd === null ? "unknown" : "dear" };
  }
};

/** A person's move: their target, its cheapest shape; held only while that account can't run it at all. */
const decideHand = (
  facts: DecideFacts,
  trigger: Extract<MoveTrigger, { kind: "hand" }>,
  options: readonly MoveOption[],
  verdicts: AccountVerdict[],
  tokens: number | null
): MoveChoice => {
  const mine = options
    .filter((one) => one.account.id === trigger.to)
    .sort(
      (a, b) =>
        (a.effective ?? Number.POSITIVE_INFINITY) -
        (b.effective ?? Number.POSITIVE_INFINITY)
    );
  const [best] = mine;
  const out = best?.account.out?.kind;
  if (!best || out === "benched" || out === "limit") {
    return {
      kind: "wait",
      why: "hand",
      until: best?.account.backAt ?? facts.current.resetAt ?? facts.now,
      frees: trigger.to,
      stayUsd: null,
      moveUsd: null,
      accounts: verdicts,
      tokens,
    };
  }
  const [, next] = mine;
  return {
    kind: "move",
    moves: [
      decided(
        facts,
        trigger,
        best,
        next ? { what: optionWord(next.shape), usd: next.effective } : null
      ),
    ],
    accounts: verdicts,
    tokens,
  };
};

/** At a limit or a refused sign-in: it can't run where it is. */
const decideStopped = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  holding: readonly MoveOption[],
  common: Common,
  moveUsd: number | null
): MoveChoice => {
  const { now, policy, session, current } = facts;
  const refused = trigger.kind === "refused-credential";
  const waitMs = policy.waitMinutes * MINUTE_MS;
  const resetAt = current.resetAt ?? now + waitMs;
  const tokens = tokensOf(session.context);
  const { rates } = session.costs;
  const outlasts =
    session.cache.kind === "warm" && resetAt <= session.cache.until;
  const waitUsd =
    tokens === null || !rates
      ? null
      : tokens * (outlasts ? rates.read : rates.write);
  const wait = (why: WaitWhy, until = resetAt, frees?: string): MoveChoice => ({
    kind: "wait",
    why,
    until,
    ...(frees ? { frees } : {}),
    stayUsd: waitUsd,
    moveUsd,
    ...common,
  });
  if (!refused && session.forked) {
    return wait("fork");
  }
  if (!(refused || policy.move)) {
    return wait("off");
  }
  if (!refused && resetAt - now <= waitMs) {
    return wait("soon");
  }
  // Waiting re-reads nothing more than a warm read: it waits, unless a
  // person waits on it (decided 2026-11-19: at a limit they move at once).
  if (!refused && outlasts && !session.personWaiting) {
    return wait("free");
  }
  if (holding.length > 0) {
    return {
      kind: "move",
      moves: movesOf(
        facts,
        trigger,
        holding,
        refused ? null : { what: "wait", usd: waitUsd }
      ),
      ...common,
    };
  }
  const back = soonestBack(facts, common.accounts);
  return back && back.at < resetAt
    ? wait("full", back.at, back.accountId)
    : wait("full");
};

/**
 * Why a session ahead of any limit stays whatever a move would cost: a
 * fork; moving off; its account forcing it onto credits; a person waiting
 * on it at a forecast (decided 2026-11-19); its work item ended, at a
 * forecast; the hub having moved it lately;
 * an unknown cache at a forecast or a wake (unknown is never free); or, at
 * a wake, its own account still holding it. Undefined when none holds it.
 */
const aheadHeld = (
  facts: DecideFacts,
  trigger: MoveTrigger
): StayWhy | undefined => {
  const { session, policy, current, now } = facts;
  const credits = trigger.kind === "extra-usage";
  if (session.forked) {
    return "fork";
  }
  if (!policy.move) {
    return "off";
  }
  if (credits) {
    return current.atPlanLimit === "extra-usage" ? "credits" : undefined;
  }
  if (trigger.kind === "forecast" && session.personWaiting) {
    return "waiting";
  }
  // A session nobody will wake burns nothing on its account: moving it
  // ahead of the run-out spends a re-read and relieves no window.
  if (trigger.kind === "forecast" && session.ended) {
    return "ended";
  }
  if (bounces(facts)) {
    return "bounce";
  }
  if (session.cache.kind === "unknown") {
    return "unknown";
  }
  if (trigger.kind !== "wake") {
    return;
  }
  // Its own account is read as a target is: its floor, then whether it
  // runs short with the session's burn on it.
  const here = holdsOn(current, 0);
  const short = runsShortWith(
    current.windows,
    session.burn ?? 0,
    policy.waitMinutes * MINUTE_MS,
    now
  );
  return here.ok && short === null ? "holds" : undefined;
};

/** Ahead of any limit: a forecast, extra usage past a plan, a wake. */
const decideAhead = (
  facts: DecideFacts,
  trigger: MoveTrigger,
  holding: readonly MoveOption[],
  common: Common,
  moveUsd: number | null
): MoveChoice => {
  const { session, current } = facts;
  const credits = trigger.kind === "extra-usage";
  const stayUsd = credits ? session.costs.nextTurnUsd : stayPrice(facts);
  const stay = (why: StayWhy): MoveChoice => ({
    kind: "stay",
    why,
    stayUsd,
    moveUsd,
    ...common,
  });
  const held = aheadHeld(facts, trigger);
  if (held) {
    return stay(held);
  }
  // A forecast or a wake moves only what moves for free (decided
  // 2026-11-19): a cache that carries, or one cold already.
  const free =
    trigger.kind === "forecast" || trigger.kind === "wake"
      ? holding.filter((one) => one.carries || session.cache.kind === "cold")
      : holding;
  const [best] = free;
  if (!best) {
    return stay("full");
  }
  // On credits the move must beat what staying costs in real dollars, by
  // the margin, unless the account forces the move.
  if (credits && current.atPlanLimit === "price") {
    if (best.effective === null || stayUsd === null) {
      return stay(stayUsd === null ? "credits" : "unknown");
    }
    if (
      best.effective + Math.max(MARGIN_USD, MARGIN_SHARE * stayUsd) >=
      stayUsd
    ) {
      return stay("dearer");
    }
  }
  return {
    kind: "move",
    moves: movesOf(facts, trigger, free, {
      what: credits ? "credits" : "stay",
      usd: stayUsd,
    }),
    ...common,
  };
};

/**
 * THE ONE DECISION. For a move trigger: move (to the first of `moves`),
 * wait for a reset (at a limit, a refused sign-in or a person's move to a
 * full account), or stay. For a hub-started turn: run it, keep it as a note
 * for the session's next turn, or skip it.
 */
export function decide(facts: TurnFacts, trigger: TurnTrigger): TurnChoice;
export function decide(facts: DecideFacts, trigger: MoveTrigger): MoveChoice;
export function decide(
  given: DecideFacts | TurnFacts,
  trigger: MoveTrigger | TurnTrigger
): MoveChoice | TurnChoice {
  if (trigger.kind === "hub-turn") {
    return decideTurn(given, trigger);
  }
  // A move's facts: the overloads let no move trigger in with a turn's.
  if (!("accounts" in given)) {
    return {
      kind: "stay",
      why: "unknown",
      stayUsd: null,
      moveUsd: null,
      accounts: [],
      tokens: null,
    };
  }
  const facts = given;
  const options = facts.accounts.flatMap((account) =>
    optionsOn(facts, trigger, account)
  );
  const accounts = verdictsOf(facts, options);
  const tokens = tokensOf(facts.session.context);
  if (trigger.kind === "hand") {
    return decideHand(facts, trigger, options, accounts, tokens);
  }
  const holding = ordered(options);
  const moveUsd = holding[0]?.effective ?? null;
  const common = { accounts, tokens };
  return runnable(trigger)
    ? decideAhead(facts, trigger, holding, common, moveUsd)
    : decideStopped(facts, trigger, holding, common, moveUsd);
}
