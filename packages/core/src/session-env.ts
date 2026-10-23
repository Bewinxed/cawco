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
 * `INVOCATION_ID` is the id systemd gives CawCo's own unit (systemd.exec(5):
 * "a randomized, unique 128-bit ID identifying each runtime cycle of the
 * unit"), and to a process that inherits it, it says "you run inside a
 * service's cgroup, and the service tracks you". Podman reads it so: started
 * with it set, it leaves conmon in its caller's cgroup instead of a
 * `libpod-conmon-<id>.scope` of its own (libpod/oci_conmon_linux.go,
 * `moveConmonToCgroupAndSignal`: "$INVOCATION_ID is set by systemd when
 * running as a service. if ctr.runtime.RemoteURI() == "" &&
 * os.Getenv("INVOCATION_ID") != "" { mustCreateCgroup = false }"). A
 * container a session's shell started then had its conmon inside
 * `cawco-sessiond-<build>.service`, and the keeper's stop, which signals
 * every process of its cgroup, reached conmon, whose SIGTERM handler passes
 * the signal on to the container (conmon ctr_exit.c `on_sig_exit`: "if
 * (container_pid > 0) { if (kill(container_pid, signal) == 0) return;"). An
 * agent update that retired a keeper stopped every container started that
 * way on obelisk, 2026-10-19 09:28:30. No process CawCo hands its
 * environment to is its unit's: none gets the id.
 *
 * A session gets only the `CAWCO_*` variables its own tools read
 * ({@link SESSION_CAWCO_ENV}). The rest are CawCo's wiring (the keeper's
 * socket, the machine id, the gateway's port, a server's launch flags) and
 * stay out, so a rig started from a session's shell names its own keeper and
 * hub rather than inheriting the live ones.
 */
import { CAWCO_ENV } from "./cawco-env";

/** CawCo's embedded pi's package dir: CawCo's own module graph's, never another process's. */
const EMBEDDED_PI_DIR = "PI_PACKAGE_DIR";

/** The id of the systemd unit CawCo runs in: CawCo's own unit's, never another process's. */
const UNIT_INVOCATION = "INVOCATION_ID";

/**
 * The `CAWCO_*` a session's own tools read, each by its reader:
 * - `CAWCO_INSTANCE_ID`, `CAWCO_SESSION_CREDENTIAL`: `cawco tool` acts as the
 *   session named, with its credential (cli/src/tools.ts `sessionOf`,
 *   `credentialHeader`).
 * - `CAWCO_HUB_URL`: `cawco tool` finds its hub by it first (cli/src/discover.ts
 *   `discoverHub`: `const explicit = hub ?? readEnv(CAWCO_ENV.hubUrl)`).
 */
export const SESSION_CAWCO_ENV: readonly string[] = [
  CAWCO_ENV.instanceId,
  CAWCO_ENV.sessionCredential,
  CAWCO_ENV.hubUrl,
];

/** `env`'s defined entries that are not CawCo's own process's and that `keep` keeps. */
const defined = (
  env: Readonly<Record<string, string | undefined>>,
  keep: (name: string) => boolean
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        entry[0] !== EMBEDDED_PI_DIR &&
        entry[0] !== UNIT_INVOCATION &&
        keep(entry[0])
    )
  );

/** `env` as a host tool CawCo runs gets it: without what is CawCo's own process's. */
export const hostEnvironment = (
  env: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> => defined(env, () => true);

/**
 * `env` as a harness server gets it (an OpenCode server, which runs many
 * sessions): the host's, with no `CAWCO_*` at all. What a session's shell or
 * MCP server needs of CawCo, the server's plugin sets for that session and
 * location itself; anything inherited would reach every session's.
 */
export const serverEnvironment = (
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> => defined(env, (name) => !name.startsWith("CAWCO_"));

/** `env` as a session gets it: the host's, with only the `CAWCO_*` its tools read. */
export const sessionEnvironment = (
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> =>
  defined(
    env,
    (name) => !name.startsWith("CAWCO_") || SESSION_CAWCO_ENV.includes(name)
  );
