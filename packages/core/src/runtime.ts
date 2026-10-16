/** Server-only runtime layout. Never import through the browser-facing core barrel. */
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atMost } from "./at-most";
import { binaryAssets } from "./binary-assets";
import { writeStateFile } from "./state-file";

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

/**
 * The embedded trees a process reads from disk ({@link runtimeTree}), by their
 * first path segment. The rest of what the build embeds is read through
 * {@link embeddedFile} and never published.
 */
const RUNTIME_TREES = new Set([
  "dashboard",
  "drizzle",
  "pi",
  "skills",
  "srt",
  "workflow",
]);

/**
 * How many files {@link publishRuntime} writes at once. Each write is flushed
 * before its rename (state-file.ts), and flushes issued one after another
 * each wait for their own journal commit: on a loaded machine the dashboard's
 * 2651 client files took 21 to 33 s to publish that way, past the updater's
 * 30 s verify, which rolled the release back (stage 2 of f2d2554e6). Issued
 * together the disk commits them in shared batches: 3700 files in 0.83 s at
 * load 83, against 19 s one at a time.
 */
const PUBLISH_CONCURRENCY = 64;

/** Written once every runtime file is published and flushed; while it is there nothing is checked again. */
const PUBLISHED_MARKER = ".published";

/**
 * A child process cannot open $bunfs, so every standalone process publishes
 * this build's runtime trees before anything reads one (scripts/binary
 * entry.ts): each missing file written whole and flushed (state-file.ts), all
 * at once, then the marker. A file already published is left alone without
 * touching its folder: inside a workspace the runtime folder is read-only,
 * and even a recursive mkdir of a folder that exists fails there with EEXIST
 * (`cawco tools` in a workspace). Processes that start together each write
 * what they find missing; a rename lands the same bytes whichever wins.
 */
export async function publishRuntime(): Promise<void> {
  const base = runtimeDataDir();
  if (existsSync(join(base, PUBLISHED_MARKER))) {
    return;
  }
  const missing = Object.entries(binaryAssets).filter(
    ([name]) =>
      RUNTIME_TREES.has(name.split("/")[0]) && !existsSync(join(base, name))
  );
  if (!missing.length) {
    return;
  }
  for (const dir of new Set(
    missing.map(([name]) => dirname(join(base, name)))
  )) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const limit = atMost(PUBLISH_CONCURRENCY);
  await Promise.all(
    missing.map(([name, source]) =>
      limit(async () =>
        writeStateFile(join(base, name), await Bun.file(source).bytes(), {
          mode: 0o600,
          inPlace: true,
        })
      )
    )
  );
  await writeStateFile(join(base, PUBLISHED_MARKER), runtimeVersion, {
    mode: 0o600,
  });
}

/** Where an embedded tree {@link publishRuntime} published sits on disk. */
export function runtimeTree(prefix: string): string {
  if (!RUNTIME_TREES.has(prefix.split("/")[0])) {
    throw new Error(`This CawCo build publishes no runtime tree: ${prefix}`);
  }
  if (
    !Object.keys(binaryAssets).some((name) => name.startsWith(`${prefix}/`))
  ) {
    throw new Error(`This CawCo build has no embedded tree: ${prefix}`);
  }
  return join(runtimeDataDir(), prefix);
}

export function runtimeExecutable(name: string): string {
  const root = runtimeTree(dirname(name));
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
