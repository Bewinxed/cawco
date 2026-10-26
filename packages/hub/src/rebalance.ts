import {
  type Account,
  type AccountForecast,
  type AccountMove,
  type AccountProvider,
  accountName,
  accountNameAmong,
  clockWords,
  heldAccountWords,
  keepsGoingOnExtraUsage,
  LIMITED_PROVIDERS,
  namedAccount,
  type RebalanceNotice,
  tokenWords,
  type WindowForecast,
  windowWords,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import { NEXT_TURN_ALLOWANCE_USD, usdWords } from "./admission";
import {
  type AtLimitPorts,
  decideStop,
  type LimitRow,
  moveSideWords,
  type StopDecision,
  type StopTarget,
  stopInputOf,
} from "./at-limit";
import { stoppedByCawOff } from "./caw-own";
import type { DbShape } from "./db";
import type { LimitHold } from "./db/at-limit";
import type { TurnUsageRow } from "./db/turn-usage";
import {
  type AccountPaces,
  accountForecasts,
  accountPaces,
  type HistoryPoint,
  reReadWeight,
  weightedTokens,
} from "./forecast";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { type Arrival, SESSION_WINDOW_MS, WINDOW_MS } from "./placement";

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
    db.accounts.history({ accountId: account.id, since }).map((row) => ({
      accountId: row.accountId,
      kind: row.kind,
      scopeLabel: row.scopeLabel,
      percent: row.percent,
      resetsAt: row.resetsAt,
      fetchedAt: row.fetchedAt.getTime(),
    }))
  );
  const turns = new Map(
    accounts.map((account) => [
      account.id,
      db.turnUsage.list({ accountId: account.id, since }),
    ])
  );
  const ids = new Set(accounts.map((account) => account.id));
  const rows = db.listInstances();
  const running = new Set(
    rows.flatMap((row) =>
      row.status === "running" && row.accountId && ids.has(row.accountId)
        ? [row.accountId]
        : []
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
 * own turns of the last 5 hours burn on any of the provider's accounts, else
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
 * the last 5 hours; null when it has none recorded.
 */
export const sessionBurn = (
  turns: readonly TurnUsageRow[],
  instanceId: string,
  now: number
): number | null => {
  const mine = turns.filter(
    (turn) =>
      turn.instanceId === instanceId &&
      turn.at.getTime() > now - SESSION_WINDOW_MS
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
 * hour: the sessions of that kind with turns in the last 5 hours on the
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
      if (turn.at.getTime() > now - SESSION_WINDOW_MS) {
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
  return total / mine.length / (SESSION_WINDOW_MS / HOUR_MS);
};

/** An account forecast to run out before its window resets. */
export interface Stress {
  /** When the window resets; null when nothing named it. */
  resetAt: number | null;
  /** When it runs out at its pace: now for one already at its limit. */
  runsOutAt: number;
  /** The window that runs out first. */
  window: WindowForecast;
}

/**
 * Whether an account is stressed: a window of it runs out (or is out) before
 * it resets, less `waitMs` (a reset that near is waited for, as at the
 * limit). The window that runs out first; null when none does.
 */
export const stressOf = (
  forecast: AccountForecast | undefined,
  waitMs: number,
  now: number
): Stress | null => {
  let worst: Stress | null = null;
  for (const window of forecast?.windows ?? []) {
    const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : null;
    if (resetAt !== null && resetAt <= now) {
      continue;
    }
    const runsOutAt = window.utilization >= 100 ? now : window.runsOutAt;
    if (
      runsOutAt === undefined ||
      (resetAt !== null && runsOutAt >= resetAt - waitMs)
    ) {
      continue;
    }
    if (!worst || runsOutAt < worst.runsOutAt) {
      worst = { window, runsOutAt, resetAt };
    }
  }
  return worst;
};

/** One running session's part of its account's burn. */
export interface SessionShare {
  /** Its own burn, weighted tokens an hour; null when no turns of it are recorded. */
  burn: number | null;
  /** Its part of the account's pace, 0–1. */
  share: number;
  /** How the part was had, in words for its `why`. */
  why: string;
}

/**
 * Each running session's share of its account's weighted tokens in the
 * stressed window since it opened (`turn_usage`). A session with no turns
 * recorded there gets no share; when the account has none recorded at all
 * (`turn_usage` not written yet), nothing tells its sessions apart, and each
 * counts an even part, which its `why` says.
 */
export const sessionShares = (
  sessions: readonly { id: string }[],
  turns: readonly TurnUsageRow[],
  stress: Stress,
  named: string,
  now: number
): Map<string, SessionShare> => {
  const length = WINDOW_MS[stress.window.kind] ?? SESSION_WINDOW_MS;
  const opened = (stress.resetAt ?? now) - length;
  const spent = new Map<string, number>();
  let total = 0;
  for (const turn of turns) {
    if (turn.at.getTime() >= opened) {
      const w = weightedTokens(turn);
      spent.set(turn.instanceId, (spent.get(turn.instanceId) ?? 0) + w);
      total += w;
    }
  }
  return new Map(
    sessions.map((session) => {
      const mine = spent.get(session.id) ?? 0;
      const burn = sessionBurn(turns, session.id, now);
      if (total <= 0) {
        return [
          session.id,
          {
            burn,
            share: 1 / sessions.length,
            why: `no turns are recorded on ${named} in this window, so it counts an even part (1/${sessions.length}) of its pace`,
          },
        ];
      }
      return [
        session.id,
        mine > 0
          ? {
              burn,
              share: mine / total,
              why: `it spent ${Math.round((mine / total) * 100)}% of ${named}'s weighted tokens in this window`,
            }
          : {
              burn,
              share: 0,
              why: `no turns of it are recorded on ${named} in this window, so it is given no share of its pace`,
            },
      ];
    })
  );
};

/**
 * What re-reading `row`'s context on `target` costs, as a percent of its
 * 5-hour window, where what a percent of it costs is measured
 * (forecast.ts `tokensPerPercent`); undefined when it is not, or the
 * context was never reported.
 */
export const reReadCost = (
  forecast: ForecastRead,
  row: Pick<LimitRow, "cacheTtl" | "contextTokens">,
  target: Account
): { pct: number; window: string } | undefined => {
  const perPct = forecast.paces
    .get(target.id)
    ?.find((one) => one.kind === "session")?.tokensPerPct;
  return perPct && row.contextTokens !== null
    ? {
        pct: reReadWeight(row.contextTokens, row.cacheTtl) / perPct,
        window: "5-hour",
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
    | "cacheExpiresAt"
    | "changed"
    | "compactable"
    | "handMove"
    | "idle"
    | "machineName"
    | "move"
    | "named"
    | "note"
    | "noticed"
    | "owe"
    | "owed"
    | "startedBy"
    | "waitedOn"
  >;
  /** At-limit arms its next look again: what can be balanced changed. */
  replan: () => void;
}

/** The sessions a pass already moved, or owes a move, as they arrive on their targets: the next decision in the pass counts their burn there. */
type Added = Map<string, Arrival>;

/** What a pass moved off one stressed account. */
interface MovedOff {
  cacheKept: boolean;
  from: Account;
  /** Moves owed to their sessions' turn's end ({@link AtLimitPorts.owe}). */
  left: number;
  moved: number;
  runsOutAt: number;
  to: Account | null;
}

/** One stressed account as its pass works through it. */
interface Source {
  forecast: ForecastRead;
  from: Account;
  fromForecast: AccountForecast | undefined;
  out: MovedOff;
  /** Its pace's share moved off it so far, 0–1. */
  relieved: number;
  stress: Stress;
  waitMs: number;
}

/** Whether `source` no longer runs out: below its limit, with the pace left lasting to its reset. */
const lasts = (source: Source, now: number): boolean => {
  const { stress, relieved, waitMs } = source;
  if (stress.window.utilization >= 100) {
    return false;
  }
  const pace = (stress.window.pace ?? 0) * (1 - relieved);
  if (pace <= 0) {
    return true;
  }
  return (
    stress.resetAt !== null &&
    now + ((100 - stress.window.utilization) / pace) * HOUR_MS >=
      stress.resetAt - waitMs
  );
};

/**
 * The burn a session takes to its target, weighted tokens an hour: its own,
 * where its turns are recorded, else its share of its account's 5-hour pace
 * in that window's weighted tokens, where a percent of it is measured.
 */
const burnOf = (source: Source, share: SessionShare): number => {
  if (share.burn !== null) {
    return share.burn;
  }
  const pace =
    source.fromForecast?.windows.find((one) => one.kind === "session")?.pace ??
    0;
  const perPct =
    source.forecast.paces
      .get(source.from.id)
      ?.find((one) => one.kind === "session")?.tokensPerPct ?? 0;
  return share.share * pace * perPct;
};

/** What one planned move came to: stop the account's moves, skip this one, owed to its turn's end, or moved. */
type Step = "stop" | "skip" | "owed" | "moved";

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
   * `row` as it stands now, when it is still on `from`, running, not Caw's
   * own with Caw off (at-limit `stays`), owing no move, not refused
   * unchanged, not admitted onto `from` in its current window (admission.ts
   * `admittedHere`: another account freeing never moves it again), and
   * nothing else is acting on it.
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
      db.atLimit.compaction(row.id) ||
      ports.admission.admittedHere(fresh)
    ) {
      return undefined;
    }
    return fresh;
  };

  /**
   * Moves `row` to `target` between turns and writes its line, as the
   * decision weighed it (`weighed`, `tokens` its context priced). One
   * mid-turn, or whose process still runs, owes the move to its turn's end
   * (or its next start), the line written as it lands, as a person's move
   * mid-turn does; one whose move failed otherwise stays, and says why.
   */
  const carry = async (
    source: Source,
    row: LimitRow,
    target: Account,
    weighed: StopTarget,
    tokens: number,
    warm: boolean
  ): Promise<"owed" | "skip" | "moved"> => {
    const { from, stress } = source;
    const pct =
      weighed.carries || weighed.moveUsd === null || weighed.usdPerPct === null
        ? undefined
        : weighed.moveUsd / weighed.usdPerPct;
    const move: AccountMove = {
      kind: "moved",
      from: namedAccount(from, source.forecast.accounts),
      to: namedAccount(target, source.forecast.accounts),
      sameOrganization: weighed.carries,
      tokens,
      window: windowWords(stress.window),
      resetsAt: stress.resetAt,
      because: warm
        ? { kind: "forecast", runsOutAt: stress.runsOutAt }
        : { kind: "cold", wake: false },
      ...(pct === undefined ? {} : { cost: { pct, window: "5-hour" } }),
    };
    const going = (): void => {
      source.out.to = target;
      source.out.cacheKept = weighed.carries;
    };
    if (!(await ports.idle(row))) {
      ports.owe(
        row,
        target.id,
        move,
        "it is inside a turn, and a session moves only between turns"
      );
      going();
      return "owed";
    }
    acting.add(row.id);
    let done: Awaited<ReturnType<AtLimitPorts["move"]>>;
    try {
      done = await ports.move(row, target.id, false);
    } finally {
      acting.delete(row.id);
    }
    const why = "kept" in done ? done.kept : undefined;
    if (why?.running) {
      ports.owe(row, target.id, move, why.why);
      going();
      return "owed";
    }
    if (why) {
      // It did not move: its charge goes with it.
      ports.admission.refund(row.id);
      refused.add(row.id);
      console.warn(
        `[rebalance] ${ports.named(row)} stays on ${accountNameAmong(from, source.forecast.accounts)}, not moved to ${accountNameAmong(target, source.forecast.accounts)} ahead of its forecast run-out: ${why.why}. It isn't tried again until its next turn ends or an account signs in, leaves, or comes back from its bench.`
      );
      return "skip";
    }
    ports.note(row, move);
    going();
    return "moved";
  };

  /** Why a session stays where it is ahead of its account's run-out, as the decision says it (`why`), for the journal. */
  const stayWords = (
    decision: Extract<StopDecision, { action: "wait" }>,
    from: string,
    waitMinutes: number
  ): string => {
    switch (decision.why) {
      case "soon":
        return `${from} runs out within the ${waitMinutes} minutes the policy waits for, so it moves at its limit instead`;
      case "free":
        return `its cache outlasts ${from}'s run-out, so staying costs nothing; its limit decides again`;
      case "warm":
        return `its cache is warm, and moving to another organization now would re-read ${tokenWords(decision.tokens)} cold for ${usdWords(decision.coldUsd)}; it moves at its limit instead, and is compacted there when large`;
      case "full":
        return `no other account can take it now: ${heldList(decision)}`;
      case "fork":
        return "a fork stays on the account its origin's cache is on";
      case "off":
        return "moving to another account at the limit is switched off";
      case "hand":
        return "a person moved it, and the account they chose can't take it yet";
    }
  };

  /** Every other account and why it didn't take the session, as a line names them. */
  const heldList = (
    decision: Extract<StopDecision, { action: "wait" }>
  ): string => {
    const accounts = db.accounts.list();
    return (
      decision.accounts
        .flatMap((one) => {
          const account = db.accounts.get(one.accountId);
          return account
            ? [
                heldAccountWords({
                  account: namedAccount(account, accounts),
                  reason: one.reason,
                  ...(one.backAt === undefined ? {} : { backAt: one.backAt }),
                }),
              ]
            : [];
        })
        .join(" · ") || "no other account is signed in for it"
    );
  };

  /**
   * One planned move, as the decision at a forecast says it
   * (at-limit.ts `decideStop`, `forecast`): moved, or owed to its turn's
   * end, to the first account it weighed; staying, this one skipped; or
   * staying with no account that can take it, the pass stopped.
   */
  const step = async (
    source: Source,
    row: LimitRow,
    share: SessionShare,
    added: Added
  ): Promise<Step> => {
    const fresh = candidate(row, source.from);
    if (!fresh) {
      return "skip";
    }
    const { from, forecast } = source;
    const fromName = accountNameAmong(from, forecast.accounts);
    const now = Date.now();
    const input = stopInputOf(
      db,
      ports,
      fresh,
      from,
      "forecast",
      now,
      [...added.values()],
      source.stress.runsOutAt
    );
    const decision = decideStop(input);
    const head = `[rebalance] ${ports.named(fresh)} is on ${fromName}, which is forecast to run out at ${clockWords(source.stress.runsOutAt)}, and ${share.why}`;
    if (decision.action === "wait") {
      console.info(
        `${head}. It stays: ${stayWords(decision, fromName, input.policy.waitMinutes)}. The next look at the accounts, within 5 minutes, decides again.`
      );
      return decision.why === "full" ? "stop" : "skip";
    }
    const [weighed] = decision.targets;
    const target = weighed ? db.accounts.get(weighed.accountId) : undefined;
    if (!(weighed && target)) {
      return "skip";
    }
    const targetName = accountNameAmong(target, forecast.accounts);
    const warm = input.session.cacheExpiresAt !== null;
    let why = "its cache is cold, so moving re-reads nothing waiting wouldn't";
    if (weighed.carries) {
      why = "one organization and its cache warm, so its cache carries";
    } else if (warm) {
      why = `a person waits on it, and re-reading ${tokenWords(decision.tokens)} cold is under the ${input.policy.moveWholeUnderK}k floor`;
    }
    // Charged now, before any await, so the next decision counts it.
    ports.admission.charge(
      fresh.id,
      target.id,
      weighed.moveUsd === null
        ? null
        : weighed.moveUsd + NEXT_TURN_ALLOWANCE_USD
    );
    console.info(
      `${head}. It moves to ${targetName} between turns: ${why}; moving ${moveSideWords(weighed, decision.tokens, targetName)}.`
    );
    const done = await carry(
      source,
      fresh,
      target,
      weighed,
      decision.tokens,
      warm
    );
    // Owed or moved, its burn leaves `from` for `target`.
    if (done !== "skip") {
      source.relieved += share.share;
      added.set(fresh.id, {
        accountId: target.id,
        burn: burnOf(source, share),
        instanceId: fresh.id,
        since: now,
      });
    }
    return done;
  };

  /**
   * Whether `from`'s plan limit stops nothing: past it, its sessions keep
   * going on its extra usage (core `keepsGoingOnExtraUsage`), so none is
   * moved ahead of `stress`. Says so when it does.
   */
  const keepsGoing = (
    forecast: ForecastRead,
    from: Account,
    stress: Stress
  ): boolean => {
    const reading = db.accounts
      .readings()
      .find((one) => one.accountId === from.id);
    if (!keepsGoingOnExtraUsage(from, reading)) {
      return false;
    }
    console.info(
      `[rebalance] The sessions on ${accountNameAmong(from, forecast.accounts)} stay there, though its ${windowWords(stress.window)} window is forecast to run out at ${clockWords(stress.runsOutAt)}: past its plan they keep going on its extra usage, as its setting says.`
    );
    return true;
  };

  /**
   * Moves running sessions off `from` while it is forecast to run out,
   * highest share of its burn first, one at a time; stops once it no
   * longer runs out, or a target would. Null when it is not stressed.
   */
  const moveOff = async (
    forecast: ForecastRead,
    from: Account,
    rows: LimitRow[],
    added: Added
  ): Promise<MovedOff | null> => {
    const now = Date.now();
    const waitMs =
      db.accounts.routing(from.provider).atLimit.waitMinutes * 60_000;
    const fromForecast = forecast.forecasts.find(
      (one) => one.accountId === from.id
    );
    const stress = stressOf(fromForecast, waitMs, now);
    if (!stress || keepsGoing(forecast, from, stress)) {
      return null;
    }
    const shares = sessionShares(
      rows,
      forecast.turns.get(from.id) ?? [],
      stress,
      accountNameAmong(from, forecast.accounts),
      now
    );
    const planned = rows
      .flatMap((row) => {
        const share = shares.get(row.id);
        return share ? [{ row, share }] : [];
      })
      .sort(
        (a, b) =>
          b.share.share - a.share.share ||
          (a.row.contextTokens ?? 0) - (b.row.contextTokens ?? 0)
      );
    const source: Source = {
      forecast,
      from,
      fromForecast,
      stress,
      waitMs,
      relieved: 0,
      out: {
        from,
        left: 0,
        moved: 0,
        runsOutAt: stress.runsOutAt,
        to: null,
        cacheKept: false,
      },
    };
    for (const { row, share } of planned) {
      if (lasts(source, Date.now())) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one move at a time, each between its session's turns, the next one's target forecast taking it in
      const done = await step(source, row, share, added);
      if (done === "stop") {
        break;
      }
      if (done === "owed") {
        source.out.left += 1;
      } else if (done === "moved") {
        source.out.moved += 1;
      }
    }
    return source.out.moved + source.out.left > 0 ? source.out : null;
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
    for (const row of db.listInstances()) {
      if (
        row.machineId === machineId &&
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
    const last = db.atLimit
      .events([row.id])
      .findLast((one) => one.move.kind === "moved")?.move;
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
        // biome-ignore lint/performance/noAwaitInLoops: one account at a time, each target's forecast taking the moves before it in
        const moved = from ? await moveOff(forecast, from, rows, added) : null;
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
    ports.changed();
  };

  /** Passes running now, by provider and machine, with the trigger that came meanwhile (undefined: none). */
  const passes = new Map<
    string,
    { again: RebalanceCause | null | undefined }
  >();
  const passKey = (provider: string, machineId: string) =>
    `${provider}\u0000${machineId}`;

  /**
   * Rebalances `provider`'s accounts on `machineId`, one pass at a time per
   * pair: a trigger while one runs runs it once more after, keeping the
   * cause that came.
   */
  const rebalance = async (
    provider: AccountProvider,
    machineId: string,
    cause: RebalanceCause | null = null,
    /** Looks at the holds after: false for a look's own pass, which just did. */
    looks = true
  ): Promise<void> => {
    if (!LIMITED_PROVIDERS.includes(provider) || lifetime.closed()) {
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
        // biome-ignore lint/performance/noAwaitInLoops: passes on one pair run one after another
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
      if (
        one.state === "signed-in" &&
        provider &&
        LIMITED_PROVIDERS.includes(provider)
      ) {
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
      // biome-ignore lint/performance/noAwaitInLoops: one pair at a time, each move between its session's turns
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
    /** A turn of `instanceId` ended: a carry refused before may go now. */
    turnEnded: (instanceId: string): void => {
      refused.delete(instanceId);
    },
  };
};
