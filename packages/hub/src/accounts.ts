import {
  type Account,
  type AccountOverage,
  type AccountProbe,
  type AccountReading,
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

/**
 * Squares the account sign-ins on `machineId` with what its agent just read
 * from every Claude Code config dir there. True when anything changed; false
 * also when a probe it needed failed, which the caller retries.
 *
 * Who a dir is signed in as is asked only where the hub knows nothing yet: a
 * `~/.claude` login with no account, an account with no identity or no
 * catalog. The machine's own `~/.claude` login becomes an account the first
 * time it is seen, matched by identity: machines signed in as the same email
 * and organization share one account, a different identity is another. That
 * account lives in `~/.claude` on that machine (`home`); no credential moves.
 * The limit history read from that login before accounts moves to it then.
 */
/** What one step of a reconcile did. */
interface Squared {
  changed: boolean;
  failed: boolean;
}

/**
 * The machine's own `~/.claude` login: known, it stays as it is; new, the
 * probe says who it is, and it joins (or makes) the account of that identity.
 */
const squareHome = async (
  db: DbShape,
  machineId: string,
  home: ClaudeAccountReport,
  probe: AccountProber
): Promise<Squared> => {
  const store = db.accounts;
  const mine = store.signins().filter((one) => one.machineId === machineId);
  const homeSignin = mine.find((one) => one.home);
  if (!home.loggedIn) {
    return {
      changed: homeSignin
        ? store.putSignin({ ...homeSignin, state: "signed-out" })
        : false,
      failed: false,
    };
  }
  const cataloged = store
    .catalogs()
    .some((one) => one.accountId === homeSignin?.accountId);
  if (homeSignin && cataloged) {
    return {
      changed: store.putSignin({ ...homeSignin, state: "signed-in" }),
      failed: false,
    };
  }
  const read = await probe(machineId, null);
  const identity = read?.identity;
  if (!(read && identity)) {
    return { changed: false, failed: !read };
  }
  let changed = false;
  let account = store
    .list()
    .find((one) => one.identity && sameIdentity(one.identity, identity));
  if (!account) {
    // No nickname: it goes by the email it is signed in as.
    account = store.create({
      provider: "anthropic",
      kind: home.kind ?? "subscription",
      identity,
    });
    changed = true;
  }
  keepProbe(db, account.id, read);
  for (const signin of mine.filter((one) => one.home)) {
    if (signin.accountId !== account.id) {
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
  // What the hub read from this `~/.claude` before accounts was this
  // account's use all along.
  changed = store.adoptMachineHistory(machineId, account.id) > 0 || changed;
  return { changed, failed: false };
};

/**
 * Where one account dir stands: signed out, signed in as its account (the
 * first sign-in names the account), or signed in as someone else. Undefined
 * when the probe it needed could not be read.
 */
const dirState = async (
  db: DbShape,
  machineId: string,
  account: Account,
  loggedIn: boolean,
  probe: AccountProber
): Promise<SigninState | undefined> => {
  if (!loggedIn) {
    return "signed-out";
  }
  const store = db.accounts;
  const known = store.catalogs().some((one) => one.accountId === account.id);
  if (account.identity && known) {
    const was = store
      .signins()
      .find(
        (one) => one.accountId === account.id && one.machineId === machineId
      );
    return was?.state === "mismatch" ? "mismatch" : "signed-in";
  }
  const read = await probe(machineId, account.id);
  if (!read) {
    return undefined;
  }
  const { identity } = read;
  if (!identity) {
    return "signed-out";
  }
  if (account.identity && !sameIdentity(account.identity, identity)) {
    return "mismatch";
  }
  if (!account.identity) {
    store.setIdentity(account.id, identity);
  }
  keepProbe(db, account.id, read);
  return "signed-in";
};

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
    const account = report.account ? store.get(report.account) : undefined;
    if (!account) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one dir's Claude Code at a time on the machine
    const state = await dirState(
      db,
      machineId,
      account,
      report.loggedIn,
      probe
    );
    if (!state) {
      failed = true;
      continue;
    }
    changed =
      store.putSignin({
        accountId: account.id,
        machineId,
        state,
        home: false,
      }) || changed;
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

/** The account a Claude session runs on: its own, else its machine's. */
const accountOfSession = (
  db: DbShape,
  row: { accountId: string | null; machineId: string }
): string | undefined => row.accountId ?? machineAccount(db, row.machineId);

/** The accounts a running Claude session is on. */
const watchedAccounts = (db: DbShape): Set<string> => {
  const watched = new Set<string>();
  for (const row of db.listInstances()) {
    const id =
      row.status === "running" && row.harness === "claude"
        ? accountOfSession(db, row)
        : undefined;
    if (id) {
      watched.add(id);
    }
  }
  return watched;
};

/** The limits a session runs under: its account's. */
export const sessionLimits = (
  db: DbShape,
  row: { accountId: string | null; machineId: string },
  now = Date.now()
): ClaudeLimits | undefined => {
  const accountId = accountOfSession(db, row);
  if (!accountId) {
    return undefined;
  }
  return limitsOf(
    db.accounts.readings().find((one) => one.accountId === accountId),
    watchedAccounts(db).has(accountId),
    now
  );
};

/**
 * The account that speaks for a machine where a screen shows one Claude
 * reading per machine: its `~/.claude` login, else the first account signed
 * in there.
 */
export const machineAccount = (
  db: DbShape,
  machineId: string
): string | undefined => {
  const signed = db.accounts
    .signins()
    .filter((one) => one.machineId === machineId && one.state === "signed-in");
  return (signed.find((one) => one.home) ?? signed[0])?.accountId;
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
  const readings = db.accounts.readings();
  const watched = watchedAccounts(db);
  return db.listAgents().flatMap((agent) => {
    const go = goByMachine.get(agent.machineId);
    const accountId = machineAccount(db, agent.machineId);
    if (!(go || accountId)) {
      return [];
    }
    const payload: ClaudeLimits = accountId
      ? limitsOf(
          readings.find((one) => one.accountId === accountId),
          watched.has(accountId),
          now
        )
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
