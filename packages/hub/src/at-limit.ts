import {
  type Account,
  type AccountMove,
  type AccountProvider,
  type AccountReading,
  type AccountSignin,
  accountNameAmong,
  type HeldReason,
  isChatgptPlan,
  keepsGoingOnExtraUsage,
  namedAccount,
  type WaitReason,
} from "@cawco/core/accounts";
import {
  RESTART_WAIT_CAP_MS,
  WORK_IN_FLIGHT,
} from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import { OVER_STATUSES } from "@cawco/core/protocol";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import {
  aheadOfWeek,
  earliestReset,
  openedAt,
  windowKey,
  windowResetAt,
  windowUsed,
  windowWords,
} from "@cawco/core/usage/windows";
import { clockWords, dayWords } from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { configurePage } from "@cawco/core/words/configure";
import type { KeptOff } from "./account-marks";
import { type Admission, usdWords } from "./admission";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import {
  type DecidedMove,
  type DecideFacts,
  decide as decideOne,
  type FactAccount,
  type MoveChoice,
  type MoveTrigger,
  type WaitWhy,
} from "./decide";
import type { HubTimer } from "./lifetime";
import {
  type AccountsRead,
  type AtLimitPorts,
  compactedLine,
  factsOf,
  fullWindow,
  type Handed,
  type Kept,
  kWords,
  type LimitRow,
  lineCost,
  linePrice,
  liveWorkOf,
  moveSideWords,
  planOf,
  refusedUntil,
  type Stall,
  type TakenUpBy,
  WHOLE_MOVE_NOTICE_MS,
} from "./limit-decision";
import {
  type AccountRow,
  type Arrival,
  accountRows,
  arrivingBurn,
  type PlacementInput,
  pacedOrder,
  pinnedOf,
  runsOutBy,
} from "./placement";
import { createRebalancer, readForecast, sessionBurn } from "./rebalance";

/**
 * A running Claude session whose account reached its limit: its turn was
 * refused. It moves whole to another account known to have room, in the same
 * chat, or, when no account has room, is held until the earliest moment one
 * does (its own account's reset, or another's that comes sooner), by its
 * provider's `atLimit` routing. Moving means re-reading the context without
 * its cache, since caches are per organization and workspace
 * (platform.claude.com/docs/en/build-with-claude/prompt-caching: "Different
 * organizations never share caches"), unless both accounts are in one
 * organization. How it is made small is the one decision's (decide.ts): a
 * cold cache moves whole unless the policy takes the cheapest path, a warm
 * one at its limit as the policy's `atLimit` names (its harness's own
 * `/compact` after the move, a fresh conversation opened on a summary,
 * limit-moves.ts `continueAsMove`, or whole, announced first:
 * {@link WHOLE_MOVE_NOTICE_MS}). Every outcome is one line in its
 * transcript saying what it cost and what the next best would have (core
 * `AccountMove`). Moves happen only between turns. A session stopped at its
 * limit, or on its refused sign-in, runs no turn. When a person waits on
 * it, nothing it holds for later (a background command, a monitor, a
 * wake-up) keeps it where it is: its move ends that work and it is told on
 * the new account what ended (server.ts `moveRowsToAccount` with
 * `stopped`), as a person's pick does. When nobody does (a delegate's
 * work), its move waits for that work and never ends it (decided
 * 2026-11-19): it moves once that work ends, or carries on at its reset.
 *
 * Where it goes, or whether it waits, is the one decision (decide.ts
 * `decide`) over what the hub already knows ({@link factsOf}): every
 * account's readings and floors, the moves admitted onto each
 * (admission.ts), organizations by id, the session's cache state, context
 * and measured prices, and who waits on it. No account is tried and failed
 * in turn. A move that fails for the target's part ({@link Kept.target})
 * goes to the next account the same decision weighed.
 *
 * The same controller rebalances before any limit (rebalance.ts): a
 * session on an account that runs short moves only when the move is free
 * (its cache carries, or is cold already), and held sessions are looked at
 * again at once.
 *
 * A turn that ran on its account's extra usage past a plan limit was not
 * refused: Claude Code answered it on the account's credits. The account's
 * setting (core `AtPlanLimit`) forces staying or moving, or, by default,
 * the decision prices the session's next turn on credits against the
 * cheapest move to plan room that holds, and takes the lower.
 *
 * It also answers a Claude session whose turn died on its account's
 * credential. Refused for good (ask-routing.ts `settleRefusal` signed the account
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
 *
 * A hold carries on by itself only within its provider's cutoff (core
 * `AtLimit.staleAfterHours`, a day by default): past its reset by more, or
 * held that long on a refused sign-in, it goes stale ({@link goneStale}):
 * nothing sends to it, wakes it or moves it, whatever looks at it (a recheck,
 * a machine connecting, a hub's boot), until a person or its parent writes
 * to it.
 */

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
type Cause = "limit" | "refused-credential" | "extra-usage";

/** The percent `account` keeps free of a window of `group` (core `Account.reservePct`, `sessionReservePct`): its floor; 0 for none. */
const floorOf = (account: Account | undefined, group: string): number => {
  const floors: Record<string, number | null | undefined> = {
    weekly: account?.reservePct,
    session: account?.sessionReservePct,
  };
  const used = floors[group];
  return used === null || used === undefined ? 0 : Math.max(0, 100 - used);
};

/**
 * Why `row` (placement's row of an account) can't take a session whatever
 * the price: another ChatGPT plan, not signed in on its machine, not allowed
 * by its project or task, refused its model by its provider, benched, its
 * limits never read, at its limit, or out of the pinned strategy's backups.
 * Null when it can: what it has left is the floor test's (decide.ts).
 */
const outOf = (
  row: AccountRow,
  how: { otherPlan: boolean; pinned: string | null; strategy: string },
  now: number
): HeldReason | null => {
  if (how.otherPlan) {
    return { kind: "plan" };
  }
  if (!row.signedIn) {
    return { kind: "signin" };
  }
  if (row.notAllowedBy) {
    return { kind: "allowed", by: row.notAllowedBy };
  }
  if (row.marked) {
    return row.marked;
  }
  if (row.benchedUntil !== null) {
    return { kind: "benched" };
  }
  if (!row.read) {
    return { kind: "unread" };
  }
  if (row.windows.some((window) => windowUsed(window, now) >= 100)) {
    return { kind: "limit" };
  }
  if (how.strategy === "pinned" && row.id !== how.pinned && row.neverBackup) {
    return { kind: "backup" };
  }
  return null;
};

/**
 * Every account of `leaving`'s provider as the decision for `row` reads it
 * ({@link AtLimitPorts.accountRows}): placement's rows (placement.ts
 * `accountRows`) with the burn already arriving on each (`how.owed`: the
 * sessions on their way to an account; `landing`: those a look already
 * sent), the ledger's figures (admission.ts), each window's floor, and
 * where the kind's strategy ranks it, a sign-in a turn on `row`'s machine
 * proved since `how.provenSince` breaking ties; `row`'s own burn and its
 * model's window; and the provider's refusals the hub keeps for its model
 * (`how.keptOff`, hub account-marks.ts), which no move lands on.
 */
export const accountsRead = (
  db: DbShape,
  admission: Pick<Admission, "ledger">,
  row: LimitRow,
  leaving: string,
  landing: readonly Arrival[],
  how: {
    asks: Pick<
      PlacementInput,
      "kind" | "projectAccounts" | "taskAccounts" | "typeAccount"
    >;
    keptOff: KeptOff;
    machineName: string;
    owed: ReadonlyMap<string, string>;
    provenSince: number;
    /** The sign-ins `row`'s harness can run on (placement.ts `harnessSignins`). */
    signins: AccountSignin[];
    window: number | null;
  }
): AccountsRead => {
  const from = db.accounts.get(leaving);
  const provider = from?.provider;
  // A ChatGPT plan is left for no other plan (core `isChatgptPlan`).
  const onePlan = from !== undefined && isChatgptPlan(from);
  const now = Date.now();
  const accounts = db.accounts
    .list()
    .filter((account) => account.provider === provider);
  if (!provider) {
    return { accounts: [], current: undefined, burn: null, window: how.window };
  }
  const { asks } = how;
  const choice = db.accounts.routing(provider)[asks.kind];
  const strategy = {
    kind: choice.strategy,
    pinned: pinnedOf(choice, accounts) ?? null,
    prefers: asks.typeAccount ?? null,
  };
  const forecast = readForecast(db, provider, now, how.owed);
  const burn = sessionBurn([...forecast.turns.values()].flat(), row.id, now);
  const proven = db.turnUsage.accountsUsedOn(row.machineId, how.provenSince);
  const arriving = landing.filter((one) => one.instanceId !== row.id);
  const landed = new Set(arriving.map((one) => one.instanceId));
  const rows = accountRows(
    {
      accounts,
      signins: how.signins,
      harness: row.harness,
      readings: db.accounts.readings(),
      bench: db.accounts.bench(),
      routing: db.accounts.routing(provider),
      machineId: row.machineId,
      machineName: how.machineName,
      ...(row.model ? { model: row.model } : {}),
      ...asks,
      ...how.keptOff,
      paces: forecast.paces,
      arrivals: [
        ...forecast.arrivals.filter(
          (one) => one.instanceId !== row.id && !landed.has(one.instanceId)
        ),
        ...arriving,
      ],
      now,
    },
    ""
  );
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const order = pacedOrder(strategy.kind, strategy.pinned ?? undefined);
  const ranked = (one: AccountRow) => ({
    ahead: aheadOfWeek(one.windows, now) !== undefined,
    id: one.id,
    order: one.order,
    createdAt: one.createdAt,
    binding: Math.max(
      0,
      ...one.windows.map((window) => windowUsed(window, now))
    ),
    reset: earliestReset(one.windows, now),
    runsOut: runsOutBy(one.windows, burn ?? 0, one.arrivals, one.id, now),
  });
  const ranks = new Map(
    [...rows]
      .sort(
        (a, b) =>
          Number(b.id === strategy.prefers) -
            Number(a.id === strategy.prefers) ||
          order(ranked(a), ranked(b)) ||
          Number(proven.has(b.id)) - Number(proven.has(a.id))
      )
      .map((one, at) => [one.id, at])
  );
  const fact = (one: AccountRow): FactAccount => {
    const account = byId.get(one.id);
    const ledger = admission.ledger(one.id, row.id, row.model, now);
    const windows = one.windows.map((window) => {
      const held = ledger.windows.find(
        (entry) => windowKey(entry.window) === windowKey(window)
      );
      return {
        window: {
          kind: window.kind,
          group: window.group,
          scopeLabel: window.scopeLabel,
        },
        usedPct: held?.usedPct ?? windowUsed(window, now),
        spentPct: held?.spentPct ?? null,
        pendingPct: held?.pendingPct ?? null,
        usdPerPct: held?.usdPerPct ?? null,
        floorPct: floorOf(account, window.group),
        resetAt: windowResetAt(window),
        openedAt: openedAt(window),
        pace: window.pace,
        tokensPerPct: window.tokensPerPct,
        arriving: arrivingBurn(one.arrivals, one.id, window, now),
      };
    });
    return {
      id: one.id,
      orgId: account?.identity?.orgId ?? null,
      out: outOf(
        one,
        {
          otherPlan: onePlan && account !== undefined && isChatgptPlan(account),
          pinned: strategy.pinned,
          strategy: strategy.kind,
        },
        now
      ),
      backAt: one.backAt,
      pendingMoves: ledger.pendingMoves,
      rank: ranks.get(one.id) ?? rows.length,
      sessionOpenedAt:
        windows.find(
          (window) =>
            window.window.group === "session" &&
            window.resetAt !== null &&
            window.resetAt > now
        )?.openedAt ?? null,
      windows,
    };
  };
  const current = rows.find((one) => one.id === leaving);
  return {
    accounts: rows.filter((one) => one.id !== leaving).map(fact),
    current: current ? fact(current) : undefined,
    burn,
    window: how.window,
  };
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
const over = (
  row: Pick<LimitRow, "continuedInto" | "status"> | undefined
): boolean =>
  !row || row.continuedInto !== null || OVER_STATUSES.has(row.status);

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
type Waiting = Extract<MoveChoice, { kind: "wait" }>;
/** A decision that keeps a session going where it is, on extra usage. */
type Staying = Extract<MoveChoice, { kind: "stay" }>;

/** A wait's reason as its line says it: a person's move writes no line of its own. */
const lineWhy = (why: WaitWhy): WaitReason => (why === "hand" ? "full" : why);

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

  /**
   * The one decision (decide.ts) for `row` off `current`, for `cause`, now,
   * or, when a person moved it, for their move; undefined when its account
   * is none the hub reads.
   */
  const decide = (
    row: LimitRow,
    current: Account,
    cause: Cause,
    now: number
  ): { decision: MoveChoice; facts: DecideFacts } | undefined => {
    const facts = factsOf(db, ports, row, current, now, {
      landing: [...landing.values()],
    });
    if (!facts) {
      return;
    }
    const byHand = ports.handMove(row);
    const trigger: MoveTrigger = byHand
      ? { kind: "hand", to: byHand, stopped: cause !== "extra-usage" }
      : { kind: cause };
    return { facts, decision: decideOne(facts, trigger) };
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
   * `row` ran its turn on `current`'s extra usage past a plan limit, and the
   * decision keeps it there: nothing holds it, as its turns are answered
   * there. Its log line says both prices.
   */
  const stillOnExtraUsage = (
    row: LimitRow,
    current: Account,
    decision: Staying
  ): void => {
    const named = accountNameAmong(current, db.accounts.list());
    const because: Record<Staying["why"], string> = {
      fork: "a fork stays on the account its origin's cache is on",
      off: "moving to another account at the limit is switched off",
      full: "no other account it may run on holds it now",
      credits: `${named} says to keep going on its extra usage`,
      dearer: `its next turn there costs ${usdWords(decision.stayUsd)} on credits, and the cheapest move that holds costs ${usdWords(decision.moveUsd)}`,
      unknown: "its next turn's price there is unknown",
      waiting: "a person waits on it",
      bounce: "the hub moved it lately",
      holds: "its account holds it",
    };
    sayOnExtraUsage(
      row,
      `ran its turn on ${named}'s extra usage, past its plan limit, and keeps going there: ${because[decision.why]}. Each turn's end decides again.`
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
    const next = lifetime.after("at-limit settle", SETTLE_MS, () => {
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

  /** The line a move writes: what it re-read and what the decision priced, beside the next best, and the window, or the refused sign-in, that sent it. */
  const movedNote = (
    row: LimitRow,
    current: Account,
    target: Account,
    move: DecidedMove,
    tokens: number | null,
    now: number,
    cause: Cause
  ): Extract<AccountMove, { kind: "moved" }> => {
    const atLimit = cause === "limit";
    const full = atLimit
      ? fullWindow(readingOf(current.id), row.model, now)
      : undefined;
    const accounts = db.accounts.list();
    return {
      kind: "moved",
      from: namedAccount(current, accounts),
      to: namedAccount(target, accounts),
      sameOrganization: move.carries,
      ...lineCost(move),
      price: linePrice(move.price, accounts),
      ...(cause === "refused-credential"
        ? { because: { kind: "refused" as const } }
        : {}),
      ...(cause === "extra-usage"
        ? { because: { kind: "extra-usage" as const } }
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
      : db.atLimit.latestEvent(row.id)?.move;
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
   * Moves `row` onto `target`, made small as the decided move says
   * ({@link planOf}), its line written once it has moved whole or compacts
   * there; a compaction before the move, or a summary, writes its own as it
   * goes. A move off a refused sign-in is also said to whoever hears its
   * reports. A move that ended work its process held for later says so.
   * Answers why it did not move.
   */
  const carryMove = async (
    row: LimitRow,
    current: Account,
    target: Account,
    move: DecidedMove,
    tokens: number | null,
    cause: Cause,
    laterSince: number | undefined
  ): Promise<Kept | undefined> => {
    const refused = cause === "refused-credential";
    const plan = planOf(move);
    const moved = compactedLine(
      movedNote(row, current, target, move, tokens, Date.now(), cause),
      plan,
      row.harness
    );
    const line = crypto.randomUUID();
    // Its announcement gives way to the move it announced.
    const announced = db.atLimit.latestEvent(row.id);
    if (announced?.move?.kind === "moving") {
      ports.unnote(row, announced.id);
    }
    // A turn extra usage answered is over: the session waits there for its
    // next message, as a move between turns does.
    const carryOn = {
      limit: "limit",
      "refused-credential": "signin",
      "extra-usage": false,
    } as const;
    const done = await ports.move(
      row,
      move,
      carryOn[cause],
      plan.method === "whole" ? undefined : { line, move: moved, plan },
      laterSince
    );
    if ("kept" in done) {
      return done.kept;
    }
    if ("later" in done) {
      return undefined;
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

  /** Timers that carry out an announced move whole at its moment, by session ({@link announce}). */
  const notices = new Map<string, HubTimer>();

  /**
   * When `row`'s move whole to `target` goes: the moment its last line, an
   * announcement of that move, names; undefined when none stands.
   */
  const announcedAt = (row: LimitRow, target: Account): number | undefined => {
    const last = db.atLimit.latestEvent(row.id)?.move;
    return last?.kind === "moving" && last.to.id === target.id
      ? last.at
      : undefined;
  };

  /**
   * A move whole the policy names for a context it would otherwise compact
   * at a limit ({@link DecidedMove} `announce`), announced in `row`'s
   * transcript before it goes (core `AccountMove` `moving`): true while it
   * waits its {@link WHOLE_MOVE_NOTICE_MS}, held there meanwhile at its
   * limit, and decided again at its moment; false once that has passed,
   * when it goes. A person who stops the session meanwhile keeps it where
   * it is.
   */
  const announce = (
    row: LimitRow,
    current: Account,
    target: Account,
    move: DecidedMove,
    tokens: number | null,
    cause: Cause,
    now: number
  ): boolean => {
    const was = announcedAt(row, target);
    if (was !== undefined && was <= now) {
      return false;
    }
    const at = was ?? now + WHOLE_MOVE_NOTICE_MS;
    if (was === undefined) {
      const accounts = db.accounts.list();
      ports.note(row, {
        kind: "moving",
        from: namedAccount(current, accounts),
        to: namedAccount(target, accounts),
        at,
        tokens,
        ...lineCost(move),
      });
      console.info(
        `[at-limit] ${ports.named(row)} moves whole from ${accountNameAmong(current, accounts)} to ${accountNameAmong(target, accounts)} at ${clockWords(at)}, as its provider's policy says for a conversation this large; stopping it before then keeps it where it is.`
      );
    }
    if (cause === "limit") {
      db.atLimit.putHold({
        instanceId: row.id,
        accountId: current.id,
        until: at,
      });
    } else if (cause === "refused-credential") {
      holdRefused(row, current);
    }
    const pending = notices.get(row.id);
    if (pending) {
      lifetime.cancel(pending);
    }
    notices.set(
      row.id,
      lifetime.after("at-limit notice", Math.max(0, at - now), () => {
        notices.delete(row.id);
        const fresh = rowOf(row.id);
        if (!fresh || over(fresh)) {
          return;
        }
        act(fresh, current, cause).catch((error: unknown) => {
          console.error(failedWords(fresh, current, error));
        });
      })
    );
    return true;
  };

  /**
   * The move a person asked of `row` ({@link AtLimitPorts.handMove}), as the
   * decision took it for them: carried out once it is between turns, while
   * that account can take it; held until that account is back while it
   * cannot. Nothing else is done to it at its limit meanwhile: it is not
   * moved elsewhere, as the person chose a move.
   */
  const carryByHand = async (
    row: LimitRow,
    current: Account,
    toId: string,
    decision: MoveChoice,
    cause: Cause
  ): Promise<void> => {
    const target = db.accounts.get(toId);
    const accounts = db.accounts.list();
    const from = accountNameAmong(current, accounts);
    const to = target
      ? accountNameAmong(target, accounts)
      : "the account a person chose";
    if (decision.kind !== "move") {
      settling.delete(row.id);
      const until =
        decision.kind === "wait"
          ? decision.until
          : holdUntil(row, current, Date.now());
      // Held without a transcript line of its own: its account's "waiting"
      // line would name the wrong reset, and the person's move already says
      // where it goes.
      if (db.atLimit.hold(row.id)?.until !== until) {
        console.info(
          `[at-limit] ${ports.named(row)} can't move from ${from} to ${to} yet, as a person asked: ${to} can't take it now, until ${clockWords(until)}. It is held on ${from} and moves when ${to} is back; nothing else is done to it meanwhile.`
        );
      }
      db.atLimit.putHold({
        instanceId: row.id,
        accountId: current.id,
        until,
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
   * Whether `row` no longer runs on `current`: a decision moves a session
   * off `current` only while it runs there, so a timer or a look that began
   * before another move took it off decides nothing ({@link lookAt}).
   */
  const left = (row: LimitRow, current: Account): boolean => {
    const on = ports.accountOf(row);
    if (on === current.id) {
      return false;
    }
    const accounts = db.accounts.list();
    const now = on ? db.accounts.get(on) : undefined;
    console.info(
      `[at-limit] ${ports.named(row)} isn't decided again off ${accountNameAmong(current, accounts)}: it runs on ${now ? accountNameAmong(now, accounts) : "no account"} now.`
    );
    return true;
  };

  /**
   * Moves `row` off `current`, or holds it, as the one decision says
   * (decide.ts); one a person moved, only as they asked
   * ({@link carryByHand}).
   */
  const act = async (
    row: LimitRow,
    current: Account,
    cause: Cause = "limit"
  ): Promise<void> => {
    if (acting.has(row.id) || over(row)) {
      return;
    }
    if (left(row, current)) {
      return;
    }
    if (ports.moving(row)) {
      // A compaction ahead of a move that its limit has now overtaken: what
      // the limit decides replaces it. Any other is under way already.
      if (cause === "extra-usage" || !db.atLimit.compaction(row.id)) {
        return;
      }
      console.info(
        `[at-limit] ${ports.named(row)} was compacting ahead of its move, and ${accountNameAmong(current, db.accounts.list())} refused a turn of it meanwhile, so that compaction ends and its limit decides now.`
      );
      ports.dropCompaction(row);
    }
    acting.add(row.id);
    try {
      const now = Date.now();
      const decided = decide(row, current, cause, now);
      if (!decided) {
        console.info(
          `[at-limit] ${ports.named(row)} isn't decided: ${accountNameAmong(current, db.accounts.list())} is none of its provider's accounts the hub reads now. The next look decides again.`
        );
        return;
      }
      const byHand = ports.handMove(row);
      if (byHand) {
        await carryByHand(row, current, byHand, decided.decision, cause);
        return;
      }
      await carryOut(row, current, decided.facts, decided.decision, cause);
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
   * One decision for `row` off `current`, carried out: held, kept going on
   * extra usage, or moved to its first move's account. A target whose own
   * part fails (its account's dir, not the session's process:
   * {@link Kept.target}) passes it to the next move the same decision
   * weighed; any other failure holds it as it was, a look deciding again.
   */
  const carryOut = async (
    row: LimitRow,
    current: Account,
    facts: DecideFacts,
    decision: MoveChoice,
    cause: Cause
  ): Promise<void> => {
    if (decision.kind === "wait") {
      waits(row, current, facts, decision, cause);
      return;
    }
    if (decision.kind === "stay") {
      settling.delete(row.id);
      later.delete(row.id);
      waitEnded(row.id);
      if (cause === "extra-usage") {
        stillOnExtraUsage(row, current, decision);
      } else if (cause === "refused-credential") {
        holdRefused(row, current);
      } else {
        hold(row, current, {
          ...decision,
          kind: "wait",
          why: "full",
          until: holdUntil(row, current, facts.now),
        });
      }
      return;
    }
    const { moves } = decision;
    for (const [at, move] of moves.entries()) {
      const target = db.accounts.get(move.to);
      if (!target) {
        continue;
      }
      const last = at === moves.length - 1;
      const failed = await moveTo(row, current, target, move, {
        facts,
        tokens: decision.tokens,
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

  /** What staying on `current` costs, as a move's line says it beside what moving costs. */
  const waitSide = (
    current: Account,
    move: DecidedMove,
    cause: Cause
  ): string => {
    const from = accountNameAmong(current, db.accounts.list());
    if (move.carries) {
      return "one organization and its cache warm, so its cache carries";
    }
    if (cause === "refused-credential") {
      return `${from}'s sign-in is refused, so it can't go on there at all`;
    }
    if (cause === "extra-usage") {
      return `${from}'s extra usage costs ${usdWords(move.price.next?.usd ?? null)} for its next turn there`;
    }
    return move.price.next?.what === "wait"
      ? `waiting for ${from}'s reset would cost ${usdWords(move.price.next.usd)}`
      : `${from} is at its limit`;
  };

  /**
   * Reserves `row`'s move to `target` before any await, so a decision
   * meanwhile counts it: its charge on the ledger (its re-read and its next
   * turn there), its burn arriving there, its chip on its way (one on extra
   * usage was answered, not stopped: its chip says nothing, as at a
   * rebalance's move).
   */
  const reserve = (
    row: LimitRow,
    current: Account,
    target: Account,
    move: DecidedMove,
    facts: DecideFacts,
    cause: Cause
  ): void => {
    const next = facts.session.costs.nextTurnUsd;
    ports.admission.charge(
      row,
      target.id,
      move.usd === null || next === null ? null : move.usd + next
    );
    if (facts.session.burn) {
      landing.set(row.id, {
        accountId: target.id,
        burn: facts.session.burn,
        instanceId: row.id,
        since: facts.now,
      });
    }
    if (cause !== "extra-usage") {
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
      since: how.since,
      waits,
    });
    return kept.target ? kept.why : undefined;
  };

  /**
   * One move of `row` to `target`, as the decision took it: reserved before
   * any await ({@link reserve}); only between turns. Answers why when the
   * target's own part failed, so the next target may take it; held or
   * settling otherwise. A person waiting on it never waits for what its
   * process holds for later: the move ends that work now. Nobody waiting,
   * that work is never ended for the move (decided 2026-11-19): the move
   * waits for it, decided again at each look.
   */
  const moveTo = async (
    row: LimitRow,
    current: Account,
    target: Account,
    move: DecidedMove,
    how: {
      cause: Cause;
      facts: DecideFacts;
      last: boolean;
      tokens: number | null;
    }
  ): Promise<string | undefined> => {
    const { cause, facts, tokens } = how;
    const { now } = facts;
    reserve(row, current, target, move, facts, cause);
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
    // Given, `laterSince` keeps that work: counted from now at every look,
    // its cap is never reached, so nothing ends it for the move.
    const laterSince =
      facts.session.personWaiting || cause !== "limit" ? undefined : Date.now();
    if (
      move.announce &&
      announce(row, current, target, move, tokens, cause, now)
    ) {
      unreserve(row);
      return;
    }
    db.atLimit.dropHold(row.id);
    const accounts = db.accounts.list();
    const to = accountNameAmong(target, accounts);
    console.info(
      `[at-limit] ${ports.named(row)} moves from ${accountNameAmong(current, accounts)} to ${to}: moving ${moveSideWords(move, tokens, to)}; ${waitSide(current, move, cause)}.`
    );
    if (cause === "extra-usage") {
      extraUsageSaid.delete(row.id);
      const named = accountNameAmong(current, accounts);
      console.info(
        `[at-limit] ${ports.named(row)} ran its turn on ${named}'s extra usage, past its plan limit, so it moves to ${to} now, between turns, as the decision priced it. It waits there for its next message.`
      );
    }
    const kept = await carryMove(
      row,
      current,
      target,
      move,
      tokens,
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
   * A decision that keeps `row` where it is: held there; one whose
   * credential was refused, held until an account can take it. A wait its
   * cache makes free, or its reset's nearness, is said once in the log with
   * both sides' prices.
   */
  const waits = (
    row: LimitRow,
    current: Account,
    facts: DecideFacts,
    decision: Waiting,
    cause: Cause
  ): void => {
    settling.delete(row.id);
    // Whatever it waited for before, this decision keeps it here now.
    later.delete(row.id);
    waitEnded(row.id);
    if (cause === "extra-usage") {
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
      sayWait(row, current, facts, decision);
    }
    hold(row, current, decision);
  };

  /** Says why `row` waits for its own reset, with what waiting and moving each cost. */
  const sayWait = (
    row: LimitRow,
    current: Account,
    facts: DecideFacts,
    decision: Waiting
  ): void => {
    const from = accountNameAmong(current, db.accounts.list());
    const { cache } = facts.session;
    const moving = `the cheapest move that holds would cost ${usdWords(decision.moveUsd)}`;
    console.info(
      `[at-limit] ${ports.named(row)} waits on ${from} for its reset at ${clockWords(decision.until)}, which costs ${usdWords(decision.stayUsd)}: ${decision.why === "free" && cache.kind === "warm" ? `its prompt cache lasts until ${clockWords(cache.until)}, past the reset` : `the reset is within ${facts.policy.waitMinutes} minutes`}, where ${moving} (${kWords(decision.tokens)}).`
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
    const last = db.atLimit.latestEvent(row.id)?.move;
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
    current: Account,
    taken: TakenUpBy | undefined
  ): Promise<void> => {
    if (!signedIn(row, current)) {
      await act(row, current, "refused-credential");
    } else if (await ports.idle(row)) {
      db.atLimit.dropHold(row.id);
      console.info(
        `[at-limit] ${ports.named(row)}: ${accountNameAmong(current, db.accounts.list())} is signed in again on its machine, so it carries on there.`
      );
      carriesOn(row, "signin", taken);
    }
  };

  /**
   * `row`, its hold just dropped, carries on where what `stopped` it left
   * it. Taken up past the cutoff ({@link takenUp}), the carry-on is a note
   * the turn of the word that took it up reads, and what was kept for it
   * goes now; for a Continue, nothing is carried on.
   */
  const carriesOn = (
    row: LimitRow,
    stopped: "limit" | "signin",
    taken: TakenUpBy | undefined
  ): void => {
    if (taken !== "continue") {
      ports.resume(row, stopped, taken === "word");
    }
    if (taken) {
      ports.changed();
    }
  };

  /** How long past its reset `current`'s provider still carries a hold on by itself, ms (core `AtLimit.staleAfterHours`). */
  const cutoffOf = (current: Account): number =>
    db.accounts.routing(current.provider).atLimit.staleAfterHours * HOUR_MS;

  /**
   * Whether `held` is past the cutoff at `now`: its reset passed more than
   * the cutoff ago, or, held on a refused sign-in (no reset), it was held
   * that long.
   */
  const pastCutoff = (
    held: LimitHold,
    current: Account,
    now: number
  ): boolean => now - (held.until ?? held.since ?? now) > cutoffOf(current);

  /**
   * THE RULE FOR A STALE HOLD: `row`, held past the cutoff, is never carried
   * on by the hub: nothing is sent to it, nothing wakes it, nothing moves it.
   * Its hold stays, keeping what it is sent at the hub, marked stale once:
   * the person is told in Needs you, its parent reads it in `delegate_list`
   * ({@link stall}), and the carry-on it would have been sent goes, as a
   * note, with the turn a person's or its parent's word starts
   * ({@link takenUp}). Continued with continue_session, stopped or discarded,
   * its hold ends.
   */
  const goneStale = (
    row: LimitRow,
    current: Account,
    held: LimitHold,
    now: number
  ): void => {
    if (held.staleAt !== null) {
      return;
    }
    db.atLimit.markStale(row.id, now);
    later.delete(row.id);
    waitEnded(row.id);
    const from = accountNameAmong(current, db.accounts.list());
    const hours = cutoffOf(current) / HOUR_MS;
    const day = dayWords(held.since ?? now);
    const why =
      held.until === null
        ? `its sign-in was refused on ${day}`
        : `${from}'s limit reset on ${dayWords(held.until)} at ${clockWords(held.until)}`;
    console.info(
      `[at-limit] ${ports.named(row)}: ${why}, more than ${hours} hours ago, so its hold is stale and the hub no longer carries it on by itself: nothing is sent to it or wakes it. It waits in Needs you and its parent's delegate_list until a person or its parent writes to it, or it is continued, stopped or discarded.`
    );
    const words = accountsWords.staleNotice;
    ports.stale(
      row,
      held.until === null
        ? words.signedOutTitle(from, day)
        : words.title(from, day),
      words.body(hours)
    );
    ports.changed();
  };

  /**
   * A person's or its parent's word, or a Continue, reached `row`, held
   * past the cutoff ({@link goneStale}): its hold is theirs to take up now
   * ({@link carriesOn}). Its notice goes; a hold on a refused sign-in counts
   * its cutoff from now. Answers the hold as it stands.
   */
  const takenUp = (
    row: LimitRow,
    current: Account,
    held: LimitHold,
    now: number
  ): LimitHold => {
    ports.unstale(row);
    console.info(
      `[at-limit] ${ports.named(row)} was held past the cutoff and is written to by a person or its parent, or continued, so the hub takes its hold up again: a message's turn reads its carry-on, a Continue's filing turn goes on its own.`
    );
    if (held.until !== null) {
      return held;
    }
    db.atLimit.putHold({
      instanceId: row.id,
      accountId: current.id,
      until: null,
      since: now,
    });
    return { ...held, since: now, staleAt: null };
  };

  /** Held sessions a look is on now: one look at a hold at a time ({@link lookAt}). */
  const looking = new Set<string>();

  /**
   * One held session, its hold as it stands now: past the cutoff, nothing is
   * done to it ({@link goneStale}) unless `asked`: a person's or its
   * parent's word, or a Continue, took it up ({@link takenUp}); else it is
   * carried on ({@link carryHold}). One that runs no more has its hold
   * dropped.
   *
   * Looks run side by side (a recheck, a rebalance's pass, an account back
   * from its bench, a message held at the limit), each over the holds it
   * listed as it began. So a hold is looked at by one look at a time, read
   * as it stands when that look reaches it: one another look is on is left
   * to it, and one another look ended (it moved the session, or carried it
   * on at its reset) is not looked at. A look acting on its list's copy
   * moved a session it no longer held a second time (obelisk, 2026-11-05
   * 12:40:30: a move re-reading 1,000k tokens cold, 3 s after the first).
   */
  const lookAt = async (
    instanceId: string,
    now: number,
    asked: TakenUpBy | undefined
  ): Promise<void> => {
    const held = db.atLimit.hold(instanceId);
    if (!held || looking.has(instanceId)) {
      return;
    }
    looking.add(instanceId);
    try {
      await lookAtHeld(held, now, asked);
    } finally {
      looking.delete(instanceId);
    }
  };

  /** {@link lookAt}'s one hold, read as it stands. */
  const lookAtHeld = async (
    held: LimitHold,
    now: number,
    asked: TakenUpBy | undefined
  ): Promise<void> => {
    const row = rowOf(held.instanceId);
    const current = db.accounts.get(held.accountId);
    if (over(row) || !row || !current) {
      db.atLimit.dropHold(held.instanceId);
      later.delete(held.instanceId);
      waitEnded(held.instanceId);
      if (held.staleAt !== null) {
        ports.unstale({ id: held.instanceId });
      }
      return;
    }
    if (!pastCutoff(held, current, now)) {
      await carryHold(row, current, held, now, undefined);
    } else if (asked === undefined) {
      goneStale(row, current, held, now);
    } else {
      await carryHold(
        row,
        current,
        takenUp(row, current, held, now),
        now,
        asked
      );
    }
  };

  /**
   * One held session carried on: past its own account's reset, it carries
   * on where it is once it is between turns; past the moment another account
   * frees, or before either, a decision moves it to an account that can take
   * it (or holds it again). One held on its refused credential (`until` null)
   * carries on where it is once its account is signed in there again, and
   * until then moves as soon as another account can take it. `taken`: who
   * took up its stale hold ({@link carriesOn}).
   */
  const carryHold = async (
    row: LimitRow,
    current: Account,
    held: LimitHold,
    now: number,
    taken: TakenUpBy | undefined
  ): Promise<void> => {
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
      await lookAtSignedOut(row, current, taken);
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
      carriesOn(row, "limit", taken);
    }
  };

  /**
   * The holds in the order admission takes them: sessions a person waits
   * on first, then orchestrators with live children, then the rest; each
   * group by how long it has been held.
   */
  const admissionOrder = (holds: LimitHold[]): LimitHold[] => {
    // The held rows and their children, by key: never the fleet's every row.
    const ids = holds.map((held) => held.instanceId);
    const parents = new Set(
      db
        .childrenOf(ids)
        .flatMap((one) => (over(one) ? [] : [one.parentInstanceId]))
    );
    const byId = new Map(
      db.listedInstancesByIds(ids).map((one) => [one.id, one])
    );
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
      await lookAt(held.instanceId, now, undefined);
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
   * held or two accounts could balance. A stale hold waits on no moment
   * ({@link goneStale}).
   */
  const plan = (): void => {
    lifetime.cancel(timer);
    timer = undefined;
    if (lifetime.closed()) {
      return;
    }
    const now = Date.now();
    const holds = db.atLimit.holds().filter((one) => one.staleAt === null);
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
    timer = lifetime.after("at-limit look", Math.max(1000, at - now), () => {
      detach(tick().finally(plan), "at-limit look");
    });
  };

  /**
   * A hold whose move waits on work in flight, as its stalled words say it:
   * where it moves and what it waits for. Nobody waits on it, so no move
   * ends that work (decided 2026-11-19): it moves when the work ends, or
   * carries on where it is at its own reset, `until`, when one is named.
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
    const work = carry.why.startsWith(WORK_IN_FLIGHT)
      ? carry.why.slice(WORK_IN_FLIGHT.length)
      : carry.why;
    if (resets !== null) {
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
    return { words: accountsWords.stalled.carrying(from, toName, work) };
  };

  /**
   * A hold as its stalled words say it: held past the cutoff, carried on
   * once written to ({@link goneStale}); on a refused sign-in; its move
   * waiting for work in flight ({@link carryStall}); or until the earliest
   * reset, its own account's or another's that frees first.
   */
  const heldStall = (held: LimitHold): Stall => {
    const words = accountsWords.stalled;
    const from = db.accounts.get(held.accountId);
    const name = from
      ? accountNameAmong(from, db.accounts.list())
      : "its account";
    if (held.staleAt !== null) {
      const day = dayWords(held.since ?? held.staleAt);
      return {
        words:
          held.until === null
            ? words.staleSignedOut(name, day)
            : words.stale(name, day),
        stale: true,
      };
    }
    if (held.until === null) {
      return { words: words.refused(name) };
    }
    const carry = later.get(held.instanceId);
    if (carry) {
      return carryStall(name, carry, held.until);
    }
    const last = db.atLimit.latestEvent(held.instanceId)?.move;
    const clock = clockWords(held.until);
    if (last?.kind === "moving" && last.at === held.until) {
      return {
        words: words.movingAt(name, last.to.name, clock),
        until: held.until,
      };
    }
    const frees =
      last?.kind === "waiting" && last.until === held.until
        ? last.frees
        : undefined;
    return {
      words: frees
        ? words.waitingOn(name, frees.name, clock)
        : words.waiting(name, clock),
      until: held.until,
    };
  };

  rebalancer.accountsChanged();

  return {
    /**
     * `instanceId` stopped at its account's limit, in words, while it is:
     * on its way to an account that can take it (now, or once its turn
     * ends), its move waiting for work in flight (by the cap at the latest:
     * {@link carryStall}), held until the earliest reset (`until`, epoch ms;
     * its own account's, or another's that frees first and takes it), held
     * on a refused sign-in until an account can take it, or held past the
     * cutoff (`stale`), carried on only once written to; a hold whose
     * provider's saved policy does not read says so. Undefined while it
     * runs.
     */
    stall(instanceId: string): Stall | undefined {
      const held = db.atLimit.hold(instanceId);
      if (held) {
        const stall = heldStall(held);
        const provider = db.accounts.get(held.accountId)?.provider;
        return provider && db.accounts.atLimitUnread(provider) !== null
          ? {
              ...stall,
              words: accountsWords.stalled.policyUnread(stall.words),
            }
          : stall;
      }
      const moving = towards.get(instanceId);
      if (!moving) {
        return undefined;
      }
      const accounts = db.accounts.list();
      return {
        words: accountsWords.stalled.moving(
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
     * Past the cutoff it is carried on only when `asked`: the message is a
     * person's or its parent's, or a Continue's ({@link goneStale}).
     */
    async lookNow(
      instanceId: string,
      why: string,
      asked?: TakenUpBy
    ): Promise<void> {
      const held = db.atLimit.hold(instanceId);
      if (
        !held ||
        acting.has(instanceId) ||
        (held.staleAt !== null && asked === undefined)
      ) {
        return;
      }
      const row = rowOf(instanceId);
      console.info(
        `[at-limit] ${row ? ports.named(row) : instanceId} is looked at again now, not at the next recheck: ${why}.`
      );
      await lookAt(instanceId, Date.now(), asked);
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
      rebalancer.forget(instanceId);
      const notice = notices.get(instanceId);
      if (notice) {
        lifetime.cancel(notice);
        notices.delete(instanceId);
      }
      waitEnded(instanceId);
      extraUsageSaid.delete(instanceId);
      const held = db.atLimit.hold(instanceId);
      db.atLimit.dropHold(instanceId);
      if (held && held.staleAt !== null) {
        ports.unstale({ id: instanceId });
      }
      if (held || was) {
        console.info(
          `[at-limit] ${instanceId.slice(0, 8)} was continued in a new session, so its ${held ? `hold${held.until === null ? "" : ` until ${clockWords(held.until)}`}` : "look at its turn's end"} is dropped: nothing resumes it.`
        );
      }
      ports.changed();
      plan();
    },
    /**
     * `instanceId`'s move to `accountId` failed after it was under way (a
     * summary that could not be written or folded, server.ts
     * `summaryMoveFailed`; `why` in the hub's words): it stays where it is,
     * the failure said once in its transcript, and, `stopped` at its limit
     * or on a refused sign-in, held there as any session no account took
     * ({@link unmoved}). Nothing moves it some other way.
     */
    moveFailed(
      instanceId: string,
      accountId: string,
      why: string,
      stopped: false | "limit" | "signin"
    ): void {
      const row = rowOf(instanceId);
      const current = row ? currentOf(row) : undefined;
      const target = db.accounts.get(accountId);
      if (!(row && current && target)) {
        return;
      }
      unmoved(row, current, target, why, {
        held: stopped !== false,
        refused: stopped === "signin",
        since: undefined,
        waits: false,
      });
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
      const facts = factsOf(db, ports, row, current, Date.now());
      const decision = facts
        ? decideOne(facts, { kind: "refused-credential" })
        : undefined;
      return decision?.kind === "move" ? decision.moves[0]?.to : undefined;
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
