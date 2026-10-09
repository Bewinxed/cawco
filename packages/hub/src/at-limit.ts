import {
  type Account,
  type AccountBench,
  type AccountMove,
  type AccountProvider,
  type AccountReading,
  type AtLimit,
  accountName,
  type ContinueStep,
  type LimitWindow,
  modelScope,
  type NeutralOrigin,
  namedAccount,
  type RebalanceNotice,
  type WaitReason,
  windowWords,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
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
 */

export type LimitRow = ReturnType<DbShape["getInstancesByIds"]>[number];

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
  changed: () => void;
  /**
   * Continues `row` on `accountId` from a summary, the new session taking
   * its place once `row` has ended: `kept` when it still covers the
   * conversation as it stands, otherwise one written there and kept for
   * `row` until `keepUntil`, so a retry reads it again rather than writing
   * another. Throws when `row` cannot be read to start one; a later step
   * that fails comes back as {@link createAtLimit}'s `continuationFailed`.
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
  /** Whether `row` is between turns: nothing running and nothing waiting on it. */
  idle: (row: LimitRow) => Promise<boolean>;
  /** Runs the next look and each settling session's timer until the hub closes. */
  lifetime: HubLifetimeShape;
  /** A machine as a sentence names it. */
  machineName: (machineId: string) => string;
  /**
   * Relaunches `row` on `accountId`, its conversation with it, and, when
   * its limit stopped it (`carryOn`), has it carry on; a session moved
   * between turns before any limit waits for its next message. Answers why
   * when it did not move: `row` is still on its account then.
   */
  move: (
    row: LimitRow,
    accountId: string,
    carryOn: boolean
  ) => Promise<string | undefined>;
  /** The session's machine and title, as a line names them. */
  named: (row: LimitRow) => { machine: string; session: string };
  /** Writes one line into `row`'s transcript. */
  note: (row: LimitRow, move: AccountMove) => void;
  /** What adding an account set moving, for the Accounts page. */
  noticed: (notice: RebalanceNotice) => void;
  /** Has `row` carry on where its limit stopped it, on the account it is on. */
  resume: (row: LimitRow) => void;
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
  /** Who would carry `row` off `accountId`: placement for its kind, excluding that account. */
  target: (row: LimitRow, accountId: string) => string | null;
  /** Whether `row`'s prompt cache is still warm: a move off its account then re-reads it. */
  warm: (row: LimitRow) => boolean;
}

/** What a failure said, as a line quotes it. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * A session past caring: its process will not be woken by anything the hub
 * does here. One another took the place of is never acted on again: a
 * session is continued once, ever.
 */
const over = (row: LimitRow | undefined): boolean =>
  !row ||
  ["stopped", "discarded", "error"].includes(row.status) ||
  row.continuedInto !== null;

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
   * Looks at a refused session again shortly: its machine still had its turn
   * running when the refusal came. Given up once {@link SETTLE_FOR_MS} has
   * passed: a session busy that long is in a turn its account took.
   */
  const settle = (row: LimitRow, current: Account): void => {
    const was = settling.get(row.id);
    const until = was?.until ?? Date.now() + SETTLE_FOR_MS;
    if (was) {
      lifetime.cancel(was.timer);
    }
    if (lifetime.closed() || Date.now() >= until) {
      settling.delete(row.id);
      console.info(
        `[at-limit] ${row.id}: still mid-turn after ${SETTLE_FOR_MS / 1000}s; its next refusal is looked at then`
      );
      return;
    }
    const next = lifetime.after(SETTLE_MS, () => {
      const fresh = rowOf(row.id);
      if (over(fresh) || !fresh) {
        settling.delete(row.id);
        return;
      }
      act(fresh, current).catch((error: unknown) => {
        console.error(
          `[at-limit] ${row.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    });
    settling.set(row.id, { timer: next, until });
  };

  /** The line a move writes: what it cost, and the window that sent it. */
  const movedNote = (
    row: LimitRow,
    current: Account,
    target: Account,
    sameOrg: boolean,
    now: number
  ): AccountMove => {
    const full = fullWindow(readingOf(current.id), row.model, now);
    const cost = sameOrg
      ? undefined
      : reReadCost(readForecast(db, target.provider, now), row, target);
    return {
      kind: "moved",
      from: namedAccount(current),
      to: namedAccount(target),
      sameOrganization: sameOrg,
      ...(cost ? { cost } : {}),
      tokens: row.contextTokens,
      window: full ? windowWords(full) : null,
      resetsAt: refusedUntil(
        db.accounts.bench(now),
        readingOf(current.id),
        current.id,
        row.model,
        now
      ),
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
   * Continuing `row` on `target` failed at `step`: it is the one session
   * running, still on `current`. Its transcript says so (once for the same
   * failure, however often a retry meets it again), and it is held until
   * its reset, each look deciding again whether to wait or try once more.
   */
  const unmoved = (
    row: LimitRow,
    current: Account,
    target: Account,
    step: ContinueStep,
    reason: string
  ): void => {
    const last = db.atLimit.events([row.id]).at(-1)?.move;
    const repeated =
      last?.kind === "unmoved" &&
      last.step === step &&
      last.reason === reason &&
      last.to.id === target.id;
    if (!repeated) {
      ports.note(row, {
        kind: "unmoved",
        from: namedAccount(current),
        to: namedAccount(target),
        step,
        reason,
        ...ports.named(row),
      });
    }
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: holdUntil(row, current, Date.now()),
    });
    console.warn(
      `[at-limit] ${row.id}: continuing on ${accountName(target)} failed at ${step}: ${reason}`
    );
    ports.changed();
    plan();
  };

  /**
   * Moves `row` whole onto `target`, its line written once it has; one that
   * did not move is held on `current` until its reset, and says why.
   */
  const moveWhole = async (
    row: LimitRow,
    current: Account,
    target: Account,
    oneOrganization: boolean,
    now: number
  ): Promise<void> => {
    const why = await ports.move(row, target.id, true);
    if (why) {
      unmoved(row, current, target, "start", why);
      return;
    }
    db.atLimit.dropSummary(row.id);
    ports.note(row, movedNote(row, current, target, oneOrganization, now));
  };

  /** Moves or continues `row` off `current`, or holds it, as {@link decideAtLimit} says. */
  const act = async (row: LimitRow, current: Account): Promise<void> => {
    if (acting.has(row.id) || ports.continuing(row) || over(row)) {
      return;
    }
    acting.add(row.id);
    try {
      const now = Date.now();
      const decision = decide(row, current, now);
      if (decision.action === "wait") {
        settling.delete(row.id);
        hold(row, current, decision);
        return;
      }
      // Only between turns: never inside a tool round, never over a turn
      // someone started since.
      if (!(await ports.idle(row))) {
        settle(row, current);
        return;
      }
      const was = settling.get(row.id);
      if (was) {
        lifetime.cancel(was.timer);
        settling.delete(row.id);
      }
      const target = db.accounts.get(decision.targetId);
      if (!target) {
        return;
      }
      db.atLimit.dropHold(row.id);
      if (decision.action === "move") {
        await moveWhole(row, current, target, decision.sameOrganization, now);
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
        unmoved(row, current, target, "prepare", messageOf(error));
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
          `[at-limit] ${row.id}: summary kept ahead of ${accountName(current)}'s limit (${window.percent}%)`
        );
      } else {
        db.atLimit.dropSummary(row.id);
      }
    } catch (error) {
      db.atLimit.dropSummary(row.id);
      console.warn(
        `[at-limit] ${row.id}: summary ahead of the limit failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** Drops each kept summary whose window reset first, or whose session left its account or ended. */
  const discardSummaries = (now: number): void => {
    for (const kept of db.atLimit.summaries()) {
      const row = rowOf(kept.instanceId);
      if (
        Date.parse(kept.resetsAt) <= now ||
        over(row) ||
        (row && ports.accountOf(row) !== kept.accountId)
      ) {
        db.atLimit.dropSummary(kept.instanceId);
        console.info(
          `[at-limit] ${kept.instanceId}: summary kept at its limit discarded`
        );
      }
    }
  };

  /**
   * Whether `row` stays at its limit with nothing carrying it on: a work
   * item's session in a project whose Caw is off, as with Caw off nothing
   * wakes a model for the project (Projects §5.3), neither a move to a free
   * account nor a resume at the reset. Its hold goes, and its transcript
   * says so once per limit: the line stands in for a wait written while Caw
   * was on, which would otherwise read as carried on at the reset.
   */
  const stays = (row: LimitRow, current: Account): boolean => {
    const project = row.projectId ? db.project(row.projectId) : undefined;
    if (!(row.workItemId && project && !project.caw)) {
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
      ports.note(row, {
        kind: "stopped",
        account: namedAccount(current),
        resetsAt,
      });
      console.info(
        `[at-limit] ${row.id}: ${project.name}'s Caw is off, so nothing carries it on past ${accountName(current)}'s limit`
      );
    }
    if (held) {
      ports.changed();
    }
    return true;
  };

  /**
   * One held session: past its reset, it carries on where it is once it is
   * between turns; before, another account may have come free for it.
   */
  const lookAt = async (held: LimitHold, now: number): Promise<void> => {
    const row = rowOf(held.instanceId);
    const current = db.accounts.get(held.accountId);
    if (over(row) || !row || !current) {
      db.atLimit.dropHold(held.instanceId);
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
        `[at-limit] ${row.id}: ${accountName(current)} reset; carrying on`
      );
      ports.resume(row);
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
      console.info(
        `[at-limit] ${instanceId}: turn refused at ${accountName(current)}'s limit`
      );
      if (row.continuedInto !== null) {
        console.info(
          `[at-limit] ${instanceId}: it was continued as ${row.continuedInto} already; it is never continued again`
        );
        return;
      }
      const origin = ports.startedBy(row);
      if (origin?.kind === "system" && noticeTurn(origin)) {
        console.info(
          `[at-limit] ${instanceId}: the hub's own word (${origin.name ?? "a notice"}) started that turn; it is left for a person or its parent`
        );
        return;
      }
      if (!stays(row, current)) {
        await act(row, current);
      }
    },
    /** A turn of `instanceId` ended as any turn does: maybe write a summary ahead of the limit. */
    async turnEnded(instanceId: string): Promise<void> {
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      if (row && current) {
        await prepare(row, current);
      }
    },
    /**
     * A continuation of `instanceId` from `fromAccountId` to `toAccountId`
     * failed at `step`; nothing of it is left running but `instanceId`.
     */
    continuationFailed(
      instanceId: string,
      failure: {
        fromAccountId: string;
        toAccountId: string;
        step: ContinueStep;
        reason: string;
      }
    ): void {
      const row = rowOf(instanceId);
      const current = db.accounts.get(failure.fromAccountId);
      const target = db.accounts.get(failure.toAccountId);
      if (row && current && target) {
        unmoved(row, current, target, failure.step, failure.reason);
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
