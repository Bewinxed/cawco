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
import type { DelegateType } from "@cawco/core/delegate-types";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DelegateTypesShape } from "./delegate-types";
import {
  artifacts,
  cardSettlings,
  DECIDES_ID,
  decidesKinds,
  decidesMembers,
  decidesRoutes,
  decidesSettings,
  turnUsage,
} from "./schema";

export type CardSettlingRow = typeof cardSettlings.$inferSelect;
type MemberRow = typeof decidesMembers.$inferSelect;
type SettingsRow = typeof decidesSettings.$inferSelect;

/**
 * Whether a ledger row's card is still its member's: not settled by it, and
 * not taken back by the person's own pick ({@link DecidesDb.markTakenBack}).
 */
export const holds = (row: CardSettlingRow): boolean =>
  row.settledAt === null && row.takenBackAt === null;

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
  /**
   * The cards it still holds ({@link holds}) on pages that still stand, as
   * rows (the caller asks which runs are live). A card on a deleted page
   * waits on no one; what it settled there stays in `decided`.
   */
  open: CardSettlingRow[];
  /** The cards it settled that he picked otherwise. */
  takenBack: number;
}

/** Who decides' rows: the fleet's table, its members and kinds (decides.ts), and where every card went (settling.ts). */
export interface DecidesDb {
  /** The fleet's Who decides, whole: the built-in members with what he changed, the members he added, every kind and its member. */
  readonly fleet: () => FleetDecides;
  /** Every kind, in order. */
  readonly kinds: () => Kind[];
  /** Stamps card `card` of `artifactId` settled at `at`. */
  readonly markSettled: (artifactId: string, card: string, at: Date) => void;
  /**
   * Stamps card `card` of `artifactId` taken from its member by the person's
   * own pick: one it settled that he picked otherwise, or one still waiting
   * on it that he picked first. Neither counts as the member's: its record's
   * `decided` reads `settledAt` alone, and a card it never settled leaves
   * its `open`.
   */
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
  /** Every card a member still holds ({@link holds}), a card that came to him aside. */
  readonly open: () => CardSettlingRow[];
  /** A kind added or renamed. */
  readonly putKind: (kind: Kind) => void;
  /** A member he added, with its delegate type, in one transaction; answers it as Who decides lists it. */
  readonly putMember: (
    row: Omit<MemberRow, "createdAt">,
    type: DelegateType | null
  ) => Member;
  /** Each card's row, replacing that card's last. */
  readonly putSettlings: (rows: CardSettlingRow[]) => void;
  /** The member's record. */
  readonly record: (memberId: string) => MemberRecord;
  /** A kind gone: its row, its fleet route; answers the open cards' rows filed under it. Saved routes that can't be read stay so. */
  readonly removeKind: (id: string, moveTo: string) => CardSettlingRow[];
  /** A member gone: its row, and its kinds back to `you` in the fleet routes; answers the kinds it had. */
  readonly removeMember: (id: string) => string[];
  /** What he changed of the built-in members. */
  readonly setBuiltIn: (change: BuiltInChange) => void;
  /** The fleet's routes, whole: they replace what was saved, routes that could not be read included. */
  readonly setRoutes: (routes: Record<string, string>) => void;
  /** Where card `card` of `artifactId` went, when the hub routed it. */
  readonly settling: (
    artifactId: string,
    card: string
  ) => CardSettlingRow | undefined;
  /** Where each card of `artifactId` the hub routed went. */
  readonly settlings: (artifactId: string) => CardSettlingRow[];
  /** The cost of `instances`' turns since `since`, in dollars. */
  readonly spend: (instances: string[], since: Date) => number;
}

/** A row he added, as a member. */
const memberOfRow = (row: Omit<MemberRow, "createdAt">): Member => ({
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
});

/** Each flock member's chosen pose, as the settings row holds it; a member he left alone has none. */
const posesOf = (
  settings: SettingsRow | undefined
): Partial<Record<FlockMember, CawPoseId>> => {
  const poses: [FlockMember, CawPoseId | null | undefined][] = [
    ["caw", settings?.cawPose],
    ["advisor", settings?.advisorPose],
    ["practice", settings?.practicePose],
    ["asker", settings?.askerPose],
  ];
  return Object.fromEntries(
    poses.flatMap(([member, pose]) => (pose ? [[member, pose]] : []))
  );
};

/**
 * How he hears of `id`'s answers, as the settings row holds it: his
 * choice, else the built-in's; while what was stored did not read
 * (`hear_unread`), a member he has not set again hears `each`, so no answer
 * is kept from him that he did not choose to hear later.
 */
const hearOf = (
  settings: SettingsRow | undefined,
  id: "advisor" | "practice"
): Hear | null => {
  const chosen =
    id === "advisor" ? settings?.advisorHear : settings?.practiceHear;
  if (chosen) {
    return chosen;
  }
  return typeof settings?.hearUnread === "string" ? "each" : BUILT_IN[id].hear;
};

/** The built-in members with what `settings` changed of them. */
const builtIns = (settings: SettingsRow | undefined): Member[] => {
  const poses = posesOf(settings);
  return BUILT_IN_MEMBERS.map((id) => {
    const member = BUILT_IN[id];
    const pose = id === "you" ? null : (poses[id] ?? member.pose);
    if (id === "advisor" || id === "practice") {
      return {
        ...member,
        pose,
        delegateType: settings?.[id] ?? member.delegateType,
        hear: hearOf(settings, id),
      };
    }
    return { ...member, pose };
  });
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

  /** The member each kind he set goes to, by kind id. */
  const storedRoutes = (): Map<string, string> =>
    new Map(
      db
        .select()
        .from(decidesRoutes)
        .all()
        .map((row) => [row.kindId, row.memberId])
    );

  const fleet = (): FleetDecides => {
    const row = settings();
    const all = [...builtIns(row), ...members().map(memberOfRow)];
    const known = new Set(all.map((member) => member.id));
    const listed = kinds();
    // Saved routes that can't be read (migration 0406) send every kind to
    // him, never to core's seed, until they are saved again.
    const unread = typeof row?.routesUnread === "string";
    const stored = storedRoutes();
    // Core's seed by any kind's id: a kind he added has none.
    const seeded: Partial<Record<string, string>> = DEFAULT_ROUTES;
    const routes = Object.fromEntries(
      listed.map((kind) => {
        const member = unread
          ? BUILT_IN.you.id
          : (stored.get(kind.id) ?? seeded[kind.id] ?? BUILT_IN.you.id);
        return [kind.id, known.has(member) ? member : BUILT_IN.you.id];
      })
    );
    return {
      members: all,
      kinds: listed,
      routes,
      pictures: posesOf(row),
      ...(unread ? { routesUnread: true } : {}),
    };
  };

  return {
    fleet,
    kinds,
    members,
    setRoutes: (routes) => {
      // Written whole: they replace what was saved, routes that could not
      // be read included.
      db.transaction((tx) => {
        tx.delete(decidesRoutes).run();
        for (const [kindId, memberId] of Object.entries(routes)) {
          tx.insert(decidesRoutes).values({ kindId, memberId }).run();
        }
        tx.update(decidesSettings)
          .set({ routesUnread: null })
          .where(eq(decidesSettings.id, DECIDES_ID))
          .run();
      });
    },
    setBuiltIn: (change) => {
      const row = settings();
      const hear = {
        advisorHear: change.hear?.advisor ?? row?.advisorHear ?? null,
        practiceHear: change.hear?.practice ?? row?.practiceHear ?? null,
      };
      const poses = {
        cawPose: change.pictures?.caw ?? row?.cawPose ?? null,
        advisorPose: change.pictures?.advisor ?? row?.advisorPose ?? null,
        practicePose: change.pictures?.practice ?? row?.practicePose ?? null,
        askerPose: change.pictures?.asker ?? row?.askerPose ?? null,
      };
      writeSettings({
        ...(change.advisor === undefined ? {} : { advisor: change.advisor }),
        ...(change.practice === undefined ? {} : { practice: change.practice }),
        // What did not read as these became columns stops counting once he
        // has set every member it could have spoken for.
        ...(change.hear
          ? {
              ...hear,
              ...(Object.values(hear).every(Boolean)
                ? { hearUnread: null }
                : {}),
            }
          : {}),
        ...(change.pictures
          ? {
              ...poses,
              ...(Object.values(poses).every(Boolean)
                ? { picturesUnread: null }
                : {}),
            }
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
      return memberOfRow(row);
    },
    removeMember: (id) => {
      const { routes } = fleet();
      const returned = Object.keys(routes).filter(
        (kind) => routes[kind] === id
      );
      db.transaction((tx) => {
        tx.delete(decidesMembers).where(eq(decidesMembers.id, id)).run();
        tx.update(decidesRoutes)
          .set({ memberId: BUILT_IN.you.id })
          .where(eq(decidesRoutes.memberId, id))
          .run();
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
      const open = db
        .select()
        .from(cardSettlings)
        .where(and(eq(cardSettlings.kind, id), isNull(cardSettlings.settledAt)))
        .all();
      db.transaction((tx) => {
        // Its route goes with it (`decides_routes` cascades).
        tx.delete(decidesKinds).where(eq(decidesKinds.id, id)).run();
        tx.update(cardSettlings)
          .set({ kind: moveTo })
          .where(eq(cardSettlings.kind, id))
          .run();
      });
      return open;
    },
    settlings: (artifactId) =>
      db
        .select()
        .from(cardSettlings)
        .where(eq(cardSettlings.artifactId, artifactId))
        .all(),
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
    open: () =>
      db
        .select()
        .from(cardSettlings)
        .where(
          and(
            isNull(cardSettlings.settledAt),
            isNull(cardSettlings.takenBackAt),
            ne(cardSettlings.route, BUILT_IN.you.id)
          )
        )
        .all(),
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
            isNull(cardSettlings.takenBackAt)
          )
        )
        .run();
    },
    record: (memberId) => {
      // Each row with whether its page still stands: nothing cascades from
      // `artifacts` here, and a page can come back (a project restored from
      // the trash puts its rows back by id, db forget.ts).
      const read = db
        .select({ row: cardSettlings, page: artifacts.id })
        .from(cardSettlings)
        .leftJoin(artifacts, eq(artifacts.id, cardSettlings.artifactId))
        .where(eq(cardSettlings.route, memberId))
        .all();
      const rows = read.map(({ row }) => row);
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
        open: read.flatMap(({ row, page }) =>
          page !== null && holds(row) ? [row] : []
        ),
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
