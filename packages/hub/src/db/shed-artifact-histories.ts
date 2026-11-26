/**
 * Every artifact's doc whose deleted history outweighs its live content,
 * shed once as the hub opens its store (db/migrate.ts's `opened` step),
 * through the same shed and the same log write a doc's compaction makes
 * (artifacts/shed.ts `shedOf`, db/artifacts.ts `replaceLog`): the
 * design-system board held 4.2 MB for some 350 KB of live content, nearly
 * all of it its pins' places rewritten by a placing loop since fixed
 * (2026-11-26). No client is joined while the store opens; each device
 * that holds an old copy is told as it syncs (artifacts/sync.ts). A held
 * next version, and an artifact one is held for, keep their history, as
 * compaction keeps it (artifacts/docs.ts `compact`).
 */
import { and, asc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { shedLine, shedOf } from "../artifacts/shed";
import { replaceLog } from "./artifacts";
import {
  artifactRetired,
  artifacts,
  artifactUpdates,
  dataMigrations,
} from "./schema";

/** Artifact `id`'s doc shed, when its history outweighs its content. Whether it was. */
const shedOne = (db: BunSQLiteDatabase, id: string): boolean => {
  const doc = new Doc();
  try {
    for (const { update } of db
      .select({ update: artifactUpdates.update })
      .from(artifactUpdates)
      .where(eq(artifactUpdates.artifactId, id))
      .orderBy(asc(artifactUpdates.seq))
      .all()) {
      applyUpdate(doc, update);
    }
    const before =
      db
        .select({ retired: artifactRetired.retired })
        .from(artifactRetired)
        .where(eq(artifactRetired.artifactId, id))
        .get()?.retired ?? null;
    const shed = shedOf(doc, encodeStateAsUpdate(doc), before);
    if (!shed) {
      return false;
    }
    replaceLog(db, id, shed.live, shed.retired);
    console.info(shedLine(id, shed));
    return true;
  } finally {
    doc.destroy();
  }
};

/** The sheds above, once, under the step's name: how many docs were shed, or null when it had run before. */
export const shedArtifactHistoriesOnce = (
  db: BunSQLiteDatabase,
  name: string
): number | null => {
  if (
    db.select().from(dataMigrations).where(eq(dataMigrations.name, name)).get()
  ) {
    return null;
  }
  const holding = db
    .select({ id: artifacts.heldFor })
    .from(artifacts)
    .where(isNotNull(artifacts.heldFor));
  const ids = db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(isNull(artifacts.heldFor), notInArray(artifacts.id, holding)))
    .all()
    .map((row) => row.id);
  let shed = 0;
  for (const id of ids) {
    shed += shedOne(db, id) ? 1 : 0;
  }
  console.info(
    `[artifacts] ${shed} of ${ids.length} artifact docs shed their deleted history`
  );
  db.insert(dataMigrations).values({ name, at: new Date() }).run();
  return shed;
};
