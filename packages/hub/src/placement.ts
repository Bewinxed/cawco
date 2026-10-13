import {
  type Account,
  type AccountBench,
  type AccountReading,
  type AccountSignin,
  accountName,
  clockWords,
  type LimitWindow,
  modelScope,
  type PlacementExplain,
  type PlacementStrategy,
  type ProviderRouting,
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
  /**
   * The account a running session leaves at its limit. Placement then looks
   * for another to carry it: never this one, only one with headroom, and none
   * at all ({@link Placement}'s `accountId` null) rather than one anyway.
   */
  exclude?: string;
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
  | ({ ok: true } & PlacementExplain)
  | { ok: false; refusal: string };

/**
 * Why a Claude session can't start on a machine with no CawCo account
 * signed in: it never runs on the machine's own Claude Code login.
 */
export const noAccountRefusal = (machine: string): string =>
  `No Claude account is signed in on ${machine}. Add one in Configure → Accounts and sign it in there.`;

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

const byOrder = (list: Account[]): Account[] =>
  [...list].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

/** What placement reads of each account's windows, for one model scope at one moment. */
class Usage {
  readonly #input: PlacementInput;
  readonly #scope: string | null;

  constructor(input: PlacementInput) {
    this.#input = input;
    this.#scope = modelScope(input.model);
  }

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

  headroom = (account: Account): boolean => this.binding(account.id) < 100;

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
    const kinds: [string, string | null][] = [
      ["session", null],
      ["weekly_all", null],
      ...(this.#scope
        ? [["weekly_scoped", this.#scope] as [string, string | null]]
        : []),
    ];
    const paceOf = (kind: string, scopeLabel: string | null) =>
      paces
        .get(id)
        ?.find((one) => one.kind === kind && one.scopeLabel === scopeLabel);
    const windows: CarryWindow[] = kinds.map(([kind, scopeLabel]) => {
      const window = this.#window(id, kind);
      return {
        kind,
        scopeLabel,
        resetsAt: window?.resetsAt ?? null,
        utilization: window?.percent ?? 0,
        pace: paceOf(kind, scopeLabel)?.pace ?? null,
      };
    });
    return runsOutWith(
      windows,
      (window) => {
        const perPct = paceOf(window.kind, window.scopeLabel)?.tokensPerPct;
        return perPct
          ? ((burn ?? 0) + arrivingBurn(arrivals ?? [], id, window, now)) /
              perPct
          : 0;
      },
      now
    );
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

  said(id: string): string {
    return `5-hour ${pct(this.session(id))}, weekly ${pct(this.weekly(id))}`;
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
    return { account, why: `${accountName(account)} is pinned.` };
  }
  const backup = byOrder(candidates.filter((one) => !one.neverBackup)).find(
    usage.headroom
  );
  return backup
    ? {
        account: backup,
        why: `The pinned account ${pinnedId ? name(pinnedId) : ""} cannot take it here, so fill-first chose ${accountName(backup)}, the first backup with headroom (${usage.said(backup.id)}).`,
      }
    : undefined;
};

/** Fill-first: the lowest in order with headroom. */
const fillFirst = (candidates: Account[], usage: Usage): Choice => {
  const account = byOrder(candidates).find(usage.headroom);
  return account
    ? {
        account,
        why: `${accountName(account)} is the first account in order with headroom (${usage.said(account.id)}).`,
      }
    : undefined;
};

/** Spread: the lowest binding use. */
const spread = (candidates: Account[], usage: Usage): Choice => {
  const [account] = [...candidates].sort(
    (a, b) => usage.binding(a.id) - usage.binding(b.id) || a.order - b.order
  );
  return account
    ? {
        account,
        why: `${accountName(account)} has the lowest use (${usage.said(account.id)}).`,
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
  const ranked = candidates
    .filter(usage.headroom)
    .sort(
      (a, b) =>
        usage.resetOf(a.id) - usage.resetOf(b.id) ||
        usage.binding(a.id) - usage.binding(b.id)
    );
  const carrier = ranked.find((one) => usage.runsOut(one.id) === null);
  const stays = carrier ? undefined : ranked.find((one) => one.id === current);
  const lastOut = (a: Account, b: Account) =>
    (usage.runsOut(b.id) ?? 0) - (usage.runsOut(a.id) ?? 0);
  const account = carrier ?? stays ?? [...ranked].sort(lastOut)[0];
  if (!account) {
    return undefined;
  }
  const named = accountName(account);
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
        `${accountName(one)} resets sooner but would run out at ${clockWords(usage.runsOut(one.id) ?? 0)} first`
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
  const pickName = accountName(pick);
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
 * The strategies' part: drop the benched and the past-reserve, prefer the
 * delegate type's account, else the kind's strategy, else the pinned or
 * first account anyway.
 */
const choose = (
  input: PlacementInput,
  allowed: Account[],
  name: (id: string) => string
): Placement => {
  const usage = new Usage(input);
  // A session leaving its account at the limit goes only where there is room.
  const candidates = allowed.filter(
    (account) =>
      !(usage.benched(account.id) || usage.pastReserve(account)) &&
      (input.exclude === undefined || usage.headroom(account))
  );
  const outNote = allowed
    .filter((account) => !candidates.includes(account))
    .map((account) =>
      usage.benched(account.id)
        ? `${accountName(account)} is benched until its window resets`
        : `${accountName(account)} is past its ${account.reservePct}% reserve`
    );
  const out = outNote.length > 0 ? ` (${outNote.join("; ")}.)` : "";

  const preferred = candidates.find((one) => one.id === input.typeAccount);
  if (preferred) {
    return {
      ok: true,
      accountId: preferred.id,
      strategy: "type",
      why: `The delegate type prefers ${accountName(preferred)}.${out}`,
    };
  }

  const choice = input.routing[input.kind];
  const pinnedId = choice.pinnedAccountId ?? byOrder(input.accounts)[0]?.id;
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
  if (input.exclude !== undefined) {
    return {
      ok: true,
      accountId: null,
      strategy: "none",
      why: `No other account this session may run on has room for it now${out}.`,
    };
  }
  // Nothing left: the pinned account, else the first, anyway.
  const fallback =
    allowed.find((account) => account.id === pinnedId) ?? byOrder(allowed)[0];
  return {
    ok: true,
    accountId: fallback?.id ?? null,
    strategy: choice.strategy,
    why: fallback
      ? `No allowed account has room for it now${out}, so it starts on ${accountName(fallback)} anyway.`
      : `No allowed account has room for it now${out}.`,
  };
};

export const place = (input: PlacementInput): Placement => {
  const byId = new Map(input.accounts.map((account) => [account.id, account]));
  const name = (id: string): string => {
    const account = byId.get(id);
    return account ? accountName(account) : id;
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

  const eligibleHere = eligible(input);
  const { signedIn } = eligibleHere;
  const allowed = eligibleHere.allowed.filter(
    (account) => account.id !== input.exclude
  );
  if (input.exclude !== undefined) {
    return choose(input, allowed, name);
  }
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
      refusal: `None of the accounts signed in on ${machine} (${signedIn.map(accountName).join(", ")}) is allowed here: the project or task limits this session to ${limits.map(name).join(", ")}.`,
    };
  }
  // One account: no choice to make.
  const [only] = allowed;
  if (allowed.length === 1 && only) {
    return {
      ok: true,
      accountId: only.id,
      strategy: "only",
      why: `${accountName(only)} is the only account this session may run on here.`,
    };
  }
  return choose(input, allowed, name);
};
