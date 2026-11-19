/**
 * Accounts: several sign-ins per provider, one of which each session runs on.
 *
 * An account is one sign-in or one key for one provider, held by CawCo once
 * per machine; every harness on that machine that speaks the provider uses
 * that one credential, and nothing holds a second copy of a grant (refresh
 * tokens rotate, so copies sign each other out). A Claude subscription lives
 * in its own Claude Code config dir, signed in by `claude auth login`, for
 * Claude Code alone. Every other provider's lives in
 * `~/.cawco/accounts/<id>/credential.json`, in pi-ai's credential format,
 * refreshed only by the agent through pi-ai's own refresh; pi and OpenCode
 * sessions on the account read it from there. The hub knows an account by
 * its id and its identity, never by anything secret, and never stores a key.
 *
 * Browser-safe: types and pure functions only.
 */

import { nullable, object, optional, safeParse, string } from "valibot";
import {
  type AccountHue,
  type ColdMove,
  type CompactMethod,
  PLACEMENT_STRATEGIES,
  type PlacementStrategy,
} from "./accounts/kinds";
import { everyOf } from "./every-of";
import type { HarnessKind } from "./harness/kinds";
import { traitsOf } from "./harness/traits";
import type { LimitWindow } from "./usage/types";
import { accountsWords } from "./words/accounts";

/**
 * Who bills the account: a provider id. `anthropic` is a Claude subscription
 * or Console organization, for Claude Code alone: Anthropic's terms keep its
 * OAuth tokens out of every other product. Any other is a provider pi or
 * OpenCode speaks, by pi-ai's id for it (`openai-codex` for a ChatGPT
 * subscription, `github-copilot`, `opencode-go`, `zai`…), or OpenCode's own
 * id for one pi-ai has no provider for (`zai-coding-plan`, a configured
 * `litellm`) — see {@link ProviderInfo}.
 */
export type AccountProvider = string;

/** The provider of Claude subscriptions and Console organizations. */
export const CLAUDE_PROVIDER = "anthropic";

/**
 * What a project's sessions on its account do when that account reaches its
 * limit (hub placement.ts `runningAccounts`): `wait` holds them there until
 * it resets, keeping its connectors; `move` moves them to an account with
 * room, as a session on an account its start named moves, and they lose the
 * project's account's connectors there.
 */
export const PROJECT_AT_LIMIT = ["wait", "move"] as const;
export type ProjectAtLimit = (typeof PROJECT_AT_LIMIT)[number];

/**
 * How the account signs in. Claude: a subscription (`claude auth login`) or a
 * Console organization (`claude auth login --console`). Any other provider:
 * its own OAuth sign-in through pi-ai (`oauth`), or a key (`api_key`).
 */
export type AccountKind = "subscription" | "console" | "oauth" | "api_key";

/** The kinds a Claude account can be. */
export const ACCOUNT_KINDS: readonly AccountKind[] = [
  "subscription",
  "console",
];

/** The kinds any other provider's account can be. */
export const PROVIDER_ACCOUNT_KINDS: readonly AccountKind[] = [
  "oauth",
  "api_key",
];

/**
 * A provider an account can be for, as a machine's harnesses know it: pi-ai's
 * providers joined with what OpenCode's models list calls them. Joined by id,
 * and ChatGPT by the one name they differ on: pi-ai's `openai-codex` is
 * OpenCode's `openai` signed in with OAuth (OpenCode's codex plugin,
 * packages/opencode/src/plugin/openai/codex.ts: `auth: { provider: "openai" }`).
 */
export interface ProviderInfo {
  /** Whether pi-ai's own OAuth sign-in for it asks for a device code (finishable on any device). */
  deviceCode: boolean;
  /** The account provider id. */
  id: AccountProvider;
  /** Whether it takes an API key. */
  key: boolean;
  name: string;
  /** Whether it signs in with OAuth through pi-ai. */
  oauth: boolean;
  /** OpenCode's id for it; absent when OpenCode has none. */
  opencode?: string;
  /** pi-ai's id for it; absent when pi-ai has none. */
  pi?: string;
}

// Every harness has one: an `Extract` of its own, so the wire schema keeps naming it `HomeStore`.
/** Where a credential moved into an account came from: a harness's own store on the machine. */
export type HomeStore = Extract<import("./harness/kinds").HarnessKind, string>;

/**
 * How an account of a kind signs in on a machine. `paste-code`: a link to
 * authorise at, and a code pasted back (Claude Code's `claude auth login`).
 * `device-code`: a code entered on any device at the provider's page while
 * the machine waits. `api-key`: a key typed once in the dashboard and relayed
 * to the machines picked.
 */
type SigninKind = "paste-code" | "device-code" | "api-key";

/**
 * The providers whose limits CawCo reads: Claude's from Anthropic's
 * `api/oauth/usage` (usage/anthropic.ts) and, between those reads, its
 * sessions' `rate_limit_event`s; ChatGPT's from `wham/usage` (usage/chatgpt.ts),
 * OpenCode Go's from `zen/go/v1/usage` (usage/opencode-go.ts). Every other
 * provider exposes none CawCo can read (Copilot included: neither pi-ai's
 * github-copilot.js nor OpenCode's copilot.ts reads a quota), so it has no
 * windows, no dials and no at-limit moves; placement still works.
 */
export const LIMITED_PROVIDERS: readonly AccountProvider[] = [
  CLAUDE_PROVIDER,
  "openai-codex",
  "opencode-go",
];

/**
 * Whether an account is a ChatGPT plan: pi-ai's `openai-codex` signed in
 * with OAuth, the only way it signs in. A provider alone (a routing, a
 * rebalance pass) reads as its OAuth accounts. CawCo never puts a ChatGPT
 * session on another ChatGPT plan by itself: OpenAI's Sign in with ChatGPT
 * terms (2026-11-04) bar an app from "splitting usage, rotating accounts,
 * or otherwise bypassing usage limits". A session that reaches its plan's
 * limit, or loses its account, waits on its own plan and offers to continue
 * on the person's OpenAI API key ({@link isOpenaiKey}) or on another agent
 * or model; only the person moves it. Every rule that keeps a ChatGPT
 * session on its plan reads this, and the native app reads the same rule
 * from `ACCOUNT_RULES.onePlanProviders`.
 */
export const isChatgptPlan = (account: {
  kind?: AccountKind;
  provider: AccountProvider;
}): boolean =>
  ONE_PLAN_PROVIDERS.includes(account.provider) &&
  (account.kind ?? "oauth") === "oauth";

/** The providers whose sessions run on one plan alone ({@link isChatgptPlan}). */
const ONE_PLAN_PROVIDERS: readonly AccountProvider[] = ["openai-codex"];

/** Whether an account is an OpenAI API key: provider `openai`, a key, billed per token. */
export const isOpenaiKey = (account: {
  kind: AccountKind;
  provider: AccountProvider;
}): boolean => account.provider === "openai" && account.kind === "api_key";

/**
 * One row of the account picker: a provider and one way its accounts sign
 * in. A provider that takes both OAuth and a key is two rows, as Claude is
 * (a subscription, and a Console organization).
 */
export interface ProviderChoice {
  /** The harnesses that use an account of it. */
  harnesses: import("./harness/kinds").HarnessKind[];
  /** The account kind this row adds. */
  kind: AccountKind;
  /** Whether CawCo reads its limits ({@link LIMITED_PROVIDERS}). */
  limits: boolean;
  name: string;
  provider: AccountProvider;
  signin: SigninKind;
}

/**
 * The providers Codex runs on: a ChatGPT plan (`openai-codex`), signed in
 * by Codex's own device code into the account's Codex home, and an OpenAI
 * key (`openai`), handed to that home as it is sent (core harness/codex.ts).
 */
const CODEX_PROVIDERS: readonly AccountProvider[] = ["openai-codex", "openai"];

/**
 * The account picker's rows from the providers the fleet's machines know:
 * Claude's two, then for every other provider a device-code row where pi-ai
 * signs it in with a device code, and a key row where it takes a key.
 * pi-ai OAuth sign-ins that finish only on the machine's own localhost
 * (openrouter's) are not offered: nobody at the dashboard could finish them.
 */
export const providerChoices = (
  providers: readonly ProviderInfo[]
): ProviderChoice[] => {
  const claude: ProviderChoice[] = [
    {
      provider: CLAUDE_PROVIDER,
      kind: "subscription",
      name: "Claude",
      signin: "paste-code",
      harnesses: ["claude"],
      limits: true,
    },
    {
      provider: CLAUDE_PROVIDER,
      kind: "console",
      name: "Claude Console",
      signin: "paste-code",
      harnesses: ["claude"],
      limits: false,
    },
  ];
  const rest = providers.flatMap((one): ProviderChoice[] => {
    const harnesses: import("./harness/kinds").HarnessKind[] = [
      ...(one.pi ? (["pi"] as const) : []),
      ...(one.opencode ? (["opencode"] as const) : []),
      ...(CODEX_PROVIDERS.includes(one.id) ? (["codex"] as const) : []),
    ];
    const limits = LIMITED_PROVIDERS.includes(one.id);
    const base = { provider: one.id, name: one.name, harnesses, limits };
    return [
      ...(one.oauth && one.deviceCode
        ? [{ ...base, kind: "oauth" as const, signin: "device-code" as const }]
        : []),
      ...(one.key
        ? [{ ...base, kind: "api_key" as const, signin: "api-key" as const }]
        : []),
    ];
  });
  return [...claude, ...rest];
};

/**
 * Who an account is: an email in an organization, the organization known by
 * its id (`orgId`), never its name, which is a display name: an org renamed
 * is the same org, and two orgs can share a name. Claude: as `claude auth
 * status --json` reports it (`email`, `orgName`, `orgId`). ChatGPT: the
 * access token's claims, read on the machine — the email
 * (`https://api.openai.com/profile`.email) and, as `organization` and its
 * id, the ChatGPT account id (`https://api.openai.com/auth`.chatgpt_account_id),
 * the workspace the subscription bills. Another OAuth provider: the email its
 * credential names, if any, and its provider id. A key: its last four
 * characters (`…a1b2`) and, as `organization` and its id, a fingerprint of
 * it (`key:` and the first 16 hex of its SHA-256), so the same key on two
 * machines is one account and the key itself never leaves them.
 */
export interface AccountIdentity {
  email: string;
  /** The organization's name, for a screen. */
  organization: string;
  /**
   * The organization's id: what tells two identities apart. Null where
   * nothing read one (Claude Code's initialize response names none, an agent
   * older than this field sends none): such an identity is the same as no
   * other ({@link sameIdentity}).
   */
  orgId: string | null;
}

/**
 * What a session on an account does once the account reaches a plan limit
 * while its extra usage is on (Claude Code's `overageStatus` allowed): the
 * hub prices it (`price`, the default, decided 2026-11-19 move-redesign
 * "extra"): the session's measured next-turn dollars on credits against the
 * cheapest move to an account with plan room that holds (hub decide.ts),
 * the lower taken; or the person forces it, to move to an account with plan
 * room (`move`) or to keep going on this account's extra usage
 * (`extra-usage`). With extra usage off or refused, the account is at its
 * limit as any other is, whichever it says. It governs a session that has
 * reached the limit: a new session goes to plan room first, and to a
 * keep-going account's extra usage only when no account it may run on has
 * plan room, or when Pinned pins that account.
 */
export type AtPlanLimit = "price" | "move" | "extra-usage";

export interface Account {
  /** What its sessions do at a plan limit while its extra usage is on ({@link AtPlanLimit}). */
  atPlanLimit: AtPlanLimit;
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
   * Its week's floor: past this percent of its weekly window used, no new
   * session is placed on it and no hub move lands on it (hub decide.ts, the
   * floor test); null: no floor. {@link ACCOUNT_RESERVE} by default: 10% of
   * the week kept (decided 2026-11-19, move-redesign "room").
   */
  reservePct: number | null;
  /**
   * Its 5-hour window's floor, as {@link reservePct} is its week's: past
   * this percent of its 5-hour window used, nothing new is placed or moved
   * onto it; null: no floor. {@link ACCOUNT_RESERVE} by default: 20% kept.
   */
  sessionReservePct: number | null;
  /**
   * The step its setup (Configure → Accounts → Add) stands at, while that
   * setup is unfinished; absent once it is done. A reload, or a press on the
   * account's row, opens the setup there again.
   */
  setupStep?: AccountSetupStep;
}

/**
 * An account's floors as it starts (decided 2026-11-19, move-redesign
 * "room"): 10% of its week and 20% of its 5-hour window stay free of new
 * sessions and of the hub's moves. A person changes them per account.
 */
export const ACCOUNT_RESERVE = { weeklyPct: 90, sessionPct: 80 } as const;

/** A step of an account's setup after it was made (the dashboard's `words.setup.steps`). */
export const ACCOUNT_SETUP_STEPS = [
  "signIn",
  "nameIt",
  "yourSessions",
  "delegates",
  "atLimit",
  "done",
] as const;
export type AccountSetupStep = (typeof ACCOUNT_SETUP_STEPS)[number];

/** Where an account stands on one machine. */
export type SigninState = "signed-in" | "signed-out" | "mismatch";

/**
 * How far a refusal that signed an account out reaches (hub accounts.ts
 * `claudeCredentialRefused`): `machine`, one machine's credential, back on a
 * sign-in there; `account`, the account's own access, signed out on every
 * machine and back on all of them once a check's turn as the account is
 * answered (hub accounts.ts `checkRefusal`).
 */
export type RefusalReach = "machine" | "account";

/**
 * One account signed in (or not) on one machine: its one credential there,
 * which every harness on the machine that speaks its provider uses.
 */
export interface AccountSignin {
  accountId: string;
  checkedAt: number;
  machineId: string;
  /**
   * When a credential from one of the machine's own stores was moved into
   * this account there ({@link CONTROL_MOVE_HOME_LOGIN},
   * {@link CONTROL_MOVE_HOME_CREDENTIAL}), epoch ms; null for a sign-in made
   * in Configure → Accounts.
   */
  movedAt: number | null;
  /** The store it was moved from: `~/.claude`, pi's own `auth.json`, OpenCode's own; null when not moved. */
  movedFrom: HomeStore | null;
  /**
   * Why the hub signed it out there itself: the words a session on it met
   * when Claude Code refused it for good: this machine's credential (revoked,
   * or a refresh that can't succeed), or the account's own subscription
   * access, which signs it out on every machine (hub accounts.ts
   * `claudeCredentialRefused`). It stays signed out, whatever the store says,
   * until it is signed in again through CawCo, or, for an account-wide
   * refusal, until a check's turn as the account is answered. Null for any
   * other state.
   */
  reason: string | null;
  /** How far the refusal that signed it out reaches; null with no {@link reason}. */
  refusalReach: RefusalReach | null;
  state: SigninState;
}

export interface StrategyChoice {
  /** The account `pinned` names; ignored by the other strategies. */
  pinnedAccountId?: string;
  strategy: PlacementStrategy;
}

/**
 * How a session is made small when it moves, as the one decision (hub
 * decide.ts) offers it. A context under {@link AtLimit.moveWholeUnderK}
 * thousand tokens, or one whose cache carries to the account it moves to,
 * moves whole whatever this says. A cold cache moves as {@link coldMove}
 * says. A warm cache moving to another organization is priced: whole, its
 * harness's own compaction before the move (only while its account can run
 * it) or after it, the cheaper over its next turn; at a limit, as
 * {@link atLimit} names it. A session that stays on its organization is
 * compacted by its harness on its own; before that, once a turn ends with
 * its context within {@link Compaction.fileRoom} tokens of where that
 * harness compacts it, the hub gives it one turn to file its open items
 * (hub limit-decision.ts `fileDue`).
 */
export interface Compaction {
  /**
   * Nothing can run on its account (its limit refused a turn, its sign-in
   * was refused) and its cache is warm: `summary` goes on from a summary on
   * the target; `native` moves it whole and compacts it there; `whole`
   * moves it as it is. A summary that can't be written for a move (its
   * summariser can't fit the conversation, can't be placed, or the
   * conversation can't be read) takes `native` for that move, its line
   * saying why.
   */
  atLimit: CompactMethod;
  /** A cold cache moves whole, or by the cheapest path ({@link ColdMove}). */
  coldMove: ColdMove;
  /**
   * The room, in tokens, short of the point where its harness compacts it
   * on its own (core harness.ts `NeutralResultMessage.compactsAt`), at which
   * a session files its open items into its records: once per rise, at the
   * end of the first turn whose reading is within it, the next compaction
   * re-arming it (hub at-limit.ts `fileDue`). 0 files none.
   */
  fileRoom: number;
  /** Who writes a summary: its harness and model, placed as any start is. */
  summarizer: { harness: HarnessKind; model: string };
}

export const DEFAULT_COMPACTION: Compaction = {
  coldMove: "whole",
  atLimit: "summary",
  fileRoom: 30_000,
  summarizer: { harness: "claude", model: "claude-sonnet-5-5" },
};

/**
 * What a running session does when its account hits its limit: wait for the
 * reset, or move to another account that can take it (the hub's
 * `decide`). `waitMinutes`: a reset this close is waited for.
 * `moveWholeUnderK`: a context under this many thousand tokens moves whole
 * and goes on; one of this many or more, moved to another organization
 * (whose cache it can't read), is compacted as `compaction` says for the
 * moment it moves at. A live work item's session is answered so whoever
 * started its refused turn, the hub's own word to it included; every other
 * word of the hub's a limit refused is left until a person or the session's
 * parent writes.
 */
export interface AtLimit {
  compaction: Compaction;
  move: boolean;
  moveWholeUnderK: number;
  /**
   * How long past its reset a held session is still carried on by itself
   * (a sign-in hold, which has no reset, counts from when it was held).
   * Older, its hold goes stale: nothing sends to it or wakes it until a
   * person or its parent writes to it, and it waits in Needs you and in its
   * parent's `delegate_list` (hub at-limit.ts `goneStale`).
   */
  staleAfterHours: number;
  waitMinutes: number;
}

export const DEFAULT_AT_LIMIT: AtLimit = {
  move: true,
  waitMinutes: 15,
  staleAfterHours: 24,
  moveWholeUnderK: 200,
  compaction: DEFAULT_COMPACTION,
};

/**
 * The policy the hub acts on for a provider whose saved policy does not
 * read (hub db/accounts.ts `routing`, migration 0399): never the default,
 * and nothing the hub does by itself that the saved policy may not have
 * allowed. It moves no session to another account at its limit or ahead
 * of a run-out (`move` off: the hub's rule 3 waits, `off`); a move it still
 * makes (a person's, a refused sign-in's) goes whole, compacted and
 * summarised by none, and one made where a session stopped is announced
 * first however small its context (`moveWholeUnderK` 0), so a person can
 * stop it; no session is sent a
 * filing turn (`fileRoom` 0); a hold an hour past its reset, the shortest
 * cutoff a person can save, waits for a person or its parent; and a hold
 * with no reset to wait for is looked at again after an hour, not sooner.
 * The summariser only writes a summary someone asks for, so it stays the
 * default's. A save of the policy replaces it.
 */
export const RESTRICTIVE_AT_LIMIT: AtLimit = {
  move: false,
  waitMinutes: 60,
  staleAfterHours: 1,
  moveWholeUnderK: 0,
  compaction: {
    coldMove: "whole",
    atLimit: "whole",
    fileRoom: 0,
    summarizer: DEFAULT_COMPACTION.summarizer,
  },
};

/**
 * The strategies a provider's routing can choose from. Spread weighs how
 * long each account lasts and Soonest reset when its windows reset, both
 * read from the account's limits; a provider whose limits CawCo doesn't read
 * ({@link LIMITED_PROVIDERS}) has neither, so for it they would only ever
 * place as Fill first does. It offers Pinned and Fill first. ChatGPT
 * ({@link isChatgptPlan}) offers Pinned alone: every other strategy spreads
 * new sessions across plans, which OpenAI's terms bar.
 */
export const strategiesFor = (
  provider: AccountProvider
): readonly PlacementStrategy[] => {
  if (isChatgptPlan({ provider })) {
    return ACCOUNT_RULES.onePlanStrategies;
  }
  return LIMITED_PROVIDERS.includes(provider)
    ? PLACEMENT_STRATEGIES
    : ACCOUNT_RULES.unlimitedStrategies;
};

/**
 * A provider's routing until it is saved: a person's sessions pinned and a
 * session's delegates on the soonest reset where CawCo reads its limits;
 * both Fill first where it doesn't; both pinned for ChatGPT
 * ({@link strategiesFor}).
 */
export const defaultRouting = (provider: AccountProvider): ProviderRouting => {
  const defaults = defaultsOf(provider);
  return {
    provider,
    yours: { strategy: defaults.yours },
    delegates: { strategy: defaults.delegates },
    atLimit: DEFAULT_AT_LIMIT,
  };
};

/** The strategies a provider's routing starts from ({@link defaultRouting}). */
const defaultsOf = (provider: AccountProvider): StrategyDefaults => {
  if (isChatgptPlan({ provider })) {
    return ACCOUNT_RULES.onePlanDefaults;
  }
  return LIMITED_PROVIDERS.includes(provider)
    ? ACCOUNT_RULES.limitedDefaults
    : ACCOUNT_RULES.unlimitedDefaults;
};

/**
 * The rules that shape Configure › Accounts, which the native app follows
 * from here too (`bun run words` writes them as `Words.Accounts.Rules`):
 * when a provider's routing is offered, which providers' limits CawCo reads
 * (their accounts have a Limits section, an At the limit step and every
 * strategy), what the others offer, which run each session on one plan
 * (ChatGPT: Pinned alone, and no move at the limit), the routing each starts
 * from, and the at-limit policy a routing starts with.
 */
/** The strategy a routing starts from, for your own sessions and for delegates. */
interface StrategyDefaults {
  delegates: PlacementStrategy;
  yours: PlacementStrategy;
}

const UNLIMITED_STRATEGIES: readonly PlacementStrategy[] = [
  "pinned",
  "fill-first",
];
const LIMITED_DEFAULTS: StrategyDefaults = {
  yours: "pinned",
  delegates: "soonest-reset",
};
const UNLIMITED_DEFAULTS: StrategyDefaults = {
  yours: "fill-first",
  delegates: "fill-first",
};
/** ChatGPT's one strategy, and its routing's start ({@link isChatgptPlan}). */
const ONE_PLAN_STRATEGIES: readonly PlacementStrategy[] = ["pinned"];
const ONE_PLAN_DEFAULTS: StrategyDefaults = {
  yours: "pinned",
  delegates: "pinned",
};

export const ACCOUNT_RULES = {
  /** A provider's routing is a choice among its accounts: it is offered from this many. */
  routingFrom: 2,
  limitedProviders: LIMITED_PROVIDERS,
  unlimitedStrategies: UNLIMITED_STRATEGIES,
  limitedDefaults: LIMITED_DEFAULTS,
  unlimitedDefaults: UNLIMITED_DEFAULTS,
  onePlanProviders: ONE_PLAN_PROVIDERS,
  onePlanStrategies: ONE_PLAN_STRATEGIES,
  onePlanDefaults: ONE_PLAN_DEFAULTS,
  atLimit: DEFAULT_AT_LIMIT,
  /**
   * How long the hub waits on a machine's sign-in step: Claude Code printing
   * its link (the agent waits up to 30 s), exchanging a code (up to 60 s), a
   * device code waited for (a minute at a time). A client asks for longer.
   */
  signinWaitMs: 90_000,
  /** The terms that cover moving a conversation between Claude subscriptions. */
  termsUrl: "https://code.claude.com/docs/en/legal-and-compliance",
};

/** Whether a provider with this many accounts has a routing to choose. */
export const hasRouting = (accounts: number): boolean =>
  accounts >= ACCOUNT_RULES.routingFrom;

/**
 * One provider's routing. `yours` places the sessions a person starts;
 * `delegates` the ones a session starts.
 */
export interface ProviderRouting {
  atLimit: AtLimit;
  /**
   * Set while the provider's saved at-limit policy can't be read (hub
   * migration 0399): the policy's fields that don't read, as a short
   * reason ("staleAfterHours, compaction.fileRoom"), never the stored text.
   * `atLimit` is then core `RESTRICTIVE_AT_LIMIT`. A save clears it.
   */
  atLimitUnread?: string;
  delegates: StrategyChoice;
  provider: AccountProvider;
  yours: StrategyChoice;
}

/**
 * What one account's store on a machine says: whether it is signed in, how,
 * and as whom. Claude: `claude auth status` in the account's config dir.
 * Any other provider: the credential in the account's `credential.json`, its
 * identity read there (a ChatGPT token's claims, a key's fingerprint). Read
 * on every connect and again every minute, so a store signed in as someone
 * else since is seen within a minute. A Claude account's models are the
 * hub's to ask ({@link CONTROL_PROBE_ACCOUNT}), once per account.
 */
export interface AccountReport {
  /** The account whose store this is, under `~/.cawco/accounts/<id>/`. */
  account: string;
  /** Who the store is signed in as. Absent when it names nobody. */
  identity?: AccountIdentity;
  /** `console` for a Claude Console login; `oauth` or `api_key` for any other provider's credential. */
  kind?: AccountKind;
  loggedIn: boolean;
  /** The provider of the credential held; absent for a Claude dir. */
  provider?: AccountProvider;
}

/**
 * What a session's Claude Code says of its account at initialize, as it
 * starts: who it is signed in as (absent when nobody is) and its plan. Not
 * its models: Claude Code lists them relative to the session's own model (a
 * model it does not know is added as a "Custom model" row, an explicit id
 * replaces the alias row that runs it), so they are no account's catalog.
 */
export interface SessionAccountRead {
  identity?: AccountIdentity;
  subscriptionType?: string;
}

/**
 * What a probe (a session that never takes a turn and names no model) reads
 * of a config dir at initialize: its {@link SessionAccountRead}, and the models
 * the account offers, which the hub keeps as its catalog.
 */
export interface AccountProbe extends SessionAccountRead {
  models: import("./harness/kinds").ModelInfo[];
}

/**
 * An account's model catalog as its Claude Code last reported it, and the
 * effort each model ran at when a session asked for none (learned from the
 * sessions themselves; absent until one has).
 */
export interface AccountCatalog {
  accountId: string;
  defaultEfforts: Record<string, string>;
  models: import("./harness/kinds").ModelInfo[];
  readAt: number;
}

/**
 * Why an account's models could not be read, as the hub's last probe of it
 * went, its machine named; gone once a probe answers. A picker with no
 * catalog for the account says it.
 */
export interface AccountCatalogFault {
  accountId: string;
  reason: string;
}

/** Extra-usage state, as the session's rate-limit events report it. */
export interface AccountOverage {
  disabledReason: string | null;
  inUse: boolean;
  resetsAt: string | null;
  status: string | null;
}

/**
 * Whether requests past the plan may run as extra usage, as the account's
 * last `rate_limit_event` said: `overageStatus` allowed or allowed with a
 * warning; with no status, whether it was spending extra usage then.
 */
export const extraUsageOn = (
  overage: AccountOverage | null | undefined
): boolean =>
  overage?.status ? overage.status !== "rejected" : overage?.inUse === true;

/**
 * Whether `account`'s plan limits stop nothing on it: it says to keep going
 * on extra usage at a plan limit ({@link AtPlanLimit}), and its extra usage
 * is on ({@link extraUsageOn}).
 */
export const keepsGoingOnExtraUsage = (
  account: Pick<Account, "atPlanLimit">,
  reading: Pick<AccountReading, "overage"> | undefined
): boolean =>
  account.atPlanLimit === "extra-usage" && extraUsageOn(reading?.overage);

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
  /**
   * The account's window set: the windows (core usage/windows.ts
   * `windowKey`) the provider's last report that named its windows carried
   * (a Claude `rate_limit_event`'s `unifiedWindows`, a usage endpoint's
   * answer). A held window outside it is gone. Null until a report names
   * them: the windows held are all that is known, and a Claude account keeps
   * the session window it holds until one does.
   */
  windowKinds: string[] | null;
  windows: LimitWindow[];
}

/**
 * An account a provider refused for want of credit ({@link outOfCredit}),
 * for the models of one provider its credential opens: an OpenCode Go key
 * out of Zen's balance (`opencode`) still runs Go's models. Kept until a
 * turn on that provider succeeds, the account is signed in again through
 * CawCo, or a person acknowledges a top-up (Check again in Configure ›
 * Accounts). A model the hub picks for a start that picked none keeps off
 * it; a person's pick still runs it.
 */
export interface AccountCredit {
  accountId: string;
  /** The model's provider the refusal was for, as its harness names it (`opencode`, `anthropic`). */
  provider: AccountProvider;
  /** The provider's own words, as its harness handed them over. */
  reason: string;
  /** When the refusal came, epoch ms. */
  since: number;
}

/**
 * A model a provider refused an account the use of ({@link modelNotEnabled}):
 * access to it is disabled for the account (OpenCode Zen's "Model access is
 * disabled"), while the account's other models still run. Kept until a turn
 * of that account on that model succeeds, the account is signed in again
 * through CawCo, or a person presses Check again in Configure › Accounts. A
 * model the hub picks for a start that picked none passes it over on that
 * account; a person's pick still runs it.
 */
export interface AccountAccess {
  accountId: string;
  /** The model refused, as its harness runs it (`opencode/claude-fable-5`). */
  model: string;
  /** The provider the model is billed to, as its harness names it (`opencode`, `anthropic`). */
  provider: AccountProvider;
  /** The provider's own words, as its harness handed them over. */
  reason: string;
  /** When the refusal came, epoch ms. */
  since: number;
}

/**
 * A provider's refusal the hub keeps of an account, as a start or a move
 * that picks its account keeps off it: out of credit for the session's
 * model's provider ({@link AccountCredit}), or the session's model not
 * enabled for it ({@link AccountAccess}).
 */
export type AccountMark =
  | { kind: "credit"; provider: string; since: number }
  | { kind: "access"; model: string; since: number };

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
  /** How long it runs (core `LimitWindow.group`): `session`, `weekly`, `monthly`, or another. */
  group: string;
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
 * Adds who carries over `from`..`to` to `spans`: it lengthens the last span
 * when the same account carries on from where it ended, and an empty
 * stretch adds nothing.
 */
export function pushCarry(
  spans: CarrySpan[],
  accountId: string | null,
  from: number,
  to: number
): void {
  const last = spans.at(-1);
  if (last && last.accountId === accountId && last.to === from) {
    last.to = to;
  } else if (to > from) {
    spans.push({ accountId, from, to });
  }
}

/**
 * A provider's accounts as a forecast: each account's windows, and which
 * account carries a person's new sessions (`yours`) and a session's
 * (`delegates`) from now to the relay's horizon.
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
  strategy:
    | PlacementStrategy
    | "fork"
    | "explicit"
    | "project"
    | "only"
    | "type"
    | "none";
  why: string;
}

/**
 * What the placement preview answers (`GET /api/accounts/placement`): the
 * placement, and the model it was read for as the session would start on it
 * there (`provider/id`; pi's `default` as pi picks it in the session's
 * directory, a bare id as the machine resolves it), so a screen names the
 * session's provider by the same answer placement used. Null when the session
 * names no model and nothing resolves one.
 */
export interface PlacementPreview extends PlacementExplain {
  model: string | null;
}

/**
 * What one check's turn as an account came to ({@link CONTROL_CHECK_ACCOUNT}):
 * answered, or Claude Code's error in place of an answer (its
 * `SDKAssistantMessageError` and its words). A turn that did neither is no
 * answer, and the control fails.
 */
export type AccountCheck =
  { kind: "answered" } | { kind: "error"; error: string; text: string };

/**
 * What a check of an account Claude Code refused account-wide came to
 * (`POST /api/accounts/:id/refusal-check`, and the hub's hourly look):
 * `back` on every machine (`machines`) its refusal had signed out;
 * `refused` still, in `reason`'s words; `none`, no verdict (`why`), and it
 * stays out; or `not-refused`, nothing to check.
 */
export type RefusalVerdict =
  | { kind: "back"; machines: string[] }
  | { kind: "refused"; reason: string }
  | { kind: "none"; why: string }
  | { kind: "not-refused" };

/** What joining a new sign-in into an existing account did on its machine. */
export interface AccountJoinedOn {
  /** `kept`: the existing account's login there was kept, the new one dropped. `moved`: the new login is the existing account's there now. */
  outcome: "kept" | "moved";
}

/**
 * A sign-in that came out as an account that already exists: the sign-in is
 * that account's now, and the account made for it is gone. `note` says so
 * for a screen.
 */
export interface AccountJoined {
  accountId: string;
  note: string;
}

/** Who a machine's own `~/.claude` is signed in as, by its `claude auth status`. */
export interface HomeLogin {
  identity?: AccountIdentity;
  kind?: AccountKind;
  loggedIn: boolean;
}

/** Where a moved login now is: the account's store, as its owner names it. */
export interface HomeLoginMoved {
  /**
   * Set instead of a move when the machine's own credential did not answer
   * (its refresh refused, run out): why. Nothing was moved and the original
   * is as it was; the hub then lends the account's working sign-in to the
   * machine when another machine holds it ({@link CONTROL_BORROW_ACCOUNT}).
   */
  expired?: string;
  /**
   * Claude: `the macOS Keychain` or `the credentials file`, as Claude Code
   * names its stores. Any other provider: `the account's credential file`.
   */
  store: string;
}

/** Where a borrowed credential's refresh token would be: it has none. */
export const BORROWED_REFRESH = "cawco-borrowed";

/** A lender's access token for one account, as a borrower's store keeps it: never its refresh token. */
export interface LentAccess {
  access: string;
  /** The ChatGPT account the token is for, where the credential names one. */
  accountId?: string;
  /** Epoch ms. */
  expires: number;
  identity: AccountIdentity;
  provider: AccountProvider;
}

/** A borrower near its borrowed access token's expiry, asking the hub for a fresh one from its lender. */
export interface AccountBorrowFrame {
  accountId: string;
  instanceId?: undefined;
  kind: "account_borrow";
  /** The machine that lent it, as the borrower's store names it. */
  lender: string;
  requestId: string;
}

/** One credential in a harness's own store a CawCo account can hold. */
export interface HomeCredential {
  identity: AccountIdentity;
  kind: "oauth" | "api_key";
  /** The account provider it is for. */
  provider: AccountProvider;
  store: import("./harness/traits").CredentialStoreKind;
  /** The provider's id in that store, as the store names it (`openai` in OpenCode's for ChatGPT). */
  storeProvider: string;
}

/**
 * How a Claude sign-in ended, and what the dir's Claude Code said once it
 * had. `mismatch`: the dir signed in as someone other than the account
 * already is, so the machine logged that dir out again.
 */
export interface AccountSigninResult {
  /** Signed in as an account that already exists: it is that account's now. */
  joined?: AccountJoined;
  probe?: AccountProbe;
  state: SigninState;
}

/**
 * A provider sign-in begun: a device code to enter on any device, where, and
 * until when (`expiresAt` from the provider's own device-code expiry); or,
 * for a provider with no device code, a link to authorise at, after which
 * the person pastes the code or redirect URL it ends on.
 */
export type ProviderSigninChallenge =
  | { expiresAt: number; userCode: string; verificationUrl: string }
  | { url: string };

/**
 * A sign-in a machine has started for an account and not finished: the link
 * or device code it showed, kept by the hub until it ends or lapses
 * (`expiresAt`, epoch ms), so a screen that reloads or reopens shows that
 * same link or code again instead of starting another.
 */
export interface PendingAccountSignin {
  accountId: string;
  challenge: ProviderSigninChallenge;
  /** Codex's own sign-in, into the account's Codex home there; absent for the account's own. */
  codex?: true;
  expiresAt: number;
  machineId: string;
}

/**
 * How a provider sign-in (or a key) ended. `signed-in`: as `identity` (its
 * `email` said again for a screen; null when the provider names nobody), on
 * `plan` (ChatGPT's usage endpoint's `plan_type`, else the token's own claim;
 * null when nothing said). `mismatch`: it signed in as someone other than the
 * account already is, so the machine signed that store out again. `expired`:
 * the code lapsed before it was entered. `pending`: not entered yet; ask
 * again.
 */
export type ProviderSigninResult =
  | {
      state: "signed-in";
      email: string | null;
      /** Null when the provider's credential names nobody. */
      identity: AccountIdentity | null;
      /** Signed in as an account that already exists: it is that account's now. */
      joined?: AccountJoined;
      plan: string | null;
    }
  | { state: "mismatch"; email: string | null }
  | { state: "expired" }
  | { state: "pending" };

/**
 * A provider's refusal as its harness hands it over, structured: the HTTP
 * status of the answer (pi's, read off the response by the fetch its
 * requests are made with, agent pi-runtime.ts `ProviderAnswers`; OpenCode's
 * error `status`), and the harness's own sort of the provider's answer:
 * OpenCode's error `type` (`provider.quota` for a usage or quota limit,
 * among them ChatGPT's `usage_limit_reached` and OpenCode Go's
 * `GoUsageLimitError`, and `provider.rate-limit` for a 429 or a rate-limit
 * code; OpenCode 2.0.29's classifier, `QuotaExceeded` and `RateLimit`), or
 * Claude Code's assistant message `error` (agent SDK 0.3.302
 * `SDKAssistantMessageError`, `rate_limit`).
 */
export interface ProviderRefusal {
  /** The provider's own error code in its answer's body ({@link providerErrorOf}). */
  code?: string;
  /**
   * The provider's own error type in its answer's body ({@link
   * providerErrorOf}: Anthropic-shaped `permission_error`), or as Claude
   * Code copies it onto its error frame (`api_error_type`).
   */
  errorType?: string;
  status?: number;
  type?: string;
}

/**
 * The harnesses' sorts of a provider refusing for want of credit: Claude
 * Code's assistant message `error` (agent SDK 0.3.325
 * `SDKAssistantMessageError`, `billing_error`).
 */
const CREDIT_TYPES: ReadonlySet<string> = new Set(["billing_error"]);

/**
 * Providers' own error codes for an account with no credit left: OpenAI's
 * `insufficient_quota`, which it answers with a 429 ("You exceeded your
 * current quota, please check your plan and billing details").
 */
const CREDIT_CODES: ReadonlySet<string> = new Set(["insufficient_quota"]);

/**
 * Whether a provider refused for want of credit: a 402 (OpenCode Zen's
 * "Insufficient balance"), the credit sort its harness put the answer in,
 * or the provider's own credit code. Read before {@link atProviderLimit}:
 * OpenAI's no-credit answer is a 429 too. Its words are never read.
 */
export const outOfCredit = ({ code, status, type }: ProviderRefusal): boolean =>
  status === 402 ||
  (type !== undefined && CREDIT_TYPES.has(type)) ||
  (code !== undefined && CREDIT_CODES.has(code));

/**
 * Providers' own error types for a model the account may not use: the
 * Anthropic-shaped `permission_error`, which OpenCode Zen answers with a 403
 * ("Model access is disabled. Change model access at …") and Anthropic's
 * API with a 403 for a model the organization has no access to.
 */
const ACCESS_TYPES: ReadonlySet<string> = new Set(["permission_error"]);

/**
 * Providers' own error codes for a model the account may not use: OpenAI's
 * `model_not_found` ("The model … does not exist or you do not have access
 * to it").
 */
const ACCESS_CODES: ReadonlySet<string> = new Set(["model_not_found"]);

/**
 * Whether a provider refused the account the use of the model it was asked
 * for: a 403 whose body's error type is a permission one, or the provider's
 * own code for a model the account has no access to. Per model: the
 * account's other models still run. Its words are never read.
 */
export const modelNotEnabled = ({
  code,
  errorType,
  status,
}: ProviderRefusal): boolean =>
  (status === 403 && errorType !== undefined && ACCESS_TYPES.has(errorType)) ||
  (code !== undefined && ACCESS_CODES.has(code));

/**
 * A provider's error answer, as OpenAI-shaped APIs give it
 * (`{"error":{"code":…,"type":…}}`) and Anthropic-shaped ones
 * (`{"type":"error","error":{"type":…}}`).
 */
const ERROR_BODY = object({
  error: object({
    code: optional(nullable(string())),
    type: optional(nullable(string())),
  }),
});

/**
 * The provider's own error code and type in the body of its error answer,
 * when that is JSON that names them; neither for any other body.
 */
export const providerErrorOf = (
  body: string | undefined
): Pick<ProviderRefusal, "code" | "errorType"> => {
  if (!body) {
    return {};
  }
  let read: unknown;
  try {
    read = JSON.parse(body);
  } catch {
    return {};
  }
  const parsed = safeParse(ERROR_BODY, read);
  if (!parsed.success) {
    return {};
  }
  const { code, type } = parsed.output.error;
  return {
    ...(code ? { code } : {}),
    ...(type ? { errorType: type } : {}),
  };
};

/** The harnesses' sorts of a provider refusing at the account's limits: OpenCode's, then Claude Code's. */
const LIMIT_TYPES: ReadonlySet<string> = new Set([
  "provider.quota",
  "provider.rate-limit",
  "rate_limit",
]);

/**
 * Whether a provider refused at its account's limit: a 429, or the limit
 * sorts its harness put the provider's answer in. The one test every
 * harness's refusal goes through; its words are never read.
 */
export const atProviderLimit = (refusal: ProviderRefusal): boolean =>
  !outOfCredit(refusal) &&
  (refusal.status === 429 ||
    (refusal.type !== undefined && LIMIT_TYPES.has(refusal.type)));

/**
 * One reading of an account's windows on a machine, made by its agent from
 * the provider's own usage endpoint with the account's credential: Claude's
 * `api/oauth/usage`, ChatGPT's `wham/usage`, OpenCode Go's
 * `zen/go/v1/usage`. Every 5 minutes while signed in, after each turn on it,
 * and when the hub asks for one account now. `error` says why the last read
 * failed (a 401: the reading held is the last good one, from `readAt`).
 */
export interface ProviderAccountReading {
  accountId: string;
  error: string | null;
  plan: string | null;
  /** When the windows were read, epoch ms. */
  readAt: number;
  windows: LimitWindow[];
}

/**
 * The providers an account's credential opens, by the account's provider,
 * where they are more than its own, in the ids pi-ai and OpenCode share:
 * an OpenCode Go key is a key of OpenCode's Console, which opens Go's
 * models and Zen's pay-per-use ones (`opencode`) alike, billed to its
 * workspace ("Point a harness at the Console gateway with an API key to use
 * any paid or Go model", https://opencode.ai/docs/console/harnesses/, read
 * 2026-11-07; pi names both providers' key `OPENCODE_API_KEY`). The one
 * rule both ways, for every harness that runs on accounts: the account's
 * credential is given to its harness under each ({@link providersOpenedBy}),
 * and a model's provider is billed to an account of any provider that opens
 * it ({@link accountProvidersOf}).
 */
const PROVIDERS_OPENED: Readonly<
  Record<AccountProvider, readonly AccountProvider[]>
> = {
  "opencode-go": ["opencode-go", "opencode"],
};

/** OpenCode's id for a provider pi-ai names otherwise: a ChatGPT sign-in (`openai-codex`) is OpenCode's `openai`. */
const OPENCODE_IDS: Readonly<Record<AccountProvider, string>> = {
  "openai-codex": "openai",
};

/**
 * The providers an account of `provider` opens in `harness`, by the
 * harness's own ids ({@link PROVIDERS_OPENED}, and for OpenCode
 * {@link OPENCODE_IDS}): its own id unless the table names more.
 */
export const providersOpenedBy = (
  harness: string,
  provider: AccountProvider
): readonly string[] => {
  const opened = PROVIDERS_OPENED[provider] ?? [provider];
  return traitsOf(harness).ownProviderIds
    ? opened.map((one) => OPENCODE_IDS[one] ?? one)
    : opened;
};

/**
 * The account providers a session's model could bill to, by harness, in the
 * order they are tried: Claude Code's models are Claude accounts'; a pi or
 * OpenCode model `provider/id` is every account provider's that opens it
 * there ({@link providersOpenedBy}), those the tables name first: OpenCode's
 * `openai` is a ChatGPT subscription's (`openai-codex`) or an OpenAI key's
 * (`openai`), and `opencode` (Zen) an OpenCode Go key's or a Zen key's in
 * both. A pi or OpenCode `anthropic/…` model is none: Claude subscriptions
 * run in Claude Code alone. An OpenCode session on an account runs in that
 * account's own OpenCode server, so every provider OpenCode signs in to can
 * be an account's. A bare id or `default` names no provider: the hub
 * qualifies a pi one by pi's own resolution first. Whether the session runs
 * on one also needs a signed-in account of it on its machine, which only the
 * hub knows.
 */
export const accountProvidersOf = (
  harness: string,
  model: string | null | undefined
): AccountProvider[] => {
  const sole = traitsOf(harness).soleProvider;
  if (sole !== null) {
    return [sole];
  }
  const slash = model?.indexOf("/") ?? -1;
  const prefix = model && slash > 0 ? model.slice(0, slash) : undefined;
  if (!prefix || prefix === CLAUDE_PROVIDER) {
    return [];
  }
  return [
    ...Object.keys(PROVIDERS_OPENED),
    ...Object.keys(OPENCODE_IDS),
    prefix,
  ].filter(
    (provider, at, all) =>
      all.indexOf(provider) === at &&
      providersOpenedBy(harness, provider).includes(prefix)
  );
};

/**
 * `model` (`provider/id`) as an account of `provider` opens it in `harness`
 * ({@link providersOpenedBy}): the same id under that provider's own, as a
 * ChatGPT session's `openai-codex/gpt-5.5` in pi is an OpenAI key's
 * `openai/gpt-5.5`. Undefined for a model that names no provider.
 */
export const modelOn = (
  harness: string,
  model: string | null | undefined,
  provider: AccountProvider
): string | undefined => {
  const slash = model?.indexOf("/") ?? -1;
  const [opened] = providersOpenedBy(harness, provider);
  return model && slash > 0 && opened
    ? `${opened}/${model.slice(slash + 1)}`
    : undefined;
};

/** The first provider {@link accountProvidersOf} names; undefined when none. */
export const providerOf = (
  harness: string,
  model: string | null | undefined
): AccountProvider | undefined => accountProvidersOf(harness, model)[0];

/** A provider pi-ai speaks on a machine, with how it signs in. */
export interface PiProvider {
  deviceCode: boolean;
  id: string;
  key: boolean;
  name: string;
  oauth: boolean;
}

/** A provider OpenCode's server lists on a machine. */
export interface OpencodeProvider {
  id: string;
  name: string;
}

/**
 * The providers each harness on a machine lists, each read on its own: a
 * harness whose list could not be read is left out, and the hub keeps its
 * last list, so OpenCode's server being down neither hides pi's providers
 * nor reads as OpenCode having none.
 */
export interface MachineProviderLists {
  opencode?: OpencodeProvider[];
  pi?: PiProvider[];
}

/**
 * pi-ai's providers joined with OpenCode's, by id, and ChatGPT by its one
 * alias (pi-ai `openai-codex` is OpenCode `openai` with OAuth). `pi` lists
 * pi-ai's providers with how each signs in; `opencode` lists OpenCode's ids.
 * pi-ai's `anthropic` is left out: Claude subscriptions are Claude Code's.
 */
export const joinProviders = (
  pi: readonly PiProvider[],
  opencode: readonly OpencodeProvider[]
): ProviderInfo[] => {
  const opencodeIds = new Map(opencode.map((one) => [one.id, one]));
  const joined: ProviderInfo[] = pi
    .filter((one) => one.id !== CLAUDE_PROVIDER)
    .map((one) => {
      const chatgpt = isChatgptPlan({ provider: one.id });
      const [alias] = providersOpenedBy("opencode", one.id);
      return {
        ...one,
        // pi-ai calls it "OpenAI Codex (legacy)"; it is a ChatGPT subscription.
        name: chatgpt ? "ChatGPT" : one.name,
        pi: one.id,
        ...(opencodeIds.has(alias) ? { opencode: alias } : {}),
      };
    });
  const named = new Set(
    joined.map((one) => providersOpenedBy("opencode", one.id)[0])
  );
  for (const one of opencode) {
    if (!named.has(one.id) && one.id !== CLAUDE_PROVIDER) {
      joined.push({
        id: one.id,
        name: one.name,
        opencode: one.id,
        oauth: false,
        deviceCode: false,
        key: true,
      });
    }
  }
  return joined;
};

/** Model families the provider scopes some weekly windows by. */
const FAMILY = /(?:^|claude-)(fable|opus|sonnet|haiku)(?:\b|-)/iu;

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
const accountName = (
  account: Pick<Account, "email" | "id" | "label">
): string => account.label ?? account.email ?? accountsWords.unnamed;

/**
 * What each of `accounts` is called where it stands beside the others: its
 * {@link accountName}, and for an account with no nickname whose email
 * another account of its provider also signs in as (a personal plan and a
 * Team seat on one email), its organization after it, so each reading says
 * whose it is: "bewinxed@petralab.ai (Petralab)".
 */
export const accountNames = (
  accounts: readonly NameableAccount[]
): Map<string, string> =>
  new Map(accounts.map((one) => [one.id, accountNameAmong(one, accounts)]));

/** What an account is named by: its nickname, email, identity, id and provider. */
export type NameableAccount = Pick<
  Account,
  "email" | "id" | "identity" | "label" | "provider"
>;

/**
 * What `one` is called beside `accounts` ({@link accountNames}): the name
 * every line the hub writes or logs gives it. `accounts` may hold other
 * providers'.
 */
export const accountNameAmong = (
  one: NameableAccount,
  accounts: readonly NameableAccount[]
): string => {
  const org = one.identity?.organization;
  const sharing =
    one.email !== null &&
    accounts.some(
      (other) =>
        other.id !== one.id &&
        other.provider === one.provider &&
        other.email?.toLowerCase() === one.email?.toLowerCase()
    );
  return !one.label && org && sharing
    ? `${one.email} (${org})`
    : accountName(one);
};

/** An account as a transcript line names it, as it was when the line was written. */
export interface NamedAccount {
  hue: AccountHue;
  id: string;
  name: string;
}

/** `account` as a line names it among `accounts`, the hub's every account ({@link accountNames}). */
export const namedAccount = (
  account: Account,
  accounts: readonly Account[]
): NamedAccount => ({
  id: account.id,
  name: accountNameAmong(account, accounts),
  hue: account.hue,
});

/**
 * Why a session at its account's limit waits rather than moving: it is a
 * fork (it reads its origin's cache, on its origin's account), moving is
 * switched off, no account can take it now (`full`), its own account resets
 * within the wait the policy allows (`soon`), or its prompt cache lasts past
 * that reset, so waiting costs nothing where a move re-reads it cold
 * (`free`). `room` and `work` are history only: lines a hub stored when
 * admission kept a share of each account's room from moves, and while a
 * delegate's work could be set to carry on after its own account's reset;
 * never written now, still read.
 */
export type WaitReason =
  "fork" | "off" | "full" | "free" | "room" | "soon" | "work";

/**
 * Why another account didn't take a session held at its limit, or, for one
 * that could, that it could (`fits`). In order of the hub's rules: another
 * ChatGPT plan than the one the session is on (`plan`: {@link isChatgptPlan},
 * never a target), not signed
 * in on its machine, not one its project or task allows, benched, past its
 * reserve, its limits never read, at its own limit, kept out of the pinned
 * strategy's backups, a move already landing there while its window isn't
 * measured in dollars (`alone`), too little left for this move (`room`:
 * what it has left, what the move takes and the floor it keeps free,
 * percent of its window; lines from before the floor was kept name none), or
 * running out within the wait the policy allows with it (`runsOut`). A
 * provider's refusal of it the hub keeps ({@link AccountMark}: `credit`,
 * `access`) is read right after its lists.
 */
export type HeldReason =
  | { kind: "plan" }
  | { kind: "signin" }
  | { kind: "allowed"; by: "project" | "task" }
  | AccountMark
  | { kind: "benched" }
  | { kind: "reserve"; pct: number }
  | { kind: "unread" }
  | { kind: "limit" }
  | { kind: "backup" }
  | { kind: "alone" }
  | { kind: "room"; keepsPct?: number; leftPct: number; movePct: number }
  | { kind: "runsOut"; at: number; leftPct: number }
  | { kind: "fits"; carries: boolean; leftPct: number };

/** Another account and why it didn't take a held session, or that it could ({@link HeldReason}). */
export interface HeldAccount {
  account: NamedAccount;
  /** When it takes sessions again, epoch ms, when a reading says (benched, at its limit, past its reserve). */
  backAt?: number;
  reason: HeldReason;
}

/**
 * Where the native compaction of a move stands ({@link AccountMove}
 * `moved`): the session files its open items in its records (`filing`),
 * then its harness's own `/compact` runs (`compacting`); it ends compacted,
 * or stopped (a person interrupted or stopped either turn, or the
 * compaction failed), the conversation then going on whole.
 */
export type CompactStage = "filing" | "compacting" | "compacted" | "stopped";

/**
 * Why a session moved other than at a limit refusing a turn of it
 * ({@link AccountMove} `moved`): its account was forecast to run out at
 * `runsOutAt` (a rebalance between turns), its cache was cold at its wake,
 * so the move re-read nothing extra, Claude Code refused `from`'s
 * credential for good (`refused`: the hub signed it out there), or a turn
 * of it ran on `from`'s extra usage past its plan, which says to move then.
 */
export type MoveBecause =
  | { kind: "forecast"; runsOutAt: number }
  | { kind: "cold"; wake: boolean }
  | { kind: "refused" }
  | { kind: "extra-usage" };

/**
 * What the hub's one decision (hub decide.ts) priced for a move it made:
 * the dollars of the option it took (`usd`; null when its model or context
 * could not be priced), and the next-best option it passed over with its
 * dollars (`next`; null when there was none): staying (`stay`), waiting for
 * the account's reset (`wait`), keeping on extra usage (`credits`), or
 * another way of moving, named by how it moves and, when it goes elsewhere,
 * where (`to`).
 */
export interface MovePrice {
  next: {
    to?: string;
    usd: number | null;
    what: MovePriceOption;
  } | null;
  usd: number | null;
}

/** An option of the decision, as a move's line names the next best ({@link MovePrice}). */
export type MovePriceOption =
  | "stay"
  | "wait"
  | "credits"
  | "whole"
  | "compact-before"
  | "compact-after"
  | "summary";

/**
 * What the hub did when a running session's account reached its limit: the
 * one line its transcript says it in (core `ACCOUNT_MOVE`). `tokens` is the
 * session's context as its harness last reported it; null when it never has.
 */
export type AccountMove =
  | {
      kind: "moved";
      /** Moved because a person asked (`POST /api/instances/:id/account`), not at a limit. */
      asked?: true;
      /** Moved because a person removed `from` (`DELETE /api/accounts/:id`): every session on it moves off. */
      removed?: true;
      /** Moved because a person signed `from` out on its machine (`DELETE /api/accounts/:id/machines/:machineId`): every session on it there moves off. */
      signedOut?: true;
      /** With `signedOut`: that machine, as it was named then. */
      signedOutOn?: string;
      /**
       * Moved to another organization with a context of the policy's
       * `moveWholeUnderK` or more, compacted natively as the decision chose
       * ({@link Compaction}):
       * it files its open items, then its harness's `/compact` runs, as its
       * first steps on `to`, or on `from` before the move
       * ({@link compactFirst}). The line is said again under its id as that
       * goes.
       */
      compact?: CompactStage;
      /**
       * The compaction runs on `from`, warm, and the move follows it: the
       * decision priced it cheapest. Absent: it runs on `to` after the move.
       */
      compactFirst?: true;
      /** The harness whose own `/compact` runs, when its descriptor names it on a moved line (core harness/traits.ts `compactorOf`): what its compaction keeps is less. */
      compactBy?: import("./harness/traits").CompactNamedKind;
      /**
       * The policy said to go on from a summary, which could not be written
       * for this move, in the hub's words: its harness's `/compact` ran
       * instead.
       */
      summaryRefused?: string;
      /**
       * Its process ended on `to` before it took a step of the compaction,
       * and the hub started it again there to take it.
       */
      relaunched?: true;
      from: NamedAccount;
      to: NamedAccount;
      /** Both accounts in one organization: its prompt cache came along. */
      sameOrganization: boolean;
      tokens: number | null;
      /** The window that refused it, as core usage/windows.ts `windowWords` names it. */
      window: string | null;
      /** When that window resets, epoch ms; null when nothing said. */
      resetsAt: number | null;
      /** Why it moved other than at a limit ({@link MoveBecause}); absent: its account's limit refused a turn, or a person asked. */
      because?: MoveBecause;
      /** What the re-read cost on `to`: a percent of the window it is counted against, named as `windowWords` names it; absent when unpriced. */
      cost?: { pct: number; window: string };
      /** The price the hub's decision chose, and the next best ({@link MovePrice}); absent on a person's move and on lines stored before it was said. */
      price?: MovePrice;
      /**
       * What the move ended with its old process: work it held for later (its
       * background tasks, its one-time wake-ups), which no resume on another
       * account brings back. The session is told on arrival what ended.
       */
      ended?: { tasks: number; wakeups: number };
    }
  | {
      /**
       * A move whole the policy chose for a context large enough to compact
       * ({@link Compaction} `whole`): it goes at `at` by itself, from `from`
       * to `to`, unless a person stops the session before then.
       */
      kind: "moving";
      from: NamedAccount;
      to: NamedAccount;
      at: number;
      tokens: number | null;
      /** What the re-read will cost on `to`: a percent of its window; absent when unpriced. */
      cost?: { pct: number; window: string };
    }
  | {
      kind: "waiting";
      /** The account it is held on, at its limit. */
      account: NamedAccount;
      /**
       * Another account that frees before `account` resets: it moves there
       * at `until`. Absent: `until` is `account`'s own reset.
       */
      frees?: NamedAccount;
      /**
       * Every other account of its provider and why it didn't take it, or
       * that it could ({@link HeldAccount}): what a person reads, so a line
       * never says no account has room beside one that has. Absent on lines
       * stored before holds named them.
       */
      accounts?: HeldAccount[];
      /** The earliest moment an account takes it again, epoch ms: the line counts down to it. */
      until: number;
      why: WaitReason;
      tokens: number | null;
    }
  | {
      /**
       * The session went on in a fresh conversation of its own, seeded with
       * a summary of the one before (or the person's own messages alone,
       * `asks`), on `to` from `from` (null on a harness without accounts):
       * a continuation anything but the person's own Continue asked for,
       * which stays one session (hub `foldContinued`). The line stands
       * between the two conversations.
       */
      kind: "continued";
      from: NamedAccount | null;
      to: NamedAccount | null;
      /** The account whose summariser wrote the summary it went on from; null when nothing was summarised. */
      writtenOn: NamedAccount | null;
      /**
       * Who asked for it, as the line's detail names them: a session by its
       * name, or a comment on a task. Absent on a line a hub stored before
       * continuations stayed one session.
       */
      by?: string;
      /** A session asked for it, not its account's limit: true on every line written now. */
      asked?: true;
      /** It restarted from the person's own messages alone: nothing was summarised. */
      asks?: true;
      /**
       * It went on from a summary as its move to `to`, as the policy says
       * ({@link Compaction} `summary`): at its account's limit (`limit`:
       * the window that refused it and when that resets, or its refused
       * sign-in), or ahead of one (`ahead`: its account's forecast run-out,
       * its extra usage, or a person's move, `because`). Absent: a session
       * or a task asked for it.
       */
      move?: {
        at: "limit" | "ahead";
        because?: MoveBecause;
        asked?: true;
        window: string | null;
        resetsAt: number | null;
      };
      tokens: number | null;
      /**
       * Null on every line written now (no summary is written ahead of a
       * limit any more), and never shown. Sent only because the TestFlight
       * builds 20261015 to 20261018 require it, which the hub's wire check
       * holds to (packages/hub/scripts/openapi.ts); it goes in the change
       * that expires them.
       */
      preparedAtPct: number | null;
    }
  | {
      /**
       * A work item's session whose project has Caw off: nothing wakes a
       * model there, so nothing carries it on past `account`'s limit,
       * neither a move nor a resume at the reset. A person sends it on.
       */
      kind: "stopped";
      account: NamedAccount;
      /** When that limit resets, epoch ms; null when nothing said. */
      resetsAt: number | null;
    }
  | {
      /**
       * Claude Code refused `account`'s credential for good and no other
       * account can take the session: it stays, and what it is sent waits at
       * the hub, until `account` is signed in again or another comes free.
       */
      kind: "signed-out";
      account: NamedAccount;
    }
  | {
      /**
       * The session's process was ended, and by whom: a stop someone asked
       * for, or a signal from outside CawCo. A stop is never a failure; the
       * line says what starts it again.
       */
      kind: "ended";
      by: EndedBy;
    }
  | {
      /**
       * Moving it whole to `to` failed at `step`: it goes on in its
       * conversation, still on `from`. (`continue`, a continuation from a
       * summary, and `asked`, are history only: lines a hub stored before it
       * compacted natively.)
       */
      kind: "unmoved";
      /** What failed: a move whole (`move`), or, in a stored line, a continuation from a summary (`continue`). */
      action: "move" | "continue";
      /** It was moving off `from` because Claude Code refused `from`'s sign-in: `from` has no reset to wait for. */
      signedOut?: true;
      from: NamedAccount | null;
      to: NamedAccount | null;
      /** The session asked for it (`continue_session`), not its account's limit. */
      asked?: true;
      step: ContinueStep;
      /** What the hub got from the step that failed. */
      reason: string;
      /**
       * Only work its process holds for later kept it (a background task, a
       * one-time wake-up), and no person waits on it: the move goes when that
       * work ends, and never ends it (decided 2026-11-19).
       */
      waits?: true;
    };

/** What a limit line says the hub did: an {@link AccountMove}'s `kind`. */
export type AccountMoveKind = AccountMove["kind"];

/** Every {@link AccountMoveKind}: the hub keeps a line's kind in a column of its own (hub `limit_events.kind`). */
export const ACCOUNT_MOVE_KINDS = everyOf<AccountMoveKind>()([
  "moved",
  "moving",
  "waiting",
  "continued",
  "stopped",
  "signed-out",
  "ended",
  "unmoved",
]);

/**
 * Who ended a session's process ({@link AccountMove} `ended`): a person (the
 * dashboard's Stop), a session (its parent's `stop_delegate`, or its project's conversation's), the
 * hub's own work (`why`: a work item over, a project
 * forgotten), or a signal no part of CawCo sent (`outside`), after which the
 * turn it cut is handed back when there was one (`resumes`).
 */
export type EndedBy =
  | { kind: "person" }
  | { kind: "session"; name: string }
  | { kind: "hub"; why: string }
  | { kind: "outside"; signal: string; resumes: boolean };

/**
 * The steps of continuing a session from a summary, in order: read its
 * transcript, summarise it, start its fresh conversation. Until the last
 * one is done it goes on in the conversation it has.
 */
export type ContinueStep = "prepare" | "summary" | "start";

/**
 * What adding an account (or one coming back from its bench) set moving on
 * one machine, for the Accounts page: the running sessions moved between
 * turns off accounts forecast to run out, and the held sessions re-decided
 * at once. Kept by the hub until acknowledged (`id` is its notice id).
 */
export interface RebalanceNotice {
  at: number;
  /** The accounts that came: `added`, newly signed in there; `back`, their bench ended. */
  came: { account: NamedAccount; how: "added" | "back" }[];
  /** The held sessions looked at again, by the account each was held on. */
  held: {
    from: NamedAccount;
    moved: {
      to: NamedAccount;
      tokens: number | null;
      /** One organization: nothing was re-read. */
      cacheKept: boolean;
      cost?: { pct: number; window: string };
    }[];
    /**
     * Always 0: nothing continues from a summary at a limit now. Sent only
     * because the TestFlight builds 20261015 and 20261015.3 require it, which
     * the hub's wire check holds to (packages/hub/scripts/openapi.ts); it
     * goes in the change that expires them.
     */
    continued: number;
    /** Still waiting: each one's context. */
    waiting: (number | null)[];
  }[];
  id: string;
  machine: string;
  /**
   * Always empty: a running session moves at its own turn's end, each
   * writing its own line, never at a look an account's coming starts. Sent
   * because the shipped apps decode it (the iPhone app's `RebalanceNotice`).
   */
  running: {
    from: NamedAccount;
    organization: string | null;
    runsOutAt: number;
    to: NamedAccount;
    /** The cache came along (one organization, and a carry there keeps it). */
    cacheKept: boolean;
    moved: number;
    /** Planned and owed to their turn's end: mid-turn, or their process still running, when looked at. */
    left: number;
  }[];
}

/**
 * Whether two identities are the same account: the same email in the same
 * organization, the organization by its id alone. Either side with no id is
 * the same as nothing: who it is can't be compared, and a name is never
 * taken for an id. (An identity off the wire from an agent older than
 * `orgId` has none at all, so the test is for an id, not for null.)
 */
export const sameIdentity = (a: AccountIdentity, b: AccountIdentity): boolean =>
  Boolean(a.orgId) &&
  a.orgId === b.orgId &&
  a.email.toLowerCase() === b.email.toLowerCase();

/**
 * Who a Claude Code login says it is (its `auth status`, or its initialize
 * response, which names no organization id) as an identity, or nothing when
 * it names nobody (a dir that is not signed in reports no email).
 */
export const identityOf = (account: {
  email?: string;
  organization?: string;
  orgId?: string;
}): AccountIdentity | undefined =>
  account.email
    ? {
        email: account.email,
        organization: account.organization ?? "",
        orgId: account.orgId || null,
      }
    : undefined;
