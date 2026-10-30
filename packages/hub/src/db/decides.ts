import type { DelegateType } from "@cawco/core";
import {
  BUILT_IN,
  BUILT_IN_MEMBERS,
  type CawPoseId,
  DEFAULT_ROUTES,
  type FleetDecides,
  type FlockMember,
  type Hear,
  KIND_SEED,
  type Kind,
  type Member,
} from "@cawco/core/decides";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DelegateTypesShape } from "../delegate-types";
import {
  artifacts,
  cardSettlings,
  decidesKinds,
  decidesMembers,
  decidesSettings,
  turnUsage,
} from "./schema";

export type CardSettlingRow = typeof cardSettlings.$inferSelect;
type MemberRow = typeof decidesMembers.$inferSelect;
type SettingsRow = typeof decidesSettings.$inferSelect;

/** The one {@link decidesSettings} row's key. */
const DECIDES_ID = "decides";

/** What the person changed of the built-in members. */
export interface BuiltInChange {
  advisor?: string;
  hear?: Partial<Record<"advisor" | "practice", Hear>>;
  pictures?: Partial<Record<FlockMember, CawPoseId>>;
  practice?: string;
}

/** A member's record (`GET /api/decides/members/:id/record`), its spend aside. */
export interface MemberRecord {
  decided: number;
  /** The sessions that settled for it, for their spend (`spend`). */
  instances: string[];
  lastAt: Date | null;
  takenBack: number;
  /** Its cards not settled yet, as rows (the caller asks which runs are live). */
  unsettled: CardSettlingRow[];
}

/** Who decides' rows: the fleet's table, its members and kinds (decides.ts), and where every card went (settling.ts). */
export interface DecidesDb {
  /** The fleet's Who decides, whole: the built-in members with what he changed, the members he added, every kind and its member. */
  readonly fleet: () => FleetDecides;
  /** Every kind, in order. */
  readonly kinds: () => Kind[];
  /** Stamps card `card` of `artifactId` settled at `at`. */
  readonly markSettled: (artifactId: string, card: string, at: Date) => void;
  /** Stamps a settled card the person picked again. */
  readonly markTakenBack: (artifactId: string, card: string, at: Date) => void;
  /** The members he added, as rows. */
  readonly members: () => MemberRow[];
  /**
   * The cards routed to `member` on project `projectId`'s pages (null:
   * pages in no project), newest first: the member's session for the
   * project is the newest row's.
   */
  readonly onProject: (
    member: string,
    projectId: string | null
  ) => CardSettlingRow[];
  /** A kind added or renamed. */
  readonly putKind: (kind: Kind) => void;
  /** A member he added, with its delegate type, in one transaction. */
  readonly putMember: (
    row: Omit<MemberRow, "createdAt">,
    type: DelegateType | null
  ) => void;
  /** Each card's row, replacing that card's last. */
  readonly putSettlings: (rows: CardSettlingRow[]) => void;
  /** The member's record. */
  readonly record: (memberId: string) => MemberRecord;
  /** A kind gone: its row, its fleet route; answers the open cards' rows filed under it. */
  readonly removeKind: (id: string, moveTo: string) => CardSettlingRow[];
  /** A member gone: its row, and its kinds back to `you` in the fleet routes; answers those kinds. */
  readonly removeMember: (id: string) => string[];
  /** What he changed of the built-in members. */
  readonly setBuiltIn: (change: BuiltInChange) => void;
  /** The fleet's routes, whole. */
  readonly setRoutes: (routes: Record<string, string>) => void;
  /** Where card `card` of `artifactId` went, when the hub routed it. */
  readonly settling: (
    artifactId: string,
    card: string
  ) => CardSettlingRow | undefined;
  /** The cost of `instances`' turns since `since`, in dollars. */
  readonly spend: (instances: string[], since: Date) => number;
}

/** A row he added, as a member. */
const memberOfRow = (row: MemberRow): Member => ({
  id: row.id,
  type: row.type,
  name: row.name,
  job: row.job,
  subject: row.subject,
  builtIn: false,
  hue: row.hue,
  pose: null,
  hear: row.hear,
  delegateType: row.delegateType,
  reach: row.reach,
});

/** The built-in members with what `settings` changed of them. */
const builtIns = (settings: SettingsRow | undefined): Member[] =>
  BUILT_IN_MEMBERS.map((id) => {
    const member = BUILT_IN[id];
    const pose =
      id === "you" ? null : (settings?.pictures?.[id] ?? member.pose);
    if (id === "advisor" || id === "practice") {
      return {
        ...member,
        pose,
        delegateType: settings?.[id] ?? member.delegateType,
        hear: settings?.hear?.[id] ?? member.hear,
      };
    }
    return { ...member, pose };
  });

/** The fleet's routes written whole, in the transaction `tx`. */
const putRoutes = (
  tx: Pick<BunSQLiteDatabase, "insert">,
  routes: Record<string, string>
): void => {
  tx.insert(decidesSettings)
    .values({ id: DECIDES_ID, routes })
    .onConflictDoUpdate({ target: decidesSettings.id, set: { routes } })
    .run();
};

export const decidesDb = (
  db: BunSQLiteDatabase,
  types: DelegateTypesShape
): DecidesDb => {
  // The six built-in kinds stand from the first start; a rename he made
  // stays, and a built-in kind is never removed, so nothing reseeds one.
  for (const kind of KIND_SEED) {
    db.insert(decidesKinds).values(kind).onConflictDoNothing().run();
  }

  const settings = (): SettingsRow | undefined =>
    db
      .select()
      .from(decidesSettings)
      .where(eq(decidesSettings.id, DECIDES_ID))
      .get();

  /** Writes `set` into the one settings row, made when missing. */
  const writeSettings = (set: Partial<Omit<SettingsRow, "id">>): void => {
    db.insert(decidesSettings)
      .values({ id: DECIDES_ID, ...set })
      .onConflictDoUpdate({ target: decidesSettings.id, set })
      .run();
  };

  const kinds = (): Kind[] =>
    db
      .select()
      .from(decidesKinds)
      .orderBy(asc(decidesKinds.position), asc(decidesKinds.id))
      .all();

  const members = (): MemberRow[] =>
    db
      .select()
      .from(decidesMembers)
      .orderBy(asc(decidesMembers.createdAt))
      .all();

  const fleet = (): FleetDecides => {
    const row = settings();
    const all = [...builtIns(row), ...members().map(memberOfRow)];
    const known = new Set(all.map((member) => member.id));
    const listed = kinds();
    const stored = row?.routes ?? {};
    const routes = Object.fromEntries(
      listed.map((kind) => {
        const member =
          stored[kind.id] ??
          (DEFAULT_ROUTES as Record<string, string>)[kind.id] ??
          "you";
        return [kind.id, known.has(member) ? member : "you"];
      })
    );
    return {
      members: all,
      kinds: listed,
      routes,
      pictures: row?.pictures ?? {},
    };
  };

  return {
    fleet,
    kinds,
    members,
    setRoutes: (routes) => writeSettings({ routes }),
    setBuiltIn: (change) => {
      const row = settings();
      writeSettings({
        ...(change.advisor === undefined ? {} : { advisor: change.advisor }),
        ...(change.practice === undefined ? {} : { practice: change.practice }),
        ...(change.hear
          ? { hear: { ...(row?.hear ?? {}), ...change.hear } }
          : {}),
        ...(change.pictures
          ? { pictures: { ...(row?.pictures ?? {}), ...change.pictures } }
          : {}),
      });
    },
    putMember: (row, type) => {
      db.transaction((tx) => {
        if (type) {
          types.put(type);
        }
        const { id: _id, ...set } = row;
        tx.insert(decidesMembers)
          .values(row)
          .onConflictDoUpdate({ target: decidesMembers.id, set })
          .run();
      });
    },
    removeMember: (id) => {
      const routes = { ...fleet().routes };
      const returned = Object.keys(routes).filter(
        (kind) => routes[kind] === id
      );
      for (const kind of returned) {
        routes[kind] = "you";
      }
      db.transaction((tx) => {
        tx.delete(decidesMembers).where(eq(decidesMembers.id, id)).run();
        putRoutes(tx, routes);
      });
      return returned;
    },
    putKind: (kind) => {
      db.insert(decidesKinds)
        .values(kind)
        .onConflictDoUpdate({
          target: decidesKinds.id,
          set: { name: kind.name, example: kind.example },
        })
        .run();
    },
    removeKind: (id, moveTo) => {
      const routes = { ...(settings()?.routes ?? {}) };
      delete routes[id];
      const open = db
        .select()
        .from(cardSettlings)
        .where(and(eq(cardSettlings.kind, id), isNull(cardSettlings.settledAt)))
        .all();
      db.transaction((tx) => {
        tx.delete(decidesKinds).where(eq(decidesKinds.id, id)).run();
        tx.update(cardSettlings)
          .set({ kind: moveTo })
          .where(eq(cardSettlings.kind, id))
          .run();
        putRoutes(tx, routes);
      });
      return open;
    },
    settling: (artifactId, card) =>
      db
        .select()
        .from(cardSettlings)
        .where(
          and(
            eq(cardSettlings.artifactId, artifactId),
            eq(cardSettlings.card, card)
          )
        )
        .get(),
    onProject: (member, projectId) =>
      db
        .select({ row: cardSettlings })
        .from(cardSettlings)
        .innerJoin(artifacts, eq(artifacts.id, cardSettlings.artifactId))
        .where(
          and(
            eq(cardSettlings.route, member),
            isNotNull(cardSettlings.instanceId),
            projectId === null
              ? isNull(artifacts.projectId)
              : eq(artifacts.projectId, projectId)
          )
        )
        .orderBy(sql`${cardSettlings.createdAt} desc`)
        .all()
        .map(({ row }) => row),
    putSettlings: (rows) => {
      db.transaction((tx) => {
        for (const row of rows) {
          const { artifactId: _artifact, card: _card, ...set } = row;
          tx.insert(cardSettlings)
            .values(row)
            .onConflictDoUpdate({
              target: [cardSettlings.artifactId, cardSettlings.card],
              set,
            })
            .run();
        }
      });
    },
    markSettled: (artifactId, card, at) => {
      db.update(cardSettlings)
        .set({ settledAt: at, takenBackAt: null })
        .where(
          and(
            eq(cardSettlings.artifactId, artifactId),
            eq(cardSettlings.card, card)
          )
        )
        .run();
    },
    markTakenBack: (artifactId, card, at) => {
      db.update(cardSettlings)
        .set({ takenBackAt: at })
        .where(
          and(
            eq(cardSettlings.artifactId, artifactId),
            eq(cardSettlings.card, card),
            isNotNull(cardSettlings.settledAt),
            isNull(cardSettlings.takenBackAt)
          )
        )
        .run();
    },
    record: (memberId) => {
      const rows = db
        .select()
        .from(cardSettlings)
        .where(eq(cardSettlings.route, memberId))
        .all();
      const settled = rows.filter((row) => row.settledAt !== null);
      const last = settled.reduce<Date | null>(
        (at, row) =>
          row.settledAt && (!at || row.settledAt > at) ? row.settledAt : at,
        null
      );
      return {
        decided: settled.length,
        lastAt: last,
        takenBack: settled.filter((row) => row.takenBackAt !== null).length,
        unsettled: rows.filter((row) => row.settledAt === null),
        instances: [
          ...new Set(
            rows.flatMap((row) => (row.instanceId ? [row.instanceId] : []))
          ),
        ],
      };
    },
    spend: (instances, since) =>
      instances.length === 0
        ? 0
        : (db
            .select({
              total: sql<number>`coalesce(sum(${turnUsage.costUsd}), 0)`,
            })
            .from(turnUsage)
            .where(
              and(
                inArray(turnUsage.instanceId, instances),
                gte(turnUsage.at, since)
              )
            )
            .get()?.total ?? 0),
  };
};
