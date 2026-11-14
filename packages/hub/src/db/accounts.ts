import {
  type Account,
  type AccountBench,
  type AccountCatalog,
  type AccountIdentity,
  type AccountKind,
  type AccountOverage,
  type AccountProvider,
  type AccountReading,
  type AccountSetupStep,
  type AccountSignin,
  type AtLimit,
  defaultRouting,
  type HomeStore,
  type ProviderRouting,
  RESTRICTIVE_AT_LIMIT,
  type RefusalReach,
} from "@cawco/core/accounts";
import { ACCOUNT_HUES, type AccountHue } from "@cawco/core/accounts/kinds";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { DAY_MS } from "@cawco/core/time";
import type { LimitWindow } from "@cawco/core/usage/types";
import { windowKey as windowSetKey } from "@cawco/core/usage/windows";
import { and, asc, eq, gt, gte, inArray, lte, max, ne, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import {
  accountBench,
  accountCatalogs,
  accountLeaves,
  accountModelEfforts,
  accountReadings,
  accountRouting,
  accountSignins,
  accounts,
  accountWindows,
  loginMoves,
  movedFromSessions,
  projectAccounts,
  projects,
  removedAccounts,
  strandedSessions,
  usageLimitHistory,
} from "./schema";

/** 30 days — long enough to cover several weekly windows, short enough that the table stays small. */
const LIMIT_HISTORY_RETENTION_MS = 30 * DAY_MS;

/** What an account's editable settings may be patched with. */
type AccountPatch = Partial<
  Pick<
    Account,
    "atPlanLimit" | "hue" | "label" | "neverBackup" | "order" | "reservePct"
  > & { setupStep: AccountSetupStep | null }
>;

type AccountHistoryRow = typeof usageLimitHistory.$inferSelect;

/** A credential moving out of a machine's own store into an account (`login_moves`). */
export interface LoginMove {
  accountId: string;
  identity: AccountIdentity;
  machineId: string;
  /** The account provider it is for; Claude's for `~/.claude`'s login. */
  provider: AccountProvider;
  since: number;
  store: HomeStore;
  /** The provider's id in the store it leaves (OpenCode's `openai` for ChatGPT). */
  storeProvider: string;
}

/**
 * A removed account's store a machine still holds because a process there
 * still runs in it (`account_leaves`): signed out there once none does.
 */
export interface AccountLeave {
  accountId: string;
  machineId: string;
  provider: AccountProvider;
  since: number;
}

/** A session left on no account by its account's removal or sign-out there (`stranded_sessions`). */
export interface StrandedSession {
  accountName: string;
  instanceId: string;
  why: "removed" | "signed-out";
}

export interface AccountsDb {
  /** The provider's saved at-limit policy as it was stored, when it does not read whole (migration 0399); null when it reads or none is saved. */
  readonly atLimitUnread: (provider: AccountProvider) => string | null;
  readonly bench: (now?: number) => AccountBench[];
  /**
   * The provider's account signed in as `identity` (core `sameIdentity`:
   * the email in any case, the same organization id), but `except`; one
   * indexed lookup. None for an identity with no organization id: it is
   * the same as no other.
   */
  readonly byIdentity: (
    provider: AccountProvider,
    identity: AccountIdentity,
    except?: string
  ) => Account | undefined;
  readonly catalogs: () => AccountCatalog[];
  /**
   * A turn on the account ended at `at` with no report: Claude Code reports
   * whenever a window moves, so its windows still stand then. Moves the
   * reading's time on (never back); nothing for an account with no windows.
   * The time it held before, when it moved; undefined when nothing moved.
   */
  readonly confirmReading: (
    accountId: string,
    at: number
  ) => number | undefined;
  readonly create: (draft: {
    hue?: AccountHue;
    identity?: AccountIdentity;
    kind: AccountKind;
    label?: string | null;
    provider: AccountProvider;
    /** Made by a setup still under way: the step it stands at. */
    setupStep?: AccountSetupStep;
  }) => Account;
  /** The leave of `accountId` from `machineId` is over: its store there is signed out. */
  readonly dropLeave: (accountId: string, machineId: string) => void;
  readonly get: (id: string) => Account | undefined;
  readonly history: (q: {
    accountId: string;
    kind?: string;
    since?: number;
    until?: number;
  }) => AccountHistoryRow[];
  /**
   * Drops the account's sign-in on `machineId` and keeps its store there as
   * a leave ({@link AccountLeave}), in one step: a process there still runs
   * in it. No report puts that sign-in back while the leave stands
   * ({@link putSignin}). False when the account is gone.
   */
  readonly leaveMachine: (accountId: string, machineId: string) => boolean;
  /** The removed accounts' stores machines still hold under a running process. */
  readonly leaves: () => AccountLeave[];
  readonly list: () => Account[];
  /** The sessions still running from a moved credential, by instance id → machine id. */
  readonly movedFrom: () => Map<string, string>;
  /** The credentials moving now. */
  readonly moves: () => LoginMove[];
  readonly patch: (id: string, patch: AccountPatch) => Account | undefined;
  /** The account's models as its Claude Code just answered; learned efforts stay. */
  readonly putCatalog: (
    accountId: string,
    models: ModelInfo[],
    at?: number
  ) => void;
  /** The effort `model` ran at on the account when a session asked for none. */
  readonly putDefaultEffort: (
    accountId: string,
    model: string,
    effort: string
  ) => void;
  readonly putMove: (move: LoginMove) => void;
  readonly putMovedFrom: (instanceIds: string[], machineId: string) => void;
  /**
   * Lays one report over the account's reading: windows replace the ones of
   * the same kind and scope, the rest are kept, except a kept one whose reset
   * has passed by `at`, which is over, and one outside the window set the
   * report names (`windowKinds`, core `AccountReading.windowKinds`), which
   * the account no longer has: both are dropped. A report naming no set
   * keeps the one held. Appends every window that moved to the history
   * series. The reading's time is `at` only when the report carries
   * windows: a plan alone (a probe's, a session's start) says nothing of
   * them.
   */
  readonly putReading: (
    accountId: string,
    report: ReadingReport,
    at?: number
  ) => void;
  /**
   * Whether the row changed. `moved` left out keeps what the row says about
   * a move (when, and from which store); null clears it; a new row says none.
   * `reason` is the row's from now on; left out, it has none.
   */
  readonly putSignin: (
    signin: Omit<
      AccountSignin,
      "checkedAt" | "movedAt" | "movedFrom" | "reason" | "refusalReach"
    > & {
      moved?: { at: number; from: HomeStore } | null;
      reason?: string | null;
      /** How far the refusal `reason` says reaches; dropped with no reason. */
      refusalReach?: RefusalReach | null;
    }
  ) => boolean;
  readonly readings: () => AccountReading[];
  /** When the hub last checked whether the account is still refused account-wide (`accounts.refusal_checked_at`), epoch ms; null when never. */
  readonly refusalCheckedAt: (id: string) => number | null;
  /**
   * Removes the account, kept in the record of removed accounts with when
   * and why (`removed_accounts`): a machine that missed it forgets its store
   * at its next connect. `leavesOn`: the machines that keep its store until
   * no process there runs in it ({@link AccountLeave}), recorded with it.
   */
  readonly remove: (
    id: string,
    why: "removed" | "joined",
    leavesOn?: readonly string[]
  ) => boolean;
  /** Of `ids`, the ones this hub removed. */
  readonly removedOf: (ids: readonly string[]) => string[];
  readonly removeMove: (
    move: Pick<LoginMove, "machineId" | "store" | "storeProvider">
  ) => void;
  readonly removeMovedFrom: (instanceId: string) => void;
  readonly removeSignin: (accountId: string, machineId: string) => boolean;
  /**
   * The provider's routing; a provider with no row reads the defaults. A
   * saved at-limit policy that does not read ({@link atLimitUnread}) reads
   * as core `RESTRICTIVE_AT_LIMIT`.
   */
  readonly routing: (provider: AccountProvider) => ProviderRouting;
  readonly setBench: (
    accountId: string,
    scope: string | null,
    until: number
  ) => void;
  readonly setIdentity: (id: string, identity: AccountIdentity) => void;
  /** Keeps `at` as the account's last refusal check. */
  readonly setRefusalCheckedAt: (id: string, at: number) => void;
  readonly setRouting: (routing: ProviderRouting) => void;
  readonly signins: () => AccountSignin[];
  /** `instanceIds` were left on no account: `accountName` was removed, or signed out on their machine (`why`). */
  readonly strand: (
    instanceIds: readonly string[],
    accountName: string,
    why: StrandedSession["why"]
  ) => void;
  /** The sessions left on no account, stopped until one can take them. */
  readonly stranded: () => StrandedSession[];
  /** `instanceId`'s {@link StrandedSession}, when it is one. */
  readonly strandedOf: (instanceId: string) => StrandedSession | undefined;
  /** `instanceId` runs on an account again. Whether it was stranded. */
  readonly unstrand: (instanceId: string) => boolean;
}

type AccountRow = typeof accounts.$inferSelect;
type RoutingRow = typeof accountRouting.$inferSelect;

/**
 * A routing row's saved at-limit policy, read from its columns; undefined
 * when it does not read whole: kept unread by migration 0399, or a column
 * empty. The hub acts on core `RESTRICTIVE_AT_LIMIT` then, never the
 * default.
 */
const savedPolicy = (row: RoutingRow): AtLimit | undefined => {
  const {
    atLimitMove: move,
    atLimitWaitMinutes: waitMinutes,
    atLimitMoveWholeUnderK: moveWholeUnderK,
    atLimitStaleAfterHours: staleAfterHours,
    compactionAtLimit: atLimit,
    compactionBeforeMove: beforeMove,
    compactionFileRoom: fileRoom,
    compactionSummarizerHarness: harness,
    compactionSummarizerModel: model,
  } = row;
  return row.atLimitUnread === null &&
    move !== null &&
    waitMinutes !== null &&
    moveWholeUnderK !== null &&
    staleAfterHours !== null &&
    atLimit !== null &&
    beforeMove !== null &&
    fileRoom !== null &&
    harness !== null &&
    model !== null
    ? {
        move,
        waitMinutes,
        moveWholeUnderK,
        staleAfterHours,
        compaction: {
          atLimit,
          beforeMove,
          fileRoom,
          summarizer: { harness, model },
        },
      }
    : undefined;
};

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  provider: row.provider,
  kind: row.kind,
  label: row.label,
  email: row.email,
  hue: row.hue,
  order: row.order,
  neverBackup: row.neverBackup,
  reservePct: row.reservePct,
  atPlanLimit: row.atPlanLimit,
  identity:
    row.email === null
      ? null
      : {
          email: row.email,
          organization: row.organization ?? "",
          orgId: row.orgId,
        },
  ...(row.setupStep ? { setupStep: row.setupStep } : {}),
  createdAt: row.createdAt.getTime(),
});

/** One identity as `accounts_identity` keys it: the provider, the email in any case, the organization's id. */
const sameIdentityAs = (
  provider: AccountProvider,
  identity: AccountIdentity & { orgId: string }
) =>
  and(
    eq(accounts.provider, provider),
    eq(sql`lower(${accounts.email})`, identity.email.toLowerCase()),
    eq(accounts.orgId, identity.orgId)
  );

/** One report laid over an account's reading ({@link AccountsDb.putReading}). */
interface ReadingReport {
  overage?: AccountOverage | null;
  subscription?: string | null;
  /** The account's window set, as the report names it; null or absent: it names none. */
  windowKinds?: string[] | null;
  windows?: LimitWindow[];
}

/** A window's identity in a reading: its kind and the model it is scoped to. */
const windowKey = (w: LimitWindow): string =>
  `${w.kind}\u0000${w.scopeLabel ?? ""}`;

/**
 * An account's reading row after one report at `at`: what the report names
 * replaces what was held, the rest kept. Its time is `at` only when the
 * report carries windows: a plan alone says nothing of them.
 */
const readingValues = (
  previous: typeof accountReadings.$inferSelect | undefined,
  report: ReadingReport,
  at: number
) => ({
  windowKinds: report.windowKinds ?? previous?.windowKinds ?? null,
  subscription:
    report.subscription === undefined
      ? (previous?.subscription ?? null)
      : report.subscription,
  overage:
    report.overage === undefined ? (previous?.overage ?? null) : report.overage,
  lastSeenAt:
    report.windows === undefined && previous
      ? previous.lastSeenAt
      : new Date(at),
});

/**
 * The held windows a report at `at` did not name that are gone: one whose
 * reset has passed by then, and one outside the window set the report
 * names (`kinds`; null: it names none).
 */
const overWindows = (
  held: ReadonlyMap<string, LimitWindow>,
  reported: readonly LimitWindow[],
  kinds: readonly string[] | null,
  at: number
): LimitWindow[] => {
  const named = new Set(reported.map(windowKey));
  const set = kinds ? new Set(kinds) : null;
  return [...held].flatMap(([key, w]) => {
    if (named.has(key)) {
      return [];
    }
    const reset = w.resetsAt ? Date.parse(w.resetsAt) : Number.NaN;
    const over = Number.isFinite(reset) && reset <= at;
    return over || (set && !set.has(windowSetKey(w))) ? [w] : [];
  });
};

/** A window as its row keeps it; "" is no scope. */
const toWindow = (
  row: Omit<typeof accountWindows.$inferSelect, "accountId">
): LimitWindow => ({
  kind: row.kind,
  scopeLabel: row.scopeLabel === "" ? null : row.scopeLabel,
  group: row.group,
  isActive: row.isActive,
  percent: row.percent,
  severity: row.severity,
  resetsAt: row.resetsAt,
});

export const accountsDb = (db: BunSQLiteDatabase): AccountsDb => {
  /** Whether a leave keeps `accountId`'s store on `machineId` ({@link AccountLeave}). */
  const leaving = (accountId: string, machineId: string): boolean =>
    db
      .select({ accountId: accountLeaves.accountId })
      .from(accountLeaves)
      .where(
        and(
          eq(accountLeaves.accountId, accountId),
          eq(accountLeaves.machineId, machineId)
        )
      )
      .get() !== undefined;
  const get = (id: string): Account | undefined => {
    const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
    return row ? toAccount(row) : undefined;
  };
  const list = (): Account[] =>
    db
      .select()
      .from(accounts)
      .orderBy(asc(accounts.order), asc(accounts.createdAt))
      .all()
      .map(toAccount);

  const catalogs = (): AccountCatalog[] => {
    const efforts = new Map<string, Record<string, string>>();
    for (const { accountId, model, effort } of db
      .select()
      .from(accountModelEfforts)
      .all()) {
      efforts.set(accountId, { ...efforts.get(accountId), [model]: effort });
    }
    return db
      .select()
      .from(accountCatalogs)
      .all()
      .map((row) => ({
        accountId: row.accountId,
        models: row.models,
        defaultEfforts: efforts.get(row.accountId) ?? {},
        readAt: row.readAt.getTime(),
      }));
  };

  return {
    list,
    get,
    byIdentity: (provider, identity, except) => {
      const { orgId } = identity;
      if (!orgId) {
        return;
      }
      const row = db
        .select()
        .from(accounts)
        .where(
          and(
            sameIdentityAs(provider, { ...identity, orgId }),
            except === undefined ? undefined : ne(accounts.id, except)
          )
        )
        .orderBy(asc(accounts.order), asc(accounts.createdAt))
        .limit(1)
        .get();
      return row ? toAccount(row) : undefined;
    },
    catalogs,
    putCatalog: (accountId, models, at = Date.now()) => {
      if (!get(accountId)) {
        return;
      }
      db.insert(accountCatalogs)
        .values({ accountId, models, readAt: new Date(at) })
        .onConflictDoUpdate({
          target: accountCatalogs.accountId,
          set: { models, readAt: new Date(at) },
        })
        .run();
    },
    putDefaultEffort: (accountId, model, effort) => {
      const catalog = db
        .select({ accountId: accountCatalogs.accountId })
        .from(accountCatalogs)
        .where(eq(accountCatalogs.accountId, accountId))
        .get();
      if (!catalog) {
        return;
      }
      db.insert(accountModelEfforts)
        .values({ accountId, model, effort })
        .onConflictDoUpdate({
          target: [accountModelEfforts.accountId, accountModelEfforts.model],
          set: { effort },
        })
        .run();
    },
    create: ({ provider, kind, label, hue, identity, setupStep }) => {
      const taken = list().map((account) => account.hue);
      const order =
        (db
          .select({ top: max(accounts.order) })
          .from(accounts)
          .get()?.top ?? -1) + 1;
      const row = db
        .insert(accounts)
        .values({
          id: crypto.randomUUID(),
          provider,
          kind,
          label: label ?? null,
          // The first of the seven hues nobody has, so up to seven accounts are
          // told apart at a glance. An existing account keeps the hue it has.
          hue:
            hue ??
            ACCOUNT_HUES.find((one) => !taken.includes(one)) ??
            ACCOUNT_HUES[order % ACCOUNT_HUES.length] ??
            "blue",
          order,
          email: identity?.email ?? null,
          organization: identity?.organization ?? null,
          orgId: identity?.orgId || null,
          setupStep: setupStep ?? null,
        })
        .returning()
        .get();
      return toAccount(row);
    },
    patch: (id, patch) => {
      if (Object.keys(patch).length > 0) {
        db.update(accounts).set(patch).where(eq(accounts.id, id)).run();
      }
      return get(id);
    },
    setIdentity: (id, identity) => {
      db.update(accounts)
        .set({
          email: identity.email,
          organization: identity.organization,
          orgId: identity.orgId || null,
        })
        .where(eq(accounts.id, id))
        .run();
    },
    refusalCheckedAt: (id) =>
      db
        .select({ at: accounts.refusalCheckedAt })
        .from(accounts)
        .where(eq(accounts.id, id))
        .get()
        ?.at?.getTime() ?? null,
    setRefusalCheckedAt: (id, at) => {
      db.update(accounts)
        .set({ refusalCheckedAt: new Date(at) })
        .where(eq(accounts.id, id))
        .run();
    },
    // Its sign-ins, readings, catalog and bench go with it (cascade), and
    // so does its place on any project's account list; a project whose list
    // held it alone runs on every account again, as an empty list would
    // start nothing in it.
    remove: (id, why, leavesOn = []) =>
      db.transaction((tx) => {
        const [gone] = tx
          .delete(accounts)
          .where(eq(accounts.id, id))
          .returning()
          .all();
        if (gone) {
          tx.update(projects)
            .set({ accountsLimited: false })
            .where(
              and(
                eq(projects.accountsLimited, true),
                sql`not exists (select 1 from ${projectAccounts} where ${projectAccounts.projectId} = ${projects.id})`
              )
            )
            .run();
          const removedAt = new Date();
          tx.insert(removedAccounts)
            .values({ id, removedAt, why })
            .onConflictDoNothing()
            .run();
          if (leavesOn.length > 0) {
            tx.insert(accountLeaves)
              .values(
                leavesOn.map((machineId) => ({
                  accountId: id,
                  machineId,
                  provider: gone.provider,
                  since: removedAt,
                }))
              )
              .onConflictDoNothing()
              .run();
          }
        }
        return gone !== undefined;
      }),
    leaves: () =>
      db
        .select()
        .from(accountLeaves)
        .all()
        .map((row) => ({ ...row, since: row.since.getTime() })),
    dropLeave: (accountId, machineId) => {
      db.delete(accountLeaves)
        .where(
          and(
            eq(accountLeaves.accountId, accountId),
            eq(accountLeaves.machineId, machineId)
          )
        )
        .run();
    },
    removedOf: (ids) =>
      ids.length === 0
        ? []
        : db
            .select({ id: removedAccounts.id })
            .from(removedAccounts)
            .where(inArray(removedAccounts.id, [...ids]))
            .all()
            .map((row) => row.id),
    signins: () =>
      db
        .select()
        .from(accountSignins)
        .all()
        .map((row) => ({
          ...row,
          checkedAt: row.checkedAt.getTime(),
          movedAt: row.movedAt?.getTime() ?? null,
          movedFrom: row.movedFrom ?? null,
          reason: row.reason ?? null,
          refusalReach: row.reason ? (row.refusalReach ?? null) : null,
        })),
    putSignin: ({
      accountId,
      machineId,
      state,
      moved,
      reason = null,
      refusalReach = null,
    }) => {
      // A store being signed out there under a running process is not a
      // sign-in, whatever the machine reports of it.
      if (!get(accountId) || leaving(accountId, machineId)) {
        return false;
      }
      const before = db
        .select()
        .from(accountSignins)
        .where(
          and(
            eq(accountSignins.accountId, accountId),
            eq(accountSignins.machineId, machineId)
          )
        )
        .get();
      const checkedAt = new Date();
      // A reach goes with a reason, and only with one.
      const reach = reason === null ? null : refusalReach;
      let movedAt = before?.movedAt ?? null;
      let movedFrom = before?.movedFrom ?? null;
      if (moved !== undefined) {
        movedAt = moved ? new Date(moved.at) : null;
        movedFrom = moved?.from ?? null;
      }
      db.insert(accountSignins)
        .values({
          accountId,
          machineId,
          state,
          movedAt,
          movedFrom,
          reason,
          refusalReach: reach,
          checkedAt,
        })
        .onConflictDoUpdate({
          target: [accountSignins.accountId, accountSignins.machineId],
          set: {
            state,
            movedAt,
            movedFrom,
            reason,
            refusalReach: reach,
            checkedAt,
          },
        })
        .run();
      return (
        before?.state !== state ||
        (before.reason ?? null) !== reason ||
        (before.refusalReach ?? null) !== reach ||
        (before.movedAt?.getTime() ?? null) !== (movedAt?.getTime() ?? null)
      );
    },
    moves: () =>
      db
        .select()
        .from(loginMoves)
        .all()
        .map(({ email, organization, orgId, ...row }) => ({
          ...row,
          identity: { email, organization, orgId },
          since: row.since.getTime(),
        })),
    putMove: ({ identity, ...move }) => {
      db.insert(loginMoves)
        .values({
          ...move,
          email: identity.email,
          organization: identity.organization,
          orgId: identity.orgId || null,
          since: new Date(move.since),
        })
        .onConflictDoNothing()
        .run();
    },
    removeMove: ({ machineId, store, storeProvider }) => {
      db.delete(loginMoves)
        .where(
          and(
            eq(loginMoves.machineId, machineId),
            eq(loginMoves.store, store),
            eq(loginMoves.storeProvider, storeProvider)
          )
        )
        .run();
    },
    movedFrom: () =>
      new Map(
        db
          .select()
          .from(movedFromSessions)
          .all()
          .map((row) => [row.instanceId, row.machineId])
      ),
    putMovedFrom: (instanceIds, machineId) => {
      if (instanceIds.length === 0) {
        return;
      }
      db.insert(movedFromSessions)
        .values(instanceIds.map((instanceId) => ({ instanceId, machineId })))
        .onConflictDoNothing()
        .run();
    },
    removeMovedFrom: (instanceId) => {
      db.delete(movedFromSessions)
        .where(eq(movedFromSessions.instanceId, instanceId))
        .run();
    },
    stranded: () =>
      db
        .select({
          instanceId: strandedSessions.instanceId,
          accountName: strandedSessions.accountName,
          why: strandedSessions.why,
        })
        .from(strandedSessions)
        .all(),
    strandedOf: (instanceId) =>
      db
        .select({
          instanceId: strandedSessions.instanceId,
          accountName: strandedSessions.accountName,
          why: strandedSessions.why,
        })
        .from(strandedSessions)
        .where(eq(strandedSessions.instanceId, instanceId))
        .get(),
    strand: (instanceIds, accountName, why) => {
      if (instanceIds.length === 0) {
        return;
      }
      db.insert(strandedSessions)
        .values(
          instanceIds.map((instanceId) => ({ instanceId, accountName, why }))
        )
        .onConflictDoUpdate({
          target: strandedSessions.instanceId,
          set: { accountName, why, since: new Date() },
        })
        .run();
    },
    unstrand: (instanceId) =>
      db
        .delete(strandedSessions)
        .where(eq(strandedSessions.instanceId, instanceId))
        .returning()
        .all().length > 0,
    leaveMachine: (accountId, machineId) =>
      db.transaction((tx) => {
        const account = tx
          .select({ provider: accounts.provider })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .get();
        if (!account) {
          return false;
        }
        tx.delete(accountSignins)
          .where(
            and(
              eq(accountSignins.accountId, accountId),
              eq(accountSignins.machineId, machineId)
            )
          )
          .run();
        tx.insert(accountLeaves)
          .values({
            accountId,
            machineId,
            provider: account.provider,
            since: new Date(),
          })
          .onConflictDoNothing()
          .run();
        return true;
      }),
    removeSignin: (accountId, machineId) =>
      db
        .delete(accountSignins)
        .where(
          and(
            eq(accountSignins.accountId, accountId),
            eq(accountSignins.machineId, machineId)
          )
        )
        .returning()
        .all().length > 0,
    routing: (provider) => {
      const row = db
        .select()
        .from(accountRouting)
        .where(eq(accountRouting.provider, provider))
        .get();
      return row
        ? {
            provider: row.provider,
            yours: {
              strategy: row.yoursStrategy,
              ...(row.yoursPinned ? { pinnedAccountId: row.yoursPinned } : {}),
            },
            delegates: {
              strategy: row.delegatesStrategy,
              ...(row.delegatesPinned
                ? { pinnedAccountId: row.delegatesPinned }
                : {}),
            },
            atLimit: savedPolicy(row) ?? RESTRICTIVE_AT_LIMIT,
          }
        : defaultRouting(provider);
    },
    atLimitUnread: (provider) => {
      const row = db
        .select()
        .from(accountRouting)
        .where(eq(accountRouting.provider, provider))
        .get();
      if (!row || savedPolicy(row)) {
        return null;
      }
      return row.atLimitUnread ?? "a saved policy with a field left empty";
    },
    // A pin names an account the hub keeps, or none: a strategy other than
    // `pinned` may carry one the routes never checked.
    setRouting: (routing) => {
      const kept = (id: string | undefined) => (id && get(id) ? id : null);
      const values = {
        yoursStrategy: routing.yours.strategy,
        yoursPinned: kept(routing.yours.pinnedAccountId),
        delegatesStrategy: routing.delegates.strategy,
        delegatesPinned: kept(routing.delegates.pinnedAccountId),
        atLimitMove: routing.atLimit.move,
        atLimitWaitMinutes: routing.atLimit.waitMinutes,
        atLimitMoveWholeUnderK: routing.atLimit.moveWholeUnderK,
        atLimitStaleAfterHours: routing.atLimit.staleAfterHours,
        compactionAtLimit: routing.atLimit.compaction.atLimit,
        compactionBeforeMove: routing.atLimit.compaction.beforeMove,
        compactionFileRoom: routing.atLimit.compaction.fileRoom,
        compactionSummarizerHarness:
          routing.atLimit.compaction.summarizer.harness,
        compactionSummarizerModel: routing.atLimit.compaction.summarizer.model,
        atLimitUnread: null,
      };
      db.insert(accountRouting)
        .values({ provider: routing.provider, ...values })
        .onConflictDoUpdate({ target: accountRouting.provider, set: values })
        .run();
    },
    readings: () => {
      const windows = new Map<string, LimitWindow[]>();
      for (const { accountId, ...row } of db
        .select()
        .from(accountWindows)
        .orderBy(sql`rowid`)
        .all()) {
        windows.set(accountId, [
          ...(windows.get(accountId) ?? []),
          toWindow(row),
        ]);
      }
      return db
        .select()
        .from(accountReadings)
        .all()
        .map((row) => ({
          accountId: row.accountId,
          windows: windows.get(row.accountId) ?? [],
          subscription: row.subscription,
          overage: row.overage,
          windowKinds: row.windowKinds,
          lastSeenAt: row.lastSeenAt.getTime(),
        }));
    },
    confirmReading: (accountId, at) => {
      const held = db
        .select({ accountId: accountWindows.accountId })
        .from(accountWindows)
        .where(eq(accountWindows.accountId, accountId))
        .limit(1)
        .get();
      const reading = db
        .select({ lastSeenAt: accountReadings.lastSeenAt })
        .from(accountReadings)
        .where(eq(accountReadings.accountId, accountId))
        .get();
      if (!(held && reading) || reading.lastSeenAt.getTime() >= at) {
        return;
      }
      db.update(accountReadings)
        .set({ lastSeenAt: new Date(at) })
        .where(eq(accountReadings.accountId, accountId))
        .run();
      return reading.lastSeenAt.getTime();
    },
    putReading: (accountId, report, at = Date.now()) => {
      if (!get(accountId)) {
        return;
      }
      db.transaction((tx) => {
        const previous = tx
          .select()
          .from(accountReadings)
          .where(eq(accountReadings.accountId, accountId))
          .get();
        const before = new Map(
          tx
            .select()
            .from(accountWindows)
            .where(eq(accountWindows.accountId, accountId))
            .all()
            .map((row) => {
              const w = toWindow(row);
              return [windowKey(w), w];
            })
        );
        // One window per kind and scope, the last reported of each.
        const reported = [
          ...new Map(
            (report.windows ?? []).map((w) => [windowKey(w), w])
          ).values(),
        ];
        const values = readingValues(previous, report, at);
        tx.insert(accountReadings)
          .values({ accountId, ...values })
          .onConflictDoUpdate({
            target: accountReadings.accountId,
            set: values,
          })
          .run();
        // A window this report did not name whose reset has passed is over:
        // what it said is of a window that no longer runs. One outside the
        // window set the report names is a window the account no longer
        // has. The windows reported replace their own rows, read after the
        // ones this report did not name; every other window stays as it was.
        const kinds = report.windowKinds ?? null;
        const replaced = [
          ...(report.windows === undefined && kinds === null
            ? []
            : overWindows(before, reported, kinds, at)),
          ...reported,
        ];
        for (const w of replaced) {
          tx.delete(accountWindows)
            .where(
              and(
                eq(accountWindows.accountId, accountId),
                eq(accountWindows.kind, w.kind),
                eq(accountWindows.scopeLabel, w.scopeLabel ?? "")
              )
            )
            .run();
        }
        if (reported.length > 0) {
          tx.insert(accountWindows)
            .values(
              reported.map((w) => ({
                accountId,
                kind: w.kind,
                scopeLabel: w.scopeLabel ?? "",
                group: w.group,
                isActive: w.isActive,
                percent: w.percent,
                severity: w.severity,
                resetsAt: w.resetsAt,
              }))
            )
            .run();
        }
        // A window that moved — percent, severity, or a new window
        // (`resetsAt`, so a rollover's drop starts a new series rather than
        // reading as spend running backwards) — is a point on its series.
        const moved = reported.filter((w) => {
          const prior = before.get(windowKey(w));
          return (
            prior === undefined ||
            prior.percent !== w.percent ||
            prior.severity !== w.severity ||
            prior.resetsAt !== w.resetsAt
          );
        });
        if (moved.length === 0) {
          return;
        }
        tx.insert(usageLimitHistory)
          .values(
            moved.map((w) => ({
              accountId,
              kind: w.kind,
              scopeLabel: w.scopeLabel,
              percent: Math.round(w.percent),
              severity: w.severity,
              resetsAt: w.resetsAt,
              fetchedAt: new Date(at),
            }))
          )
          .run();
        const cutoff = new Date(at - LIMIT_HISTORY_RETENTION_MS);
        tx.delete(usageLimitHistory)
          .where(lte(usageLimitHistory.fetchedAt, cutoff))
          .run();
      });
    },
    history: ({ accountId, kind, since, until }) =>
      db
        .select()
        .from(usageLimitHistory)
        .where(
          and(
            eq(usageLimitHistory.accountId, accountId),
            ...(kind ? [eq(usageLimitHistory.kind, kind)] : []),
            ...(since
              ? [gte(usageLimitHistory.fetchedAt, new Date(since))]
              : []),
            ...(until
              ? [lte(usageLimitHistory.fetchedAt, new Date(until))]
              : [])
          )
        )
        .orderBy(usageLimitHistory.fetchedAt)
        .all(),
    bench: (now = Date.now()) =>
      db
        .select()
        .from(accountBench)
        .where(gt(accountBench.until, new Date(now)))
        .all()
        .map((row) => ({
          accountId: row.accountId,
          scope: row.scope === "" ? null : row.scope,
          until: row.until.getTime(),
        })),
    setBench: (accountId, scope, until) => {
      if (!get(accountId)) {
        return;
      }
      const values = { accountId, scope: scope ?? "", until: new Date(until) };
      db.insert(accountBench)
        .values(values)
        .onConflictDoUpdate({
          target: [accountBench.accountId, accountBench.scope],
          set: { until: values.until },
        })
        .run();
    },
  };
};

export interface ProjectAccountsDb {
  /** The accounts the project's sessions may run on; null: every account. */
  readonly setProjectAccounts: (id: string, accounts: string[] | null) => void;
}

export const projectAccountsDb = (core: DbCore): ProjectAccountsDb => {
  const { db } = core;

  return {
    setProjectAccounts: (id, list) => {
      db.transaction((tx) => {
        tx.update(projects)
          .set({ accountsLimited: list !== null })
          .where(eq(projects.id, id))
          .run();
        tx.delete(projectAccounts)
          .where(eq(projectAccounts.projectId, id))
          .run();
        const distinct = [...new Set(list ?? [])];
        if (distinct.length > 0) {
          tx.insert(projectAccounts)
            .values(distinct.map((accountId) => ({ projectId: id, accountId })))
            .run();
        }
      });
    },
  };
};
