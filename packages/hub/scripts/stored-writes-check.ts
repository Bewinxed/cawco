/**
 * `bun scripts/stored-writes-check.ts` in packages/hub: a stored JSON column (core
 * stored-json.ts `storedJson`) refuses a write holding a key its type does
 * not declare, and still reads a row that holds one. Planted on a table of
 * its own in an in-memory database, through Drizzle as the hub writes, with
 * the generated schemas the hub's columns use:
 *
 * - Law A: a key the column's type does not declare, at its root, fails the
 *   write with a StoredShapeError naming the column, the key, and the
 *   declared type to declare it in with its file; nothing is written.
 * - Law B: one nested in an array of a declared type is named by that type,
 *   not the column's, its indices as one (`[].key`).
 * - Law C: every key declared (an optional one among them) writes, and a key
 *   whose value is undefined is no key: JSON writes none.
 * - Law D: a row written before, holding a key no type declares, reads, the
 *   key stripped.
 * - Law E: a row as written reads back: Law C's, its undefined key left out
 *   of the JSON, which only an optional property may be (scripts/
 *   stored-shapes.ts refuses `undefined` anywhere else in a stored type).
 *
 * Run by `bun run check` (scripts/check.ts, `stored-writes:check`); it fails on any law broken.
 */
import { Database } from "bun:sqlite";
import {
  DelegateEventPayloadSchema,
  ModelInfoSchema,
} from "@cawco/core/stored-shapes";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { isStoredShapeError, storedJson } from "../src/stored-json";

const planted = sqliteTable("planted", {
  id: integer("id").primaryKey(),
  payload: storedJson(DelegateEventPayloadSchema)("payload").notNull(),
  models: storedJson(z.array(ModelInfoSchema))("models").notNull(),
});

const sqlite = new Database(":memory:");
sqlite.run(
  "CREATE TABLE planted (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, models TEXT NOT NULL)"
);
const db = drizzle(sqlite);

const failures: string[] = [];
const law = (name: string, held: boolean, said: string): void => {
  if (!held) {
    failures.push(`${name}: ${said}`);
  }
};

/** What writing `row` came to: written, or the refusal's words. */
const write = (row: typeof planted.$inferInsert): string => {
  try {
    db.insert(planted).values(row).run();
    return "written";
  } catch (error) {
    return isStoredShapeError(error) && error.direction === "write"
      ? error.message
      : `not a write's refusal: ${String(error)}`;
  }
};

const model = { value: "probe-model", displayName: "Probe" };
const rows = () => sqlite.query("SELECT id FROM planted").all().length;

// Law A: an undeclared key at the column's root.
const root = write({
  id: 1,
  // A spread, as the hub's report path wrote `notice` before its type declared it.
  payload: { body: "b", failed: false, ...{ bogus: 1 } },
  models: [model],
});
law(
  "Law A",
  root.startsWith("planted.payload was written") &&
    root.includes("`bogus`") &&
    root.includes("DelegateEventPayload (packages/core/src/protocol.ts)") &&
    rows() === 0,
  `${root}; ${rows()} row(s)`
);

// Law B: an undeclared key in an array of a declared type.
const nested = write({
  id: 2,
  payload: { body: "b", failed: false },
  models: [
    model,
    { ...model, ...{ bogus: true } },
    { ...model, ...{ bogus: false } },
  ],
});
law(
  "Law B",
  nested.startsWith("planted.models was written") &&
    nested.includes(
      "`[].bogus`, which ModelInfo (packages/core/src/harness/kinds.ts)"
    ) &&
    rows() === 0,
  `${nested}; ${rows()} row(s)`
);

// Law C: every key declared, and one undefined.
const declared = write({
  id: 3,
  payload: { body: "b", failed: false, notice: true, headline: undefined },
  models: [{ ...model, supportsEffort: true }],
});
law("Law C", declared === "written" && rows() === 1, declared);

// Law E: that row reads back as it was written.
try {
  const back = db.select().from(planted).where(eq(planted.id, 3)).get();
  law(
    "Law E",
    back !== undefined &&
      "notice" in back.payload &&
      back.payload.notice === true &&
      !("headline" in back.payload),
    JSON.stringify(back)
  );
} catch (error) {
  law("Law E", false, `the read threw: ${String(error)}`);
}

// Law D: an old row holding an undeclared key still reads.
sqlite.run("INSERT INTO planted (id, payload, models) VALUES (4, ?, ?)", [
  JSON.stringify({ body: "old", failed: false, bogus: 1 }),
  JSON.stringify([{ ...model, bogus: true }]),
]);
try {
  const old = db.select().from(planted).where(eq(planted.id, 4)).get();
  law(
    "Law D",
    old !== undefined &&
      !("bogus" in old.payload) &&
      old.models.every((one) => !("bogus" in one)),
    JSON.stringify(old)
  );
} catch (error) {
  law("Law D", false, `the read threw: ${String(error)}`);
}
sqlite.close();

if (failures.length > 0) {
  console.error(
    `stored-writes-check: ${failures.length} broken\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  "stored-writes-check: laws A–E held: a planted key no type declares fails its write, at the column's root and in an array of a declared type, naming the column, the key and the type; declared keys write, and read back as written; an old row holding one reads"
);
