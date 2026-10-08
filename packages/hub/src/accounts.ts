import {
  type Account,
  type AccountIdentity,
  type AccountKind,
  type AccountOverage,
  type AccountProbe,
  type AccountReading,
  type AccountSignin,
  type ClaudeAccountReport,
  type ClaudeExtraUsage,
  type ClaudeLimits,
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

/** Asks a machine's Claude harness for one dir's initialize response; undefined when it could not say. */
export type AccountProber = (
  machineId: string,
  account: string | null
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
 * The machine's own `~/.claude` login is `identity`, as its `auth status` or a
 * session's initialize response just said: it is the account of that
 * identity, made now when the hub has none, and it is the only account home
 * on the machine. Machines signed in as the same email and organization share
 * one account; a different identity is another, whichever machine registers
 * first. The account lives in `~/.claude` on that machine (`home`); no
 * credential moves. The limit history read from that login before accounts
 * moves to it, the account of the identity the login answers as.
 */
export const homeIs = (
  db: DbShape,
  machineId: string,
  identity: AccountIdentity,
  kind: AccountKind
): { account: Account; changed: boolean } => {
  const store = db.accounts;
  let changed = false;
  let account = store
    .list()
    .find((one) => one.identity && sameIdentity(one.identity, identity));
  if (!account) {
    // No nickname: it goes by the email it is signed in as.
    account = store.create({ provider: "anthropic", kind, identity });
    changed = true;
  }
  for (const signin of store.signins()) {
    if (
      signin.machineId === machineId &&
      signin.home &&
      signin.accountId !== account.id
    ) {
      // `~/.claude` is someone else now: the account it held is not signed
      // in on this machine any more.
      changed = store.removeSignin(signin.accountId, machineId) || changed;
    }
  }
  changed =
    store.putSignin({
      accountId: account.id,
      machineId,
      state: "signed-in",
      home: true,
    }) || changed;
  changed = store.adoptMachineHistory(machineId, account.id) > 0 || changed;
  return { account, changed };
};

/**
 * The account's models, read through a probe of its dir on the machine when
 * the hub has none yet; kept only when the dir still answers as the account.
 * False when the probe could not be read, which the caller retries.
 */
const catalogFor = async (
  db: DbShape,
  machineId: string,
  dir: string | null,
  account: Account,
  probe: AccountProber
): Promise<boolean> => {
  if (db.accounts.catalogs().some((one) => one.accountId === account.id)) {
    return true;
  }
  const read = await probe(machineId, dir);
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
 * The machine's own `~/.claude` login, as its `auth status` read it for the
 * machine's latest report: signed in as someone, it is that identity's account
 * ({@link homeIs}); signed out, the account it held is signed out there.
 * Signed in as nobody the hub can name (an API key, a third-party provider),
 * it is no account.
 */
const squareHome = async (
  db: DbShape,
  machineId: string,
  home: ClaudeAccountReport,
  probe: AccountProber
): Promise<Squared> => {
  const store = db.accounts;
  if (!(home.loggedIn && home.identity)) {
    let changed = false;
    for (const signin of store.signins()) {
      if (signin.machineId === machineId && signin.home) {
        changed =
          store.putSignin({ ...signin, state: "signed-out" }) || changed;
      }
    }
    return { changed, failed: false };
  }
  const { account, changed } = homeIs(
    db,
    machineId,
    home.identity,
    home.kind ?? "subscription"
  );
  const read = await catalogFor(db, machineId, null, account, probe);
  return { changed, failed: !read };
};

/**
 * Where one account dir stands, as its `auth status` read it for the
 * machine's latest report: signed out, signed in as its account (the first sign-in names the
 * account), or signed in as someone else (`mismatch`).
 */
const dirState = (
  db: DbShape,
  account: Account,
  report: ClaudeAccountReport
): SigninState => {
  if (!(report.loggedIn && report.identity)) {
    return "signed-out";
  }
  if (!account.identity) {
    db.accounts.setIdentity(account.id, report.identity);
    return "signed-in";
  }
  return sameIdentity(account.identity, report.identity)
    ? "signed-in"
    : "mismatch";
};

/**
 * Squares the account sign-ins on `machineId` with what its agent just read
 * from every Claude Code config dir there: who each dir is signed in as
 * decides its sign-in, every time. True when anything changed; `failed` when
 * a catalog probe it needed could not be read, which the caller retries.
 */
export const reconcileAccounts = async (
  db: DbShape,
  machineId: string,
  reports: ClaudeAccountReport[],
  probe: AccountProber
): Promise<Squared> => {
  const store = db.accounts;
  const mine = store.signins().filter((one) => one.machineId === machineId);
  const home = reports.find((report) => report.account === null);
  const squared = home
    ? await squareHome(db, machineId, home, probe)
    : { changed: false, failed: false };
  let { changed, failed } = squared;

  for (const report of reports) {
    const found = report.account ? store.get(report.account) : undefined;
    if (!found) {
      continue;
    }
    const state = dirState(db, found, report);
    const account = store.get(found.id) ?? found;
    changed =
      store.putSignin({
        accountId: account.id,
        machineId,
        state,
        home: false,
      }) || changed;
    if (state === "signed-in") {
      // biome-ignore lint/performance/noAwaitInLoops: one dir's Claude Code at a time on the machine
      const read = await catalogFor(db, machineId, account.id, account, probe);
      failed = failed || !read;
    }
  }

  // An account dir the machine no longer has is an account it is not signed in to.
  for (const signin of mine) {
    const gone =
      !signin.home &&
      signin.state !== "signed-out" &&
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
 * reading per machine, out of sign-ins already read: its `~/.claude` login,
 * else the first account signed in there.
 */
const speakerAmong = (
  signins: readonly AccountSignin[],
  machineId: string
): string | undefined => {
  const signed = signins.filter(
    (one) => one.machineId === machineId && one.state === "signed-in"
  );
  return (signed.find((one) => one.home) ?? signed[0])?.accountId;
};

/** {@link speakerAmong}, reading the sign-ins for one machine's answer. */
export const machineAccount = (
  db: DbShape,
  machineId: string
): string | undefined => speakerAmong(db.accounts.signins(), machineId);

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
  /** The account a Claude session runs on: its own, else its machine's. */
  const accountOf = (row: SessionOnAccount): string | undefined =>
    row.accountId ?? speakerAmong(signins, row.machineId);
  const watched = new Set(
    db.runningClaudeSessions().flatMap((row) => {
      const id = accountOf(row);
      return id ? [id] : [];
    })
  );
  return {
    accountOf,
    speakerFor: (machineId: string) => speakerAmong(signins, machineId),
    limits: (accountId: string, now: number): ClaudeLimits =>
      limitsOf(readings.get(accountId), watched.has(accountId), now),
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

/**
 * A `rate_limit_event` from a session on `accountId`: the account's windows
 * move, its overage state with them, and a window that refused a request
 * benches the account (for that model, or for every one) until it resets.
 */
export const noteRateLimit = (
  db: DbShape,
  accountId: string,
  info: ObservedRateLimitInfo,
  now = Date.now()
): void => {
  const observed = observedReading(info);
  db.accounts.putReading(
    accountId,
    {
      windows: observed.windows,
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
