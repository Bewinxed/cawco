/**
 * The hub's mirror of outside items (schema `external_items`, provider spec
 * §2.3): one row per project and item, and THE writer of it. Every path
 * that learns what an item holds writes it here and nowhere else: a task's
 * link made from its URL (db task-links.ts `syncTaskLinks`), a read of a
 * linked item and an Actions run a wait names (external-items.ts
 * `readLinks`), an event about a linked item (external-items.ts
 * `applyEvent`), the tracker sync's record (db trackers.ts `putLink`,
 * `updateLink`), and a connector poll's records (db ingress.ts
 * `keepConnectorPollItems`).
 *
 * A revision carries a `version` (the source's updated-at in ms, or a
 * record's version) when it knows one: one older than the version held
 * writes none of what it says of the item, only what it says of the read
 * (`readAt`, `etag`, `problem`), so an event read late never puts an older
 * state over a newer one.
 */
import type { ItemKind, ItemRef } from "@cawco/providers/provider";
import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { externalItems } from "./schema";
import type { ItemProvider } from "./stored-types";

export type ItemRow = typeof externalItems.$inferSelect;

type Writer = Pick<BunSQLiteDatabase, "insert" | "select" | "update">;

/** An item as the mirror keys it: one a URL names, or a connector poll's record. */
export interface MirrorRef {
  container: string;
  host: string;
  key: string;
  kind: ItemKind;
  provider: ItemProvider;
  ref: string;
  url: string | null;
}

/** What one read, event or sync says of an item; a field left out stays as held. */
export type ItemRevision = Partial<
  Omit<ItemRow, keyof MirrorRef | "id" | "projectId">
>;

/** The fields a revision says of the item itself, which an older version never writes. */
const SNAPSHOT: ReadonlySet<string> = new Set<keyof ItemRevision>([
  "externalId",
  "title",
  "state",
  "stateName",
  "author",
  "labels",
  "version",
]);

const DIGITS = /^\d+$/u;

/** Whether `version` is older than `held`: both the source's ms, compared as numbers. A record's version (its poll's own) is never older, only other: the writer never asks. */
const older = (
  held: string | null,
  version: string | null | undefined
): boolean =>
  typeof version === "string" &&
  held !== null &&
  DIGITS.test(version) &&
  DIGITS.test(held) &&
  BigInt(version) < BigInt(held);

/** An item a URL names, as the mirror keys it. */
export const mirrorRefOf = (item: ItemRef): MirrorRef => ({
  provider: item.provider,
  host: item.host,
  container: item.container,
  kind: item.kind,
  key: item.key,
  ref: item.ref,
  url: item.url,
});

/** What a write did: the row as it now stands, and whether its state or title moved. */
export interface ItemWritten {
  item: ItemRow;
  moved: boolean;
}

/** `revision` over the row `held`: its snapshot unless older, its read always. */
const writeOver = (
  tx: Writer,
  held: ItemRow,
  revision: ItemRevision
): ItemWritten => {
  const patch: ItemRevision =
    held.kind !== "record" && older(held.version, revision.version)
      ? Object.fromEntries(
          Object.entries(revision).filter(([field]) => !SNAPSHOT.has(field))
        )
      : revision;
  const moved =
    (patch.state !== undefined && patch.state !== held.state) ||
    (patch.title !== undefined && patch.title !== held.title);
  if (Object.keys(patch).length === 0) {
    return { item: held, moved };
  }
  const item =
    tx
      .update(externalItems)
      .set(patch)
      .where(eq(externalItems.id, held.id))
      .returning()
      .get() ?? held;
  return { item, moved };
};

/** The project's mirror row of `ref`, or undefined while it has none. */
const itemOf = (
  tx: Pick<BunSQLiteDatabase, "select">,
  projectId: string,
  ref: Omit<MirrorRef, "ref" | "url">
): ItemRow | undefined =>
  tx
    .select()
    .from(externalItems)
    .where(
      and(
        eq(externalItems.projectId, projectId),
        eq(externalItems.provider, ref.provider),
        eq(externalItems.host, ref.host),
        eq(externalItems.container, ref.container),
        eq(externalItems.kind, ref.kind),
        eq(externalItems.key, ref.key)
      )
    )
    .get();

/**
 * THE writer: the project's mirror row of `ref`, made when it has none,
 * with `revision` written over it (nothing, when it says nothing).
 */
export const writeItem = (
  tx: Writer,
  projectId: string,
  ref: MirrorRef,
  revision: ItemRevision = {}
): ItemWritten => {
  const held = itemOf(tx, projectId, ref);
  if (held) {
    return writeOver(tx, held, revision);
  }
  const item = tx
    .insert(externalItems)
    .values({ id: crypto.randomUUID(), projectId, ...ref, ...revision })
    .returning()
    .get();
  return {
    item,
    moved: item.state !== null || item.title !== "",
  };
};

/** THE writer, for a row already held, by its id; undefined when it is gone. */
export const writeItemById = (
  tx: Writer,
  id: string,
  revision: ItemRevision
): ItemWritten | undefined => {
  const held = tx
    .select()
    .from(externalItems)
    .where(eq(externalItems.id, id))
    .get();
  return held && writeOver(tx, held, revision);
};
