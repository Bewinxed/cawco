/** Server-only runtime layout. Never import through the browser-facing core barrel. */
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atMost } from "./at-most";
import { binaryAssets, publishedHashes } from "./binary-assets";
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
 * carries them. Epoch 3: the fleet's config travels as acknowledged deltas
 * (core fleet.ts `FLEET_DELTA`), the register's answer carrying the policy
 * and the machine online only once it has written it (READY); an epoch-2
 * agent knows no delta. Epoch 4: CawCo has no multi-step run engine, so a
 * hub answers no run step's or run's route and a session row names no run
 * nor step; an epoch-3 agent's OpenCode plugin still offers the step tools
 * that called them. A hub sends a launch only to an agent whose range
 * holds its own, and a joined machine installs only a build whose range
 * overlaps its hub's.
 */
export const protocolRange = { min: 4, max: 4 } as const;
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
  "photon-node",
  "pi",
  "playwright-core",
  "skills",
  "srt",
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

/** Whether the embedded file `name` is published to disk: its first segment is a runtime tree. */
export const publishedFile = (name: string): boolean =>
  RUNTIME_TREES.has(name.split("/")[0]);

/**
 * Written once every runtime file is published and flushed: this build's
 * manifest, each published file's content hash and name on a line of its
 * own (`publishedHashes`, hashed by the builder), under a first line that
 * hashes the rest. While that first line is this build's nothing is checked
 * again; a build of another set finds each file whose hash differs from the
 * marker's line for it, or that is missing, and writes it. Nothing a start
 * does reads a published file's contents.
 */
const PUBLISHED_MARKER = ".published";

/** The marker's lines below its first, by name: `<hash>\t<name>`. */
const manifestBody = (hashes: [string, string][]): string =>
  hashes.map(([name, hash]) => `${hash}\t${name}`).join("\n");

/** The manifest a marker holds, by name, or nothing when it is missing or not one. */
const markerManifest = (text: string): Map<string, string> | undefined => {
  const files = new Map<string, string>();
  for (const line of text.split("\n").slice(1)) {
    const tab = line.indexOf("\t");
    if (tab < 1) {
      return;
    }
    files.set(line.slice(tab + 1), line.slice(0, tab));
  }
  return files;
};

/** A runtime folder that refuses writes: a workspace's, which only the machine's processes publish. */
const readOnly = (error: unknown): boolean => {
  const { code } = error as NodeJS.ErrnoException;
  return code === "EROFS" || code === "EACCES";
};

/**
 * A child process cannot open $bunfs, so every standalone process publishes
 * this build's runtime trees before anything reads one (scripts/binary
 * entry.ts): each file whose hash is not the marker's, or that is missing,
 * written whole and flushed (state-file.ts), all at once, then the marker. A
 * file already published is left alone without touching its folder: inside
 * a workspace the runtime folder is read-only, and even a recursive mkdir of
 * a folder that exists fails there with EEXIST (`cawco tools` in a
 * workspace). With nothing to write, a marker of another build is still
 * replaced where the folder takes it, so a complete tree is checked once.
 * Processes that start together each write what they find; a rename lands
 * the same bytes whichever wins.
 */
export async function publishRuntime(): Promise<void> {
  const base = runtimeDataDir();
  const hashes = Object.entries(publishedHashes).sort(([a], [b]) =>
    a < b ? -1 : Number(a > b)
  );
  if (!hashes.length) {
    return;
  }
  const body = manifestBody(hashes);
  const set = Bun.hash(body).toString(36);
  const marker = join(base, PUBLISHED_MARKER);
  const kept = existsSync(marker) ? readFileSync(marker, "utf8") : "";
  if (kept.split("\n", 1)[0] === set) {
    return;
  }
  const onDisk = markerManifest(kept);
  const stale = hashes.filter(
    ([name, hash]) =>
      onDisk?.get(name) !== hash || !existsSync(join(base, name))
  );
  const content = `${set}\n${body}`;
  if (!stale.length) {
    try {
      await writeStateFile(marker, content, { mode: 0o600, inPlace: true });
    } catch (error) {
      if (!readOnly(error)) {
        throw error;
      }
    }
    return;
  }
  for (const dir of new Set(stale.map(([name]) => dirname(join(base, name))))) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const limit = atMost(PUBLISH_CONCURRENCY);
  await Promise.all(
    stale.map(([name]) =>
      limit(async () =>
        writeStateFile(
          join(base, name),
          await Bun.file(embeddedFile(name)).bytes(),
          { mode: 0o600, inPlace: true }
        )
      )
    )
  );
  await writeStateFile(marker, content, { mode: 0o600, inPlace: true });
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
