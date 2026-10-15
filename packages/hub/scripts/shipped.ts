/**
 * What is in people's hands, as the release records say: git tags on the
 * repository. A published nightly is `nightly-<count>-<commit>`
 * (publish-release.ts creates it at the build's commit); a TestFlight build
 * is `testflight-<ios|mac>-<build>` (testflight.sh tags its commit before
 * the upload). A `git fetch` brings both.
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
  commit: string;
  label: string;
}

const tags = (cwd: string, pattern: string): string[] => {
  const run = Bun.spawnSync(
    ["git", "tag", "--list", pattern, "--format=%(refname:short)"],
    { cwd }
  );
  if (run.exitCode !== 0) {
    throw new Error(`git tag --list ${pattern}: ${run.stderr.toString()}`);
  }
  return run.stdout.toString().split("\n").filter(Boolean);
};

/** The newest published nightly: the highest build count among the tags. */
export const newestNightly = (cwd: string): Baseline => {
  let newest: { count: number; tag: string } | undefined;
  for (const tag of tags(cwd, "nightly-*")) {
    const count = Number(NIGHTLY.exec(tag)?.[1]);
    if (count > (newest?.count ?? -1)) {
      newest = { count, tag };
    }
  }
  if (!newest) {
    throw new Error(
      "No nightly-* tag in this repository, so the newest published nightly is unknown: run `git fetch origin --tags`"
    );
  }
  return { label: `nightly ${newest.count}`, commit: newest.tag };
};

/** Every TestFlight build uploaded in the last 90 days, by platform and build number. */
export const installableTestFlight = (
  cwd: string,
  now = Date.now()
): Baseline[] =>
  tags(cwd, "testflight-*").flatMap((tag) => {
    const match = TESTFLIGHT.exec(tag);
    if (!match) {
      return [];
    }
    const [, platform, build, year, month, day] = match;
    const uploaded = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return now - uploaded <= (TESTFLIGHT_DAYS + 1) * DAY_MS
      ? [{ label: `TestFlight ${platform} ${build}`, commit: tag }]
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
