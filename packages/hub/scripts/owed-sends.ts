/**
 * `bun run owed-sends <database>` in packages/hub: what migration 0421 will
 * do to a hub database's owed sends (`sent_messages.owed`, the send as its
 * machine is to be handed it, which 0421 folds into `sent_messages.envelope`
 * behind the flag `owed_held`), read before it runs. Opens the database
 * read-only (a copy of a live hub's, or a fixture unpacked) and counts its
 * sends as owed and envelope equal (the flag set, nothing else moves), owed
 * alone (the owed envelope becomes its envelope), envelope alone (left as it
 * is), both different (the kept envelope stays, the owed one moves to
 * owed_unread), owed unreadable beside a kept envelope (the same) and owed
 * unreadable alone (still owed with no envelope, never handed on), and
 * names each of the last three. Read with 0421's own predicates
 * (db/owed-sends-unread.ts); on a database 0421 has run on it says so and
 * counts nothing.
 */
import { Database } from "bun:sqlite";
import { envelopeAloneCount, owedSendsKept } from "../src/db/owed-sends-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error("owed-sends: name the database: bun run owed-sends <path>");
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const ran =
  client
    .query<{ found: number }, []>(
      "SELECT count(*) AS found FROM pragma_table_info('sent_messages') WHERE name = 'owed'"
    )
    .get()?.found !== 1;
if (ran) {
  console.log(
    `sent_messages.owed: 0421 has run on ${path}; read a copy taken before it`
  );
} else {
  const owed = owedSendsKept(client);
  const of = (kind: string) => owed.filter((one) => one.reading.kind === kind);
  const sends =
    client
      .query<{ found: number }, []>(
        "SELECT count(*) AS found FROM sent_messages"
      )
      .get()?.found ?? 0;
  console.log(
    `sent_messages: ${sends} sends, ${owed.length} owed: ${of("same").length} owed and envelope equal, ${of("alone").length} owed alone, ${envelopeAloneCount(client)} envelope alone, ${of("different").length} both different, ${of("unread-beside").length} owed unreadable beside an envelope, ${of("unread-alone").length} owed unreadable alone`
  );
  /** A value as this shows it: cut short, on one line. */
  const shown = (raw: string | null): string =>
    JSON.stringify((raw ?? "").slice(0, 120));
  for (const one of of("different")) {
    console.log(
      `  both different: ${one.key}: the kept envelope stays; the owed one ${shown(one.owed)} goes to owed_unread`
    );
  }
  for (const one of owed) {
    const { reading } = one;
    if (reading.kind === "unread-beside" || reading.kind === "unread-alone") {
      console.log(
        `  owed unreadable ${reading.kind === "unread-beside" ? "beside an envelope" : "alone"}: ${one.key}: ${shown(one.owed)}: ${reading.why}`
      );
    }
  }
}
client.close();
