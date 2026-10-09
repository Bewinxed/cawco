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
  CLAUDE_PROVIDER,
  type ClaudeExtraUsage,
  type ClaudeLimits,
  type ProviderAccountReading,
  type SigninState,
  sameIdentity,
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
): Account =>
  db.accounts
    .list()
    .find(
      (one) =>
        one.provider === provider &&
        one.identity &&
        sameIdentity(one.identity, identity)
    ) ?? db.accounts.create({ provider, kind, identity });

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
  if (
    read.identity &&
    account.identity &&
    sameIdentity(read.identity, account.identity)
  ) {
    keepProbe(db, account.id, read);
  }
  return true;
};

/**
 * Where one account dir stands, as its `auth status` read it for the
 * machine's latest report: signed out, signed in as its account (the first sign-in names the
 * account), or signed in as someone else (`mismatch`).
 */
const dirState = (
  db: DbShape,
  account: Account,
  report: AccountReport
): SigninState => {
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
  if (!account.identity) {
    // One identity is one account: a fresh account's store signed in as
    // another account's identity is not named after it. The sign-in's own
    // answer joins it into that account (server.ts `joinExisting`); until
    // then it is signed in as nobody of its own.
    const taken = report.identity;
    if (
      db.accounts
        .list()
        .some(
          (one) =>
            one.id !== account.id &&
            one.provider === account.provider &&
            one.identity !== null &&
            sameIdentity(one.identity, taken)
        )
    ) {
      return "signed-out";
    }
    db.accounts.setIdentity(account.id, report.identity);
    return "signed-in";
  }
  return sameIdentity(account.identity, report.identity)
    ? "signed-in"
    : "mismatch";
};

/**
 * Squares the account sign-ins on `machineId` with what its agent just read
 * from every account store there of one kind: Claude's config dirs
 * (`claude`), or every other provider's credential stores (`providers`). Who
 * each store is signed in as decides its sign-in, every time, except one
 * settled since the report came in (`receivedAt`): a sign-in finished, or an
 * earlier pass of this same report, while it waited behind a probe. True
 * when anything changed; `failed` when a Claude catalog probe it needed
 * could not be read, which the caller retries.
 */
export const reconcileAccounts = async (
  db: DbShape,
  machineId: string,
  scope: "claude" | "providers",
  reports: AccountReport[],
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
    const settled = settledSince(found.id);
    const state = settled ? settled.state : dirState(db, found, report);
    const account = store.get(found.id) ?? found;
    if (!settled) {
      changed =
        store.putSignin({ accountId: account.id, machineId, state }) || changed;
    }
    if (state === "signed-in" && scope === "claude") {
      // biome-ignore lint/performance/noAwaitInLoops: one dir's Claude Code at a time on the machine
      const read = await catalogFor(db, machineId, account, probe);
      failed = failed || !read;
    }
  }

  // An account store the machine no longer has is an account it is not signed in to.
  for (const signin of mine) {
    const gone =
      signin.state !== "signed-out" &&
      !settledSince(signin.accountId) &&
      !reports.some((report) => report.account === signin.accountId);
    if (gone) {
      changed = store.putSignin({ ...signin, state: "signed-out" }) || changed;
    }
  }
  return { changed, failed };
};

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
 * spent in the new one that anyone has heard of. `watched`: a session runs
 * on the account, so Claude Code reports every change and the reading is
 * current however long ago it last moved; otherwise it is stale, since use
 * from anywhere else goes unseen.
 */
export const limitsOf = (
  reading: AccountReading | undefined,
  watched: boolean,
  now = Date.now()
): ClaudeLimits => {
  const base = {
    extraUsage: extraUsageOf(reading?.overage ?? null),
    fetchedAt: reading?.lastSeenAt ?? now,
    subscription: reading?.subscription ?? null,
  };
  if (!reading || reading.windows.length === 0) {
    return { ...base, stale: false, windows: [], error: "no reading yet" };
  }
  return {
    ...base,
    stale: !watched,
    error: null,
    windows: reading.windows.map((window) =>
      window.resetsAt && Date.parse(window.resetsAt) <= now
        ? { ...window, percent: 0, severity: "normal", isActive: false }
        : window
    ),
  };
};

/**
 * The account that speaks for a machine where a screen shows one Claude
 * reading per machine, out of sign-ins already read: the first account
 * signed in there.
 */
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

/**
 * The accounts as one read sees them: who speaks for each machine, each
 * account's reading, and which accounts a running Claude session is on.
 * Read once per pass over the sessions, never once per session: a board is
 * thousands of rows, and reading every session again for each of them is what
 * held the hub's one thread for minutes once its first account existed
 * (nightly 2069, 2026-10-08).
 */
const accountsView = (db: DbShape) => {
  const signins = db.accounts.signins();
  const readings = new Map(
    db.accounts.readings().map((reading) => [reading.accountId, reading])
  );
  /** The account a Claude session runs on; none for one that runs on no CawCo account. */
  const accountOf = (row: SessionOnAccount): string | undefined =>
    row.accountId ?? undefined;
  const watched = new Set(
    db.runningClaudeSessions().flatMap((row) => {
      const id = accountOf(row);
      return id ? [id] : [];
    })
  );
  const claude = claudeAccounts(db);
  // Any other provider's windows are read by its machines every 5 minutes,
  // whatever runs on it: current while the last read is that recent.
  const current = (accountId: string, now: number): boolean =>
    watched.has(accountId) ||
    (!claude.has(accountId) &&
      now - (readings.get(accountId)?.lastSeenAt ?? 0) < PROVIDER_CURRENT_MS);
  return {
    accountOf,
    speakerFor: (machineId: string) => speakerAmong(signins, claude, machineId),
    limits: (accountId: string, now: number): ClaudeLimits =>
      limitsOf(readings.get(accountId), current(accountId, now), now),
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
  return (row) => {
    const accountId = view.accountOf(row);
    return accountId ? view.limits(accountId, now) : undefined;
  };
};

/**
 * Every machine's readings in the shape the usage screens read: Claude's from
 * the account that speaks for it ({@link machineAccount}), OpenCode Go's from
 * its own key. A machine with neither has no reading.
 */
export const machineReadings = (db: DbShape, now = Date.now()) => {
  const goByMachine = new Map(
    db.listUsageLimits().map((row) => [row.machineId, row])
  );
  const view = accountsView(db);
  return db.listAgents().flatMap((agent) => {
    const go = goByMachine.get(agent.machineId);
    const accountId = view.speakerFor(agent.machineId);
    if (!(go || accountId)) {
      return [];
    }
    const payload: ClaudeLimits = accountId
      ? view.limits(accountId, now)
      : {
          extraUsage: null,
          fetchedAt: now,
          stale: false,
          subscription: null,
          windows: [],
          error: "not signed in",
        };
    return [
      {
        machineId: agent.machineId,
        hostname: agent.hostname,
        payload,
        openCodeGo: go?.openCodeGo ?? null,
        fetchedAt: new Date(
          Math.max(payload.fetchedAt, go?.fetchedAt.getTime() ?? 0)
        ),
      },
    ];
  });
};

/** Two of a machine's 5-minute reads: a provider reading younger than this is current. */
const PROVIDER_CURRENT_MS = 10 * 60_000;

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
