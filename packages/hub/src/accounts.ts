import {
  type Account,
  type AccountIdentity,
  type AccountKind,
  type AccountOverage,
  type AccountProbe,
  type AccountProvider,
  type AccountReading,
  type AccountReport,
  type AccountSignin,
  accountNameAmong,
  CLAUDE_PROVIDER,
  CLAUDE_READING_CURRENT_MS,
  type ClaudeExtraUsage,
  type ClaudeLimits,
  type ProviderAccountReading,
  type SigninState,
  sameIdentity,
  type UsageLimitsReading,
  type UsageLimitsResponse,
} from "@cawco/core";
import {
  type ObservedRateLimitInfo,
  observedReading,
} from "@cawco/core/usage/observed";
import type { DbShape } from "./db";

/**
 * The hub's half of accounts: where each is signed in, as machines report it,
 * and what its sessions' Claude Code says about its limits.
 */

/** Asks a machine's Claude harness for one account dir's initialize response; undefined when it could not say. */
export type AccountProber = (
  machineId: string,
  account: string
) => Promise<AccountProbe | undefined>;

/** Keeps what a probe or a session's initialize said about an account. */
export const keepProbe = (
  db: DbShape,
  accountId: string,
  probe: AccountProbe,
  at = Date.now()
): void => {
  if (probe.models.length > 0) {
    db.accounts.putCatalog(accountId, probe.models, at);
  }
  if (probe.subscriptionType !== undefined) {
    db.accounts.putReading(
      accountId,
      { subscription: probe.subscriptionType },
      at
    );
  }
};

/**
 * `account` with its organization id, read from its own store: a Claude
 * account named before ids were read has none, and the first read of its own
 * login that names one (a machine's report on its dir, a probe of it, its
 * sign-in's answer) fills it in. Matched by the store, which is the
 * account's, never by identity; only a login of the same email fills it, as
 * another email's org is no org of this account's. Any other account as it
 * is.
 */
export const withOrgIdFrom = (
  db: DbShape,
  account: Account,
  read: AccountIdentity
): Account => {
  const held = account.identity;
  if (
    !held ||
    held.orgId ||
    !read.orgId ||
    held.email.toLowerCase() !== read.email.toLowerCase()
  ) {
    return account;
  }
  const identity = { ...held, orgId: read.orgId };
  db.accounts.setIdentity(account.id, identity);
  console.log(
    `[accounts] ${accountNameAmong(account, db.accounts.list())}'s organization is ${read.orgId} (${read.organization || "unnamed"}), as its own login reads it; one identity is that email in that organization from now on.`
  );
  return { ...account, identity };
};

/** The {@link uncompared} lines already said, so a store read each minute says its line once. */
const saidUncompared = new Set<string>();

/**
 * Says, once per thing read, that `identity` could not be compared with any
 * account's: it names no organization id (an agent older than `orgId`, or a
 * read that names none), and an org's name is never taken for its id.
 */
export const uncompared = (identity: AccountIdentity, what: string): void => {
  const line = `[accounts] ${what} is ${identity.email}${identity.organization ? ` in ${identity.organization}` : ""}, but names no organization id, so it couldn't be compared with this hub's accounts: it is taken as nobody's.`;
  if (!saidUncompared.has(line)) {
    saidUncompared.add(line);
    console.warn(line);
  }
};

/** What one step of a reconcile did. */
interface Squared {
  changed: boolean;
  failed: boolean;
}

/**
 * The provider's account of `identity`: the one already signed in as it,
 * else one made now with no nickname (it goes by its email). Machines signed
 * in as the same identity share one account.
 */
export const accountOfIdentity = (
  db: DbShape,
  identity: AccountIdentity,
  kind: AccountKind,
  provider: AccountProvider
): Account => {
  if (!identity.orgId) {
    uncompared(identity, "A login moving into CawCo");
  }
  return (
    db.accounts.byIdentity(provider, identity) ??
    db.accounts.create({ provider, kind, identity })
  );
};

/**
 * The account's models, read through a probe of its dir on the machine when
 * the hub has none yet; kept only when the dir still answers as the account.
 * False when the probe could not be read, which the caller retries.
 */
const catalogFor = async (
  db: DbShape,
  machineId: string,
  account: Account,
  probe: AccountProber
): Promise<boolean> => {
  if (db.accounts.catalogs().some((one) => one.accountId === account.id)) {
    return true;
  }
  const read = await probe(machineId, account.id);
  if (!read) {
    return false;
  }
  const held = read.identity
    ? withOrgIdFrom(db, account, read.identity).identity
    : null;
  if (read.identity && held && sameIdentity(read.identity, held)) {
    keepProbe(db, account.id, read);
  }
  return true;
};

/**
 * Where one account dir stands, as its `auth status` read it for the
 * machine's latest report: signed out, signed in as its account (the first sign-in names the
 * account), or signed in as someone else (`mismatch`). `uncompared`: signed
 * in as an identity that names no organization id, which says nothing of
 * whose it is, so the store is left as it was, as an unread one is.
 */
const dirState = (
  db: DbShape,
  account: Account,
  report: AccountReport
): SigninState | "uncompared" => {
  if (report.provider && report.provider !== account.provider) {
    return "mismatch";
  }
  // A provider's credential that names nobody (a sign-in with no email) is
  // signed in as whoever it is; only one that names someone can mismatch.
  if (report.loggedIn && !report.identity && report.provider) {
    return "signed-in";
  }
  if (!(report.loggedIn && report.identity)) {
    return "signed-out";
  }
  if (!report.identity.orgId) {
    uncompared(
      report.identity,
      `${accountNameAmong(account, db.accounts.list())}'s store`
    );
    return "uncompared";
  }
  if (!account.identity) {
    // One identity is one account: a fresh account's store signed in as
    // another account's identity is not named after it. The sign-in's own
    // answer joins it into that account (server.ts `joinExisting`); until
    // then it is signed in as nobody of its own.
    if (db.accounts.byIdentity(account.provider, report.identity, account.id)) {
      return "signed-out";
    }
    db.accounts.setIdentity(account.id, report.identity);
    return "signed-in";
  }
  const held = withOrgIdFrom(db, account, report.identity).identity;
  return held && sameIdentity(held, report.identity) ? "signed-in" : "mismatch";
};

/**
 * Where one account store on `machineId` stands for a pass of a report
 * received at `receivedAt`, and whether the pass writes it. A sign-in settled
 * since the report came in stands. One the hub signed out when a session met
 * its credential refused for good (`reason`, server.ts `settleRefusal`)
 * stands too, reason and all, while the store reads signed in or signed out:
 * the store still holds that credential, which `auth status` reads as
 * signed in, so only a sign-in through CawCo brings it back. Signed in as
 * someone else is news, and is written.
 */
const squaredState = (
  db: DbShape,
  machineId: string,
  account: Account,
  report: AccountReport,
  receivedAt: number
): { state: SigninState; write: boolean } => {
  const here = db.accounts
    .signins()
    .find((one) => one.accountId === account.id && one.machineId === machineId);
  if (here && here.checkedAt > receivedAt) {
    return { state: here.state, write: false };
  }
  const state = dirState(db, account, report);
  if (state === "uncompared") {
    return { state: here?.state ?? "signed-out", write: false };
  }
  if (here?.state === "signed-out" && here.reason !== null) {
    return state === "mismatch"
      ? { state, write: true }
      : { state: "signed-out", write: false };
  }
  return { state, write: true };
};

/**
 * Squares the account sign-ins on `machineId` with what its agent just read
 * from every account store there of one kind: Claude's config dirs
 * (`claude`), or every other provider's credential stores (`providers`). Who
 * each store is signed in as decides its sign-in, every time, except one
 * settled since the report came in (`receivedAt`): a sign-in finished, or an
 * earlier pass of this same report, while it waited behind a probe; or one
 * the hub signed out on a refused credential ({@link squaredState}). A
 * store the report names `unread` (Claude Code gave no answer for it) is
 * left exactly as it was: no answer moves no sign-in. True when anything
 * changed; `failed` when a Claude catalog probe it needed could not be read,
 * which the caller retries.
 */
export const reconcileAccounts = async (
  db: DbShape,
  machineId: string,
  scope: "claude" | "providers",
  { reports, unread }: { reports: AccountReport[]; unread: string[] },
  receivedAt: number,
  probe: AccountProber
): Promise<Squared> => {
  const store = db.accounts;
  const ofScope = (account: Account | undefined): account is Account =>
    account !== undefined &&
    (account.provider === CLAUDE_PROVIDER) === (scope === "claude");
  const mine = store
    .signins()
    .filter(
      (one) => one.machineId === machineId && ofScope(store.get(one.accountId))
    );
  // Read afresh each time: a pass waits on probes, and a sign-in can settle
  // while it does.
  const settledSince = (accountId: string) =>
    store
      .signins()
      .find(
        (one) =>
          one.accountId === accountId &&
          one.machineId === machineId &&
          one.checkedAt > receivedAt
      );
  let changed = false;
  let failed = false;

  for (const report of reports) {
    const found = store.get(report.account);
    if (!ofScope(found)) {
      continue;
    }
    const { state, write } = squaredState(
      db,
      machineId,
      found,
      report,
      receivedAt
    );
    const account = store.get(found.id) ?? found;
    if (write) {
      changed =
        store.putSignin({ accountId: account.id, machineId, state }) || changed;
    }
    if (state === "signed-in" && scope === "claude") {
      // biome-ignore lint/performance/noAwaitInLoops: one dir's Claude Code at a time on the machine
      const read = await catalogFor(db, machineId, account, probe);
      failed = failed || !read;
    }
  }

  // An account store the machine no longer has is an account it is not
  // signed in to. One it has and could not read is not gone.
  for (const signin of mine) {
    const gone =
      signin.state !== "signed-out" &&
      !settledSince(signin.accountId) &&
      !unread.includes(signin.accountId) &&
      !reports.some((report) => report.account === signin.accountId);
    if (gone) {
      changed = store.putSignin({ ...signin, state: "signed-out" }) || changed;
    }
  }
  return { changed, failed };
};

/**
 * Whether Claude Code's error in place of an answer refused its account's
 * credential for good, read on the message's own `error` alone (the Agent
 * SDK's `SDKAssistantMessageError`): `authentication_failed` is a credential
 * the API turned down, so the account is signed out there, the message's
 * words its reason. Every other error (`server_error` among them, a refresh
 * another of its processes held as well as a server's failure) says nothing
 * of the credential, and is no sign-out.
 */
export const claudeCredentialRefused = (
  error: string | undefined,
  text: string
): { reason: string } | undefined =>
  error === "authentication_failed"
    ? { reason: text.trim() || "Claude Code's sign-in was refused" }
    : undefined;

/** Why extra usage is off, by Claude Code's `overageDisabledReason`, in words. */
const OFF_REASONS: Record<string, string> = {
  overage_not_provisioned: "not set up for this account",
  no_limits_configured: "not set up for this account",
  org_level_disabled: "turned off by the organization",
  org_service_level_disabled: "turned off by the organization",
  org_level_disabled_until: "turned off by the organization for now",
  seat_tier_level_disabled: "turned off for this seat",
  member_level_disabled: "turned off for this member",
  out_of_credits: "out of credits",
  seat_tier_zero_credit_limit: "no credit allowed for this seat",
  group_zero_credit_limit: "no credit allowed for this group",
  member_zero_credit_limit: "no credit allowed for this member",
};

/**
 * Extra usage as the account's last `rate_limit_event` said: on while
 * requests past the plan may run as extra usage (`overageStatus` allowed or
 * allowed with a warning), off when they are refused.
 */
const extraUsageOf = (
  overage: AccountOverage | null
): ClaudeExtraUsage | null => {
  if (!overage?.status) {
    return overage?.inUse
      ? { on: true, inUse: true, offReason: null, resetsAt: overage.resetsAt }
      : null;
  }
  const on = overage.status !== "rejected";
  return {
    on,
    inUse: overage.inUse,
    offReason:
      on || !overage.disabledReason
        ? null
        : (OFF_REASONS[overage.disabledReason] ?? null),
    resetsAt: overage.resetsAt,
  };
};

/**
 * An account's reading as `ClaudeLimits`. A window whose reset has passed
 * with no newer report reads 0%: it has rolled over, and nothing has been
 * spent in the new one that anyone has heard of. The reading is current for
 * `currentFor` after its time (the last report on the account, or a later
 * turn there that changed nothing); past that it is stale, as of its time.
 * `signedIn`: the account is signed in on some machine, so a reading can
 * still come; one signed in nowhere with none says so.
 */
export const limitsOf = (
  reading: AccountReading | undefined,
  currentFor: number,
  signedIn: boolean,
  now = Date.now()
): ClaudeLimits => {
  const base = {
    extraUsage: extraUsageOf(reading?.overage ?? null),
    fetchedAt: reading?.lastSeenAt ?? now,
    subscription: reading?.subscription ?? null,
  };
  if (!reading || reading.windows.length === 0) {
    return signedIn
      ? {
          ...base,
          stale: false,
          windows: [],
          error: "no reading yet",
          errorKind: "no-reading",
        }
      : {
          ...base,
          stale: false,
          windows: [],
          error: "not signed in",
          errorKind: "not-signed-in",
        };
  }
  return {
    ...base,
    stale: now - reading.lastSeenAt >= currentFor,
    error: null,
    errorKind: null,
    windows: reading.windows.map((window) =>
      window.resetsAt && Date.parse(window.resetsAt) <= now
        ? { ...window, percent: 0, severity: "normal", isActive: false }
        : window
    ),
  };
};

/**
 * The account that speaks for a machine where a choice needs one Claude
 * account there (its default model's catalog), out of sign-ins already read:
 * the first account signed in there.
 */
// Also fills the per-machine `limits` BRIDGE (wire-compat.ts, {@link usageLimits}); the bridge's deletion takes that use, not this.
const speakerAmong = (
  signins: readonly AccountSignin[],
  claude: ReadonlySet<string>,
  machineId: string
): string | undefined =>
  signins.find(
    (one) =>
      one.machineId === machineId &&
      one.state === "signed-in" &&
      claude.has(one.accountId)
  )?.accountId;

/** The ids of the Claude accounts. */
const claudeAccounts = (db: DbShape): Set<string> =>
  new Set(
    db.accounts
      .list()
      .filter((account) => account.provider === CLAUDE_PROVIDER)
      .map((account) => account.id)
  );

/** {@link speakerAmong}, reading the sign-ins for one machine's answer. */
export const machineAccount = (
  db: DbShape,
  machineId: string
): string | undefined =>
  speakerAmong(db.accounts.signins(), claudeAccounts(db), machineId);

/** A session as its account is read off it. */
interface SessionOnAccount {
  accountId: string | null;
  machineId: string;
}

/** Two of a machine's 5-minute reads: a provider reading younger than this is current. */
const PROVIDER_CURRENT_MS = 10 * 60_000;

/**
 * The accounts as one read sees them: each account's reading, and where
 * each is signed in. Read once per pass over the sessions, never once per
 * session: a board is thousands of rows, and reading every session again for
 * each of them is what held the hub's one thread for minutes once its first
 * account existed (nightly 2069, 2026-10-08).
 */
const accountsView = (db: DbShape) => {
  const readings = new Map(
    db.accounts.readings().map((reading) => [reading.accountId, reading])
  );
  const signedIn = new Set(
    db.accounts
      .signins()
      .filter((one) => one.state === "signed-in")
      .map((one) => one.accountId)
  );
  const claude = claudeAccounts(db);
  return {
    limits: (accountId: string, now: number): ClaudeLimits =>
      limitsOf(
        readings.get(accountId),
        // Claude's windows move only on its sessions' reports; any other
        // provider's are read by its machines every 5 minutes.
        claude.has(accountId) ? CLAUDE_READING_CURRENT_MS : PROVIDER_CURRENT_MS,
        signedIn.has(accountId),
        now
      ),
  };
};

/**
 * The limits each session runs under (its account's), read off one read of
 * the accounts: take one per pass over the sessions and ask it for each.
 */
export const sessionLimitsReader = (
  db: DbShape,
  now = Date.now()
): ((row: SessionOnAccount) => ClaudeLimits | undefined) => {
  const view = accountsView(db);
  return (row) => (row.accountId ? view.limits(row.accountId, now) : undefined);
};

/** A machine's Claude line where no Claude account is signed in there (the BRIDGE's). */
const notSignedIn = (now: number): ClaudeLimits => ({
  extraUsage: null,
  fetchedAt: now,
  stale: false,
  subscription: null,
  windows: [],
  error: "not signed in",
  errorKind: "not-signed-in",
});

/**
 * What the usage screens read (`/api/usage/limits`): each Claude account's
 * own limits, by account; and each machine's OpenCode Go plan, read with its
 * own key. `machines` is a BRIDGE (scripts/wire-compat.ts) for TestFlight
 * builds that read limits per machine, Claude's there the first account
 * signed in on it ({@link machineAccount}). It goes in the change that
 * expires those builds; nothing on this build reads it.
 */
export const usageLimits = (
  db: DbShape,
  now = Date.now()
): UsageLimitsResponse => {
  const view = accountsView(db);
  const goByMachine = new Map(
    db.listUsageLimits().map((row) => [row.machineId, row.openCodeGo])
  );
  const signins = db.accounts.signins();
  const claude = claudeAccounts(db);
  return {
    claude: db.accounts
      .list()
      .filter((account) => account.provider === CLAUDE_PROVIDER)
      .map((account) => ({
        accountId: account.id,
        limits: view.limits(account.id, now),
      })),
    machines: db.listAgents().flatMap((agent) => {
      const go = goByMachine.get(agent.machineId) ?? null;
      const speaker = speakerAmong(signins, claude, agent.machineId);
      if (!(go || speaker)) {
        return [];
      }
      return [
        {
          machineId: agent.machineId,
          hostname: agent.hostname,
          limits: speaker ? view.limits(speaker, now) : notSignedIn(now),
          openCodeGo: go,
        },
      ];
    }),
    openCodeGo: db.listAgents().flatMap((agent) => {
      const plan = goByMachine.get(agent.machineId);
      return plan
        ? [{ machineId: agent.machineId, hostname: agent.hostname, plan }]
        : [];
    }),
  };
};

/** The `kind: 'usage'` frame's limits: {@link usageLimits}, its machines in the frame's shape. */
export const usageFrameLimits = (
  db: DbShape,
  now = Date.now()
): Pick<UsageLimitsResponse, "claude" | "openCodeGo"> & {
  limits: UsageLimitsReading[];
} => {
  const read = usageLimits(db, now);
  return {
    claude: read.claude,
    openCodeGo: read.openCodeGo,
    limits: read.machines.map((machine) => ({
      machineId: machine.machineId,
      payload: machine.limits,
      openCodeGo: machine.openCodeGo,
      fetchedAt: new Date(now),
    })),
  };
};

/**
 * A Claude turn on `accountId` ended at `at` on `machineId` with no report
 * of its limits: Claude Code emits a `rate_limit_event` whenever a window's
 * rounded percent or reset moves, so the account's windows still stood
 * then. Taken only from a machine the account is signed in on, as its
 * reports are (server.ts, `rate_limit_event`). True when the reading's
 * time moved.
 */
export const confirmReading = (
  db: DbShape,
  accountId: string,
  machineId: string,
  at: number
): boolean => {
  const signedIn = db.accounts
    .signins()
    .some(
      (one) =>
        one.accountId === accountId &&
        one.machineId === machineId &&
        one.state === "signed-in"
    );
  return signedIn && db.accounts.confirmReading(accountId, at) !== undefined;
};

/**
 * An account's windows as one of its machines just read them from the
 * provider's own usage endpoint. Kept only while the account is signed in
 * there; a failed read keeps the last reading as it was, with its time. A
 * window at its limit benches the account until it resets, as a refused
 * Claude request does. True when the reading moved.
 */
export const noteProviderReading = (
  db: DbShape,
  machineId: string,
  reading: ProviderAccountReading
): boolean => {
  const signedIn = db.accounts
    .signins()
    .some(
      (one) =>
        one.accountId === reading.accountId &&
        one.machineId === machineId &&
        one.state === "signed-in"
    );
  if (!signedIn) {
    return false;
  }
  if (reading.error) {
    console.warn(
      `[accounts] ${reading.accountId}'s windows were not read on ${machineId}: ${reading.error}; the last reading stays`
    );
    return false;
  }
  db.accounts.putReading(
    reading.accountId,
    { windows: reading.windows, subscription: reading.plan },
    reading.readAt
  );
  for (const window of reading.windows) {
    const until = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
    if (window.percent >= 100 && Number.isFinite(until) && until > Date.now()) {
      db.accounts.setBench(reading.accountId, null, until);
    }
  }
  return true;
};

/**
 * A `rate_limit_event` from a session on `accountId`: the account's windows
 * move, its overage state with them, and a window that refused a request
 * benches the account (for that model, or for every one) until it resets.
 *
 * Every session on the account reports, each from the headers of its own
 * latest response, so events arrive out of order: a session whose last
 * response came earlier says a lower percent after another said a higher
 * one. Within one window (same kind, scope and reset) use only accumulates
 * until the reset, so a lower percent there is an older header, and the
 * window keeps the higher reading.
 */
export const noteRateLimit = (
  db: DbShape,
  accountId: string,
  info: ObservedRateLimitInfo,
  now = Date.now()
): void => {
  const observed = observedReading(info);
  const held =
    db.accounts.readings().find((one) => one.accountId === accountId)
      ?.windows ?? [];
  const newer = observed.windows.filter(
    (window) =>
      !held.some(
        (prior) =>
          prior.kind === window.kind &&
          prior.scopeLabel === window.scopeLabel &&
          prior.resetsAt === window.resetsAt &&
          prior.percent > window.percent
      )
  );
  db.accounts.putReading(
    accountId,
    {
      windows: newer,
      ...(observed.overage ? { overage: observed.overage } : {}),
    },
    now
  );
  if (observed.exhausted) {
    const until = observed.exhausted.resetsAt
      ? Date.parse(observed.exhausted.resetsAt)
      : Number.NaN;
    // A refusal that names no reset benches nothing: there is no time to
    // bench it until, and a guessed one would hold a good account out.
    if (Number.isFinite(until) && until > now) {
      db.accounts.setBench(accountId, observed.exhausted.scope, until);
    }
  }
};
