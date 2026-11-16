/**
 * Whether this host may release: it must be the hub's own machine, whose
 * database the release migrates (steps/live-database.ts `liveHubDatabase`).
 * ship.sh asks before it starts the release's unit, so a refusal reaches
 * whoever asked (hub ship.ts) rather than the unit's journal alone. Exit 2
 * with `Release refused: <why>`, or 0 naming the database.
 */
import { liveHubDatabase } from "./steps/live-database";

const live = await liveHubDatabase();
if ("refused" in live) {
  console.error(`Release refused: ${live.refused}`);
  process.exit(2);
}
console.log(`The release checks the hub's database at ${live.path}`);
