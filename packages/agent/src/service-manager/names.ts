/**
 * What CawCo's services are called and where their definitions live under
 * the machine's service manager: a systemd user unit `cawco-<name>.service`
 * (and its sockets, `cawco-<base>.socket`) in the user's systemd folder, or a
 * launchd job `dev.cawco.<name>` from a plist in `~/Library/LaunchAgents`.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * systemd wants a name, launchd wants a reverse-DNS label; they are one
 * service, by its name: its id, or for a build's session keeper
 * `sessiond-<version>` (core keepers.ts `keeperService`).
 */
export const unitName = (name: string): string => `cawco-${name}.service`;

export const label = (name: string): string => `dev.cawco.${name}`;

/** The user's systemd unit folder, as the environment names it now. */
export const systemdDir = (): string =>
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "systemd",
    "user"
  );

/** The user's LaunchAgents folder, where a job's plist loads at login from. */
export const launchAgentsDir = (): string =>
  join(homedir(), "Library", "LaunchAgents");

/** The user's systemd unit folder as this process started with it: where an install writes. */
const SYSTEMD_DIR = systemdDir();

export const systemdPath = (name: string): string =>
  join(SYSTEMD_DIR, unitName(name));

/** A listening socket systemd holds for a socket-activated service, by its base name (`SocketSpec.unit`). */
export const socketName = (base: string): string => `cawco-${base}.socket`;

export const socketPath = (base: string): string =>
  join(SYSTEMD_DIR, socketName(base));

export const launchAgentPath = (name: string): string =>
  join(launchAgentsDir(), `${label(name)}.plist`);

/** A keeper's unit and its launchd label, and the service name each carries (core keepers.ts `keeperService`). */
export const KEEPER_UNIT = /^cawco-(sessiond(?:-.+)?)\.service$/u;
export const KEEPER_PLIST = /^dev\.cawco\.(sessiond(?:-.+)?)\.plist$/u;
export const KEEPER_LABEL = /^dev\.cawco\.(sessiond(?:-.+)?)$/u;

/** Every update helper's launchd label and plist name start so: `dev.cawco.binary-apply.<ms>`. */
export const HELPER_LABEL_PREFIX = label("binary-apply.");

/** An update helper's transient systemd unit: `cawco-binary-apply-<ms>`. */
export const helperUnit = (stamp: number): string =>
  `cawco-binary-apply-${stamp}`;

export const guiDomain = (): string => `gui/${process.getuid?.() ?? 0}`;
