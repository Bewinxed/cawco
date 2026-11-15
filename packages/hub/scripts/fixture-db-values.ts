/**
 * Values the fixtures are seeded with (fixture-db.ts) that the migration
 * check (migrations-check.ts) looks for again: the credential-shaped tokens
 * a parked ask's call input carries, which migration 0434 seals. Each is
 * made here and holds no real credential. A leaf: fixture-db.ts runs as it
 * is imported, this does not.
 */
export const PARKED_TOKEN = `ghp_${"Fx7".repeat(12)}`;
export const PARKED_KEY = `sk-${"fixtureKey9".repeat(3)}`;
/** The tokens a transcript line quotes (fixture-db.ts `seedReadBack`), read back through the transcript route cut. */
export const READ_BACK_TOKEN = `ghp_${"Rb5".repeat(12)}`;
export const READ_BACK_KEY = `sk-${"readBackKey7".repeat(3)}`;
/** The id of that line. */
export const READ_BACK_LINE = "watch-read-back";
