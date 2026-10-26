import type { FleetDecides } from "@cawco/core/decides";
import { and, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { cardSettlings, decidesSettings } from "./schema";

type CardSettlingRow = typeof cardSettlings.$inferSelect;

/** The one {@link decidesSettings} row's key. */
const DECIDES_ID = "decides";

/** The rows Who decides keeps: the fleet's table (decides-file.ts) and the cards handed to a delegate to settle (settling.ts). */
export interface DecidesDb {
  /** The fleet's Who decides; no row reads as no routes and no advisor. */
  readonly fleet: () => FleetDecides;
  /** One run's cards, each replacing that card's last run. */
  readonly putSettlings: (rows: CardSettlingRow[]) => void;
  /** The fleet's Who decides, whole. */
  readonly setFleet: (value: FleetDecides) => void;
  /** The delegate the hub started to settle a card, when one was. */
  readonly settling: (
    artifactId: string,
    card: string
  ) => CardSettlingRow | undefined;
}

export const decidesDb = (db: BunSQLiteDatabase): DecidesDb => ({
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
  fleet: () => {
    const row = db
      .select()
      .from(decidesSettings)
      .where(eq(decidesSettings.id, DECIDES_ID))
      .get();
    return { routes: row?.routes ?? {}, advisor: row?.advisor ?? null };
  },
  putSettlings: (rows) => {
    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(cardSettlings)
          .values(row)
          .onConflictDoUpdate({
            target: [cardSettlings.artifactId, cardSettlings.card],
            set: {
              route: row.route,
              instanceId: row.instanceId,
              workItemId: row.workItemId,
              askedBy: row.askedBy,
              createdAt: row.createdAt,
            },
          })
          .run();
      }
    });
  },
  setFleet: (value) => {
    db.insert(decidesSettings)
      .values({ id: DECIDES_ID, ...value })
      .onConflictDoUpdate({ target: decidesSettings.id, set: value })
      .run();
  },
});
