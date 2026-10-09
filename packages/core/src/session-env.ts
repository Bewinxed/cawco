/**
 * What of a CawCo process's environment reaches a process that is not
 * CawCo's own: a session (its CLI or server, and every shell its tools open)
 * or a host tool CawCo runs (git, `pi --version`, an MCP server).
 *
 * `PI_PACKAGE_DIR` is the package dir of CawCo's embedded pi, set by the
 * binary's entry for its own module graph (scripts/binary/entry.ts), which
 * reads it on every call (pi's config.js `getPackageDir`). A machine's own
 * `pi`, or a session's, has its own package dir: it never gets CawCo's.
 *
 * A session gets only the `CAWCO_*` variables its own tools read
 * ({@link SESSION_CAWCO_ENV}). The rest are CawCo's wiring (the keeper's
 * socket, the machine id, the gateway's port, a server's launch flags) and
 * stay out, so a rig started from a session's shell names its own keeper and
 * hub rather than inheriting the live ones.
 */
import { CAWCO_ENV } from "./index";

/** CawCo's embedded pi's package dir: CawCo's own module graph's, never another process's. */
const EMBEDDED_PI_DIR = "PI_PACKAGE_DIR";

/**
 * The `CAWCO_*` a session's own tools read, each by its reader:
 * - `CAWCO_INSTANCE_ID`, `CAWCO_SESSION_CREDENTIAL`: `cawco tool` acts as the
 *   session named, with its credential (cli/src/tools.ts `sessionOf`,
 *   `credentialHeader`).
 * - `CAWCO_HUB_URL`: `cawco tool` finds its hub by it first (cli/src/discover.ts
 *   `discoverHub`: `const explicit = hub ?? readEnv(CAWCO_ENV.hubUrl)`).
 * - `CAWCO_MODEL`: the Claude `SessionStart` hook prints the session's model
 *   guidance by it (agent/src/fleet.ts, `model="${CAWCO_MODEL:-}"`).
 */
export const SESSION_CAWCO_ENV: readonly string[] = [
  CAWCO_ENV.instanceId,
  CAWCO_ENV.sessionCredential,
  CAWCO_ENV.hubUrl,
  "CAWCO_MODEL",
];

const defined = (
  env: Readonly<Record<string, string | undefined>>,
  keep: (name: string) => boolean
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && keep(entry[0])
    )
  );

/** `env` as a host tool CawCo runs gets it: without CawCo's embedded pi's package dir. */
export const hostEnvironment = (
  env: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> => defined(env, (name) => name !== EMBEDDED_PI_DIR);

/** `env` as a session gets it: the host's, with only the `CAWCO_*` its tools read. */
export const sessionEnvironment = (
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> =>
  defined(
    env,
    (name) =>
      name !== EMBEDDED_PI_DIR &&
      (!name.startsWith("CAWCO_") || SESSION_CAWCO_ENV.includes(name))
  );
