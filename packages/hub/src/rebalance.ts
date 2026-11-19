import {
  type Account,
  type AccountForecast,
  type AccountMove,
  type AccountProvider,
  accountName,
  accountNameAmong,
  isChatgptPlan,
  keepsGoingOnExtraUsage,
  LIMITED_PROVIDERS,
  namedAccount,
  type RebalanceNotice,
  type WindowForecast,
  type WindowRef,
} from "@cawco/core/accounts";
import { detach } from "@cawco/core/detach";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import { windowWords } from "@cawco/core/usage/windows";
import { clockWords, heldAccountWords } from "@cawco/core/words/account-lines";
import { usdWords } from "./admission";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import type { TurnUsageRow } from "./db/turn-usage";
import {
  type DecidedMove,
  type DecideFacts,
  decide,
  LOOK_AHEAD_MS,
  type MoveChoice,
  type MoveTrigger,
  runsShort,
} from "./decide";
import {
  accountForecasts,
  accountPaces,
  type HistoryPoint,
  historyPoints,
  reReadWeight,
  weightedTokens,
} from "./forecast";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  type AtLimitPorts,
  compactedLine,
  factsOf,
  type LimitRow,
  lineCost,
  linePrice,
  moveSideWords,
  type Outlook,
  planOf,
} from "./limit-decision";
import type { Arrival } from "./placement";
import type { AccountPaces } from "./window-paces";

/**
 * How far back a session's burn is read from its turns: five hours, a time
 * constant of its own, not any account's window.
 */
const BURN_SPAN_MS = 5 * HOUR_MS;

/**
 * Rebalancing a provider's accounts on a machine before any limit (at-limit
 * composes it). A session is re-placed whenever moving it is free (its cache
 * carries, or is cold) and otherwise only when staying would fail. Adding an
 * account, or one coming back from its bench, makes a new best candidate:
 * the running sessions of accounts forecast to run out move between turns,
 * one at a time, highest pace first, to where placement would carry them,
 * and every held session is looked at again at once. A session moves only
 * within its provider and harness; a fork stays with its origin. Cold
 * sessions asleep are re-placed at their wake, in the send path (server.ts
 * `replaceAtWake`).
 *
 * What it reads of the accounts: where each is heading (`usage_limit_history`
 * paces), what each session on them spends (`turn_usage`), and from those
 * which accounts run out and which of their sessions burn the most.
 */

/** How far back a pass reads: a weekly window, and a day over for its opening reading. */
const LOOKBACK_MS = 8 * DAY_MS;
/** The shortest span a burn is measured over, so one turn just taken is not an hour's rate. */
const MIN_BURN_SPAN_MS = 15 * 60_000;

/** A provider's accounts as one pass reads them. */
export interface ForecastRead {
  accounts: Account[];
  /** The sessions running on each account, or owed to it, with their expected burn ({@link Arrival}). */
  arrivals: Arrival[];
  forecasts: AccountForecast[];
  history: HistoryPoint[];
  paces: AccountPaces;
  /** The accounts a session runs on now. */
  running: ReadonlySet<string>;
  /** The turns on each account over the look-back, oldest first. */
  turns: ReadonlyMap<string, TurnUsageRow[]>;
}

/**
 * Reads `provider`'s accounts, their history and their turns, once, for one
 * pass. `owed`: the sessions a move at their turn's end, or a launch on its
 * way, takes to an account (server.ts `owedMoves`, `launchClaims`),
 * by session: each arrives there now.
 */
export const readForecast = (
  db: DbShape,
  provider: AccountProvider,
  now: number,
  owed: ReadonlyMap<string, string> = new Map()
): ForecastRead => {
  const accounts = db.accounts
    .list()
    .filter((account) => account.provider === provider);
  const since = now - LOOKBACK_MS;
  const history = accounts.flatMap((account) =>
    historyPoints(db, account.id, since)
  );
  const turns = new Map(
    accounts.map((account) => [
      account.id,
      db.turnUsage.list({ accountId: account.id, since }),
    ])
  );
  const ids = new Set(accounts.map((account) => account.id));
  // Read by key, never the fleet's every row: the sessions on these
  // accounts, those owed to one, and the parents of whoever burned on them
  // within the burn's span ({@link arrivalsOf}).
  const live = db.liveOnAccounts([...ids]);
  const held = new Set(live.map((row) => row.id));
  const burned = [...turns.values()]
    .flat()
    .filter((turn) => turn.at.getTime() > now - BURN_SPAN_MS)
    .map((turn) => turn.instanceId);
  const rows = [
    ...live,
    ...db.listedInstancesByIds(
      [...new Set([...owed.keys(), ...burned])].filter((id) => !held.has(id))
    ),
  ];
  const running = new Set(
    live.flatMap((row) =>
      row.status === "running" && row.accountId ? [row.accountId] : []
    )
  );
  const readings = db.accounts.readings();
  return {
    accounts,
    arrivals: arrivalsOf(rows, ids, turns, owed, now),
    history,
    turns,
    running,
    forecasts: accountForecasts(accounts, readings, history, running, now),
    paces: accountPaces(accounts, readings, history, turns, running, now),
  };
};

/**
 * Each session running on one of `ids`, or owed to one, as it arrives there
 * ({@link Arrival}): since its launch (now, for one owed), burning what its
 * own turns of the last {@link BURN_SPAN_MS} burn on any of the provider's accounts, else
 * what its kind's sessions with turns then burn ({@link kindBurn}). One with
 * neither burns nothing anyone can say.
 */
const arrivalsOf = (
  rows: readonly LimitRow[],
  ids: ReadonlySet<string>,
  turns: ReadonlyMap<string, TurnUsageRow[]>,
  owed: ReadonlyMap<string, string>,
  now: number
): Arrival[] => {
  const all = [...turns.values()].flat();
  const parents = new Map(rows.map((row) => [row.id, row.parentInstanceId]));
  const isDelegate = (id: string) => !!parents.get(id);
  const ofKind = (delegate: boolean) =>
    kindBurn({ turns }, (id) => isDelegate(id) === delegate, now);
  const kinds = { delegates: ofKind(true), yours: ofKind(false) };
  return rows.flatMap((row) => {
    const to = owed.get(row.id);
    const accountId =
      to ??
      (["running", "starting"].includes(row.status) ? row.accountId : null);
    if (!(accountId && ids.has(accountId))) {
      return [];
    }
    const burn =
      sessionBurn(all, row.id, now) ??
      (row.parentInstanceId ? kinds.delegates : kinds.yours);
    return burn
      ? [
          {
            accountId,
            instanceId: row.id,
            burn,
            since: to ? now : (row.spawnedAt?.getTime() ?? now),
          },
        ]
      : [];
  });
};

/**
 * What a session burns, in weighted tokens an hour, from its own turns over
 * the last {@link BURN_SPAN_MS}; null when it has none recorded.
 */
export const sessionBurn = (
  turns: readonly TurnUsageRow[],
  instanceId: string,
  now: number
): number | null => {
  const mine = turns.filter(
    (turn) =>
      turn.instanceId === instanceId && turn.at.getTime() > now - BURN_SPAN_MS
  );
  const [first] = mine;
  if (!first) {
    return null;
  }
  const span = Math.max(MIN_BURN_SPAN_MS, now - first.at.getTime());
  return (
    mine.reduce((sum, turn) => sum + weightedTokens(turn), 0) / (span / HOUR_MS)
  );
};

/**
 * What a new session of a kind is expected to burn, in weighted tokens an
 * hour: the sessions of that kind with turns in the last {@link BURN_SPAN_MS} on the
 * provider's accounts, their burn averaged. Null when none had turns.
 */
export const kindBurn = (
  forecast: Pick<ForecastRead, "turns">,
  isKind: (instanceId: string) => boolean,
  now: number
): number | null => {
  const burns = new Map<string, number>();
  for (const turns of forecast.turns.values()) {
    for (const turn of turns) {
      if (turn.at.getTime() > now - BURN_SPAN_MS) {
        burns.set(
          turn.instanceId,
          (burns.get(turn.instanceId) ?? 0) + weightedTokens(turn)
        );
      }
    }
  }
  const mine = [...burns].filter(([id]) => isKind(id));
  if (mine.length === 0) {
    return null;
  }
  const total = mine.reduce((sum, [, w]) => sum + w, 0);
  return total / mine.length / (BURN_SPAN_MS / HOUR_MS);
};

/** An account's binding window in a forecast (core `AccountForecast.bindingWindow`), as its forecast reads it. */
const bindingOf = (
  forecast: Pick<ForecastRead, "forecasts">,
  accountId: string
): WindowForecast | undefined => {
  const account = forecast.forecasts.find((one) => one.accountId === accountId);
  const ref: WindowRef | null | undefined = account?.bindingWindow;
  return ref
    ? account?.windows.find(
        (one) => one.kind === ref.kind && one.scopeLabel === ref.scopeLabel
      )
    : undefined;
};

/** What one percent of `window` of account `accountId` costs in weighted tokens; undefined when unmeasured. */
const tokensPerPctOf = (
  forecast: Pick<ForecastRead, "paces">,
  accountId: string,
  window: Pick<WindowForecast, "kind" | "scopeLabel">
): number | undefined =>
  forecast.paces
    .get(accountId)
    ?.find(
      (one) => one.kind === window.kind && one.scopeLabel === window.scopeLabel
    )?.tokensPerPct ?? undefined;

/**
 * What re-reading `row`'s context on `target` costs, as a percent of its
 * binding window, where what a percent of it costs is measured
 * (forecast.ts `tokensPerPercent`); undefined when it is not, or the
 * context was never reported.
 */
const reReadCost = (
  forecast: ForecastRead,
  row: Pick<LimitRow, "cacheTtl" | "contextTokens">,
  target: Account
): { pct: number; window: string } | undefined => {
  const window = bindingOf(forecast, target.id);
  const perPct = window
    ? tokensPerPctOf(forecast, target.id, window)
    : undefined;
  return window && perPct && row.contextTokens !== null
    ? {
        pct: reReadWeight(row.contextTokens, row.cacheTtl) / perPct,
        window: windowWords(window),
      }
    : undefined;
};

/** What set a pass going: the accounts that came, each newly signed in or back from its bench. */
export interface RebalanceCause {
  came: { accountId: string; how: "added" | "back" }[];
}

/** Two causes as one: every account either names. */
const joinCauses = (
  a: RebalanceCause | null | undefined,
  b: RebalanceCause | null
): RebalanceCause | null => {
  if (!(a && b)) {
    return a ?? b;
  }
  return {
    came: [
      ...a.came,
      ...b.came.filter(
        (one) => !a.came.some((other) => other.accountId === one.accountId)
      ),
    ],
  };
};

export interface RebalancerDeps {
  /** Sessions being moved or continued now, shared with at-limit: each is acted on once at a time. */
  acting: Set<string>;
  db: DbShape;
  lifetime: HubLifetimeShape;
  /** At-limit's look at every hold. */
  lookAtHolds: () => Promise<void>;
  ports: Pick<
    AtLimitPorts,
    | "accountRows"
    | "admission"
    | "cacheState"
    | "changed"
    | "compactable"
    | "context"
    | "handMove"
    | "idle"
    | "machineName"
    | "move"
    | "moving"
    | "named"
    | "note"
    | "noticed"
    | "owed"
    | "waitedOn"
  >;
  /** At-limit arms its next look again: what can be balanced changed. */
  replan: () => void;
}

/** The sessions a pass already moved, as they arrive on their targets: the next decision in the pass counts their burn there. */
type Added = Map<string, Arrival>;

/** What a pass moved off one account that runs short. */
interface MovedOff {
  cacheKept: boolean;
  from: Account;
  /** Sessions inside a turn, decided again at its end ({@link createRebalancer} `atTurnEnd`). */
  left: number;
  moved: number;
  runsOutAt: number;
  to: Account | null;
}

/** What one planned move came to: stop the account's moves, skip this one, decided at its turn's end, or moved. */
type Step = "stop" | "skip" | "later" | "moved";

export const createRebalancer = (deps: RebalancerDeps) => {
  const { db, lifetime, ports, acting } = deps;
  const rowOf = (id: string): LimitRow | undefined =>
    db.getInstancesByIds([id])[0];

  /**
   * Sessions whose carry their machine refused for a reason a later pass
   * would meet unchanged: left out until their next turn ends
   * ({@link turnEnded}) or the accounts change ({@link accountsChanged}),
   * so a refusal is tried, and said, once.
   */
  const refused = new Set<string>();

  /**
   * Sessions a pass found inside a turn, by session, with the provider and
   * machine of that pass: the marker to decide at that turn's end, and
   * nothing more (no move is kept with a target). Their turn's end runs
   * the pass again ({@link turnEnded}); a session that ends never takes it.
   */
  const atTurnEnd = new Map<
    string,
    { machineId: string; provider: AccountProvider }
  >();

  /**
   * `row` as it stands now, when it is still on `from`, running, not Caw's
   * own with Caw off (at-limit `stays`), owing no person's move, not refused
   * unchanged, and nothing else is acting on it. Whether the hub moved it
   * lately is the decision's to weigh (decide.ts, its guard against
   * bouncing).
   */
  const candidate = (row: LimitRow, from: Account): LimitRow | undefined => {
    const fresh = rowOf(row.id);
    if (
      fresh?.status !== "running" ||
      stoppedByCawOff(db, fresh) ||
      fresh.accountId !== from.id ||
      refused.has(row.id) ||
      ports.owed().has(row.id) ||
      acting.has(row.id) ||
      db.atLimit.hold(row.id) ||
      ports.moving(fresh)
    ) {
      return undefined;
    }
    return fresh;
  };

  /**
   * Moves `row` as `move` says, between turns, and writes its line, priced
   * beside the next best. One whose process still runs, or holds work for
   * later, is decided again at its turn's end: a move ahead of a limit
   * never ends a command (decided 2026-11-19). One whose move failed
   * otherwise stays, and says why.
   */
  const carry = async (
    from: Account,
    row: LimitRow,
    target: Account,
    move: DecidedMove,
    tokens: number | null,
    runsOutAt: number,
    window: string | null,
    resetsAt: number | null
  ): Promise<"later" | "skip" | "moved"> => {
    const accounts = db.accounts.list();
    const plan = planOf(move);
    const whole: Extract<AccountMove, { kind: "moved" }> = {
      kind: "moved",
      from: namedAccount(from, accounts),
      to: namedAccount(target, accounts),
      sameOrganization: move.carries,
      tokens,
      window,
      resetsAt,
      because: { kind: "forecast", runsOutAt },
      ...lineCost(move),
      price: linePrice(move.price, accounts),
    };
    const line = compactedLine(whole, plan, row.harness);
    const id = crypto.randomUUID();
    acting.add(row.id);
    let done: Awaited<ReturnType<AtLimitPorts["move"]>>;
    try {
      done = await ports.move(
        row,
        move,
        false,
        plan.method === "whole" ? undefined : { line: id, move: line, plan }
      );
    } finally {
      acting.delete(row.id);
    }
    if ("later" in done) {
      return "moved";
    }
    const why = "kept" in done ? done.kept : undefined;
    if (why) {
      // It did not move: its charge goes with it.
      ports.admission.refund(row.id);
      if (why.running) {
        return "later";
      }
      refused.add(row.id);
      console.warn(
        `[rebalance] ${ports.named(row)} stays on ${accountNameAmong(from, accounts)}, not moved to ${accountNameAmong(target, accounts)} ahead of its forecast run-out: ${why.why}. It isn't tried again until its next turn ends or an account signs in, leaves, or comes back from its bench.`
      );
      return "skip";
    }
    ports.note(row, line, id);
    return "moved";
  };

  /** Why a session moves ahead of its account's run-out, as the journal says it. */
  const goWords = (move: DecidedMove): string =>
    move.carries
      ? "one organization and its cache warm, so its cache carries"
      : "its cache is cold, so moving costs what its next turn there would";

  /** Why a session stays where it is ahead of its account's run-out, as the decision says it, for the journal. */
  const stayWords = (
    decision: Exclude<MoveChoice, { kind: "move" }>
  ): string => {
    if (decision.kind === "wait") {
      return "a person moved it, and the account they chose can't take it yet";
    }
    switch (decision.why) {
      case "fork":
        return "a fork stays on the account its origin's cache is on";
      case "off":
        return "moving to another account at the limit is switched off";
      case "waiting":
        return "a person waits on it, and a forecast moves no session a person waits on; its limit decides";
      case "bounce":
        return "the hub moved it lately, and it is not moved again before both accounts' 5-hour windows reset";
      case "unknown":
        return "its cache isn't measured, and a move is made ahead of a limit only when it is free";
      case "full":
        return `no move of it is free and holds: ${heldList(decision)}`;
      case "dearer":
      case "holds":
      case "credits":
        return `moving costs ${usdWords(decision.moveUsd)} against ${usdWords(decision.stayUsd)} for staying`;
    }
  };

  /** Every other account and why it didn't take the session, as a line names them. */
  const heldList = (
    decision: Exclude<MoveChoice, { kind: "move" }>
  ): string => {
    const accounts = db.accounts.list();
    return (
      decision.accounts
        .flatMap((one) => {
          const account = db.accounts.get(one.accountId);
          return account
            ? [
                heldAccountWords(
                  {
                    account: namedAccount(account, accounts),
                    reason: one.reason,
                    ...(one.backAt === undefined ? {} : { backAt: one.backAt }),
                  },
                  Date.now()
                ),
              ]
            : [];
        })
        .join(" · ") || "no other account is signed in for it"
    );
  };

  /** One account that runs short, as its pass works through it. */
  interface Source {
    from: Account;
    machineId: string;
    out: MovedOff;
    provider: AccountProvider;
    /** The burn moved off it so far, weighted tokens an hour. */
    relieved: number;
    /** When it runs out, at its pace less what was moved off. */
    runsOutAt: number;
    waitMs: number;
    /** The window it runs out on, as a line names it, and that window's reset. */
    window: { name: string | null; resetsAt: number | null };
  }

  /** `row` is decided again at its turn's end, its pass run again then: the marker, said once. */
  const markTurnEnd = (row: LimitRow, source: Source, head: string): void => {
    if (!atTurnEnd.has(row.id)) {
      console.info(
        `${head}. It is inside a turn, or its process holds work for later, and a session is decided only between turns: it is decided again at that turn's end.`
      );
    }
    atTurnEnd.set(row.id, {
      machineId: source.machineId,
      provider: source.provider,
    });
  };

  /**
   * One session on an account that runs short, decided now (decide.ts,
   * trigger `forecast`): moved only when the move is free; one inside a
   * turn decided again at its end; staying, this one skipped; staying with
   * no account that holds it, the pass stopped.
   */
  const step = async (
    source: Source,
    row: LimitRow,
    added: Added
  ): Promise<Step> => {
    const fresh = candidate(row, source.from);
    if (!fresh) {
      return "skip";
    }
    const { from } = source;
    const accounts = db.accounts.list();
    const fromName = accountNameAmong(from, accounts);
    const head = `[rebalance] ${ports.named(fresh)} is on ${fromName}, which is forecast to run out at ${clockWords(source.runsOutAt)}`;
    if (!(await ports.idle(fresh))) {
      markTurnEnd(fresh, source, head);
      return "later";
    }
    atTurnEnd.delete(fresh.id);
    const now = Date.now();
    const facts = factsOf(db, ports, fresh, from, now, {
      landing: [...added.values()],
      resetAt: source.runsOutAt,
    });
    if (!facts) {
      return "skip";
    }
    const decision = decide(facts, {
      kind: "forecast",
      runsOutAt: source.runsOutAt,
    });
    if (decision.kind !== "move") {
      console.info(
        `${head}. It stays: ${stayWords(decision)}. The next look at the accounts, within 5 minutes, decides again.`
      );
      return decision.kind === "stay" && decision.why === "full"
        ? "stop"
        : "skip";
    }
    const [move] = decision.moves;
    return move
      ? await go(source, fresh, move, {
          added,
          head,
          facts,
          tokens: decision.tokens,
        })
      : "skip";
  };

  /** One decided move of `row` off `source` carried out, charged first and counted as it lands ({@link step}). */
  const go = async (
    source: Source,
    row: LimitRow,
    move: DecidedMove,
    how: {
      added: Added;
      facts: DecideFacts;
      head: string;
      tokens: number | null;
    }
  ): Promise<Step> => {
    const target = db.accounts.get(move.to);
    if (!target) {
      return "skip";
    }
    const { facts, head } = how;
    const targetName = accountNameAmong(target, db.accounts.list());
    // Charged now, before any await, so the next decision counts it.
    const next = facts.session.costs.nextTurnUsd;
    ports.admission.charge(
      row,
      target.id,
      move.usd === null || next === null ? null : move.usd + next
    );
    console.info(
      `${head}. It moves to ${targetName} between turns: ${goWords(move)}; ${moveSideWords(move, how.tokens, targetName)}.`
    );
    const done = await carry(
      source.from,
      row,
      target,
      move,
      how.tokens,
      source.runsOutAt,
      source.window.name,
      source.window.resetsAt
    );
    if (done === "later") {
      markTurnEnd(row, source, head);
    }
    if (done === "moved") {
      const burn = facts.session.burn ?? 0;
      source.relieved += burn;
      source.out.to = target;
      source.out.cacheKept = move.carries;
      how.added.set(row.id, {
        accountId: target.id,
        burn,
        instanceId: row.id,
        since: facts.now,
      });
    }
    return done;
  };

  /** Whether `from`'s sessions keep going on its extra usage past its plan (core `keepsGoingOnExtraUsage`). */
  const onCredits = (from: Account): boolean =>
    keepsGoingOnExtraUsage(
      from,
      db.accounts.readings().find((one) => one.accountId === from.id)
    );

  /**
   * Whether `from`'s plan limit stops nothing: past it, its sessions keep
   * going on its extra usage (core `keepsGoingOnExtraUsage`), so none is
   * moved ahead of its run-out. Says so when it does.
   */
  const keepsGoing = (from: Account, runsOutAt: number): boolean => {
    if (!onCredits(from)) {
      return false;
    }
    console.info(
      `[rebalance] The sessions on ${accountNameAmong(from, db.accounts.list())} stay there, though it is forecast to run out at ${clockWords(runsOutAt)}: past its plan they keep going on its extra usage, as its setting says.`
    );
    return true;
  };

  /**
   * When `from` runs short (decide.ts `runsShort`: a window runs out within
   * the look-ahead and more than the policy's wait before its reset), less
   * `relieved` burn moved off it; null when it doesn't. The same test a
   * target is held to, over twice the look-ahead (decide.ts): no account is
   * both.
   */
  const shortOf = (
    row: LimitRow,
    from: Account,
    relieved: number,
    waitMs: number
  ): { at: number; name: string | null; resetsAt: number | null } | null => {
    const read = ports.accountRows(row, from.id, []);
    const windows = read.current?.windows ?? [];
    const now = Date.now();
    const at = runsShort(windows, -relieved, LOOK_AHEAD_MS, waitMs, now);
    if (at === null) {
      return null;
    }
    const window = windows.find(
      (one) => runsShort([one], -relieved, LOOK_AHEAD_MS, waitMs, now) === at
    );
    return {
      at,
      name: window ? windowWords(window.window) || null : null,
      resetsAt: window?.resetAt ?? null,
    };
  };

  /** `rows`, the one with the largest measured burn first; one unmeasured last. */
  const byBurn = (forecast: ForecastRead, rows: LimitRow[]): LimitRow[] => {
    const now = Date.now();
    const all = [...forecast.turns.values()].flat();
    return rows
      .map((row) => ({ row, burn: sessionBurn(all, row.id, now) ?? -1 }))
      .sort((a, b) => b.burn - a.burn)
      .map((one) => one.row);
  };

  /**
   * Decides each running session on `from` while it runs short, the one
   * with the largest measured burn first, one at a time; stops once it no
   * longer runs short, or no account holds a session. Null when it does not
   * run short.
   */
  const moveOff = async (
    provider: AccountProvider,
    machineId: string,
    forecast: ForecastRead,
    from: Account,
    rows: LimitRow[],
    added: Added
  ): Promise<MovedOff | null> => {
    const [first] = rows;
    if (!first) {
      return null;
    }
    const waitMs =
      db.accounts.routing(from.provider).atLimit.waitMinutes * 60_000;
    const short = shortOf(first, from, 0, waitMs);
    if (!short || keepsGoing(from, short.at)) {
      return null;
    }
    const planned = byBurn(forecast, rows);
    const source: Source = {
      from,
      machineId,
      provider,
      waitMs,
      relieved: 0,
      runsOutAt: short.at,
      window: { name: short.name, resetsAt: short.resetsAt },
      out: {
        from,
        left: 0,
        moved: 0,
        runsOutAt: short.at,
        to: null,
        cacheKept: false,
      },
    };
    await stepsOff(source, planned, added);
    return source.out.moved + source.out.left > 0 ? source.out : null;
  };

  /** Each of `planned` decided in turn while `source` still runs short, its outcome counted; the pass stops where a step says so. */
  const stepsOff = async (
    source: Source,
    planned: readonly LimitRow[],
    added: Added
  ): Promise<void> => {
    for (const row of planned) {
      const still = shortOf(row, source.from, source.relieved, source.waitMs);
      if (!still) {
        return;
      }
      source.runsOutAt = still.at;
      const done = await step(source, row, added);
      if (done === "stop") {
        return;
      }
      if (done === "later") {
        source.out.left += 1;
      } else if (done === "moved") {
        source.out.moved += 1;
      }
    }
  };

  /** The provider's accounts signed in on `machineId`. */
  const signedInOn = (provider: AccountProvider, machineId: string) =>
    new Set(
      db.accounts
        .signins()
        .filter(
          (one) =>
            one.machineId === machineId &&
            one.state === "signed-in" &&
            db.accounts.get(one.accountId)?.provider === provider
        )
        .map((one) => one.accountId)
    );

  /** The running sessions on `machineId`, not forks, by the signed-in account each runs on. */
  const runningOn = (
    machineId: string,
    signed: ReadonlySet<string>
  ): Map<string, LimitRow[]> => {
    // A held session burns nothing: the look at the holds answers it.
    const held = new Set(db.atLimit.holds().map((one) => one.instanceId));
    const byAccount = new Map<string, LimitRow[]>();
    // The machine's live rows alone, by the status index: every listed
    // session read whole, thousands asleep among them, at each pass of every
    // pair, held the hub's loop (probe-kit hub-live-copy).
    for (const row of db.liveInstancesOn(machineId)) {
      if (
        row.status === "running" &&
        row.forkedFrom === null &&
        row.accountId &&
        signed.has(row.accountId) &&
        !held.has(row.id)
      ) {
        byAccount.set(row.accountId, [
          ...(byAccount.get(row.accountId) ?? []),
          row,
        ]);
      }
    }
    return byAccount;
  };

  /** One held session's outcome after a look, for its group in a notice. */
  const heldOutcome = (
    group: RebalanceNotice["held"][number],
    from: Account,
    row: LimitRow,
    context: number | null,
    forecastOf: (provider: AccountProvider) => ForecastRead
  ): boolean => {
    if (db.atLimit.hold(row.id)) {
      group.waiting.push(context);
      return true;
    }
    const to =
      row.accountId && row.accountId !== from.id
        ? db.accounts.get(row.accountId)
        : undefined;
    if (!to) {
      return false;
    }
    // Its cache came along when the line of its move says so.
    const last = db.atLimit.latestEvent(row.id, "moved")?.move;
    const kept =
      last?.kind === "moved" && last.to.id === to.id && last.sameOrganization;
    const cost = kept
      ? undefined
      : reReadCost(
          forecastOf(to.provider),
          { cacheTtl: row.cacheTtl, contextTokens: context },
          to
        );
    group.moved.push({
      to: namedAccount(to, db.accounts.list()),
      tokens: context,
      cacheKept: kept,
      ...(cost ? { cost } : {}),
    });
    return true;
  };

  /** What a look at the holds did to each, by the account each was held on. */
  const heldOutcomes = (
    before: LimitHold[],
    tokens: Map<string, number | null>
  ): RebalanceNotice["held"] => {
    const groups = new Map<string, RebalanceNotice["held"][number]>();
    const read = new Map<string, ForecastRead>();
    const forecastOf = (provider: AccountProvider): ForecastRead => {
      const known =
        read.get(provider) ?? readForecast(db, provider, Date.now());
      read.set(provider, known);
      return known;
    };
    for (const held of before) {
      const from = db.accounts.get(held.accountId);
      const row = rowOf(held.instanceId);
      if (!(from && row)) {
        continue;
      }
      const group = groups.get(from.id) ?? {
        from: namedAccount(from, db.accounts.list()),
        moved: [],
        continued: 0,
        waiting: [],
      };
      const context = tokens.get(row.id) ?? row.contextTokens;
      if (heldOutcome(group, from, row, context, forecastOf)) {
        groups.set(from.id, group);
      }
    }
    return [...groups.values()];
  };

  /** The notice a pass caused by an account that came writes for the Accounts page; none when it did nothing. */
  const notify = (
    cause: RebalanceCause,
    machineId: string,
    running: MovedOff[],
    held: RebalanceNotice["held"]
  ): void => {
    const accounts = db.accounts.list();
    const came = cause.came.flatMap((one) => {
      const account = db.accounts.get(one.accountId);
      return account
        ? [{ account: namedAccount(account, accounts), how: one.how }]
        : [];
    });
    if (came.length === 0 || (running.length === 0 && held.length === 0)) {
      return;
    }
    const at = Date.now();
    ports.noticed({
      id: `rebalance:${came.map((one) => one.account.id).join("+")}:${machineId}:${at}`,
      at,
      came,
      machine: ports.machineName(machineId),
      running: running.flatMap((one) => {
        if (!one.to) {
          return [];
        }
        const from = namedAccount(one.from, accounts);
        return [
          {
            from,
            // Its line names the organization after its name
            // (core `rebalanceWords`): none where the name already does,
            // that is where it differs from the bare `accountName`.
            organization:
              from.name === accountName(one.from)
                ? one.from.identity?.organization || null
                : null,
            runsOutAt: one.runsOutAt,
            to: namedAccount(one.to, accounts),
            cacheKept: one.cacheKept,
            moved: one.moved,
            left: one.left,
          },
        ];
      }),
      held,
    });
  };

  /**
   * One pass on `provider`'s accounts on `machineId`: the moves off each
   * account forecast to run out, then (`looks`) a look at every hold, so
   * held sessions re-decide now rather than at the next look. A pass caused
   * by an account that came says what it did on the Accounts page.
   */
  const pass = async (
    provider: AccountProvider,
    machineId: string,
    cause: RebalanceCause | null,
    looks: boolean
  ): Promise<void> => {
    const signed = signedInOn(provider, machineId);
    const held = db.atLimit.holds().filter((one) => signed.has(one.accountId));
    const heldRows = db
      .getInstancesByIds(held.map((one) => one.instanceId))
      .filter((row) => row.machineId === machineId);
    const tokens = new Map(heldRows.map((row) => [row.id, row.contextTokens]));
    const holdsBefore = held.filter((one) => tokens.has(one.instanceId));
    const running: MovedOff[] = [];
    if (db.accounts.routing(provider).atLimit.move && signed.size >= 2) {
      const forecast = readForecast(db, provider, Date.now(), ports.owed());
      const added: Added = new Map();
      for (const [accountId, rows] of runningOn(machineId, signed)) {
        const from = db.accounts.get(accountId);
        const moved = from
          ? await moveOff(provider, machineId, forecast, from, rows, added)
          : null;
        if (moved) {
          running.push(moved);
        }
      }
    }
    if (looks) {
      await deps.lookAtHolds();
    }
    if (cause) {
      notify(cause, machineId, running, heldOutcomes(holdsBefore, tokens));
    }
    // A pass that moved nothing changed nothing: each look at a hold says its
    // own (at-limit.ts `act`). Every look runs a pass per pair, and each
    // change publishes the board and reads Needs you again.
    if (running.length > 0) {
      ports.changed();
    }
  };

  /** Passes running now, by provider and machine, with the trigger that came meanwhile (undefined: none). */
  const passes = new Map<
    string,
    { again: RebalanceCause | null | undefined }
  >();
  const passKey = (provider: string, machineId: string) =>
    `${provider}\u0000${machineId}`;
  /**
   * Whether `provider`'s accounts are rebalanced: CawCo reads their limits,
   * and a move between two of them is not one ChatGPT plan swapped for
   * another (core `isChatgptPlan`), which is all a ChatGPT pass could make.
   */
  const balances = (provider: AccountProvider): boolean =>
    LIMITED_PROVIDERS.includes(provider) && !isChatgptPlan({ provider });

  /**
   * Rebalances `provider`'s accounts on `machineId`, one pass at a time per
   * pair: a trigger while one runs runs it once more after, keeping the
   * cause that came. ChatGPT's never ({@link balances}).
   */
  const rebalance = async (
    provider: AccountProvider,
    machineId: string,
    cause: RebalanceCause | null = null,
    /** Looks at the holds after: false for a look's own pass, which just did. */
    looks = true
  ): Promise<void> => {
    if (!balances(provider) || lifetime.closed()) {
      return;
    }
    const key = passKey(provider, machineId);
    const running = passes.get(key);
    if (running) {
      running.again = joinCauses(running.again, cause);
      return;
    }
    passes.set(key, { again: undefined });
    let next: RebalanceCause | null | undefined = cause;
    try {
      while (next !== undefined) {
        await pass(provider, machineId, next, looks || next !== null);
        const self = passes.get(key);
        next = self?.again;
        if (self) {
          self.again = undefined;
        }
      }
    } finally {
      passes.delete(key);
    }
  };

  /** Every provider and machine with two accounts signed in to balance between. */
  const pairs = (): { machineId: string; provider: AccountProvider }[] => {
    const seen = new Map<
      string,
      { accounts: Set<string>; machineId: string; provider: string }
    >();
    for (const one of db.accounts.signins()) {
      const provider = db.accounts.get(one.accountId)?.provider;
      if (one.state === "signed-in" && provider && balances(provider)) {
        const key = passKey(provider, one.machineId);
        const pair = seen.get(key) ?? {
          accounts: new Set(),
          machineId: one.machineId,
          provider,
        };
        pair.accounts.add(one.accountId);
        seen.set(key, pair);
      }
    }
    return [...seen.values()]
      .filter((pair) => pair.accounts.size >= 2)
      .map(({ machineId, provider }) => ({ machineId, provider }));
  };

  /** Every pair rebalanced, one after another: a look's part, after its own look at the holds. */
  const everyPair = async (): Promise<void> => {
    for (const { provider, machineId } of pairs()) {
      await rebalance(provider, machineId, null, false);
    }
  };

  /** The sign-ins and benches as the last look at them found them. */
  let known: { benched: Map<string, number>; signed: Set<string> } | null =
    null;
  let benchTimer: HubTimer | undefined;
  const signinKey = (accountId: string, machineId: string) =>
    `${accountId}\u0000${machineId}`;

  /** The signed-in sign-ins of limited providers' accounts. */
  const limitedSignins = () =>
    db.accounts.signins().filter((one) => {
      const provider = db.accounts.get(one.accountId)?.provider;
      return (
        one.state === "signed-in" &&
        !!provider &&
        LIMITED_PROVIDERS.includes(provider)
      );
    });

  /** Each benched account, until when, at `now`; the next bench's end armed to look again. */
  const benchedNow = (now: number): Map<string, number> => {
    const benched = new Map<string, number>();
    for (const one of db.accounts.bench(now)) {
      if (one.until > now) {
        benched.set(
          one.accountId,
          Math.max(benched.get(one.accountId) ?? 0, one.until)
        );
      }
    }
    lifetime.cancel(benchTimer);
    benchTimer = undefined;
    const nextEnd = Math.min(...benched.values());
    if (Number.isFinite(nextEnd) && !lifetime.closed()) {
      benchTimer = lifetime.after(
        "rebalance bench ended",
        Math.max(1000, nextEnd - now + 1000),
        accountsChanged
      );
    }
    return benched;
  };

  /**
   * Looks at the sign-ins and benches against the last look: an account
   * newly signed in on a machine, or whose bench has ended, rebalances its
   * provider there with it as the cause. The first look only learns them.
   * Asked whenever the hub says the accounts moved, and at each bench's end.
   */
  const accountsChanged = (): void => {
    const signins = limitedSignins();
    const signed = new Set(
      signins.map((one) => signinKey(one.accountId, one.machineId))
    );
    const benched = benchedNow(Date.now());
    const was = known;
    known = { signed, benched };
    const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
      a.size === b.size && [...a].every((one) => b.has(one));
    // Re-armed only when what can be balanced changed: the hub says the
    // accounts moved at every reading, and re-arming each time would put
    // the next look off for as long as readings keep coming.
    if (!(
      was &&
      same(was.signed, signed) &&
      same(new Set(was.benched.keys()), new Set(benched.keys()))
    )) {
      // Another account to carry to, or one fewer: a refused carry may go now.
      refused.clear();
      deps.replan();
    }
    if (!was) {
      return;
    }
    // The accounts that came, as one cause per provider and machine.
    const causes = new Map<
      string,
      { cause: RebalanceCause; machineId: string; provider: AccountProvider }
    >();
    for (const one of signins) {
      const added = !was.signed.has(signinKey(one.accountId, one.machineId));
      const back =
        was.benched.has(one.accountId) && !benched.has(one.accountId);
      const provider = db.accounts.get(one.accountId)?.provider;
      if (!((added || back) && provider)) {
        continue;
      }
      const key = passKey(provider, one.machineId);
      const entry = causes.get(key) ?? {
        cause: { came: [] },
        machineId: one.machineId,
        provider,
      };
      entry.cause.came.push({
        accountId: one.accountId,
        how: added ? "added" : "back",
      });
      causes.set(key, entry);
    }
    for (const { cause, machineId, provider } of causes.values()) {
      const came = cause.came
        .map((one) => {
          const account = db.accounts.get(one.accountId);
          const named = account
            ? accountNameAmong(account, db.accounts.list())
            : "an account";
          return `${named} ${one.how === "added" ? "signed in" : "came back from its bench"}`;
        })
        .join(", ");
      console.info(
        `[rebalance] ${came} on ${ports.machineName(machineId)}, so its accounts there are looked at now: sessions on accounts forecast to run out move to it between turns, and sessions held at a limit are decided again.`
      );
      detach(rebalance(provider, machineId, cause), "rebalance");
    }
  };

  return {
    accountsChanged,
    everyPair,
    pairs,
    rebalance: (provider: AccountProvider, machineId: string) =>
      rebalance(provider, machineId),
    /**
     * A turn of `instanceId` ended: a carry refused before may go now, and
     * one a pass found inside that turn is decided now, its pass run again.
     */
    turnEnded: (instanceId: string): void => {
      refused.delete(instanceId);
      const marked = atTurnEnd.get(instanceId);
      if (marked) {
        atTurnEnd.delete(instanceId);
        detach(
          rebalance(marked.provider, marked.machineId),
          "rebalance at a turn's end"
        );
      }
    },
    /** `instanceId` never runs again: its marker to decide at its turn's end goes with it. */
    forget: (instanceId: string): void => {
      atTurnEnd.delete(instanceId);
    },
    /**
     * What a pass would do with `row` on `from` now, read and nothing
     * carried out: its account lasts ({@link shortOf}), goes on its extra
     * usage ({@link keepsGoing}), or runs short and the one decision for a
     * forecast is taken for it ({@link step}); undefined when its account
     * is none the hub reads.
     */
    outlook: (row: LimitRow, from: Account): Outlook | undefined => {
      const now = Date.now();
      const waitMs =
        db.accounts.routing(from.provider).atLimit.waitMinutes * 60_000;
      const short = shortOf(row, from, 0, waitMs);
      const facts = factsOf(db, ports, row, from, now, {
        ...(short ? { resetAt: short.at } : {}),
      });
      if (!facts) {
        return;
      }
      if (!short) {
        return { kind: "lasts", facts };
      }
      if (onCredits(from)) {
        return { kind: "credits", runsOutAt: short.at, facts };
      }
      const trigger: MoveTrigger = { kind: "forecast", runsOutAt: short.at };
      return {
        kind: "decided",
        trigger,
        decision: decide(facts, trigger),
        facts,
      };
    },
  };
};
