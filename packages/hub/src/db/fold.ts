import { idList } from "./id-list";
import { walkOwned } from "./owned-rows";
/** Folding sessions into one: every kind of row a session owns moved onto the survivor. */

import { CONTINUATION_ORIGIN } from "@cawco/core/harness/kinds";
import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import { conversationsOf, putConversations } from "./instances";
import {
  instanceAliases,
  instanceConversations,
  instances,
  limitEvents,
  type PriorConversation,
  sentMessages,
} from "./schema";
import type { Tx } from "./tx";

/** What folding a session's former rows into it did, for the hub's log. */
interface FoldedSession {
  /** The former rows whose process may still run: each is ended at its machine's register, then goes. */
  ending: string[];
  formers: string[];
  instanceId: string;
  /** Sends that failed only because a process went away, pending again for the session now. */
  owedAgain: string[];
}

export interface FoldDb {
  /**
   * Folds session `from` into `to`, the continuation it went on in, as
   * {@link foldFormerSessions} folds a former row, in one transaction: `from`
   * is a former id of `to` from here (and so is every id that was a former
   * id of `from`), what it ran and was sent is `to`'s, its conversation is
   * the one before `to`'s, and its row goes, or is ended first when its
   * process may still run. Undefined when `from` is no longer recorded.
   */
  readonly foldContinued: (
    from: string,
    to: string
  ) => FoldedSession | undefined;
  readonly foldFormerSessions: (
    /** Whether a send that failed for `reason` failed only because a process went away. */
    owedAgain: (reason: string) => boolean
  ) => FoldedSession[];
}

export const foldDb = (core: DbCore): FoldDb => {
  const { db, revokeIdentities, dropInstances } = core;

  /**
   * Folds `formerIds` into `survivorId`, inside the caller's transaction
   * ({@link DbShape.foldFormerSessions}). The sessions are read as they
   * started, the one that runs last. Each one a continuation started opened
   * on its "Continued on" line, which is the line between the conversation
   * before it and its own; every other "Continued on" line of theirs is the
   * same move told on the other side, and goes.
   */
  const foldInto = (
    tx: Tx,
    survivorId: string,
    formerIds: readonly string[],
    owedAgain: (reason: string) => boolean
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction moving every kind of row a session owns, in the order they depend on each other
  ): FoldedSession | undefined => {
    const survivor = tx
      .select()
      .from(instances)
      .where(eq(instances.id, survivorId))
      .get();
    const formers =
      formerIds.length > 0
        ? tx
            .select()
            .from(instances)
            .where(
              and(
                inArray(instances.id, [...formerIds]),
                ne(instances.id, survivorId)
              )
            )
            .all()
        : [];
    if (!survivor || formers.length === 0) {
      return undefined;
    }
    const members = [...formers, survivor].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const [root] = members;
    const order = [
      ...members.filter((member) => member.id !== survivorId),
      survivor,
    ];
    const ids = members.map((member) => member.id);
    const gone = formers.map((member) => member.id);
    const continued = tx
      .select()
      .from(limitEvents)
      .where(inArray(limitEvents.instanceId, ids))
      .orderBy(asc(limitEvents.at))
      .all()
      .filter((event) => event.move.kind === "continued");
    const opened = new Map<string, string>();
    for (const member of members) {
      const first = continued.find((event) => event.instanceId === member.id);
      if (member.id !== root.id && first) {
        opened.set(member.id, first.id);
      }
    }
    // A line between two conversations a member already holds stands, as
    // does the one each member opened on.
    const kept = new Set([
      ...opened.values(),
      ...members.flatMap((member) =>
        conversationsOf(tx, member.id).flatMap((one) =>
          one.next ? [one.next] : []
        )
      ),
    ]);
    const told = continued
      .filter((event) => !kept.has(event.id))
      .map((event) => event.id);
    if (told.length > 0) {
      tx.delete(limitEvents).where(inArray(limitEvents.id, told)).run();
    }
    // Each former's own earlier conversations (one folded before), then the
    // one it ran.
    const prior: PriorConversation[] = order
      .slice(0, -1)
      .flatMap((member, at) => [
        ...conversationsOf(tx, member.id),
        ...(member.sessionId
          ? [
              {
                sessionId: member.sessionId,
                harness: member.harness,
                model: member.model,
                accountId: member.accountId,
                endedAt: member.updatedAt.getTime(),
                next: opened.get(order[at + 1].id) ?? null,
              },
            ]
          : []),
      ]);
    // Since the first continuation, what failed only because a process
    // went away is the session's still: pending again, kept whole and owed
    // by the hub as it starts (server.ts `keepPendingWhole`).
    const since = continued[0]?.at ?? root.createdAt;
    const again = tx
      .select({ uuid: sentMessages.uuid, reason: sentMessages.reason })
      .from(sentMessages)
      .where(
        and(
          inArray(sentMessages.instanceId, ids),
          eq(sentMessages.state, "failed"),
          gte(sentMessages.acceptedAt, since)
        )
      )
      .all()
      .filter((send) => owedAgain(send.reason ?? ""))
      .map((send) => send.uuid);
    if (again.length > 0) {
      tx.update(sentMessages)
        .set({
          state: "pending",
          reason: null,
          refusal: null,
          anchor: null,
          owed: null,
          envelope: null,
          delivery: null,
          held: false,
        })
        .where(inArray(sentMessages.uuid, again))
        .run();
    }
    // Each session a continuation started opened on a message from the one
    // before it: the opening of a fresh conversation now, folded under the
    // line before it rather than read as a hand-off.
    for (const member of members) {
      const [first] = tx
        .select({ uuid: sentMessages.uuid, body: sentMessages.body })
        .from(sentMessages)
        .where(eq(sentMessages.instanceId, member.id))
        .orderBy(asc(sentMessages.acceptedAt))
        .limit(1)
        .all();
      const origin = first?.body?.origin;
      if (
        member.id !== root.id &&
        first?.body &&
        origin?.kind === "peer" &&
        origin.fromSession &&
        ids.includes(origin.fromSession)
      ) {
        tx.update(sentMessages)
          .set({
            body: {
              ...first.body,
              origin: { kind: "system", name: CONTINUATION_ORIGIN },
            },
          })
          .where(eq(sentMessages.uuid, first.uuid))
          .run();
      }
    }
    walkOwned(
      "fold",
      {
        sent_messages: () =>
          tx.run(
            sql`UPDATE ${sentMessages} SET instance_id = ${survivorId},
        owed = CASE WHEN owed IS NULL THEN NULL ELSE json_set(owed, '$.instanceId', ${survivorId}, '$.machineId', ${survivor.machineId}, '$.payload.instanceId', ${survivorId}) END,
        envelope = CASE WHEN envelope IS NULL THEN NULL ELSE json_set(envelope, '$.instanceId', ${survivorId}, '$.machineId', ${survivor.machineId}, '$.payload.instanceId', ${survivorId}) END
        WHERE instance_id IN (${idList(gone)})`
          ),
        // Its identity too: the session it is now holds its own.
        session_identities: () => revokeIdentities(tx, gone),
      },
      ({ table, column, fold }) => {
        const name = sql.identifier(table);
        const by = sql.identifier(column);
        if (fold === "drop") {
          tx.run(sql`DELETE FROM ${name} WHERE ${by} IN (${idList(gone)})`);
          return;
        }
        // A session nested under one of the former rows is the session's;
        // the former rows themselves go below.
        const besides =
          table === "instances" ? sql` AND id NOT IN (${idList(ids)})` : sql``;
        tx.run(
          sql`UPDATE OR IGNORE ${name} SET ${by} = ${survivorId} WHERE ${by} IN (${idList(gone)})${besides}`
        );
        if (fold === "once") {
          tx.run(sql`DELETE FROM ${name} WHERE ${by} IN (${idList(gone)})`);
        }
      }
    );
    // The session as it began: its parent, its work and its place, its
    // toolset, and its name — but the owner's, which nothing replaces.
    const first = <K extends keyof typeof survivor>(key: K) =>
      members.map((member) => member[key]).find((value) => value !== null) ??
      null;
    const named = [...members]
      .reverse()
      .find((member) => member.titleSource === "owner");
    const parent = members
      .map((member) => member.parentInstanceId)
      .find((id) => id !== null && !ids.includes(id));
    // Its conversations: the former rows' first, in the order they began,
    // then the survivor's own. They are the survivor's alone from here: a
    // former's own rows go now, as a former still running keeps its row
    // until its machine ends it, and each row names the line after it
    // (`instance_conversations_next`, unique), so a former that had gone on
    // in a fresh conversation before held that line's row twice and failed
    // the fold (Private office's Caw, 2026-11-05 10:13:07).
    tx.delete(instanceConversations)
      .where(inArray(instanceConversations.instanceId, gone))
      .run();
    putConversations(tx, survivorId, [
      ...prior,
      ...conversationsOf(tx, survivorId),
    ]);
    tx.update(instances)
      .set({
        createdAt: root.createdAt,
        parentInstanceId: parent ?? null,
        workItemId: first("workItemId"),
        projectId: first("projectId"),
        role: first("role"),
        delegateType: first("delegateType"),
        delegateTypeProject: first("delegateTypeProject"),
        mayStart: first("mayStart"),
        derivedTitle: root.derivedTitle ?? survivor.derivedTitle,
        ...(survivor.titleSource === "owner"
          ? {}
          : {
              title: named?.title ?? root.title,
              titleSource: named ? "owner" : root.titleSource,
            }),
      })
      .where(eq(instances.id, survivorId))
      .run();
    // A former row with a process that may run is ended first, by its
    // machine, and goes once that is confirmed ({@link confirmInstanceEnd}).
    const ending = formers
      .filter(
        (member) => !["stopped", "discarded", "error"].includes(member.status)
      )
      .map((member) => member.id);
    if (ending.length > 0) {
      tx.update(instances)
        .set({
          endIntent: "delete",
          endConfirmedAt: null,
          endReason: `folded into ${survivorId}`,
          endRetryAt: null,
          endAttempts: 0,
          keepAliveEnabled: false,
          keepAliveTurn: null,
          status: "stopping",
          workItemId: null,
          parentInstanceId: null,
        })
        .where(inArray(instances.id, ending))
        .run();
    }
    dropInstances(
      tx,
      gone.filter((id) => !ending.includes(id))
    );
    return { instanceId: survivorId, formers: gone, ending, owedAgain: again };
  };

  return {
    foldFormerSessions: (owedAgain) => {
      const open = db
        .select()
        .from(instanceAliases)
        .where(eq(instanceAliases.folded, false))
        .all();
      const bySurvivor = new Map<string, string[]>();
      for (const alias of open) {
        bySurvivor.set(alias.instanceId, [
          ...(bySurvivor.get(alias.instanceId) ?? []),
          alias.id,
        ]);
      }
      return [...bySurvivor].flatMap(([survivorId, formerIds]) =>
        db.transaction((tx) => {
          const folded = foldInto(tx, survivorId, formerIds, owedAgain);
          tx.update(instanceAliases)
            .set({ folded: true })
            .where(inArray(instanceAliases.id, formerIds))
            .run();
          return folded ? [folded] : [];
        })
      );
    },
    foldContinued: (from, to) =>
      db.transaction((tx) => {
        tx.update(instanceAliases)
          .set({ instanceId: to })
          .where(eq(instanceAliases.instanceId, from))
          .run();
        tx.insert(instanceAliases)
          .values({ id: from, instanceId: to, folded: true })
          .onConflictDoUpdate({
            target: instanceAliases.id,
            set: { instanceId: to, folded: true },
          })
          .run();
        // Nothing a process lost is failed in a live fold: the hub owes what
        // `from` was handed and never read before it folds (server.ts
        // `foldContinued`).
        return foldInto(tx, to, [from], () => false);
      }),
  };
};
