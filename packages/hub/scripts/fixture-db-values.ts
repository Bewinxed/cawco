/**
 * Values the fixtures are seeded with (fixture-db.ts) that the migration
 * check (migrations-check.ts) looks for again: the credential-shaped tokens
 * a parked ask's call input carries, which migration 0434 seals. Each is
 * made here and holds no real credential. A leaf: fixture-db.ts runs as it
 * is imported, this does not.
 */
export const PARKED_TOKEN = `ghp_${"Fx7".repeat(12)}`;
export const PARKED_KEY = `sk-${"fixtureKey9".repeat(3)}`;
