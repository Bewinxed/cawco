import {
  type Account,
  type AccountBench,
  type AccountReading,
  type AccountSignin,
  accountName,
  type LimitWindow,
  modelScope,
  type PlacementExplain,
  type PlacementStrategy,
  type ProviderRouting,
} from "@cawco/core";

/**
 * Which account a new session runs on (core `PlacementExplain`), decided once,
 * when it starts: prompt caches are per organization, so a running session is
 * moved only at its limit. Pure: every input is read by the caller.
 */

export interface PlacementInput {
  /** Every account of the session's provider. */
  accounts: Account[];
  bench: AccountBench[];
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

  /** When its 5-hour window resets; never, for one with no window open. */
  resetOf(id: string): number {
    const window = this.#window(id, "session");
    const at = window?.resetsAt ? Date.parse(window.resetsAt) : null;
    return at !== null && at > this.#input.now ? at : Number.POSITIVE_INFINITY;
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

/** Soonest-reset: among those with headroom, the earliest 5-hour reset; no window last; ties to most headroom. */
const soonestReset = (candidates: Account[], usage: Usage): Choice => {
  const [account] = candidates
    .filter(usage.headroom)
    .sort(
      (a, b) =>
        usage.resetOf(a.id) - usage.resetOf(b.id) ||
        usage.binding(a.id) - usage.binding(b.id)
    );
  if (!account) {
    return undefined;
  }
  const reset = usage.resetOf(account.id);
  return {
    account,
    why: Number.isFinite(reset)
      ? `${accountName(account)}'s 5-hour window resets soonest (${new Date(reset).toISOString()}) and it has headroom (${usage.said(account.id)}).`
      : `${accountName(account)} has headroom and no account has a 5-hour window open (${usage.said(account.id)}).`,
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
  const candidates = allowed.filter(
    (account) => !(usage.benched(account.id) || usage.pastReserve(account))
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
  // Nothing left: the pinned account, else the first, anyway.
  const fallback =
    allowed.find((account) => account.id === pinnedId) ?? byOrder(allowed)[0];
  return {
    ok: true,
    accountId: fallback?.id ?? null,
    strategy: choice.strategy,
    why: `No allowed account has room for it now${out}, so it starts on ${fallback ? accountName(fallback) : "the machine's own login"} anyway.`,
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
    return {
      ok: true,
      accountId,
      strategy: "fork",
      why: accountId
        ? `A fork runs on the account of the session it forks: ${name(accountId)}.`
        : "A fork runs on the account of the session it forks, which ran on the machine's own login.",
    };
  }

  const { allowed, signedIn } = eligible(input);
  if (input.explicit) {
    return explicitPick(input, input.explicit, signedIn, name);
  }
  if (signedIn.length === 0) {
    return {
      ok: true,
      accountId: null,
      strategy: "none",
      why: `No account is signed in on ${machine}, so the session runs on the machine's own Claude Code login.`,
    };
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
