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

import type { LimitWindow } from "./usage/types";

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

/** Where a credential moved into an account came from: a harness's own store on the machine. */
export type HomeStore = "claude" | "pi" | "opencode";

/**
 * How an account of a kind signs in on a machine. `paste-code`: a link to
 * authorise at, and a code pasted back (Claude Code's `claude auth login`).
 * `device-code`: a code entered on any device at the provider's page while
 * the machine waits. `api-key`: a key typed once in the dashboard and relayed
 * to the machines picked.
 */
export type SigninKind = "paste-code" | "device-code" | "api-key";

/**
 * The providers whose limits CawCo reads: Claude's from its sessions'
 * `rate_limit_event`s, ChatGPT's from `wham/usage` (usage/chatgpt.ts),
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
 * One row of the account picker: a provider and one way its accounts sign
 * in. A provider that takes both OAuth and a key is two rows, as Claude is
 * (a subscription, and a Console organization).
 */
export interface ProviderChoice {
  /** The harnesses that use an account of it. */
  harnesses: import("./harness").HarnessKind[];
  /** The account kind this row adds. */
  kind: AccountKind;
  /** Whether CawCo reads its limits ({@link LIMITED_PROVIDERS}). */
  limits: boolean;
  name: string;
  provider: AccountProvider;
  signin: SigninKind;
}

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
    const harnesses: import("./harness").HarnessKind[] = [
      ...(one.pi ? (["pi"] as const) : []),
      ...(one.opencode ? (["opencode"] as const) : []),
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
 * Who an account is. Claude: as Claude Code's initialize response reports it
 * (`account.email`, `account.organization` — the organization's name).
 * ChatGPT: the access token's claims, read on the machine — the email
 * (`https://api.openai.com/profile`.email) and, as `organization`, the ChatGPT
 * account id (`https://api.openai.com/auth`.chatgpt_account_id), the
 * workspace the subscription bills. Another OAuth provider: the email its
 * credential names, if any, and its provider id. A key: its last four
 * characters (`…a1b2`) and, as `organization`, a fingerprint of it
 * (`key:` and the first 16 hex of its SHA-256), so the same key on two
 * machines is one account and the key itself never leaves them.
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

/**
 * What a running session does when its account hits its limit: wait for the
 * reset, move whole to an account with room, or continue there from a summary
 * (the hub's `decideAtLimit`). `waitMinutes`: a reset this close is waited
 * for. `moveWholeUnderK`: a context under this many thousand tokens moves
 * whole; a larger one continues from a summary, which is written early, once
 * the account passes `prepareAtPct` of its window.
 */
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
 * The strategies a provider's routing can choose from. Spread weighs each
 * account's use and Soonest reset its 5-hour reset, both read from the
 * account's limits; a provider whose limits CawCo doesn't read
 * ({@link LIMITED_PROVIDERS}) has neither, so for it they would only ever
 * place as Fill first does. It offers Pinned and Fill first.
 */
export const strategiesFor = (
  provider: AccountProvider
): readonly PlacementStrategy[] =>
  LIMITED_PROVIDERS.includes(provider)
    ? PLACEMENT_STRATEGIES
    : ["pinned", "fill-first"];

/**
 * A provider's routing until it is saved: a person's sessions pinned and a
 * session's delegates on the soonest reset where CawCo reads its limits;
 * both Fill first where it doesn't.
 */
export const defaultRouting = (provider: AccountProvider): ProviderRouting =>
  LIMITED_PROVIDERS.includes(provider)
    ? {
        provider,
        yours: { strategy: "pinned" },
        delegates: { strategy: "soonest-reset" },
        atLimit: DEFAULT_AT_LIMIT,
      }
    : {
        provider,
        yours: { strategy: "fill-first" },
        delegates: { strategy: "fill-first" },
        atLimit: DEFAULT_AT_LIMIT,
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
 * Claude harness control: read one account dir's initialize response with a
 * session that never takes a turn (arg: account id), answering an
 * {@link AccountProbe}.
 */
export const CONTROL_PROBE_ACCOUNT = "probeAccount";

/**
 * The one-time move of a machine's own Claude Code login into CawCo, run
 * once per machine when the operator asks (`POST /api/accounts/move-login`
 * with store `claude`). Read answers who the machine's `~/.claude` is signed
 * in as, a {@link HomeLogin} (no args). Move (args: account id, the identity
 * read) moves that login's credential and `oauthAccount` into the account's
 * dir, checks the dir answers as the identity, and only then deletes the
 * original; it answers a {@link HomeLoginMoved}.
 */
export const CONTROL_READ_HOME_LOGIN = "readHomeLogin";
export const CONTROL_MOVE_HOME_LOGIN = "moveHomeLogin";

/**
 * A sign-in that came out as an identity another account already is: its
 * login joins that account's store on the machine (args: the new account's
 * id, the existing account's id, the identity). When the existing account
 * already holds a login there, the new one is a second grant of the same
 * person and is signed out and dropped; else it moves into the existing
 * account's store (Claude: credential and `oauthAccount`, checked to answer
 * as the identity before the new dir is dropped). Answers an
 * {@link AccountJoinedOn}. Claude's is a Claude harness control; any other
 * provider's the agent's own.
 */
export const CONTROL_JOIN_ACCOUNT_LOGIN = "joinAccountLogin";
export const CONTROL_JOIN_PROVIDER_ACCOUNT = "joinProviderAccount";

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

/**
 * pi harness control (arg: the session's directory): the model pi starts a
 * new session on there when none is named, as pi picks it (its saved
 * default from the global settings and `<cwd>/.pi/settings.json` merged,
 * when that model's provider has auth configured, accounts counted), as
 * `provider/id`; null when pi would pick among the machine's own providers.
 */
export const CONTROL_PI_DEFAULT_MODEL = "piDefaultModel";

/** Who a machine's own `~/.claude` is signed in as, by its `claude auth status`. */
export interface HomeLogin {
  identity?: AccountIdentity;
  kind?: AccountKind;
  loggedIn: boolean;
}

/** Where a moved login now is: the account's store, as its owner names it. */
export interface HomeLoginMoved {
  /**
   * Claude: `the macOS Keychain` or `the credentials file`, as Claude Code
   * names its stores. Any other provider: `the account's credential file`.
   */
  store: string;
}

/**
 * Machine controls for every account of a provider other than Claude's, run
 * by the agent itself (no harness: the one credential serves them all).
 *
 * - Begin (args: account id, provider) starts pi-ai's own OAuth sign-in for
 *   the provider into the account's store and answers a
 *   {@link ProviderSigninChallenge}.
 * - Complete (args: code or null, account id, the identity the account
 *   already has or null) answers a {@link ProviderSigninResult}: a code
 *   pasted into a sign-in that asked for one; else it waits up to a minute
 *   for the person to enter the device code.
 * - Key (args: account id, provider, key) writes a key the person typed in
 *   the dashboard into the account's store, relayed by the hub and never
 *   kept there; it answers a {@link ProviderSigninResult}.
 * - Forget (args: account id) signs the store out and deletes it.
 * - Fresh (args: account id) refreshes an OAuth credential through pi-ai's
 *   own refresh when it is near its expiry; the only writer of the store.
 */
export const CONTROL_BEGIN_PROVIDER_LOGIN = "beginProviderLogin";
export const CONTROL_COMPLETE_PROVIDER_LOGIN = "completeProviderLogin";
export const CONTROL_SET_PROVIDER_KEY = "setProviderKey";
export const CONTROL_FORGET_PROVIDER_ACCOUNT = "forgetProviderAccount";

/**
 * The one-time move of the machine's own pi and OpenCode credentials into
 * accounts. Read (no args) answers every entry in pi's own `auth.json` and
 * OpenCode's own `auth.json` a CawCo account can hold, a {@link
 * HomeCredential} each (a Claude subscription's OAuth there is never listed).
 * Move (args: account id, store, provider in that store, the identity read)
 * writes it into the account's store, checks the account answers, and only
 * then removes the entry from that store; it answers a {@link HomeLoginMoved}.
 */
export const CONTROL_READ_HOME_CREDENTIALS = "readHomeCredentials";
export const CONTROL_MOVE_HOME_CREDENTIAL = "moveHomeCredential";

/** One credential in a harness's own store a CawCo account can hold. */
export interface HomeCredential {
  identity: AccountIdentity;
  kind: "oauth" | "api_key";
  /** The account provider it is for. */
  provider: AccountProvider;
  store: Exclude<HomeStore, "claude">;
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
 * A provider's usage-limit refusal, in its own words or as pi and OpenCode
 * pass it on: ChatGPT's `usage_limit_reached` ("You've hit your usage
 * limit"), OpenCode Go's `GoUsageLimitError`.
 */
export const PROVIDER_LIMIT =
  /usage_limit_reached|usage limit|GoUsageLimitError|rate_limit_exceeded|rate limit reached/i;

/** Whether a pi or OpenCode turn ended on its account's usage limit, by the error it ended on. */
export const providerLimitRefused = (errors: readonly string[]): boolean =>
  errors.some((error) => PROVIDER_LIMIT.test(error));

/**
 * One reading of an account's windows on a machine, made by its agent from
 * the provider's own usage endpoint with the account's credential: ChatGPT's
 * `wham/usage`, OpenCode Go's `zen/go/v1/usage`. Every 5 minutes while signed
 * in, and after each turn on it. `error` says why the last read failed (a
 * 401: the reading held is the last good one, from `readAt`).
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
 * OpenCode providers whose sign-in OpenCode 1.18 does not put on each
 * request, so a session cannot run on its own account in OpenCode: the
 * credential, or something tied to it, is the whole server's. Each reason
 * cites OpenCode v1.18.34's own code (packages/opencode/src/…). Their
 * OpenCode sessions run from OpenCode's own store, and pi sessions of the
 * same provider still run on accounts.
 */
export const OPENCODE_UNSERVED: Readonly<Record<string, string>> = {
  azure:
    "the Azure resource is the server's (provider/provider.ts 284-291: options.resourceName from the stored sign-in's metadata or AZURE_RESOURCE_NAME)",
  "azure-cognitive-services":
    "the resource is the server's (provider/provider.ts 323-332: AZURE_COGNITIVE_SERVICES_RESOURCE_NAME)",
  "cloudflare-workers-ai":
    "the Cloudflare account is the server's base URL (provider/provider.ts 781, 805-808)",
  "cloudflare-ai-gateway":
    "the gateway is the server's base URL and its binding rebuilds every request's headers from the server's options (provider/provider.ts 818-820, 884-893)",
  "google-vertex":
    "OpenCode signs Vertex requests with Google application-default credentials through its own fetch, which replaces a plugin's (provider/provider.ts 577-587)",
  "google-vertex-anthropic":
    "OpenCode signs with Google application-default credentials (provider/provider.ts 595-613)",
  "sap-ai-core":
    "the service key is the server's AICORE_SERVICE_KEY, exchanged for tokens by the SDK itself (provider/provider.ts 619-627)",
  gitlab:
    "gitlab-ai-provider exchanges the token for a direct-access token it caches for the server (provider/provider.ts 659-681; gitlab-ai-provider 6.18.0 dist/index.js 564, 729)",
  "snowflake-cortex":
    "OpenCode installs its own fetch for a key, which replaces a plugin's (provider/provider.ts 988-996)",
  digitalocean:
    "the router models are listed from the stored sign-in's metadata (plugin/digitalocean.ts 226-254)",
  modal:
    "the models are listed with the stored key when the server starts (plugin/modal/modal.ts 6-13)",
};

/**
 * The account providers a session's model could bill to, by harness, in the
 * order they are tried: Claude Code's models are Claude accounts'; a pi model
 * `provider/id` is that pi-ai provider's; an OpenCode model `provider/id` is
 * that provider's, and OpenCode's `openai` is a ChatGPT subscription's
 * (`openai-codex`) or an OpenAI key's (`openai`). A pi or OpenCode
 * `anthropic/…` model is none: Claude subscriptions run in Claude Code alone,
 * and nor is an OpenCode model of a provider in {@link OPENCODE_UNSERVED}.
 * A bare id or `default` names no provider: the hub qualifies a pi one by
 * pi's own resolution first. Whether the session runs on one also needs a
 * signed-in account of it on its machine, which only the hub knows.
 */
export const accountProvidersOf = (
  harness: string,
  model: string | null | undefined
): AccountProvider[] => {
  if (harness === "claude") {
    return [CLAUDE_PROVIDER];
  }
  const slash = model?.indexOf("/") ?? -1;
  const prefix = model && slash > 0 ? model.slice(0, slash) : undefined;
  if (!prefix || prefix === CLAUDE_PROVIDER) {
    return [];
  }
  if (harness === "opencode" && prefix in OPENCODE_UNSERVED) {
    return [];
  }
  if (harness === "opencode" && prefix === "openai") {
    return ["openai-codex", "openai"];
  }
  return [prefix];
};

/** The first provider {@link accountProvidersOf} names; undefined when none. */
export const providerOf = (
  harness: string,
  model: string | null | undefined
): AccountProvider | undefined => accountProvidersOf(harness, model)[0];

/**
 * pi-ai's providers joined with OpenCode's, by id, and ChatGPT by its one
 * alias (pi-ai `openai-codex` is OpenCode `openai` with OAuth). `pi` lists
 * pi-ai's providers with how each signs in; `opencode` lists OpenCode's ids.
 * pi-ai's `anthropic` is left out: Claude subscriptions are Claude Code's.
 */
export const joinProviders = (
  pi: readonly {
    deviceCode: boolean;
    id: string;
    key: boolean;
    name: string;
    oauth: boolean;
  }[],
  opencode: readonly { id: string; name: string }[]
): ProviderInfo[] => {
  const opencodeIds = new Map(opencode.map((one) => [one.id, one]));
  const joined: ProviderInfo[] = pi
    .filter((one) => one.id !== CLAUDE_PROVIDER)
    .map((one) => {
      const chatgpt = one.id === "openai-codex";
      const alias = chatgpt ? "openai" : one.id;
      return {
        ...one,
        // pi-ai calls it "OpenAI Codex (legacy)"; it is a ChatGPT subscription.
        name: chatgpt ? "ChatGPT" : one.name,
        pi: one.id,
        ...(opencodeIds.has(alias) && !(alias in OPENCODE_UNSERVED)
          ? { opencode: alias }
          : {}),
      };
    });
  const named = new Set(
    joined.map((one) => (one.id === "openai-codex" ? "openai" : one.id))
  );
  for (const one of opencode) {
    if (
      !(named.has(one.id) || one.id in OPENCODE_UNSERVED) &&
      one.id !== CLAUDE_PROVIDER
    ) {
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

/** An account as a transcript line names it, as it was when the line was written. */
export interface NamedAccount {
  hue: AccountHue;
  id: string;
  name: string;
}

export const namedAccount = (account: Account): NamedAccount => ({
  id: account.id,
  name: accountName(account),
  hue: account.hue,
});

/**
 * Why a session at its account's limit waits for the reset rather than
 * moving: it is a fork (it reads its origin's cache, on its origin's
 * account), moving is switched off, no other account has room, or the reset
 * comes sooner than re-reading its context elsewhere is worth.
 */
export type WaitReason = "fork" | "off" | "full" | "soon";

/**
 * What the hub did when a running session's account reached its limit: the
 * one line its transcript says it in (core `ACCOUNT_MOVE`). `tokens` is the
 * session's context as its harness last reported it; null when it never has.
 */
export type AccountMove =
  | {
      kind: "moved";
      from: NamedAccount;
      to: NamedAccount;
      /** Both accounts in one organization: its prompt cache came along. */
      sameOrganization: boolean;
      tokens: number | null;
      /** The window that refused it, as {@link windowWords} names it. */
      window: string | null;
      /** When that window resets, epoch ms; null when nothing said. */
      resetsAt: number | null;
    }
  | {
      kind: "waiting";
      account: NamedAccount;
      /** The reset it waits for, epoch ms: the line counts down to it. */
      until: number;
      why: WaitReason;
      tokens: number | null;
    }
  | {
      kind: "continued";
      from: NamedAccount;
      to: NamedAccount;
      /** The account whose summariser wrote the summary it went on from. */
      writtenOn: NamedAccount;
      tokens: number | null;
      /** The window's percent when the summary was written ahead of the limit; null when it was written at the move. */
      preparedAtPct: number | null;
    }
  | {
      /** Continuing it on `to` failed at `step`: it is the one session running, still on `from`. */
      kind: "unmoved";
      from: NamedAccount;
      to: NamedAccount;
      step: ContinueStep;
      /** The session's machine, as the fleet names it. */
      machine: string;
      /** The session, as its title names it. */
      session: string;
      /** What the hub got from the step that failed. */
      reason: string;
    };

/**
 * The steps of continuing a session on another account, in order: read its
 * transcript, summarise it, start its successor, end it. Only after the last
 * does the successor take its place.
 */
export type ContinueStep = "prepare" | "summary" | "start" | "end";

/** "5-hour", "weekly", "weekly Opus": a window as a sentence names it. */
export const windowWords = (
  window: Pick<LimitWindow, "kind" | "scopeLabel">
): string => {
  if (window.kind === "session") {
    return "5-hour";
  }
  if (window.kind === "weekly_scoped" && window.scopeLabel) {
    return `weekly ${window.scopeLabel}`;
  }
  return "weekly";
};

const MINUTE = 60_000;

/** "12 min", "2h 10m", "3d 4h": a span ahead, rounded up to the minute. */
export const spanWords = (ms: number): string => {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** "412k tokens"; a context never reported is "its whole context". */
export const tokenWords = (tokens: number | null): string =>
  tokens === null
    ? "its whole context"
    : `${Math.round(tokens / 1000).toLocaleString("en")}k tokens`;

const WAIT_WHY: Record<WaitReason, (tokens: string) => string> = {
  fork: () => "A fork stays on the account its origin's cache is on",
  off: () => "Moving to another account at the limit is switched off",
  full: () => "No other account has room for it",
  soon: (tokens) =>
    `The reset comes sooner than re-reading ${tokens} elsewhere is worth`,
};

/**
 * An account line in words at `now`: its line, and the second line drawn on
 * hover, focus, or at wide widths. A wait counts down to its reset and, once
 * that has passed, says the session went on there.
 */
export const accountMoveWords = (
  move: AccountMove,
  now: number
): { line: string; detail: string } => {
  switch (move.kind) {
    case "moved": {
      const left = move.resetsAt === null ? 0 : move.resetsAt - now;
      return {
        line: move.sameOrganization
          ? `Moved to ${move.to.name} · same organization, cache kept`
          : `Moved to ${move.to.name} · re-read ${tokenWords(move.tokens)}`,
        detail: [
          `${move.from.name} hit its ${move.window ? `${move.window} ` : ""}limit`,
          ...(left > 0 ? [`resets in ${spanWords(left)}`] : []),
        ].join(" · "),
      };
    }
    case "waiting": {
      const left = move.until - now;
      return {
        line:
          left > 0
            ? `Waiting for ${move.account.name} to reset · ${spanWords(left)}`
            : `Continued on ${move.account.name}`,
        detail: WAIT_WHY[move.why](tokenWords(move.tokens)),
      };
    }
    case "unmoved":
      return move.step === "end"
        ? {
            line: `${move.machine} didn't end ${move.session}; it's still running`,
            detail: `Stop it there, or try again when ${move.machine} answers`,
          }
        : {
            line: `Couldn't continue on ${move.to.name}: ${move.reason}`,
            detail: `It stays on ${move.from.name}; the hub tries again in a few minutes, or it goes on when ${move.from.name} resets`,
          };
    default:
      return {
        line: `Continued on ${move.to.name} from a summary · ${tokenWords(move.tokens)} stayed on ${move.from.name}`,
        detail:
          move.preparedAtPct === null
            ? `Summary written on ${move.writtenOn.name}, at the move`
            : `Summary written at ${Math.round(move.preparedAtPct)}%, before the move`,
      };
  }
};

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
