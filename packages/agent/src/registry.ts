/**
 * Updating from the registry, which is how a machine that is not the author's
 * gets new code.
 *
 * The deployment clone this replaces tracked a git branch: a machine pulled
 * whatever had landed on `main` and built it locally. That is a reasonable way
 * for one person to run their own fleet and an unreasonable thing to hand to
 * users. It means every commit is a release, there is no version to name, no
 * way to say "stay on the previous one", and every machine needs git and a
 * full toolchain to produce a binary the author already built.
 *
 * A published version is a fact instead of a moving reference. It can be
 * pinned, compared across a fleet, and rolled back to. The bytes are built
 * once, by the release that made them, rather than once per machine.
 *
 * What this module does NOT do is decide when. It reports what is installed
 * and what is available; acting on the difference is the operator's, through
 * `cawco update` or the fleet control that calls it.
 */
import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UpdateReport } from "@cawco/core";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import {
  failed,
  installDashboardUnits,
  restartStack,
  run,
  SERVICES,
} from "./update";

/**
 * What a user installs. One package, so a fleet has one version to compare.
 *
 * This name is what every machine in a fleet runs `install` against
 * unattended, so whoever controls it controls those machines. Unscoped, which
 * only holds as a safety property while the name stays ours on npm: never
 * point this at a generic word we do not own, and never let the publish lapse.
 */
export const PACKAGE_NAME = "cawco";

const TRAILING_SLASH_RE = /\/$/;

/** The registry, overridable for a private mirror or an air-gapped fleet. */
export const registryUrl = (): string =>
  readEnv(CAWCO_ENV.registry)?.replace(TRAILING_SLASH_RE, "") ||
  "https://registry.npmjs.org";

/** Long enough for a slow mirror, short enough not to wedge a poll. */
const REGISTRY_TIMEOUT_MS = 10_000;
/** An install fetches a package and its tree; it is allowed to take a while. */
const INSTALL_TIMEOUT_MS = 300_000;

export interface VersionCheck {
  /** Whether the two differ — never a guess: `null` latest means unknown. */
  behind: boolean;
  /** What this machine is running. */
  installed: string;
  /** What the registry offers, or `null` when it could not be reached. */
  latest: string | null;
  /** Why `latest` is null, when it is. */
  reason?: string;
}

/**
 * Compares two versions the way a release train moves: newest wins, and
 * anything unparseable loses to anything parseable rather than throwing. A
 * machine must never fail to report its state because a version string was
 * shaped oddly.
 */
export const isNewer = (candidate: string, current: string): boolean => {
  try {
    Bun.semver.order(candidate, candidate);
  } catch {
    return false;
  }
  try {
    return Bun.semver.order(candidate, current) > 0;
  } catch {
    return true;
  }
};

/** What the registry says the newest published version is. */
export const latestVersion = async (): Promise<{
  version: string | null;
  reason?: string;
}> => {
  const url = `${registryUrl()}/${PACKAGE_NAME}/latest`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return { version: null, reason: `${url} answered ${response.status}` };
    }
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string"
      ? { version: body.version }
      : { version: null, reason: `${url} returned no version` };
  } catch (error) {
    return {
      version: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Where this machine stands. Answerable while offline — an unreachable
 * registry reports itself as unreachable rather than as "up to date", because
 * a fleet view that cannot tell those apart is the thing that let a stuck
 * deployment sit unnoticed for a day.
 */
export const checkVersion = async (
  installed: string
): Promise<VersionCheck> => {
  const { version, reason } = await latestVersion();
  if (!version) {
    return {
      installed,
      latest: null,
      behind: false,
      ...(reason ? { reason } : {}),
    };
  }
  return { installed, latest: version, behind: isNewer(version, installed) };
};

/**
 * Install a version and bring the services onto it.
 *
 * Global, because the services are launched by systemd units that name a
 * binary rather than a checkout — the same reason this is an install and not
 * a build. `bun add -g` rather than npm: it is the runtime the units already
 * use, and asking a machine to have a second package manager to update the
 * first is how an update path acquires its own dependencies.
 */
export const registryUpdate = async ({
  installed,
  to,
  restartAgent = true,
  force = false,
  busy = 0,
}: {
  installed: string;
  /** A version, or `latest`. */
  to?: string;
  restartAgent?: boolean;
  force?: boolean;
  busy?: number;
}): Promise<UpdateReport> => {
  const target = to ?? "latest";
  const spec = `${PACKAGE_NAME}@${target}`;

  const install = await run(
    [process.execPath, "add", "-g", spec],
    INSTALL_TIMEOUT_MS
  );
  if (!install.ok) {
    throw failed(`installing ${spec}`, install);
  }

  const after = await latestVersion();
  const report: UpdateReport = {
    from: installed,
    to: target === "latest" ? (after.version ?? target) : target,
    pulled: `installed ${spec}`,
    installed: true,
    // Nothing is built on the machine any more: the release built it once.
    built: false,
    restarted: [],
    // A release replaces every service's code at once.
    changed: SERVICES,
  };

  // The release just installed is what writes the units, as a pull's checkout
  // does in `updateCheckout`: bun links its `bin` into the global bin
  // directory, and the link leads to the package's own `cli.js`.
  const bin = await run(
    [process.execPath, "pm", "bin", "-g"],
    REGISTRY_TIMEOUT_MS
  );
  if (!bin.ok) {
    throw failed("finding bun's global bin directory", bin);
  }
  const cli = await realpath(join(bin.said, PACKAGE_NAME));
  await installDashboardUnits(report.changed, cli, dirname(cli));

  return restartStack(report, { restartAgent, force, busy }, [
    "the dashboard ships built, so nothing was compiled here",
  ]);
};
