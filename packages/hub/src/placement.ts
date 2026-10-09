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
  bench: AccountBench[];
  /**
   * The session's expected burn in weighted tokens an hour (a running one's
   * own, a new one's kind's recent average), which soonest-reset adds to an
   * account's pace in its carry test; null or absent when unmeasured.
   */
  burn?: number | null;
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
   * When the account runs out before a window of it resets, at its pace with
   * the session's burn added (`burn` over what a percent of that window
   * costs); null when it lasts to every reset, or nothing measures it. A
   * window not open yet resets {@link SESSION_WINDOW_MS} from now if it is
   * the 5-hour one, and is no limit otherwise.
   */
  runsOut(id: string): number | null {
    const { paces } = this.#input;
    if (!paces) {
      return null;
    }
    const outs = [
      this.#runsOutOf(id, "session", null),
      this.#runsOutOf(id, "weekly_all", null),
      this.#scope ? this.#runsOutOf(id, "weekly_scoped", this.#scope) : null,
    ].filter((out): out is number => out !== null);
    return outs.length > 0 ? Math.min(...outs) : null;
  }

  /** {@link runsOut} for one window of the account. */
  #runsOutOf(
    id: string,
    kind: string,
    scopeLabel: string | null
  ): number | null {
    const { paces, burn, now } = this.#input;
    const window = this.#window(id, kind);
    const at = window?.resetsAt ? Date.parse(window.resetsAt) : null;
    const open = at !== null && at > now;
    if (!open && kind !== "session") {
      return null;
    }
    const reset = open && at !== null ? at : now + SESSION_WINDOW_MS;
    const pace = paces
      ?.get(id)
      ?.find((one) => one.kind === kind && one.scopeLabel === scopeLabel);
    const added = burn && pace?.tokensPerPct ? burn / pace.tokensPerPct : 0;
    const rate = (pace?.pace ?? 0) + added;
    if (rate <= 0) {
      return null;
    }
    const out = now + (Math.max(100 - used(window, now), 0) / rate) * HOUR_MS;
    return out < reset ? out : null;
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
 * first that can carry the load to its reset ({@link Usage.runsOut}). When
 * none can, the first anyway. Without paces, the order alone decides.
 */
const soonestReset = (candidates: Account[], usage: Usage): Choice => {
  const ranked = candidates
    .filter(usage.headroom)
    .sort(
      (a, b) =>
        usage.resetOf(a.id) - usage.resetOf(b.id) ||
        usage.binding(a.id) - usage.binding(b.id)
    );
  const carrier = ranked.find((one) => usage.runsOut(one.id) === null);
  const account = carrier ?? ranked[0];
  if (!account) {
    return undefined;
  }
  const named = accountName(account);
  const head = usage.opened(account.id)
    ? `${named}'s 5-hour window resets soonest (${clockWords(usage.resetOf(account.id))}) and it has headroom (${usage.said(account.id)})`
    : `${named} has headroom and no window open yet (counts as resetting in 5h; ${usage.said(account.id)})`;
  if (!carrier) {
    const out = usage.runsOut(account.id);
    return {
      account,
      why: `${head}; it would run out at ${out === null ? "?" : clockWords(out)} at this pace, but no account with headroom lasts to its reset.`,
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
  name: (id: string) => string
): Choice => {
  switch (strategy) {
    case "pinned":
      return pinned(candidates, pinnedId, usage, name);
    case "fill-first":
      return fillFirst(candidates, usage);
    case "spread":
      return spread(candidates, usage);
    case "soonest-reset":
      return soonestReset(candidates, usage);
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
  const decided = decide(choice.strategy, candidates, pinnedId, usage, name);
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
