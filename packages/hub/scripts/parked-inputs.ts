/**
 * `bun run parked-inputs <database>` in packages/hub: what migration 0434's
 * step will do to a hub database's parked asks (`parked_asks`), read before
 * it runs. Opens the database read-only (a copy of a live hub's, or a
 * fixture unpacked) and counts the rows whose call input it will seal
 * (db/parked-inputs.ts `parkedInputsToSeal`, the step's own reading): those
 * whose envelope reads as an ask, each envelope kept as every screen reads
 * it, and those that do not, each envelope kept without its input (an
 * Approve of it withdraws it). Needs no key: counting opens nothing, and
 * nothing secret is printed, plain or sealed.
 */
import { Database } from "bun:sqlite";
import { ParkedAskShape } from "@cawco/core/stored-shapes";
import { parkedInputsToSeal } from "../src/db/parked-inputs";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "parked-inputs: name the database: bun run parked-inputs <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const rows = parkedInputsToSeal(client);
client.close();
const reads = rows.filter(({ envelope }) => {
  try {
    return ParkedAskShape.safeParse(JSON.parse(envelope)).success;
  } catch {
    return false;
  }
}).length;
console.log(
  `parked_asks: ${rows.length} row(s) to seal: ${reads} read as an ask (input sealed, envelope kept as every screen reads it), ${rows.length - reads} do not (input sealed as stored, envelope kept without it; an Approve withdraws it)`
);
