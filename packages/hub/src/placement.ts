import {
  type Account,
  type AccountBench,
  type AccountReading,
  type AccountSignin,
  accountNameAmong,
  clockWords,
  configurePage,
  keepsGoingOnExtraUsage,
  type LimitWindow,
  modelScope,
  type PlacementExplain,
  type PlacementStrategy,
  type ProviderRouting,
  type StrategyChoice,
  spanWords,
} from "@cawco/core";
import type { AccountPaces } from "./forecast";

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
  /** The project's allow-list; null or absent: every account. */
  projectAccounts?: string[] | null;
  readings: AccountReading[];
  routing: ProviderRouting;
  signins: AccountSignin[];
  /** The task's allow-list (`accounts:`); null or absent: every account. */
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

/** Each harness as a sentence names it. */
const HARNESS_NAMES: Record<string, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  pi: "pi",
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
  `${machine} hasn't said yet whether it can run ${HARNESS_NAMES[harness] ?? harness}: its agent is still checking. Start the session again in a moment. Nothing was started.`;

/** A window's use now: one whose reset has passed with no newer reading is a fresh window. */
const used = (window: LimitWindow | undefined, now: number): number => {
  if (!window) {
    return 0;
  }
  if (window.resetsAt && Date.parse(window.resetsAt) <= now) {
    return 0;
  }
  return window.percent;
};

const pct = (value: number): string => `${Math.round(value)}%`;

const HOUR_MS = 3_600_000;
/** A 5-hour window's length: one not open yet opens at the session's first use. */
export const SESSION_WINDOW_MS = 5 * HOUR_MS;
/** How long each window kind runs: when the current one opened, from its reset. */
export const WINDOW_MS: Record<string, number> = {
  session: SESSION_WINDOW_MS,
  weekly_all: 7 * 24 * HOUR_MS,
  weekly_scoped: 7 * 24 * HOUR_MS,
};

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

/** One window of an account as the run-out test reads it. */
export interface CarryWindow {
  kind: string;
  /** Percent an hour since it opened; null when unmeasured. */
  pace: number | null;
  resetsAt: string | null;
  scopeLabel: string | null;
  utilization: number;
}

/**
 * The burn arriving on `accountId` that `window`'s pace misses, weighted
 * tokens an hour: each arrival's burn times the part of the window so far it
 * was not there for (all of it in a window not open yet; none for one there
 * since the window opened).
 */
export const arrivingBurn = (
  arrivals: readonly Arrival[],
  accountId: string,
  window: Pick<CarryWindow, "kind" | "resetsAt">,
  now: number
): number => {
  const reset = window.resetsAt ? Date.parse(window.resetsAt) : null;
  const opened =
    reset !== null && reset > now
      ? reset - (WINDOW_MS[window.kind] ?? SESSION_WINDOW_MS)
      : now;
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
 * reset. A window not open yet is a fresh 5-hour one (resetting 5 hours from
 * now, from nothing used) or no limit; an account with no 5-hour window read
 * has a fresh one. The one test placement's carry test and rebalance's
 * moves both run.
 */
export const runsOutWith = (
  windows: readonly CarryWindow[],
  added: (window: CarryWindow) => number,
  now: number
): number | null => {
  const all = windows.some((one) => one.kind === "session")
    ? windows
    : [
        ...windows,
        {
          kind: "session",
          scopeLabel: null,
          pace: null,
          resetsAt: null,
          utilization: 0,
        },
      ];
  let soonest: number | null = null;
  for (const window of all) {
    const at = window.resetsAt ? Date.parse(window.resetsAt) : null;
    const open = at !== null && at > now;
    if (!open && window.kind !== "session") {
      continue;
    }
    const reset = open && at !== null ? at : now + SESSION_WINDOW_MS;
    const spent = open ? window.utilization : 0;
    const rate = (window.pace ?? 0) + added(window);
    if (rate <= 0) {
      continue;
    }
    const out = now + (Math.max(100 - spent, 0) / rate) * HOUR_MS;
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

/** What the four strategies order accounts by: fill-first order, binding use, and when the 5-hour window resets. */
export interface Ranked {
  /** The higher of its 5-hour and weekly use, percent ({@link Usage.binding}). */
  binding: number;
  createdAt: number;
  id: string;
  order: number;
  /** When its 5-hour window resets; one not open yet counts as resetting 5 hours from now ({@link Usage.resetOf}). */
  sessionReset: number;
}

/** Fill-first: lowest in order first, older first among equals. */
const byFillFirst = (
  a: Pick<Ranked, "createdAt" | "order">,
  b: Pick<Ranked, "createdAt" | "order">
): number => a.order - b.order || a.createdAt - b.createdAt;

/**
 * The kind's strategy as an ordering, best first: the one each strategy below
 * picks from, and the order at-limit's decision (at-limit.ts `decideStop`)
 * weighs the accounts that fit in. Pinned puts the pin first, then fill-first
 * over the rest; fill-first goes by order; spread by lowest binding use, then
 * order; soonest-reset by the earliest 5-hour reset, then lowest binding use.
 */
export const strategyOrder =
  (strategy: PlacementStrategy, pinnedId: string | undefined) =>
  (a: Ranked, b: Ranked): number => {
    switch (strategy) {
      case "pinned":
        return (
          Number(b.id === pinnedId) - Number(a.id === pinnedId) ||
          byFillFirst(a, b)
        );
      case "spread":
        return a.binding - b.binding || a.order - b.order;
      case "soonest-reset":
        return a.sessionReset - b.sessionReset || a.binding - b.binding;
      case "fill-first":
        return byFillFirst(a, b);
    }
  };

const byOrder = (list: Account[]): Account[] => [...list].sort(byFillFirst);

/** The account the pinned strategy pins: the one its choice names, else the first in fill-first order. */
export const pinnedOf = (
  choice: StrategyChoice,
  accounts: Account[]
): string | undefined => choice.pinnedAccountId ?? byOrder(accounts)[0]?.id;

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

  #window(id: string, kind: string): LimitWindow | undefined {
    const windows =
      this.#input.readings.find((one) => one.accountId === id)?.windows ?? [];
    return windows.find(
      (w) =>
        w.kind === kind &&
        (kind !== "weekly_scoped" || w.scopeLabel === this.#scope)
    );
  }

  session(id: string): number {
    return used(this.#window(id, "session"), this.#input.now);
  }

  weekly(id: string): number {
    const { now } = this.#input;
    const scoped = this.#scope
      ? used(this.#window(id, "weekly_scoped"), now)
      : 0;
    return Math.max(used(this.#window(id, "weekly_all"), now), scoped);
  }

  /** The higher of its 5-hour and weekly use: what stops it first. */
  binding(id: string): number {
    return Math.max(this.session(id), this.weekly(id));
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

  /** Whether its 5-hour window is open: it has a reset still ahead. */
  opened(id: string): boolean {
    const window = this.#window(id, "session");
    return !!window?.resetsAt && Date.parse(window.resetsAt) > this.#input.now;
  }

  /**
   * When its 5-hour window resets. One with no window open counts as opening
   * now, so as resetting {@link SESSION_WINDOW_MS} from now: that is when it
   * would, since the window starts at its first use.
   */
  resetOf(id: string): number {
    const window = this.#window(id, "session");
    return this.opened(id) && window?.resetsAt
      ? Date.parse(window.resetsAt)
      : this.#input.now + SESSION_WINDOW_MS;
  }

  /** What the strategies order it by ({@link strategyOrder}). */
  ranked = (account: Account): Ranked => ({
    id: account.id,
    order: account.order,
    createdAt: account.createdAt,
    binding: this.binding(account.id),
    sessionReset: this.resetOf(account.id),
  });

  /**
   * The windows that limit this session on account `id` (its 5-hour, its
   * week, its model's week), as the run-out test reads them: each one's use
   * as read, its pace, and what a percent of it costs in weighted tokens
   * (null when unmeasured, or with no paces given).
   */
  carryWindows(id: string): PacedWindow[] {
    const kinds: [string, string | null][] = [
      ["session", null],
      ["weekly_all", null],
      ...(this.#scope
        ? [["weekly_scoped", this.#scope] as [string, string | null]]
        : []),
    ];
    return kinds.map(([kind, scopeLabel]) => {
      const window = this.#window(id, kind);
      const pace = this.#input.paces
        ?.get(id)
        ?.find((one) => one.kind === kind && one.scopeLabel === scopeLabel);
      return {
        kind,
        scopeLabel,
        resetsAt: window?.resetsAt ?? null,
        utilization: window?.percent ?? 0,
        pace: pace?.pace ?? null,
        tokensPerPct: pace?.tokensPerPct ?? null,
      };
    });
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
   * bench and the resets of the windows that stop it (spent, or past its
   * reserve). Undefined when nothing read names that moment.
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
    const stopping = [
      [this.#window(account.id, "session"), 100],
      [this.#window(account.id, "weekly_all"), reserve],
      ...(this.#scope
        ? [[this.#window(account.id, "weekly_scoped"), reserve] as const]
        : []),
    ] as const;
    const resets = stopping.flatMap(([window, reservePct]) =>
      window?.resetsAt &&
      used(window, now) >= Math.min(100, reservePct) &&
      Date.parse(window.resetsAt) > now
        ? [Date.parse(window.resetsAt)]
        : []
    );
    const all = [...benched, ...resets];
    return all.length > 0 ? Math.max(...all) : undefined;
  }

  said(id: string): string {
    const account = this.#input.accounts.find((one) => one.id === id);
    const credits =
      account && this.binding(id) >= 100 && this.onExtraUsage(account)
        ? `; past its plan, it runs on extra usage: ${this.#credits}`
        : "";
    return `5-hour ${pct(this.session(id))}, weekly ${pct(this.weekly(id))}${credits}`;
  }
}

type Choice = { account: Account; why: string } | undefined;

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

/** Spread: the lowest binding use. */
const spread = (candidates: Account[], usage: Usage): Choice => {
  const order = strategyOrder("spread", undefined);
  const [account] = [...candidates].sort((a, b) =>
    order(usage.ranked(a), usage.ranked(b))
  );
  return account
    ? {
        account,
        why: `${usage.name(account)} has the lowest use (${usage.said(account.id)}).`,
      }
    : undefined;
};

/**
 * Soonest-reset: among those with headroom, by 5-hour reset (one with no
 * window open as resetting 5 hours from now), ties to most headroom, the
 * first that can carry the load to its reset ({@link Usage.runsOut}, the
 * sessions already arriving there counted). When none can, a session
 * re-placed stays where it is (`current`); a new one goes where it would run
 * out last. Without paces, the order alone decides.
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
      why: `No account with headroom lasts to its reset with it, so it stays on ${named} (${usage.said(account.id)}).`,
    };
  }
  const head = usage.opened(account.id)
    ? `${named}'s 5-hour window resets soonest (${clockWords(usage.resetOf(account.id))}) and it has headroom (${usage.said(account.id)})`
    : `${named} has headroom and no window open yet (counts as resetting in 5h; ${usage.said(account.id)})`;
  if (!carrier) {
    const out = usage.runsOut(account.id);
    return {
      account,
      why: `${named} has headroom (${usage.said(account.id)}); no account with headroom lasts to its reset with it, and ${named} runs out last, at ${out === null ? "?" : clockWords(out)}.`,
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

/** The strategy's choice among the candidates, or nothing when none of them can take it. */
const decide = (
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
 * error formula (WORDS.md): what happened, then the way on (the account
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

/** Every account of `input.accounts` but `leaving`, as a carry off `leaving`'s limit reads it ({@link AccountRow}). */
export const accountRows = (
  input: PlacementInput,
  leaving: string
): AccountRow[] => {
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

export const place = (input: PlacementInput): Placement => {
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
