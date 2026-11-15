/**
 * `bun run sealed-facts <database>` in packages/hub: what migration 0420
 * will do to a hub database's connections (`connections.sealed`, what each
 * held: its plain facts and its secrets sealed together) and fleet MCP
 * sign-ins under way (`fleet_mcp_oauth.pending`), live and in the trash,
 * read before it runs. Opens the database read-only (a copy of a live
 * hub's, or a fixture unpacked) and counts each column's values as placed
 * (it opens with the hub's key and reads whole: its facts become columns,
 * each secret sealed alone), never set (null: nothing held, no sign-in
 * under way) and restrictive (it does not open with the hub's key, or opens
 * to something that does not read whole: nothing placed, a connection read
 * as not signed in, a sign-in that matches no redirect), and names each
 * restrictive row by its id and why. Read with the migration's own reading
 * (db/sealed-facts-unread.ts `sealedFactsKept`). Nothing secret is printed,
 * plain or sealed.
 *
 * Sealed values open with the hub's key, read as migrations:check `--db`
 * reads it: `secrets.key` beside the database, copied into a scratch
 * folder this removes, never written beside the database; no other place
 * is looked in. With no key there it opens nothing and makes no key: it
 * says how many rows of each column hold a value and that each sealed one
 * would be kept sealed as stored, as the migration keeps it on a hub
 * without its key.
 */
import { Database } from "bun:sqlite";
import { databaseNamed, keyBeside } from "./key-beside";

const path = databaseNamed("sealed-facts");
const { keyed, remove } = keyBeside(path);
try {
  const { hubSecrets } = await import("../src/secret-box");
  const { sealedFactsKept } = await import("../src/db/sealed-facts-unread");
  const client = new Database(path, { readonly: true });
  // Both columns 0420 drops still there: it has not run.
  const before =
    client
      .query<{ there: number }, []>(
        "SELECT (SELECT count(*) FROM pragma_table_info('connections') WHERE name = 'sealed') + (SELECT count(*) FROM pragma_table_info('fleet_mcp_oauth') WHERE name = 'pending') AS there"
      )
      .get()?.there === 2;
  if (before && !keyed) {
    // No key is made or looked for anywhere else: a sealed value opens with
    // none (`opening`), as on a hub whose key file is missing.
    const opening = (): never => {
      throw new Error(`no secrets.key beside ${path}`);
    };
    const facts = sealedFactsKept(client, opening, "migration");
    for (const [column, kept, as] of [
      ["connections.sealed", facts.connections, "sealed_unread"],
      ["fleet_mcp_oauth.pending", facts.pending, "pending_unread"],
    ] as const) {
      const held = kept.filter((one) => one.raw !== null);
      const sealed = held.filter(
        (one) => typeof one.raw === "string" && one.raw.startsWith("v1:")
      );
      const plain = held.filter((one) => !sealed.includes(one));
      console.log(
        `${column}: ${held.length} row(s) hold a value (${held.filter((one) => one.trash === undefined).length} live, ${held.filter((one) => one.trash !== undefined).length} in the trash); with no secrets.key beside ${path}, each of the ${sealed.length} sealed would be kept sealed as stored in ${as}, nothing placed${plain.length > 0 ? `; ${plain.length} kept as plain text from before sealing read as they are: ${plain.filter((one) => one.reading.kind === "placed").length} placed` : ""}`
      );
    }
  } else if (before) {
    const facts = sealedFactsKept(client, hubSecrets, "migration");
    for (const [column, kept, restrictive] of [
      [
        "connections.sealed",
        facts.connections,
        "nothing placed, read as not signed in",
      ],
      [
        "fleet_mcp_oauth.pending",
        facts.pending,
        "nothing placed, matching no redirect",
      ],
    ] as const) {
      const count = (kind: string, trash: boolean) =>
        kept.filter(
          (one) =>
            one.reading.kind === kind && (one.trash !== undefined) === trash
        ).length;
      for (const trash of [false, true]) {
        const of = kept.filter((one) => (one.trash !== undefined) === trash);
        console.log(
          `${column}${trash ? " in the trash" : ""}: ${of.length} read, ${count("placed", trash)} placed, ${count("unset", trash)} never set, ${count("restrictive", trash)} restrictive (${restrictive})`
        );
      }
      for (const one of kept) {
        if (one.reading.kind === "restrictive") {
          console.log(
            `  restrictive: ${one.id}${one.trash === undefined ? "" : ` (trash entry ${one.trash})`}: ${one.reading.why}`
          );
        }
      }
    }
  } else {
    console.log(
      `connections.sealed, fleet_mcp_oauth.pending: 0420 has run on ${path}; read a copy taken before it`
    );
  }
  client.close();
} finally {
  remove();
}
