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

const SYSTEMD_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "systemd",
  "user"
);

export const systemdPath = (name: string): string =>
  join(SYSTEMD_DIR, unitName(name));

/** A listening socket systemd holds for a socket-activated service, by its base name (`SocketSpec.unit`). */
export const socketName = (base: string): string => `cawco-${base}.socket`;

export const socketPath = (base: string): string =>
  join(SYSTEMD_DIR, socketName(base));

export const launchAgentPath = (name: string): string =>
  join(homedir(), "Library", "LaunchAgents", `${label(name)}.plist`);

export const xml = (value: string): string =>
  value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export const guiDomain = (): string => `gui/${process.getuid?.() ?? 0}`;
