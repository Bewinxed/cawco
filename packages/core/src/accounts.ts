/**
 * Accounts: several sign-ins per provider, one of which each session runs on.
 *
 * An account's credential lives only on the machines signed in to it, in that
 * account's own Claude Code config dir, made by Claude Code's own
 * `claude auth login`. The hub knows an account by its id and its identity
 * (the email and organization the CLI reports), never by anything secret.
 *
 * Browser-safe: types and pure functions only.
 */

import type { LimitWindow } from "./usage/types";

/** Who bills the account. One provider for now; the column is generic. */
export type AccountProvider = "anthropic";

/**
 * How the account signs in: a Claude subscription (`claude auth login`), or a
 * Console organization billed by API usage (`claude auth login --console`).
 */
export type AccountKind = "subscription" | "console";

export const ACCOUNT_KINDS: readonly AccountKind[] = [
  "subscription",
  "console",
];

/** The colour an account is drawn in: the `--account-<name>` token. */
export type AccountHue = "amber" | "blue" | "cyan" | "green" | "orange";

export const ACCOUNT_HUES: readonly AccountHue[] = [
  "amber",
  "blue",
  "cyan",
  "green",
  "orange",
];

/**
 * Who an account is, as Claude Code's initialize response reports it
 * (`account.email`, `account.organization` — the organization's name).
 */
export interface AccountIdentity {
  email: string;
  organization: string;
}

export interface Account {
  createdAt: number;
  /** The email it is signed in as ({@link identity}'s); null until its first sign-in. */
  email: string | null;
  hue: AccountHue;
  id: string;
  /** Null until its first sign-in on any machine. */
  identity: AccountIdentity | null;
  kind: AccountKind;
  /** A nickname someone gave it; null: it goes by its email ({@link accountName}). */
  label: string | null;
  /** Never chosen as the fallback when the pinned account cannot take a session. */
  neverBackup: boolean;
  /** Its place in fill-first order: lowest first. */
  order: number;
  provider: AccountProvider;
  /**
   * New sessions stop being placed on it once its weekly window passes this
   * percentage; null: no reserve.
   */
  reservePct: number | null;
}

/** Where an account stands on one machine. */
export type SigninState = "signed-in" | "signed-out" | "mismatch";

export interface AccountSignin {
  accountId: string;
  checkedAt: number;
  /**
   * The account lives in the machine's own `~/.claude` (the login it had
   * before accounts existed), rather than in `~/.cawco/accounts/<id>/claude`.
   */
  home: boolean;
  machineId: string;
  state: SigninState;
}

/** How a provider's new sessions choose among its accounts. */
export type PlacementStrategy =
  | "pinned"
  | "fill-first"
  | "spread"
  | "soonest-reset";

export const PLACEMENT_STRATEGIES: readonly PlacementStrategy[] = [
  "pinned",
  "fill-first",
  "spread",
  "soonest-reset",
];

export interface StrategyChoice {
  /** The account `pinned` names; ignored by the other strategies. */
  pinnedAccountId?: string;
  strategy: PlacementStrategy;
}

/** What a session does when its account hits its limit (used by part 2). */
export interface AtLimit {
  move: boolean;
  moveWholeUnderK: number;
  prepareAtPct: number;
  waitMinutes: number;
}

export const DEFAULT_AT_LIMIT: AtLimit = {
  move: true,
  waitMinutes: 15,
  moveWholeUnderK: 200,
  prepareAtPct: 90,
};

/**
 * One provider's routing. `yours` places the sessions a person starts;
 * `delegates` the ones a session starts.
 */
export interface ProviderRouting {
  atLimit: AtLimit;
  delegates: StrategyChoice;
  provider: AccountProvider;
  yours: StrategyChoice;
}

/**
 * What `claude auth status` said about one config dir on a machine: whether
 * it is signed in, and how. Who it is signed in as is the hub's to ask
 * ({@link CONTROL_PROBE_ACCOUNT}), once, where it knows nothing yet.
 */
export interface ClaudeAccountReport {
  /** The account id for `~/.cawco/accounts/<id>/claude`; null for `~/.claude`. */
  account: string | null;
  /** `console` when `authMethod` says the dir signed in with a Console account. */
  kind?: AccountKind;
  loggedIn: boolean;
}

/**
 * What Claude Code's own initialize response says about a config dir: who it
 * is signed in as (absent when nobody is), its plan, and the models it
 * offers. Read by a probe (a session that never takes a turn) and by every
 * session as it starts.
 */
export interface AccountProbe {
  identity?: AccountIdentity;
  models: import("./harness").ModelInfo[];
  subscriptionType?: string;
}

/**
 * An account's model catalog as its Claude Code last reported it, and the
 * effort each model ran at when a session asked for none (learned from the
 * sessions themselves; absent until one has).
 */
export interface AccountCatalog {
  accountId: string;
  defaultEfforts: Record<string, string>;
  models: import("./harness").ModelInfo[];
  readAt: number;
}

/** Extra-usage state, as the session's rate-limit events report it. */
export interface AccountOverage {
  disabledReason: string | null;
  inUse: boolean;
  resetsAt: string | null;
  status: string | null;
}

/**
 * An account's freshest limit reading, assembled from what its sessions'
 * Claude Code reported: the windows from `rate_limit_event`s, the plan from
 * `accountInfo()`.
 */
export interface AccountReading {
  accountId: string;
  /** When the last event or account read for it arrived. */
  lastSeenAt: number;
  overage: AccountOverage | null;
  /** `subscriptionType` as `accountInfo()` reports it. */
  subscription: string | null;
  windows: LimitWindow[];
}

/** An account taken out of placement until its window resets. */
export interface AccountBench {
  accountId: string;
  /** The model scope it is exhausted for; null: every model. */
  scope: string | null;
  until: number;
}

/**
 * One window of an account, and where it is heading: `pace` is percent per
 * hour from the account's successive readings in this window, null when no
 * session runs on it (nothing CawCo can see is spending it); `runsOutAt` is
 * when it reaches 100% at that pace, only when that lands before its reset.
 * A window past its reset with no newer reading is a fresh one: 0%, no pace.
 */
export interface WindowForecast {
  kind: string;
  pace: number | null;
  resetsAt: string | null;
  runsOutAt?: number;
  scopeLabel: string | null;
  utilization: number;
}

/** Names one of an account's windows. */
export interface WindowRef {
  kind: string;
  scopeLabel: string | null;
}

export interface AccountForecast {
  accountId: string;
  /**
   * The window that limits the account: the one that runs out soonest at its
   * pace, else (none runs out before its reset) the one that resets latest.
   * Null when the account has no windows.
   */
  bindingWindow: WindowRef | null;
  /** When its Claude Code last reported; null: never. */
  lastSeenAt: number | null;
  windows: WindowForecast[];
}

/** Which account carries new sessions from `from` to `to`; null: none can. */
export interface CarrySpan {
  accountId: string | null;
  from: number;
  to: number;
}

/**
 * A provider's accounts as a forecast: each account's windows, and which
 * account carries a person's new sessions (`yours`) and a session's
 * (`delegates`) from now to the 5-hour horizon.
 */
export interface ProviderForecast {
  accounts: AccountForecast[];
  delegates: CarrySpan[];
  provider: AccountProvider;
  yours: CarrySpan[];
}

/** Which account placement chose, by which rule, and why, in a sentence. */
export interface PlacementExplain {
  accountId: string | null;
  strategy: PlacementStrategy | "fork" | "explicit" | "only" | "type" | "none";
  why: string;
}

/**
 * Claude harness controls for one account's dir on a machine. Begin starts
 * Claude Code's own `claude auth login` in `~/.cawco/accounts/<id>/claude`
 * (args: account id, kind) and answers `{ url }`; complete types the pasted
 * code into it (args: code, account id, the identity the account already has
 * or null) and answers an {@link AccountSigninResult}; forget runs
 * `claude auth logout` there and deletes the dir (args: account id).
 */
export const CONTROL_BEGIN_ACCOUNT_LOGIN = "beginAccountLogin";
export const CONTROL_COMPLETE_ACCOUNT_LOGIN = "completeAccountLogin";
export const CONTROL_FORGET_ACCOUNT = "forgetAccount";
/**
 * Claude harness control: read one config dir's initialize response with a
 * session that never takes a turn (arg: account id, or null for `~/.claude`),
 * answering an {@link AccountProbe}.
 */
export const CONTROL_PROBE_ACCOUNT = "probeAccount";

/**
 * How a sign-in ended, and what the dir's Claude Code said once it had.
 * `mismatch`: the dir signed in as someone other than the account already
 * is, so the machine logged that dir out again.
 */
export interface AccountSigninResult {
  probe?: AccountProbe;
  state: SigninState;
}

/** The provider whose accounts a harness's sessions run on; none for a harness without accounts yet. */
export const providerOf = (harness: string): AccountProvider | undefined =>
  harness === "claude" ? "anthropic" : undefined;

/** Model families the provider scopes some weekly windows by. */
const FAMILY = /(?:^|claude-)(fable|opus|sonnet|haiku)(?:\b|-)/i;

/**
 * The model scope a session's model falls in, as the provider's scoped windows
 * name it ("Opus", "Sonnet"): its family, from an alias or a full id. Null for
 * a model with no family to scope by (`default`, a third-party id).
 */
export const modelScope = (model: string | null | undefined): string | null => {
  const family = model?.match(FAMILY)?.[1];
  return family
    ? family.charAt(0).toUpperCase() + family.slice(1).toLowerCase()
    : null;
};

/** What an account is called: its nickname, else the email it is signed in as. */
export const accountName = (
  account: Pick<Account, "email" | "id" | "label">
): string => account.label ?? account.email ?? "an account not signed in yet";

/** Whether two identities are the same account: same email in the same organization. */
export const sameIdentity = (a: AccountIdentity, b: AccountIdentity): boolean =>
  a.email.toLowerCase() === b.email.toLowerCase() &&
  a.organization === b.organization;

/**
 * An initialize response's account as an identity, or nothing when it names
 * nobody (a dir that is not signed in reports no email).
 */
export const identityOf = (account: {
  email?: string;
  organization?: string;
}): AccountIdentity | undefined =>
  account.email
    ? { email: account.email, organization: account.organization ?? "" }
    : undefined;
