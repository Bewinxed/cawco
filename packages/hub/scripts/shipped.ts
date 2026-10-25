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
/**
 * TestFlight builds the hub no longer serves, `<platform> <build>`, though
 * still inside their 90 days: no hub built from here is held to what they
 * read. Each is expired on TestFlight once the app that reads the new wire
 * ships (`testflight.sh --expire <build>`, the app's owed list).
 *
 * - ios 20261015, 20261015.3, 20261017: they read a session row's run and
 *   step and a transcript block's run event, which the hub stopped sending
 *   when the multi-step run engine went (the owner's "The delegation tree
 *   is the run"); until updated they show no runs.
 *
 * The newest TestFlight build is never listed here: it is the app on the
 * owner's phone, and the hub serves it until a newer one ships.
 */
const UNSERVED_TESTFLIGHT = new Set([
  "ios 20261015",
  "ios 20261015.3",
  "ios 20261017",
]);
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

/**
 * Git run against the repository itself (`--git-common-dir`), not the
 * checkout `cwd` names: a linked worktree shares its clone's remotes and
 * objects, and a CawCo workspace's git door serves origin to the clone's own
 * git dir alone, so from a worktree's dir origin is refused.
 */
const repoDirs = new Map<string, string>();
const git = (cwd: string, args: string[]) => {
  let repo = repoDirs.get(cwd);
  if (!repo) {
    const found = Bun.spawnSync(
      ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, stderr: "pipe" }
    );
    if (found.exitCode !== 0) {
      throw new Error(
        `${cwd} is not in a git repository: ${found.stderr.toString().trim()}`
      );
    }
    repo = found.stdout.toString().trim();
    repoDirs.set(cwd, repo);
  }
  return Bun.spawnSync(["git", `--git-dir=${repo}`, ...args], {
    cwd,
    stderr: "pipe",
  });
};

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

/**
 * Every published nightly on origin, newest first: the builds machines run.
 * Each one's agent meets a hub built now until it updates, and it updates
 * through routes that hub must still answer.
 */
export const publishedNightlies = (cwd: string): Baseline[] => {
  const nightlies = tags(cwd, "nightly-")
    .map(([tag, commit]) => ({ commit, count: Number(NIGHTLY.exec(tag)?.[1]) }))
    .filter(({ count }) => Number.isFinite(count))
    .sort((a, b) => b.count - a.count);
  if (!nightlies.length) {
    throw new Error(
      "origin has no nightly-* tag, so the newest published nightly is unknown"
    );
  }
  return nightlies.map(({ commit, count }) => ({
    label: `nightly ${count}`,
    commit,
  }));
};

/** The newest published nightly: the highest build count among origin's tags. */
export const newestNightly = (cwd: string): Baseline =>
  publishedNightlies(cwd)[0] as Baseline;

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
    if (UNSERVED_TESTFLIGHT.has(`${platform} ${build}`)) {
      return [];
    }
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
