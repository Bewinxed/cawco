import {
  type Account,
  type AccountForecast,
  type AccountProvider,
  accountName,
  clockWords,
  LIMITED_PROVIDERS,
  namedAccount,
  type RebalanceNotice,
  type WindowForecast,
  windowWords,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import type { AtLimitPorts, LimitRow } from "./at-limit";
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
import { SESSION_WINDOW_MS } from "./placement";

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

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How far back a pass reads: a weekly window, and a day over for its opening reading. */
const LOOKBACK_MS = 8 * DAY_MS;
/** How long each window kind runs: when the current one opened, from its reset. */
const WINDOW_MS: Record<string, number> = {
  session: SESSION_WINDOW_MS,
  weekly_all: 7 * DAY_MS,
  weekly_scoped: 7 * DAY_MS,
};
/** The shortest span a burn is measured over, so one turn just taken is not an hour's rate. */
const MIN_BURN_SPAN_MS = 15 * 60_000;

/** A provider's accounts as one pass reads them. */
export interface ForecastRead {
  accounts: Account[];
  forecasts: AccountForecast[];
  history: HistoryPoint[];
  paces: AccountPaces;
  /** The accounts a session runs on now. */
  running: ReadonlySet<string>;
  /** The turns on each account over the look-back, oldest first. */
  turns: ReadonlyMap<string, TurnUsageRow[]>;
}

/** Reads `provider`'s accounts, their history and their turns, once, for one pass. */
export const readForecast = (
  db: DbShape,
  provider: AccountProvider,
  now: number
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
  const running = new Set(
    db
      .listInstances()
      .flatMap((row) =>
        row.status === "running" && row.accountId && ids.has(row.accountId)
          ? [row.accountId]
          : []
      )
  );
  const readings = db.accounts.readings();
  return {
    accounts,
    history,
    turns,
    running,
    forecasts: accountForecasts(accounts, readings, history, running, now),
    paces: accountPaces(accounts, readings, history, turns, running, now),
  };
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
  forecast: ForecastRead,
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
 * When an account would run out before a window resets with `added` percent
 * an hour on top of its pace, by window kind; null when it lasts. A window
 * not open yet is a fresh 5-hour one (resetting 5 hours from now) or no limit.
 */
export const runsOutWith = (
  forecast: AccountForecast | undefined,
  added: (window: { kind: string; scopeLabel: string | null }) => number,
  now: number
): number | null => {
  const windows: Pick<
    WindowForecast,
    "kind" | "pace" | "resetsAt" | "scopeLabel" | "utilization"
  >[] = forecast?.windows.length
    ? forecast.windows
    : [
        {
          kind: "session",
          scopeLabel: null,
          pace: null,
          resetsAt: null,
          utilization: 0,
        },
      ];
  let soonest: number | null = null;
  for (const window of windows) {
    const at = window.resetsAt ? Date.parse(window.resetsAt) : null;
    const open = at !== null && at > now;
    if (!open && window.kind !== "session") {
      continue;
    }
    const reset = open && at !== null ? at : now + SESSION_WINDOW_MS;
    const used = open ? window.utilization : 0;
    const rate = (window.pace ?? 0) + added(window);
    if (rate <= 0) {
      continue;
    }
    const out = now + (Math.max(100 - used, 0) / rate) * HOUR_MS;
    if (out < reset && (soonest === null || out < soonest)) {
      soonest = out;
    }
  }
  return soonest;
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

/** The most any open window of an account is used. */
const usedOf = (forecast: ForecastRead, accountId: string, now: number) =>
  Math.max(
    0,
    ...(forecast.forecasts
      .find((one) => one.accountId === accountId)
      ?.windows.map((one) =>
        one.resetsAt && Date.parse(one.resetsAt) <= now ? 0 : one.utilization
      ) ?? [])
  );

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
  /** Whether a move from one account to another keeps the cache (at-limit `cacheCarries`). */
  cacheCarries: (from: Account, to: Account) => boolean;
  db: DbShape;
  lifetime: HubLifetimeShape;
  /** At-limit's look at every hold. */
  lookAtHolds: () => Promise<void>;
  ports: Pick<
    AtLimitPorts,
    | "changed"
    | "continuing"
    | "idle"
    | "machineName"
    | "move"
    | "note"
    | "noticed"
    | "target"
    | "warm"
  >;
  /** At-limit arms its next look again: what can be balanced changed. */
  replan: () => void;
}

/** A pass with sessions left mid-turn is run again this often… */
const RETRY_MS = 30_000;
/** …until this long after it began. */
const RETRY_FOR_MS = 10 * 60_000;

/** The burn already moved onto each target in a pass, percent an hour by window kind. */
type Added = Map<string, (kind: string) => number>;

/** What a pass moved off one stressed account. */
interface MovedOff {
  cacheKept: boolean;
  from: Account;
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
 * The burn a session takes to `target`, percent an hour by window kind: in
 * `target`'s own percents where it prices one and the session's burn is
 * recorded, else as its share of its account's pace there.
 */
const burnTo =
  (source: Source, share: SessionShare, target: Account) =>
  (kind: string): number => {
    const perPct = source.forecast.paces
      .get(target.id)
      ?.find((one) => one.kind === kind)?.tokensPerPct;
    if (share.burn !== null && perPct) {
      return share.burn / perPct;
    }
    const pace =
      source.fromForecast?.windows.find((one) => one.kind === kind)?.pace ?? 0;
    return share.share * pace;
  };

/** What one planned move came to: stop the account's moves, skip this one, left mid-turn, or moved. */
type Step = "stop" | "skip" | "left" | "moved";

export const createRebalancer = (deps: RebalancerDeps) => {
  const { db, lifetime, ports, acting, cacheCarries } = deps;
  const rowOf = (id: string): LimitRow | undefined =>
    db.getInstancesByIds([id])[0];

  /**
   * Whether `row`, warm, may move off `from` to `target` before any limit:
   * always when its cache carries; across organizations only under the
   * floor and when the re-read fits `target`'s room, since a refusal later
   * costs a lost turn and a wait on top of the same re-read.
   */
  const warmMayMove = (
    source: Source,
    row: LimitRow,
    target: Account
  ): { ok: boolean; why: string } => {
    if (cacheCarries(source.from, target)) {
      return { ok: true, why: "one organization, so its cache carries" };
    }
    const floorK = db.accounts.routing(source.from.provider).atLimit
      .moveWholeUnderK;
    if (row.contextTokens !== null && row.contextTokens >= floorK * 1000) {
      return {
        ok: false,
        why: `its cache is warm and ${Math.round(row.contextTokens / 1000)}k is over the ${floorK}k floor; it is shrunk at its limit instead`,
      };
    }
    const cost = reReadCost(source.forecast, row, target);
    const room = 100 - usedOf(source.forecast, target.id, Date.now());
    if (cost && cost.pct > room) {
      return {
        ok: false,
        why: `re-reading it would take ≈${Math.round(cost.pct)}% of ${accountName(target)}'s 5-hour window, more than its ${Math.round(room)}% of room`,
      };
    }
    return {
      ok: true,
      why: cost
        ? `under the floor, and the re-read (≈${Math.max(1, Math.round(cost.pct))}% of ${accountName(target)}'s 5-hour window) fits its room`
        : `under the floor; the re-read is not priced, as no turns are recorded on ${accountName(target)} yet`,
    };
  };

  /** A work item's session in a project whose Caw is off: nothing moves it (at-limit `stays`). */
  const cawOff = (row: LimitRow): boolean => {
    const project = row.projectId ? db.project(row.projectId) : undefined;
    return !!(row.workItemId && project && !project.caw);
  };

  /** `row` as it stands now, when it is still on `from`, running, and nothing else is acting on it. */
  const candidate = (row: LimitRow, from: Account): LimitRow | undefined => {
    const fresh = rowOf(row.id);
    if (
      fresh?.status !== "running" ||
      cawOff(fresh) ||
      fresh.accountId !== from.id ||
      acting.has(row.id) ||
      ports.continuing(fresh) ||
      db.atLimit.hold(row.id)
    ) {
      return undefined;
    }
    return fresh;
  };

  /** Moves `row` to `target` between turns and writes its line; a session mid-turn is left for the next pass. */
  const carry = async (
    source: Source,
    row: LimitRow,
    target: Account,
    warm: boolean
  ): Promise<"left" | "moved"> => {
    if (!(await ports.idle(row))) {
      return "left";
    }
    acting.add(row.id);
    let why: string | undefined;
    try {
      why = await ports.move(row, target.id, false);
    } finally {
      acting.delete(row.id);
    }
    if (why) {
      console.warn(
        `[rebalance] ${row.id}: did not move to ${accountName(target)}: ${why}`
      );
      return "left";
    }
    const { from, stress } = source;
    const kept = cacheCarries(from, target);
    const cost = kept ? undefined : reReadCost(source.forecast, row, target);
    ports.note(row, {
      kind: "moved",
      from: namedAccount(from),
      to: namedAccount(target),
      sameOrganization: kept,
      tokens: row.contextTokens,
      window: windowWords(stress.window),
      resetsAt: stress.resetAt,
      because: warm
        ? { kind: "forecast", runsOutAt: stress.runsOutAt }
        : { kind: "cold", wake: false },
      ...(cost ? { cost } : {}),
    });
    source.out.to = target;
    source.out.cacheKept = kept;
    return "moved";
  };

  /**
   * One planned move: to where placement carries it off its account, unless
   * the table keeps it (warm across organizations, over the floor or
   * unaffordable: this one is skipped), or that account would run out with
   * its burn (the pass stops).
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
    const targetId = ports.target(fresh, from.id);
    const target = targetId ? db.accounts.get(targetId) : undefined;
    if (!target) {
      console.info(
        `[rebalance] ${row.id}: no other account has room to take it off ${accountName(from)}`
      );
      return "stop";
    }
    const warm = ports.warm(fresh);
    const allowed = warm
      ? warmMayMove(source, fresh, target)
      : {
          ok: true,
          why: "its cache is cold, so moving re-reads nothing extra",
        };
    const head = `[rebalance] ${row.id} on ${accountName(from)} (forecast to run out at ${clockWords(source.stress.runsOutAt)}): ${share.why}`;
    if (!allowed.ok) {
      console.info(
        `${head}; stays, not moved to ${accountName(target)}: ${allowed.why}`
      );
      return "skip";
    }
    const before = added.get(target.id) ?? (() => 0);
    const mine = burnTo(source, share, target);
    const withIt = (kind: string) => before(kind) + mine(kind);
    const out = runsOutWith(
      forecast.forecasts.find((one) => one.accountId === target.id),
      (window) => withIt(window.kind),
      Date.now()
    );
    if (out !== null) {
      console.info(
        `${head}; stays, and so do the rest: ${accountName(target)} would run out at ${clockWords(out)} with its burn`
      );
      return "stop";
    }
    console.info(`${head}; moves to ${accountName(target)}: ${allowed.why}`);
    const done = await carry(source, fresh, target, warm);
    if (done === "moved") {
      source.relieved += share.share;
      added.set(target.id, withIt);
    }
    return done;
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
    if (!stress) {
      return null;
    }
    const shares = sessionShares(
      rows,
      forecast.turns.get(from.id) ?? [],
      stress,
      accountName(from),
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
      if (done === "left" || done === "moved") {
        source.out[done] += 1;
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
    if (ports.continuing(row)) {
      group.continued += 1;
      return true;
    }
    const to =
      row.accountId && row.accountId !== from.id
        ? db.accounts.get(row.accountId)
        : undefined;
    if (!to) {
      return false;
    }
    const cost = cacheCarries(from, to)
      ? undefined
      : reReadCost(
          forecastOf(to.provider),
          { cacheTtl: row.cacheTtl, contextTokens: context },
          to
        );
    group.moved.push({
      to: namedAccount(to),
      tokens: context,
      cacheKept: cacheCarries(from, to),
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
        from: namedAccount(from),
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
    const came = cause.came.flatMap((one) => {
      const account = db.accounts.get(one.accountId);
      return account ? [{ account: namedAccount(account), how: one.how }] : [];
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
      running: running.flatMap((one) =>
        one.to
          ? [
              {
                from: namedAccount(one.from),
                organization: one.from.identity?.organization || null,
                runsOutAt: one.runsOutAt,
                to: namedAccount(one.to),
                cacheKept: one.cacheKept,
                moved: one.moved,
                left: one.left,
              },
            ]
          : []
      ),
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
  ): Promise<{ left: number }> => {
    const signed = signedInOn(provider, machineId);
    const held = db.atLimit.holds().filter((one) => signed.has(one.accountId));
    const heldRows = db
      .getInstancesByIds(held.map((one) => one.instanceId))
      .filter((row) => row.machineId === machineId);
    const tokens = new Map(heldRows.map((row) => [row.id, row.contextTokens]));
    const holdsBefore = held.filter((one) => tokens.has(one.instanceId));
    const running: MovedOff[] = [];
    if (db.accounts.routing(provider).atLimit.move && signed.size >= 2) {
      const forecast = readForecast(db, provider, Date.now());
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
    return { left: running.reduce((sum, one) => sum + one.left, 0) };
  };

  /** Passes running now, by provider and machine, with the trigger that came meanwhile (undefined: none). */
  const passes = new Map<
    string,
    { again: RebalanceCause | null | undefined }
  >();
  const retries = new Map<string, { since: number; timer: HubTimer }>();
  const passKey = (provider: string, machineId: string) =>
    `${provider}\u0000${machineId}`;

  /** Runs the pair again shortly when its pass left sessions mid-turn, for {@link RETRY_FOR_MS} from the first. */
  const retryLater = (
    provider: AccountProvider,
    machineId: string,
    left: number
  ): void => {
    const key = passKey(provider, machineId);
    const was = retries.get(key);
    lifetime.cancel(was?.timer);
    retries.delete(key);
    const since = was?.since ?? Date.now();
    if (left === 0 || Date.now() - since >= RETRY_FOR_MS) {
      return;
    }
    retries.set(key, {
      since,
      timer: lifetime.after(RETRY_MS, () => {
        detach(rebalance(provider, machineId), "rebalance retry");
      }),
    });
  };

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
        const { left } = await pass(
          provider,
          machineId,
          next,
          looks || next !== null
        );
        const self = passes.get(key);
        next = self?.again;
        if (self) {
          self.again = undefined;
        }
        retryLater(provider, machineId, next === undefined ? left : 0);
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
    if (
      !(
        was &&
        same(was.signed, signed) &&
        same(new Set(was.benched.keys()), new Set(benched.keys()))
      )
    ) {
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
      console.info(
        `[rebalance] ${cause.came.map((one) => `${one.accountId} ${one.how === "added" ? "signed in" : "back from its bench"}`).join(", ")} on ${machineId}: rebalancing ${provider} there`
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
  };
};
