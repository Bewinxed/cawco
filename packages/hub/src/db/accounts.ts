import {
  ACCOUNT_HUES,
  type Account,
  type AccountBench,
  type AccountCatalog,
  type AccountHue,
  type AccountIdentity,
  type AccountKind,
  type AccountOverage,
  type AccountProvider,
  type AccountReading,
  type AccountSignin,
  DEFAULT_AT_LIMIT,
  type HomeStore,
  type LimitWindow,
  type ModelInfo,
  type ProviderRouting,
} from "@cawco/core";
import { and, asc, eq, gt, gte, lte, max } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  accountBench,
  accountCatalogs,
  accountReadings,
  accountRouting,
  accountSignins,
  accounts,
  usageLimitHistory,
} from "./schema";

/** 30 days — long enough to cover several weekly windows, short enough that the table stays small. */
const LIMIT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** What an account's editable settings may be patched with. */
export type AccountPatch = Partial<
  Pick<Account, "hue" | "label" | "neverBackup" | "order" | "reservePct">
>;

export type AccountHistoryRow = typeof usageLimitHistory.$inferSelect;

export interface AccountsDb {
  readonly bench: (now?: number) => AccountBench[];
  readonly catalogs: () => AccountCatalog[];
  readonly create: (draft: {
    hue?: AccountHue;
    identity?: AccountIdentity;
    kind: AccountKind;
    label?: string | null;
    provider: AccountProvider;
  }) => Account;
  readonly get: (id: string) => Account | undefined;
  readonly history: (q: {
    accountId: string;
    kind?: string;
    since?: number;
    until?: number;
  }) => AccountHistoryRow[];
  readonly list: () => Account[];
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
  /**
   * Lays one report over the account's reading: windows replace the ones of
   * the same kind and scope, the rest are kept. Appends every window that
   * moved to the history series.
   */
  readonly putReading: (
    accountId: string,
    report: {
      overage?: AccountOverage | null;
      subscription?: string | null;
      windows?: LimitWindow[];
    },
    at?: number
  ) => void;
  /**
   * Whether the row changed. `moved` left out keeps what the row says about
   * a move (when, and from which store); null clears it; a new row says none.
   */
  readonly putSignin: (
    signin: Omit<AccountSignin, "checkedAt" | "movedAt" | "movedFrom"> & {
      moved?: { at: number; from: HomeStore } | null;
    }
  ) => boolean;
  readonly readings: () => AccountReading[];
  readonly remove: (id: string) => boolean;
  readonly removeSignin: (accountId: string, machineId: string) => boolean;
  /** The provider's routing; a provider with no row reads the defaults. */
  readonly routing: (provider: AccountProvider) => ProviderRouting;
  readonly setBench: (
    accountId: string,
    scope: string | null,
    until: number
  ) => void;
  readonly setIdentity: (id: string, identity: AccountIdentity) => void;
  readonly setRouting: (routing: ProviderRouting) => void;
  readonly signins: () => AccountSignin[];
}

type AccountRow = typeof accounts.$inferSelect;

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  provider: row.provider,
  kind: row.kind,
  label: row.label,
  email: row.identity?.email ?? null,
  hue: row.hue,
  order: row.order,
  neverBackup: row.neverBackup,
  reservePct: row.reservePct,
  identity: row.identity,
  createdAt: row.createdAt.getTime(),
});

/** A window's identity in a reading: its kind and the model it is scoped to. */
const windowKey = (w: LimitWindow): string =>
  `${w.kind}\u0000${w.scopeLabel ?? ""}`;

export const accountsDb = (db: BunSQLiteDatabase): AccountsDb => {
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

  const catalogs = (): AccountCatalog[] =>
    db
      .select()
      .from(accountCatalogs)
      .all()
      .map((row) => ({
        accountId: row.accountId,
        models: row.models,
        defaultEfforts: row.defaultEfforts,
        readAt: row.readAt.getTime(),
      }));

  return {
    list,
    get,
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
      const row = catalogs().find((one) => one.accountId === accountId);
      if (!row || row.defaultEfforts[model] === effort) {
        return;
      }
      db.update(accountCatalogs)
        .set({ defaultEfforts: { ...row.defaultEfforts, [model]: effort } })
        .where(eq(accountCatalogs.accountId, accountId))
        .run();
    },
    create: ({ provider, kind, label, hue, identity }) => {
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
          // The first hue nobody has, so two accounts are told apart at a glance.
          hue:
            hue ??
            ACCOUNT_HUES.find((one) => !taken.includes(one)) ??
            ACCOUNT_HUES[order % ACCOUNT_HUES.length] ??
            "blue",
          order,
          identity: identity ?? null,
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
      db.update(accounts).set({ identity }).where(eq(accounts.id, id)).run();
    },
    // Its sign-ins, readings, catalog and bench go with it (cascade).
    remove: (id) =>
      db.delete(accounts).where(eq(accounts.id, id)).returning().all().length >
      0,
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
        })),
    putSignin: ({ accountId, machineId, state, moved }) => {
      if (!get(accountId)) {
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
      let movedAt = before?.movedAt ?? null;
      let movedFrom = before?.movedFrom ?? null;
      if (moved !== undefined) {
        movedAt = moved ? new Date(moved.at) : null;
        movedFrom = moved?.from ?? null;
      }
      db.insert(accountSignins)
        .values({ accountId, machineId, state, movedAt, movedFrom, checkedAt })
        .onConflictDoUpdate({
          target: [accountSignins.accountId, accountSignins.machineId],
          set: { state, movedAt, movedFrom, checkedAt },
        })
        .run();
      return (
        before?.state !== state ||
        (before.movedAt?.getTime() ?? null) !== (movedAt?.getTime() ?? null)
      );
    },
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
      return (
        row ?? {
          provider,
          yours: { strategy: "pinned" },
          delegates: { strategy: "soonest-reset" },
          atLimit: DEFAULT_AT_LIMIT,
        }
      );
    },
    setRouting: (routing) => {
      db.insert(accountRouting)
        .values(routing)
        .onConflictDoUpdate({ target: accountRouting.provider, set: routing })
        .run();
    },
    readings: () =>
      db
        .select()
        .from(accountReadings)
        .all()
        .map((row) => ({
          accountId: row.accountId,
          windows: row.windows,
          subscription: row.subscription,
          overage: row.overage,
          lastSeenAt: row.lastSeenAt.getTime(),
        })),
    putReading: (accountId, report, at = Date.now()) => {
      if (!get(accountId)) {
        return;
      }
      const previous = db
        .select()
        .from(accountReadings)
        .where(eq(accountReadings.accountId, accountId))
        .get();
      const before = new Map(
        (previous?.windows ?? []).map((w) => [windowKey(w), w])
      );
      const reported = report.windows ?? [];
      const windows = [
        ...[...before.values()].filter(
          (w) => !reported.some((one) => windowKey(one) === windowKey(w))
        ),
        ...reported,
      ];
      const values = {
        windows,
        subscription:
          report.subscription === undefined
            ? (previous?.subscription ?? null)
            : report.subscription,
        overage:
          report.overage === undefined
            ? (previous?.overage ?? null)
            : report.overage,
        lastSeenAt: new Date(at),
      };
      db.insert(accountReadings)
        .values({ accountId, ...values })
        .onConflictDoUpdate({ target: accountReadings.accountId, set: values })
        .run();
      // A window that moved — percent, severity, or a new window (`resetsAt`,
      // so a rollover's drop starts a new series rather than reading as
      // spend running backwards) — is a point on its series.
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
      db.insert(usageLimitHistory)
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
      db.delete(usageLimitHistory)
        .where(lte(usageLimitHistory.fetchedAt, cutoff))
        .run();
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
