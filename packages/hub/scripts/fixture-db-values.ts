/**
 * Values the fixtures are seeded with (fixture-db.ts) that the migration
 * check (migrations-check.ts) looks for again. Each is made here and holds
 * no real credential. A leaf: fixture-db.ts runs as it is imported, this
 * does not.
 *
 * - The credential-shaped tokens a parked ask's call input carries, which
 *   migration 0434 seals: one in a shell command, which its card shows as
 *   written, and one under a field named as a key, which its card hides.
 * - The known values (src/known-values.ts) a stored transcript line quotes:
 *   a session's credential, whose hash `session_identities` holds, and a
 *   fleet MCP server's `env` value under a credential's name, sealed in
 *   its config, beside one under a path's name, which is no secret.
 */
import { createHash } from "node:crypto";

export const PARKED_TOKEN = `ghp_${"Fx7".repeat(12)}`;
export const PARKED_KEY = `sk-${"fixtureKey9".repeat(3)}`;
/** A session credential's shape (32 bytes, base64url: session-identity.ts), made from a fixed phrase. */
export const KNOWN_CREDENTIAL = createHash("sha256")
  .update("cawco fixture session credential")
  .digest("base64url");
/** The `env` value of the MCP server the known values case reads, under {@link KNOWN_ENV_NAME}. */
export const KNOWN_ENV_VALUE = `relnotes_${"Kv4".repeat(10)}`;
export const KNOWN_ENV_NAME = "RELEASE_NOTES_TOKEN";
/** A path under a name that reads as no credential: it stays in every line that names it. */
export const KNOWN_PATH = "/opt/google/chrome/chrome";
/** The MCP server that holds them, and the id of the line that quotes them. */
export const KNOWN_SERVER = "release-notes";
export const KNOWN_LINE = "watch-known-values";
