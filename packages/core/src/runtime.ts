/** Server-only runtime layout. Never import through the browser-facing core barrel. */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { binaryAssets } from "./binary-assets";

declare const __CAWCO_VERSION__: string | undefined;
declare const __CAWCO_COMMIT__: string | undefined;
export const standalone =
  typeof Bun !== "undefined" && Bun.isStandaloneExecutable;
export const runtimeVersion =
  typeof __CAWCO_VERSION__ === "string" ? __CAWCO_VERSION__ : "0.0.0-dev";
export const runtimeCommit =
  typeof __CAWCO_COMMIT__ === "string" ? __CAWCO_COMMIT__ : undefined;
/**
 * The hub ↔ agent contract this build speaks, reported by every build at
 * register and in `/health`, and carried by a release's manifest. Epoch 2: a
 * launch asks the hub for its credential and account as it starts (the
 * `launch` verb); an epoch-1 agent reads them off the spawn, which no longer
 * carries them. A hub sends a launch only to an agent whose range holds its
 * own, and a joined machine installs only a build whose range overlaps its
 * hub's.
 */
export const protocolRange = { min: 2, max: 2 } as const;
export const runtimeDataDir = () =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "runtime",
    runtimeVersion
  );

export function embeddedFile(name: string): string {
  const path = binaryAssets[name];
  if (!path) {
    throw new Error(`This CawCo build has no embedded resource: ${name}`);
  }
  return path;
}

/** A child process cannot open $bunfs; publish immutable resources atomically. */
export function materializeTree(prefix: string): string {
  const root = join(runtimeDataDir(), prefix);
  const entries = Object.entries(binaryAssets).filter(([name]) =>
    name.startsWith(`${prefix}/`)
  );
  if (!entries.length) {
    throw new Error(`This CawCo build has no embedded tree: ${prefix}`);
  }
  for (const [name, source] of entries) {
    const path = join(runtimeDataDir(), name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (!existsSync(path)) {
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, readFileSync(source), { mode: 0o600 });
      renameSync(temp, path);
    }
  }
  return root;
}

export function materializeExecutable(name: string): string {
  const root = materializeTree(dirname(name));
  const path = join(root, name.slice(dirname(name).length + 1));
  chmodSync(path, 0o700);
  return path;
}

export function ownedCommand(
  verb: string,
  source: string
): { command: string; args: string[] } {
  return { command: process.execPath, args: standalone ? [verb] : [source] };
}
