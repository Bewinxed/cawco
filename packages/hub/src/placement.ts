import {
  type Account,
  type AccountBench,
  type AccountReading,
  type AccountSignin,
  accountNameAmong,
  keepsGoingOnExtraUsage,
  modelScope,
  type PlacementExplain,
  type ProviderRouting,
  type StrategyChoice,
} from "@cawco/core/accounts";
import type { PlacementStrategy } from "@cawco/core/accounts/kinds";
import type { SettingsInEffect } from "@cawco/core/areas";
import { harnessNamed } from "@cawco/core/harness/kinds";
import { HOUR_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import {
  aheadOfWeek,
  bearing,
  earliestReset,
  headroom,
  openedAt,
  windowNoun,
  windowOpen,
  windowResetAt,
  windowUsed,
  windowWords,
} from "@cawco/core/usage/windows";
import { clockWords, spanWords } from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { areaWords } from "@cawco/core/words/areas";
import { configurePage } from "@cawco/core/words/configure";
import { projectAccountWords } from "@cawco/core/words/project-account";
import { spawnWords } from "@cawco/core/words/spawn";
import type { DbShape } from "./db";
import type { AccountPaces } from "./window-paces";

/**
 * Which account a session runs on (core `PlacementExplain`): decided when it
 * starts, and again when moving it is free or staying would fail: at its
 * limit, when its account is forecast to run out (at-limit's rebalance), and
 * at a wake with its cache cold. Pure: every input is read by the caller.
 */

export interface PlacementInput {
  /** Every account of the session's provider. */
  accounts: Account[];
  /**
   * The sessions already launched onto each account, or owed to it, whose
   * burn its measured pace does not count yet ({@link arrivingBurn}): the
   * carry test adds them, so sessions placed one after another fill an
   * account's forecast as they go. Not the session being placed.
   */
  arrivals?: readonly Arrival[];
  bench: AccountBench[];
  /**
   * The session's expected burn in weighted tokens an hour (a running one's
   * own, a new one's kind's recent average), which soonest-reset adds to an
   * account's pace in its carry test; null or absent when unmeasured.
   */
  burn?: number | null;
  /**
   * The account a session already runs on, re-placed (at a wake with its
   * cache cold): it moves only to an account that lasts to its reset with
   * it, and stays when none does.
   */
  current?: string;
  /** The account the spawn named (id, nickname or email); must be allowed, and ignores bench and reserve. */
  explicit?: string;
  /** A fork runs on the account of the session it forks, whatever else holds. */
  fork?: { accountId: string | null };
  /** `yours`: a person started it; `delegates`: a session did. */
  kind: "yours" | "delegates";
  machineId: string;
  /** Names the machine in a sentence. */
  machineName?: string;
  model?: string;
  now: number;
  /**
   * Each account's window paces (forecast.ts `accountPaces`), for
   * soonest-reset's carry test; absent: no forecast, the order alone decides.
   */
  paces?: AccountPaces;
  /**
   * The account the session's project starts its sessions on, as in effect
   * (db `inEffect`: the project's own, else its area's, `area` naming that
   * area), for a start that names none of its own ({@link projectPick});
   * absent: none, or a session already running.
   */
  projectAccount?: { area: string | null; id: string };
  /**
   * The project's allow-list; null or absent: every account. It holds only
   * sessions of a provider it lists an account of ({@link ofProvider}).
   */
  projectAccounts?: string[] | null;
  readings: AccountReading[];
  routing: ProviderRouting;
  signins: AccountSignin[];
  /** The task's allow-list (`accounts:`); null or absent: every account. Held to its providers as the project's is. */
  taskAccounts?: string[] | null;
  /** The delegate type's preferred account. */
  typeAccount?: string;
}

export type Placement =
  ({ ok: true } & PlacementExplain) | { ok: false; refusal: string };

/**
 * Why a Claude session can't start on a machine with no CawCo account
 * signed in: it never runs on the machine's own Claude Code login.
 */
export const noAccountRefusal = (machine: string): string =>
  `No Claude account is signed in on ${machine}. Add one in ${configurePage("accounts")} and sign it in there.`;

/** A harness as a sentence names it (core words/accounts.ts `harnesses`), or the value as given when it names none. */
const harnessName = (harness: string): string => {
  const kind = harnessNamed(harness);
  return kind ? accountsWords.harnesses[kind] : harness;
};

/**
 * Why a session can't start on a machine that has not reported its harness
 * yet. A machine's agent registers before it reads its harnesses, whose CLIs
 * can take many seconds to answer, so for a while after a machine first
 * joins the hub knows neither whether that harness is installed there nor
 * who is signed in to it.
 */
export const unreportedHarnessRefusal = (
  machine: string,
  harness: string
): string =>
  `${machine} hasn't said yet whether it can run ${harnessName(harness)}: its agent is still checking. Start the session again in a moment. Nothing was started.`;

const pct = (value: number): string => `${Math.round(value)}%`;

/**
 * A session launched onto an account, or owed to it (a move at its turn's
 * end, a launch on its way), whose burn the account's pace does not count
 * yet: a pace is a window's average since it opened, so a session that came
 * in late in it shows in it only for the part of the window it ran there.
 */
export interface Arrival {
  accountId: string;
  /** Its expected burn, weighted tokens an hour: its own recent turns', else its kind's. */
  burn: number;
  instanceId: string;
  /** When it began running there: its launch, or now for one still owed there. */
  since: number;
}

/** One window of an account as the run-out test reads it: the window as read, and its pace. */
export interface CarryWindow extends Pick<
  LimitWindow,
  "group" | "kind" | "percent" | "resetsAt" | "scopeLabel"
> {
  /** Percent an hour since it opened; null when unmeasured. */
  pace: number | null;
}

/**
 * The burn arriving on `accountId` that `window`'s pace misses, weighted
 * tokens an hour: each arrival's burn times the part of the window so far it
 * was not there for (all of it in a window not open yet, or of no known
 * length; none for one there since the window opened).
 */
const arrivingBurn = (
  arrivals: readonly Arrival[],
  accountId: string,
  window: Pick<CarryWindow, "group" | "resetsAt">,
  now: number
): number => {
  const opened = windowOpen(window, now) ? (openedAt(window) ?? now) : now;
  return arrivals
    .filter((one) => one.accountId === accountId)
    .reduce((sum, one) => {
      const missed =
        opened >= now
          ? 1
          : Math.min(1, Math.max(0, (one.since - opened) / (now - opened)));
      return sum + one.burn * missed;
    }, 0);
};

/**
 * When an account runs out before a window of it resets, at its pace with
 * `added` percent an hour on top, soonest first; null when it lasts to every
 * reset. Only the account's own windows are walked, each open one to its
 * own reset: a window not open has no reset to run out before, and a window
 * the account does not have (a verified Ultra account's session window) is never made
 * up. The one test placement's carry test and rebalance's moves both run.
 */
const runsOutWith = (
  windows: readonly CarryWindow[],
  added: (window: CarryWindow) => number,
  now: number
): number | null => {
  let soonest: number | null = null;
  for (const window of windows) {
    const reset = windowResetAt(window);
    if (reset === null || reset <= now) {
      continue;
    }
    const rate = (window.pace ?? 0) + added(window);
    if (rate <= 0) {
      continue;
    }
    const out = now + (Math.max(100 - window.percent, 0) / rate) * HOUR_MS;
    if (out < reset && (soonest === null || out < soonest)) {
      soonest = out;
    }
  }
  return soonest;
};

/** A window as the run-out test reads it, and what one percent of it costs in weighted tokens (null when unmeasured). */
export interface PacedWindow extends CarryWindow {
  tokensPerPct: number | null;
}

/**
 * When account `id` runs out before a window of it resets ({@link
 * runsOutWith}): at each window's pace, with `burn` (weighted tokens an
 * hour) and the burn arriving there ({@link arrivingBurn}) added over what a
 * percent of that window costs. Null when it lasts to every reset.
 */
export const runsOutBy = (
  windows: readonly PacedWindow[],
  burn: number,
  arrivals: readonly Arrival[],
  id: string,
  now: number
): number | null =>
  runsOutWith(
    windows,
    (window: CarryWindow & { tokensPerPct?: number | null }) =>
      window.tokensPerPct
        ? (burn + arrivingBurn(arrivals, id, window, now)) / window.tokensPerPct
        : 0,
    now
  );

/** An explicit pick: the account it names by id, nickname or email. */
const picked = (accounts: Account[], asked: string): Account | undefined => {
  const lower = asked.toLowerCase();
  return (
    accounts.find((account) => account.id === asked) ??
    accounts.find(
      (account) =>
        account.label?.toLowerCase() === lower ||
        account.email?.toLowerCase() === lower
    )
  );
};

/** What the four strategies order accounts by: fill-first order, binding use, the earliest reset and when it runs out; and whether it is ahead of its week. */
export interface Ranked {
  /** Its week is used past its pace line (core `aheadOfWeek`): it goes after every account that isn't ({@link pacedOrder}). */
  ahead: boolean;
  /** The use of the window that binds it now, percent: the most used of its bearing windows ({@link Usage.binding}). */
  binding: number;
  createdAt: number;
  id: string;
  order: number;
  /** The soonest reset among its bearing windows (core `earliestReset`); null when none is open. */
  reset: number | null;
  /** When it runs out with this session on it ({@link Usage.runsOut}); null when it lasts to every reset, or nothing measures it. */
  runsOut: number | null;
}

/** Fill-first: lowest in order first, older first among equals. */
const byFillFirst = (
  a: Pick<Ranked, "createdAt" | "order">,
  b: Pick<Ranked, "createdAt" | "order">
): number => a.order - b.order || a.createdAt - b.createdAt;

/** Spread: the account that lasts to every reset first, then the one that runs out last. */
const byLasting = (a: Ranked, b: Ranked): number => {
  if (a.runsOut === null || b.runsOut === null) {
    return Number(a.runsOut !== null) - Number(b.runsOut !== null);
  }
  return b.runsOut - a.runsOut;
};

/** Soonest reset: the earliest reset first; one with no window open has none to order by and goes after. */
const byReset = (a: Ranked, b: Ranked): number => {
  if (a.reset === null || b.reset === null) {
    return Number(a.reset === null) - Number(b.reset === null);
  }
  return a.reset - b.reset;
};

/**
 * The kind's strategy as an ordering, best first: the one each strategy below
 * picks from, and the order at-limit's decision (at-limit.ts `decideStop`)
 * weighs the accounts that fit in. Pinned puts the pin first, then fill-first
 * over the rest; fill-first goes by order; spread by how long it lasts with
 * the session on it (to every reset first, then the latest run-out), then
 * the least used binding window, then order; soonest-reset by the earliest
 * reset among its bearing windows, then the least used binding window. Every
 * account is read on its own windows, whichever it has.
 */
const strategyOrder =
  (strategy: PlacementStrategy, pinnedId: string | undefined) =>
  (a: Ranked, b: Ranked): number => {
    switch (strategy) {
      case "pinned":
        return (
          Number(b.id === pinnedId) - Number(a.id === pinnedId) ||
          byFillFirst(a, b)
        );
      case "spread":
        return byLasting(a, b) || a.binding - b.binding || a.order - b.order;
      case "soonest-reset":
        return byReset(a, b) || a.binding - b.binding;
      case "fill-first":
        return byFillFirst(a, b);
    }
  };

/**
 * The strategy's order with the pace line before it: an account ahead of its
 * week goes after every account that isn't, whatever the strategy says,
 * for every strategy and every kind of session. An account with no week is
 * never ahead. The order at-limit's decision weighs the accounts that fit
 * in; placement applies the same rule by choosing among those that aren't
 * ahead first ({@link decide}).
 */
export const pacedOrder =
  (strategy: PlacementStrategy, pinnedId: string | undefined) =>
  (a: Ranked, b: Ranked): number =>
    Number(a.ahead) - Number(b.ahead) ||
    strategyOrder(strategy, pinnedId)(a, b);

const byOrder = (list: Account[]): Account[] => [...list].sort(byFillFirst);

/** The account the pinned strategy pins: the one its choice names, else the first in fill-first order. */
export const pinnedOf = (
  choice: StrategyChoice,
  accounts: Account[]
): string | undefined => choice.pinnedAccountId ?? byOrder(accounts)[0]?.id;

/** The order {@link Usage.said} lists an account's windows in: by length, over all models before one model's. */
const SAID_ORDER: Record<string, number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
};

/** What placement reads of each account's windows, for one model scope at one moment. */
class Usage {
  readonly #input: PlacementInput;
  readonly #scope: string | null;
  /**
   * Why a keep-going account's extra usage counts as room here, in words
   * {@link said} quotes; undefined: only plan room counts.
   */
  readonly #credits: string | undefined;

  constructor(input: PlacementInput, credits?: string) {
    this.#input = input;
    this.#scope = modelScope(input.model);
    this.#credits = credits;
  }

  /** What the account is called beside the others (core `accountNameAmong`). */
  name = (account: Account): string =>
    accountNameAmong(account, this.#input.accounts);

  /**
   * The windows of account `id` that bear on this session (core `bearing`):
   * its own, whichever it has, a lapsed one its window set names read as
   * that kind's fresh window.
   */
  #bearing(id: string): LimitWindow[] {
    const reading = this.#input.readings.find((one) => one.accountId === id);
    return bearing(
      reading?.windows ?? [],
      this.#scope,
      this.#input.now,
      reading?.windowKinds ?? null
    );
  }

  /** The use of the window that binds it now, percent: the most used of its bearing windows; 0 with none read. */
  binding(id: string): number {
    const binds = headroom(this.#bearing(id), this.#input.now);
    return binds ? 100 - binds.left : 0;
  }

  /** The most used of its weekly windows, percent: what its reserve is read against. */
  weekly(id: string): number {
    const { now } = this.#input;
    return Math.max(
      0,
      ...this.#bearing(id)
        .filter((window) => window.group === "weekly")
        .map((window) => windowUsed(window, now))
    );
  }

  /**
   * Whether its plan limits stop nothing for this session: extra usage
   * counts here ({@link choose} says when), and it keeps going on extra usage
   * at its plan limit (core `keepsGoingOnExtraUsage`). A session carried off
   * its account at a limit goes only to plan room (at-limit.ts `decideStop`).
   */
  onExtraUsage = (account: Account): boolean =>
    this.#credits !== undefined &&
    keepsGoingOnExtraUsage(
      account,
      this.#input.readings.find((one) => one.accountId === account.id)
    );

  /**
   * Whether its extra usage would take this session past its plan, here where
   * only plan room counts: an account that keeps going.
   */
  creditsWait = (account: Account): boolean =>
    this.#credits === undefined &&
    this.binding(account.id) >= 100 &&
    keepsGoingOnExtraUsage(
      account,
      this.#input.readings.find((one) => one.accountId === account.id)
    );

  headroom = (account: Account): boolean =>
    this.binding(account.id) < 100 || this.onExtraUsage(account);

  /**
   * Whether its limits have been read at all: a session leaving its account
   * at the limit goes only where a reading shows room, never to an account
   * whose windows nobody has read, which may be spent.
   */
  read = (account: Account): boolean =>
    this.#input.readings.some((one) => one.accountId === account.id);

  /** Its bearing window that resets soonest, and when (core `earliestReset`); undefined when none is open. */
  resetting(id: string): { at: number; window: LimitWindow } | undefined {
    const windows = this.#bearing(id);
    const at = earliestReset(windows, this.#input.now);
    const window =
      at === null
        ? undefined
        : windows.find((one) => windowResetAt(one) === at);
    return at === null || !window ? undefined : { at, window };
  }

  /** Its week used furthest past its pace line, for this session's model (core `aheadOfWeek`); undefined when none is. */
  ahead(id: string) {
    return aheadOfWeek(this.#bearing(id), this.#input.now);
  }

  /** What the strategies order it by ({@link strategyOrder}). */
  ranked = (account: Account): Ranked => ({
    ahead: this.ahead(account.id) !== undefined,
    id: account.id,
    order: account.order,
    createdAt: account.createdAt,
    binding: this.binding(account.id),
    reset: this.resetting(account.id)?.at ?? null,
    runsOut: this.runsOut(account.id),
  });

  /**
   * The windows that limit this session on account `id` (its bearing
   * windows, whichever it has), as the run-out test reads them: each one as
   * read, its pace, and what a percent of it costs in weighted tokens (null
   * when unmeasured, or with no paces given).
   */
  carryWindows(id: string): PacedWindow[] {
    return this.#bearing(id).map((window) => {
      const pace = this.#input.paces
        ?.get(id)
        ?.find(
          (one) =>
            one.kind === window.kind && one.scopeLabel === window.scopeLabel
        );
      return {
        kind: window.kind,
        group: window.group,
        scopeLabel: window.scopeLabel,
        resetsAt: window.resetsAt,
        percent: window.percent,
        pace: pace?.pace ?? null,
        tokensPerPct: pace?.tokensPerPct ?? null,
      };
    });
  }

  /** Whether anything measures how account `id` is heading: paces were given and one of its windows has a pace or a cost per percent. */
  measured(id: string): boolean {
    return (
      this.#input.paces !== undefined &&
      this.carryWindows(id).some(
        (one) => one.pace !== null || one.tokensPerPct !== null
      )
    );
  }

  /**
   * When the account runs out before a window of it resets ({@link
   * runsOutWith}), at its pace with the session's burn and the burn arriving
   * there ({@link arrivingBurn}) added, each over what a percent of that
   * window costs; null when it lasts to every reset, or nothing measures it.
   */
  runsOut(id: string): number | null {
    const { paces, burn, arrivals, now } = this.#input;
    if (!paces) {
      return null;
    }
    return runsOutBy(this.carryWindows(id), burn ?? 0, arrivals ?? [], id, now);
  }

  benched(id: string): boolean {
    return this.#input.bench.some(
      (one) =>
        one.accountId === id &&
        one.until > this.#input.now &&
        (one.scope === null || one.scope === this.#scope)
    );
  }

  pastReserve(account: Account): boolean {
    return (
      account.reservePct !== null &&
      this.weekly(account.id) >= account.reservePct
    );
  }

  /**
   * Whether it can take a session now: not past its reserve, and under its
   * limits and off its bench, or past them on extra usage ({@link onExtraUsage}).
   */
  room = (account: Account): boolean =>
    !(
      (this.benched(account.id) && !this.onExtraUsage(account)) ||
      this.pastReserve(account)
    ) && this.headroom(account);

  /**
   * When an account with no room takes a session again: the latest of its
   * bench and the resets of the windows that stop it (spent, or a week past
   * its reserve). Undefined when nothing read names that moment.
   */
  backAt(account: Account): number | undefined {
    const { now, bench } = this.#input;
    const benched = bench
      .filter(
        (one) =>
          one.accountId === account.id &&
          one.until > now &&
          (one.scope === null || one.scope === this.#scope)
      )
      .map((one) => one.until);
    const reserve = account.reservePct ?? Number.POSITIVE_INFINITY;
    const resets = this.#bearing(account.id).flatMap((window) => {
      const at = windowResetAt(window);
      const stops = window.group === "weekly" ? Math.min(100, reserve) : 100;
      return at !== null && at > now && windowUsed(window, now) >= stops
        ? [at]
        : [];
    });
    const all = [...benched, ...resets];
    return all.length > 0 ? Math.max(...all) : undefined;
  }

  /**
   * Its bearing windows' use, as a sentence quotes it ("weekly 60%, Fable
   * weekly 15%" on a verified Ultra account), by length, over all models
   * before one model's; "no reading yet" when it has none.
   */
  said(id: string): string {
    const { now } = this.#input;
    const account = this.#input.accounts.find((one) => one.id === id);
    const credits =
      account && this.binding(id) >= 100 && this.onExtraUsage(account)
        ? `; past its plan, it runs on extra usage: ${this.#credits}`
        : "";
    const windows = [...this.#bearing(id)].sort(
      (a, b) =>
        (SAID_ORDER[a.group] ?? 3) - (SAID_ORDER[b.group] ?? 3) ||
        Number(a.scopeLabel !== null) - Number(b.scopeLabel !== null)
    );
    const listed = windows
      .map(
        (window) =>
          `${windowWords(window) || accountsWords.windows.another} ${pct(windowUsed(window, now))}`
      )
      .join(", ");
    return `${listed || spawnWords.account.noReading}${credits}`;
  }
}

type Choice = { account: Account; why: string } | undefined;

/** The sentence placement adds when the pace line moved back the account its strategy alone would have chosen. */
const movedBackWords = (
  named: string,
  back: { line: number; used: number; window: LimitWindow }
): string =>
  `${named} is ahead of its ${windowNoun(back.window)} (${pct(back.used)} used with ${pct(back.line)} of it gone), so it went last.`;

/** Pinned's sentence when the pace line moved the pin back and fill-first chose a backup. */
const pinMovedBackWords = (
  pin: string,
  back: { line: number; used: number; window: LimitWindow },
  named: string,
  said: string
): string =>
  `The pinned account ${pin} is ahead of its ${windowNoun(back.window)} (${pct(back.used)} used with ${pct(back.line)} of it gone), so it went last and fill-first chose ${named}, the first backup with headroom (${said}).`;

/** Pinned: the pinned account; when it is out, fill-first over the accounts that back it up. */
const pinned = (
  candidates: Account[],
  pinnedId: string | undefined,
  usage: Usage,
  name: (id: string) => string
): Choice => {
  const account = candidates.find((one) => one.id === pinnedId);
  if (account) {
    return {
      account,
      why: `${usage.name(account)} is pinned (${usage.said(account.id)}).`,
    };
  }
  const backup = byOrder(candidates.filter((one) => !one.neverBackup)).find(
    usage.headroom
  );
  return backup
    ? {
        account: backup,
        why: `The pinned account ${pinnedId ? name(pinnedId) : ""} cannot take it here, so fill-first chose ${usage.name(backup)}, the first backup with headroom (${usage.said(backup.id)}).`,
      }
    : undefined;
};

/** Fill-first: the lowest in order with headroom. */
const fillFirst = (candidates: Account[], usage: Usage): Choice => {
  const account = byOrder(candidates).find(usage.headroom);
  return account
    ? {
        account,
        why: `${usage.name(account)} is the first account in order with headroom (${usage.said(account.id)}).`,
      }
    : undefined;
};

/**
 * Spread: the account that lasts longest with this session on it ({@link
 * Usage.runsOut}, the sessions already arriving there counted): one that
 * lasts to every reset, else the one that runs out last; ties to the least
 * used binding window, then order. With nothing measured, the least used
 * binding window alone.
 */
const spread = (candidates: Account[], usage: Usage): Choice => {
  const order = strategyOrder("spread", undefined);
  const [account] = [...candidates].sort((a, b) =>
    order(usage.ranked(a), usage.ranked(b))
  );
  if (!account) {
    return undefined;
  }
  const named = usage.name(account);
  const said = usage.said(account.id);
  const out = usage.runsOut(account.id);
  if (!usage.measured(account.id)) {
    return {
      account,
      why: `No pace is measured yet, so ${named} has the most left of its tightest window (${said}).`,
    };
  }
  return {
    account,
    why:
      out === null
        ? `${named} lasts to every reset with the session on it (${said}).`
        : `No account lasts to every reset with the session on it; ${named} runs out last, at ${clockWords(out)} (${said}).`,
  };
};

/**
 * Soonest-reset: among those with headroom, by the earliest reset among its
 * bearing windows (one with no window open has none and goes after), ties
 * to most headroom, the first that can carry the load to its reset ({@link
 * Usage.runsOut}, the sessions already arriving there counted). When none
 * can, a session re-placed stays where it is (`current`); a new one goes
 * where it would run out last. Without paces, the order alone decides.
 */
const soonestReset = (
  candidates: Account[],
  usage: Usage,
  current: string | undefined
): Choice => {
  const order = strategyOrder("soonest-reset", undefined);
  const ranked = candidates
    .filter(usage.headroom)
    .sort((a, b) => order(usage.ranked(a), usage.ranked(b)));
  const carrier = ranked.find((one) => usage.runsOut(one.id) === null);
  const stays = carrier ? undefined : ranked.find((one) => one.id === current);
  const lastOut = (a: Account, b: Account) =>
    (usage.runsOut(b.id) ?? 0) - (usage.runsOut(a.id) ?? 0);
  const account = carrier ?? stays ?? [...ranked].sort(lastOut)[0];
  if (!account) {
    return undefined;
  }
  const named = usage.name(account);
  if (stays) {
    return {
      account,
      why: `No account with headroom lasts to every reset with it, so it stays on ${named} (${usage.said(account.id)}).`,
    };
  }
  const resetting = usage.resetting(account.id);
  const which = resetting ? windowWords(resetting.window) : "";
  const head = resetting
    ? `${named}'s ${which ? `${which} ` : ""}window resets soonest (${clockWords(resetting.at)}) and it has headroom (${usage.said(account.id)})`
    : `${named} has headroom and no reset ahead, as none of its windows is open yet (${usage.said(account.id)})`;
  if (!carrier) {
    const out = usage.runsOut(account.id);
    return {
      account,
      why: `${named} has headroom (${usage.said(account.id)}); no account with headroom lasts to every reset with it, and ${named} runs out last, at ${out === null ? "?" : clockWords(out)}.`,
    };
  }
  const passed = ranked
    .slice(0, ranked.indexOf(account))
    .map(
      (one) =>
        `${usage.name(one)} resets sooner but would run out at ${clockWords(usage.runsOut(one.id) ?? 0)} first`
    );
  return {
    account,
    why: `${head}${passed.length > 0 ? `; ${passed.join("; ")}` : ""}.`,
  };
};

/** The explicit pick, honoured as asked or refused with the reason; bench and reserve do not apply. */
const explicitPick = (
  input: PlacementInput,
  asked: string,
  signedIn: Account[],
  name: (id: string) => string
): Placement => {
  const pick = picked(input.accounts, asked);
  if (!pick) {
    return { ok: false, refusal: `There is no account ${asked}.` };
  }
  const pickName = name(pick.id);
  const machine = input.machineName ?? input.machineId;
  if (!signedIn.some((account) => account.id === pick.id)) {
    return {
      ok: false,
      refusal: `${pickName} is not signed in on ${machine}; sign it in there or pick another account.`,
    };
  }
  for (const [list, what] of [
    [input.projectAccounts, "project"],
    [input.taskAccounts, "task"],
  ] as const) {
    if (list && !list.includes(pick.id)) {
      return {
        ok: false,
        refusal: `${pickName} is not one of the accounts this ${what} allows (${list.map(name).join(", ") || "none"}).`,
      };
    }
  }
  return {
    ok: true,
    accountId: pick.id,
    strategy: "explicit",
    why: `${pickName} was picked for this session.`,
  };
};

/**
 * The project's account, for a start that names none of its own: it starts
 * there as one naming it would, bench and reserve aside, and is refused
 * where it is not signed in. Nothing when the project names none, or one of
 * another provider than the session's (`input.accounts` holds the session's
 * provider's alone), or one the project's or task's list leaves out: the
 * session is placed as any other.
 */
const projectPick = (
  input: PlacementInput,
  signedIn: Account[],
  name: (id: string) => string
): Placement | undefined => {
  const asked = input.projectAccount;
  const account = input.accounts.find((one) => one.id === asked?.id);
  const allows = (list: string[] | null | undefined) =>
    !(list && account) || list.includes(account.id);
  if (!(
    account &&
    allows(input.projectAccounts) &&
    allows(input.taskAccounts)
  )) {
    return;
  }
  const machine = input.machineName ?? input.machineId;
  const area = asked?.area ?? null;
  if (!signedIn.includes(account)) {
    return {
      ok: false,
      refusal:
        area === null
          ? projectAccountWords.notSignedIn(name(account.id), machine)
          : areaWords.notSignedIn(name(account.id), area, machine),
    };
  }
  return {
    ok: true,
    accountId: account.id,
    strategy: "project",
    why:
      area === null
        ? projectAccountWords.why(name(account.id))
        : areaWords.why(name(account.id), area),
  };
};

/**
 * What a start in `project` asks of placement for its account
 * ({@link PlacementInput.projectAccount}): the account in effect, and the
 * area's name (by `areaName`) when it is the area's. Nothing when the
 * project starts on none, or there is no project.
 */
export const projectAccountOf = (
  project:
    | {
        areaId: string | null;
        inEffect: Pick<SettingsInEffect, "account">;
      }
    | undefined,
  areaName: (areaId: string) => string | null
): Pick<PlacementInput, "projectAccount"> => {
  const account = project?.inEffect.account;
  if (!account?.value) {
    return {};
  }
  return {
    projectAccount: {
      id: account.value,
      area:
        account.from === "area" && project?.areaId
          ? areaName(project.areaId)
          : null,
    },
  };
};

/**
 * The accounts a running session in a project may run on, as its project's
 * list for placement (`projectAccounts`): the project's account in effect
 * (its own, else its area's) alone for
 * one on it while the project waits there at its limit (core
 * `ProjectAtLimit`), so it stays there at a rebalance and its limit; else
 * the project's own list (null: every account), so one that moves at the
 * limit moves as a session on an account its start named does.
 */
export const runningAccounts = (
  project:
    | {
        accounts: string[] | null;
        inEffect: Pick<SettingsInEffect, "account" | "accountAtLimit">;
      }
    | undefined,
  on: string | null | undefined
): string[] | null => {
  const account = project?.inEffect.account.value;
  if (
    account &&
    account === on &&
    project.inEffect.accountAtLimit.value === "wait"
  ) {
    return [account];
  }
  return project?.accounts ?? null;
};

/**
 * Of the places a start in a project could go where nothing named its
 * machine, those on machines where the project's account is signed in, in
 * their order: a start goes where its account can take it ({@link
 * projectPick}). All of them when the project names no account, or no
 * candidate's machine has it signed in: the start then goes as it did, and
 * placement says why it can't start there.
 */
export const onAccountMachines = <P extends { machineId: string }>(
  candidates: readonly P[],
  account: string | null | undefined,
  signins: readonly AccountSignin[]
): P[] => {
  if (!account) {
    return [...candidates];
  }
  const on = candidates.filter((candidate) =>
    signedInOn(signins, account, candidate.machineId)
  );
  return on.length > 0 ? on : [...candidates];
};

/** Whether `account` is signed in on `machineId`. */
export const signedInOn = (
  signins: readonly AccountSignin[],
  account: string,
  machineId: string
): boolean =>
  signins.some(
    (one) =>
      one.accountId === account &&
      one.machineId === machineId &&
      one.state === "signed-in"
  );

/** The strategy's choice among the candidates, or nothing when none of them can take it. */
const byStrategy = (
  strategy: PlacementStrategy,
  candidates: Account[],
  pinnedId: string | undefined,
  usage: Usage,
  name: (id: string) => string,
  current: string | undefined
): Choice => {
  switch (strategy) {
    case "pinned":
      return pinned(candidates, pinnedId, usage, name);
    case "fill-first":
      return fillFirst(candidates, usage);
    case "spread":
      return spread(candidates, usage);
    case "soonest-reset":
      return soonestReset(candidates, usage, current);
    default:
      return undefined;
  }
};

/**
 * The strategy's choice among the candidates, the pace line first: those
 * ahead of their week ({@link Usage.ahead}) are chosen from only when none
 * of the others can take it. When the line moved back the account the
 * strategy alone would have chosen, the sentence says so.
 */
const decide = (
  strategy: PlacementStrategy,
  candidates: Account[],
  pinnedId: string | undefined,
  usage: Usage,
  name: (id: string) => string,
  current: string | undefined
): Choice => {
  const pick = (among: Account[]) =>
    among.length > 0
      ? byStrategy(strategy, among, pinnedId, usage, name, current)
      : undefined;
  const ahead = candidates.filter((one) => usage.ahead(one.id) !== undefined);
  const chosen =
    pick(candidates.filter((one) => !ahead.includes(one))) ?? pick(ahead);
  const alone = ahead.length > 0 ? pick(candidates) : undefined;
  const back =
    chosen && alone && alone.account.id !== chosen.account.id
      ? usage.ahead(alone.account.id)
      : undefined;
  if (!(chosen && alone && back)) {
    return chosen;
  }
  const passed = usage.name(alone.account);
  return {
    account: chosen.account,
    why:
      strategy === "pinned" && alone.account.id === pinnedId
        ? pinMovedBackWords(
            passed,
            back,
            usage.name(chosen.account),
            usage.said(chosen.account.id)
          )
        : `${chosen.why} ${movedBackWords(passed, back)}`,
  };
};

/** Accounts signed in on the session's machine, and of those the ones its project and task allow. */
const eligible = (
  input: PlacementInput
): { allowed: Account[]; signedIn: Account[] } => {
  const signedIn = input.accounts.filter((account) =>
    input.signins.some(
      (one) =>
        one.accountId === account.id &&
        one.machineId === input.machineId &&
        one.state === "signed-in"
    )
  );
  const allows = (list: string[] | null | undefined, id: string) =>
    !list || list.includes(id);
  return {
    signedIn,
    allowed: signedIn.filter(
      (account) =>
        allows(input.projectAccounts, account.id) &&
        allows(input.taskAccounts, account.id)
    ),
  };
};

/**
 * The accounts that can take the session, and how they are read. Plan room
 * first: a keep-going account's extra usage (core `AtPlanLimit`) is room for
 * a new session only when no account it may run on has plan room, or when
 * Pinned pins that account, since the pin and its setting together say to
 * stay there.
 */
const roomFor = (
  input: PlacementInput,
  allowed: Account[],
  pinnedId: string | undefined
): { candidates: Account[]; usage: Usage } => {
  const among = (usage: Usage) => ({
    usage,
    candidates: allowed.filter((account) => usage.room(account)),
  });
  const plan = among(new Usage(input));
  const onPin = among(
    new Usage(input, "it is pinned, and says to keep going at a plan limit")
  );
  const pinnedOnCredits =
    input.routing[input.kind].strategy === "pinned" &&
    !plan.candidates.some((one) => one.id === pinnedId) &&
    onPin.candidates.some((one) => one.id === pinnedId);
  if (pinnedOnCredits) {
    return onPin;
  }
  return plan.candidates.length > 0
    ? plan
    : among(
        new Usage(
          input,
          "no account this session may run on has plan room, and it says to keep going at a plan limit"
        )
      );
};

/**
 * The strategies' part: drop the benched, the past-reserve and the spent
 * ({@link roomFor}), prefer the delegate type's account, else the kind's
 * strategy. With no account left, nothing starts: the refusal says when the
 * first one is back ({@link noRoomRefusal}).
 */
const choose = (
  input: PlacementInput,
  allowed: Account[],
  name: (id: string) => string
): Placement => {
  const choice = input.routing[input.kind];
  const pinnedId = pinnedOf(choice, input.accounts);
  const { usage, candidates } = roomFor(input, allowed, pinnedId);
  const outNote = allowed
    .filter((account) => !candidates.includes(account))
    .map((account) => {
      if (usage.creditsWait(account)) {
        return `${usage.name(account)} is past its plan, and its extra usage is used only when no account has plan room`;
      }
      if (usage.benched(account.id)) {
        return `${usage.name(account)} is benched until its window resets`;
      }
      if (usage.pastReserve(account)) {
        return `${usage.name(account)} is past its ${account.reservePct}% reserve`;
      }
      return usage.read(account)
        ? `${usage.name(account)} is at its limit`
        : `${usage.name(account)}'s limits are unread`;
    });
  const out = outNote.length > 0 ? ` (${outNote.join("; ")})` : "";

  const preferred = candidates.find((one) => one.id === input.typeAccount);
  if (preferred) {
    return {
      ok: true,
      accountId: preferred.id,
      strategy: "type",
      why: `The delegate type prefers ${usage.name(preferred)}.${out}`,
    };
  }

  const decided = decide(
    choice.strategy,
    candidates,
    pinnedId,
    usage,
    name,
    input.current
  );
  if (decided) {
    return {
      ok: true,
      accountId: decided.account.id,
      strategy: choice.strategy,
      why: `${decided.why}${out}`,
    };
  }
  return {
    ok: false,
    refusal: noRoomRefusal(
      allowed.filter((account) => !candidates.includes(account)),
      usage,
      input.now
    ),
  };
};

/** Why an account has no room now, as {@link noRoomRefusal} groups them. */
const NO_ROOM_GROUPS = [
  "Benched",
  "Past the reserve",
  "At the limit",
  "Limits unread",
] as const;

/**
 * Why nothing can start: no account it may run on has room now. In the
 * error formula (DESIGN.md, Voice): what happened, then the way on (the account
 * back first and when, in the words the account surfaces say a reset in, or
 * that no reading says when), then each account by why it has no room and
 * when it is back, the detail for whoever wants it.
 */
const noRoomRefusal = (full: Account[], usage: Usage, now: number): string => {
  const backs = full.map((account) => ({
    account,
    at: usage.backAt(account),
  }));
  let first: { account: Account; at: number } | undefined;
  for (const { account, at } of backs) {
    if (at !== undefined && (!first || at < first.at)) {
      first = { account, at };
    }
  }
  const wayOn = first
    ? `${usage.name(first.account)} is back ${full.length > 1 ? "first, " : ""}in ${spanWords(first.at - now)} (${clockWords(first.at)}): start it again then, or sign in another account.`
    : "No reading says when one is back: sign in another account, or start it again once one resets.";
  const groupOf = (account: Account): (typeof NO_ROOM_GROUPS)[number] => {
    if (usage.benched(account.id)) {
      return "Benched";
    }
    if (usage.pastReserve(account)) {
      return "Past the reserve";
    }
    return usage.read(account) ? "At the limit" : "Limits unread";
  };
  const groups = NO_ROOM_GROUPS.flatMap((group) => {
    const named = backs
      .filter(({ account }) => groupOf(account) === group)
      .map(({ account, at }) =>
        at === undefined
          ? usage.name(account)
          : `${usage.name(account)} until ${clockWords(at)}`
      );
    return named.length > 0 ? [`${group}: ${named.join(", ")}.`] : [];
  });
  return [
    "No account this session may run on has room for it now.",
    wayOn,
    ...groups,
  ].join(" ");
};

/**
 * One other account of a session's provider as a carry off its limit reads
 * it (at-limit.ts `decideStop`): what placement knows of it for the
 * session's model on its machine, by the rules {@link place} applies.
 */
export interface AccountRow {
  /** The burn already arriving there that its pace does not count yet ({@link arrivingBurn}). */
  arrivals: Arrival[];
  /** When it takes sessions again once benched, spent or past its reserve ({@link Usage.backAt}); null when nothing read names it. */
  backAt: number | null;
  /** Until when it is benched for the session's model; null when it isn't. */
  benchedUntil: number | null;
  createdAt: number;
  id: string;
  neverBackup: boolean;
  /** The list that keeps it out: the session's project's, or its task's; null when both allow it. */
  notAllowedBy: "project" | "task" | null;
  order: number;
  organization: string | null;
  /** Its reserve, percent of its week, when its week is past it; null otherwise. */
  pastReserve: number | null;
  /** Whether its limits have been read at all. */
  read: boolean;
  /** Whether it is signed in on the session's machine. */
  signedIn: boolean;
  /** The windows that limit the session on it, with their paces ({@link Usage.carryWindows}). */
  windows: PacedWindow[];
}

/**
 * `input` with the project's and the task's account lists kept only where
 * they hold an account of the session's provider (`input.accounts` holds
 * that provider's alone): a list of Claude accounts says nothing of a
 * session on a ChatGPT model, as the project's account says nothing of it
 * ({@link projectPick}).
 */
const ofProvider = (input: PlacementInput): PlacementInput => {
  const kept = (list: string[] | null | undefined) =>
    list?.some((id) => input.accounts.some((one) => one.id === id))
      ? list
      : null;
  return {
    ...input,
    projectAccounts: kept(input.projectAccounts),
    taskAccounts: kept(input.taskAccounts),
  };
};

/** Every account of `input.accounts` but `leaving`, as a carry off `leaving`'s limit reads it ({@link AccountRow}). */
export const accountRows = (
  asked: PlacementInput,
  leaving: string
): AccountRow[] => {
  const input = ofProvider(asked);
  const usage = new Usage(input);
  const scope = modelScope(input.model);
  const { signedIn, allowed } = eligible(input);
  const listed = (list: string[] | null | undefined, id: string) =>
    !list || list.includes(id);
  return input.accounts
    .filter((account) => account.id !== leaving)
    .map((account) => {
      const benched = input.bench
        .filter(
          (one) =>
            one.accountId === account.id &&
            one.until > input.now &&
            (one.scope === null || one.scope === scope)
        )
        .map((one) => one.until);
      let notAllowedBy: AccountRow["notAllowedBy"] = null;
      if (!listed(input.projectAccounts, account.id)) {
        notAllowedBy = "project";
      } else if (!listed(input.taskAccounts, account.id)) {
        notAllowedBy = "task";
      }
      return {
        id: account.id,
        organization: account.identity?.organization || null,
        order: account.order,
        createdAt: account.createdAt,
        neverBackup: account.neverBackup,
        signedIn: signedIn.includes(account),
        notAllowedBy: allowed.includes(account) ? null : notAllowedBy,
        read: usage.read(account),
        benchedUntil: benched.length > 0 ? Math.max(...benched) : null,
        pastReserve: usage.pastReserve(account) ? account.reservePct : null,
        backAt: usage.backAt(account) ?? null,
        windows: usage.carryWindows(account.id),
        arrivals: (input.arrivals ?? []).filter(
          (one) => one.accountId === account.id
        ),
      };
    });
};

export const place = (asked: PlacementInput): Placement => {
  const input = ofProvider(asked);
  const byId = new Map(input.accounts.map((account) => [account.id, account]));
  const name = (id: string): string => {
    const account = byId.get(id);
    return account ? accountNameAmong(account, input.accounts) : id;
  };
  const machine = input.machineName ?? input.machineId;

  // A fork reuses its origin's cache, so it runs where its origin ran.
  if (input.fork) {
    const { accountId } = input.fork;
    return accountId
      ? {
          ok: true,
          accountId,
          strategy: "fork",
          why: `A fork runs on the account of the session it forks: ${name(accountId)}.`,
        }
      : {
          ok: false,
          refusal: `A fork runs where the session it forks ran, and that session ran on Claude Code's own login on ${machine}, not on a CawCo account. Send it a message first so it moves onto one, then fork it.`,
        };
  }

  const { signedIn, allowed } = eligible(input);
  if (input.explicit) {
    return explicitPick(input, input.explicit, signedIn, name);
  }
  const project = projectPick(input, signedIn, name);
  if (project) {
    return project;
  }
  if (signedIn.length === 0) {
    return { ok: false, refusal: noAccountRefusal(machine) };
  }
  if (allowed.length === 0) {
    const limits = [
      ...(input.projectAccounts ?? []),
      ...(input.taskAccounts ?? []),
    ];
    return {
      ok: false,
      refusal: `None of the accounts signed in on ${machine} (${signedIn.map((account) => name(account.id)).join(", ")}) is allowed here: the project or task limits this session to ${limits.map(name).join(", ")}.`,
    };
  }
  // One account with room: no choice to make. Without room, the refusal.
  const [only] = allowed;
  if (allowed.length === 1 && only && new Usage(input).room(only)) {
    return {
      ok: true,
      accountId: only.id,
      strategy: "only",
      why: `${name(only.id)} is the only account this session may run on here.`,
    };
  }
  return choose(input, allowed, name);
};

/** What placing a session reads of `provider`'s accounts: its accounts, their sign-ins, readings and the bench. */
export const accountFacts = (db: DbShape, provider: string) => ({
  accounts: db.accounts
    .list()
    .filter((account) => account.provider === provider),
  signins: db.accounts.signins(),
  readings: db.accounts.readings(),
  bench: db.accounts.bench(),
});
