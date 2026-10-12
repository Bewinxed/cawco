import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type ActionState, actions } from "./schema";

export type ActionRow = typeof actions.$inferSelect;

/** What may change on a row after its proposal: never its call (connection, tool, args). */
export type ActionPatch = Partial<
  Omit<
    ActionRow,
    | "id"
    | "projectId"
    | "taskId"
    | "connection"
    | "service"
    | "account"
    | "tool"
    | "args"
    | "argsHash"
    | "runAt"
    | "reason"
    | "proposedBy"
    | "idempotencyKey"
    | "thenStage"
    | "createdAt"
  >
>;

export interface ActionsDb {
  /**
   * THE claim that lets an action's call go, in one transaction: approved →
   * running, `started_at` stamped, only while it is still approved and due
   * at `now`. Answers the row, or nothing when it is not (another tick took
   * it, it was cancelled, or it is not due): then nothing is called.
   */
  readonly claim: (id: string, now: Date) => ActionRow | undefined;
  /** Approved actions due at `now`, soonest first. */
  readonly due: (now: Date) => ActionRow[];
  readonly get: (id: string) => ActionRow | undefined;
  /** Rows in any of `states`. */
  readonly inStates: (states: readonly ActionState[]) => ActionRow[];
  readonly insert: (row: ActionRow) => ActionRow;
  /** A project's actions, newest first. */
  readonly list: (projectId: string | undefined, limit: number) => ActionRow[];
  /** The soonest time an approved action is due, or nothing. */
  readonly nextDue: () => Date | null | undefined;
  /**
   * Moves a row from one of `from` to a new state with `patch`, in one
   * statement: nothing when it is no longer in `from`.
   */
  readonly settle: (
    id: string,
    from: readonly ActionState[],
    patch: ActionPatch & { state?: ActionState }
  ) => ActionRow | undefined;
}

export const actionsDb = (db: BunSQLiteDatabase): ActionsDb => {
  const get = (id: string) =>
    db.select().from(actions).where(eq(actions.id, id)).get();

  const dueWhere = (now: Date) =>
    and(
      eq(actions.state, "approved"),
      or(isNull(actions.runAt), lte(actions.runAt, now))
    );

  return {
    claim: (id, now) =>
      db.transaction((tx) =>
        tx
          .update(actions)
          .set({ state: "running", startedAt: now })
          .where(and(eq(actions.id, id), dueWhere(now)))
          .returning()
          .get()
      ),
    due: (now) =>
      db
        .select()
        .from(actions)
        .where(dueWhere(now))
        .orderBy(actions.runAt, actions.approvedAt)
        .all(),
    get,
    insert: (row) => db.insert(actions).values(row).returning().get(),
    list: (projectId, limit) => {
      const query = db.select().from(actions);
      const scoped =
        projectId === undefined
          ? query
          : query.where(eq(actions.projectId, projectId));
      return scoped.orderBy(desc(actions.createdAt)).limit(limit).all();
    },
    nextDue: () => {
      const rows = db
        .select({ runAt: actions.runAt })
        .from(actions)
        .where(eq(actions.state, "approved"))
        .all();
      if (rows.length === 0) {
        return;
      }
      if (rows.some((row) => row.runAt === null)) {
        return null;
      }
      return new Date(
        Math.min(...rows.map((row) => row.runAt?.getTime() ?? 0))
      );
    },
    settle: (id, from, patch) =>
      db
        .update(actions)
        .set(patch)
        .where(and(eq(actions.id, id), inArray(actions.state, [...from])))
        .returning()
        .get(),
    inStates: (states) =>
      db
        .select()
        .from(actions)
        .where(inArray(actions.state, [...states]))
        .orderBy(actions.createdAt)
        .all(),
  };
};
