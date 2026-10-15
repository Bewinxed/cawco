/**
 * What is in people's hands, as the release records say: git tags on origin.
 * A published nightly is `nightly-<count>-<commit>` (publish-release.ts
 * creates it at the build's commit); a TestFlight build is
 * `testflight-<ios|mac>-<build>` (testflight.sh tags its commit before the
 * upload). They are read from origin itself, never from this clone's tags: a
 * clone cut without `--tags`, or fetched before a build was recorded, would
 * otherwise check against less than what ships, and say nothing. A tagged
 * commit this clone lacks is fetched by its id.
 */

/**
 * How long a TestFlight build stays installable: "Your build becomes
 * unavailable for testers after 90 days"
 * (https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
 * One expired early by hand is still counted, the safe side.
 */
const TESTFLIGHT_DAYS = 90;
const DAY_MS = 86_400_000;
const NIGHTLY = /^nightly-(\d+)-[0-9a-f]+$/;
/** A build number is its upload day, `yyyymmdd`, then `.2`, `.3` (testflight.py `next_number`). */
const TESTFLIGHT = /^testflight-(ios|mac)-((\d{4})(\d{2})(\d{2})(?:\.\d+)?)$/;

export interface Baseline {
  /**
   * A TestFlight build: an app, which cannot reload, so no WIRE_PROTOCOL
   * bump takes it to a new wire (the hub sends a client on an older wire the
   * board's snapshot only). The command that ends its record once the hub no
   * longer serves it.
   */
  app?: { expire: string };
  commit: string;
  label: string;
}

const git = (cwd: string, args: string[]) =>
  Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });

/** Origin's release tags, by name, each the commit it names; read once a process. */
let read: Map<string, string> | undefined;
const originTags = (cwd: string): Map<string, string> => {
  if (read) {
    return read;
  }
  const listed = git(cwd, [
    "ls-remote",
    "--tags",
    "origin",
    "refs/tags/nightly-*",
    "refs/tags/testflight-*",
  ]);
  if (listed.exitCode !== 0) {
    throw new Error(
      `origin can't be reached, so what is shipped is unknown and nothing is checked against it: git ls-remote --tags origin: ${listed.stderr.toString().trim()}`
    );
  }
  const byName = new Map<string, string>();
  for (const line of listed.stdout.toString().split("\n").filter(Boolean)) {
    const [sha, ref] = line.split("\t") as [string, string];
    const name = ref.slice("refs/tags/".length);
    // An annotated tag's `^{}` line is the commit it names; it wins over the tag object.
    if (name.endsWith("^{}")) {
      byName.set(name.slice(0, -3), sha);
    } else if (!byName.has(name)) {
      byName.set(name, sha);
    }
  }
  const missing = [...new Set(byName.values())].filter(
    (sha) => git(cwd, ["cat-file", "-e", `${sha}^{commit}`]).exitCode !== 0
  );
  if (missing.length) {
    const fetched = git(cwd, [
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      ...missing,
    ]);
    if (fetched.exitCode !== 0) {
      throw new Error(
        `origin's shipped commits ${missing.join(", ")} could not be fetched: ${fetched.stderr.toString().trim()}`
      );
    }
  }
  read = byName;
  return byName;
};
const tags = (cwd: string, prefix: string): [string, string][] =>
  [...originTags(cwd)].filter(([name]) => name.startsWith(prefix));

/** The newest published nightly: the highest build count among origin's tags. */
export const newestNightly = (cwd: string): Baseline => {
  let newest: { commit: string; count: number } | undefined;
  for (const [tag, commit] of tags(cwd, "nightly-")) {
    const count = Number(NIGHTLY.exec(tag)?.[1]);
    if (count > (newest?.count ?? -1)) {
      newest = { commit, count };
    }
  }
  if (!newest) {
    throw new Error(
      "origin has no nightly-* tag, so the newest published nightly is unknown"
    );
  }
  return { label: `nightly ${newest.count}`, commit: newest.commit };
};

/** Every TestFlight build uploaded in the last 90 days, by platform and build number. */
export const installableTestFlight = (
  cwd: string,
  now = Date.now()
): Baseline[] =>
  tags(cwd, "testflight-").flatMap(([tag, commit]) => {
    const match = TESTFLIGHT.exec(tag);
    if (!match) {
      return [];
    }
    const [, platform, build, year, month, day] = match;
    const uploaded = Date.UTC(Number(year), Number(month) - 1, Number(day));
    const train = platform === "mac" ? " --mac" : "";
    return now - uploaded <= (TESTFLIGHT_DAYS + 1) * DAY_MS
      ? [
          {
            label: `TestFlight ${platform} ${build}`,
            commit,
            app: {
              expire: `bash apps/apple/scripts/testflight.sh${train} --expire ${build}`,
            },
          },
        ]
      : [];
  });

/** Everything a hub built now must still be read by. */
export const shippedBaselines = (cwd: string): Baseline[] => [
  newestNightly(cwd),
  ...installableTestFlight(cwd),
];

// `bun shipped.ts`: the baselines, one `<commit-ish>\t<label>` per line (release.ts reads them).
if (import.meta.main) {
  for (const base of shippedBaselines(process.cwd())) {
    console.log(`${base.commit}\t${base.label}`);
  }
}
