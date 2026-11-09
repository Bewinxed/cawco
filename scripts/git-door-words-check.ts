/**
 * `bun scripts/git-door-words-check.ts`: the git config words every command
 * in a workspace runs with (agent hub-git.ts `gitDoorEnv`, its
 * `CAWCO_GIT_PARAMETERS`) parse in real git, as git reads
 * `GIT_CONFIG_PARAMETERS` (config.c `parse_config_env_list`, each word read
 * from its first character by quote.c `sq_dequote_step`). A value git cannot
 * parse fails every git command run with it, before any work:
 * "error: bogus format in GIT_CONFIG_PARAMETERS / fatal: unable to parse
 * command-line config". On 2026-11-04 the git-door and landing-faults probes
 * gave git such a value, a word list that began with a space.
 *
 * For a clone whose origin is across the network (its URL holding a `'` and
 * a `!`, the two characters git takes backslashed between quotes), on the
 * hub, or a local path, and with no hub known at all, the words are given to
 * `git config --list --show-scope`, alone and after srt's own as the runner
 * joins them (boundary/: `${GIT_CONFIG_PARAMETERS:+$GIT_CONFIG_PARAMETERS
 * }$CAWCO_GIT_PARAMETERS`). The laws:
 *
 * - Law A: git exits 0.
 * - Law B: git lists, in the command scope, exactly the config the case
 *   expects, in order, and srt's own before it when given.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any law broken.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HUB = "ws://hub.probe.test/ws";
const HUB_GIT = "http://hub.probe.test/git/";
const OUTSIDE = "https://forge.probe.test/o'brien/re!po.git";
/** srt's own `GIT_CONFIG_PARAMETERS`, which the runner puts first. */
const SRT = "'http.proxyAuthMethod=basic'";
/** This process's own git config, which the git it runs is given none of. */
const OWN_GIT_CONFIG = /^(?:GIT_CONFIG|CAWCO_GIT_)/u;

/** What every workspace's git is given, hub or none, as `git config --list` names it. */
const ALWAYS = [
  "url.cawco::https://.pushinsteadof=https://",
  "url.cawco::http://.pushinsteadof=http://",
  "url.cawco::ssh://.pushinsteadof=ssh://",
  "url.cawco::git+ssh://.pushinsteadof=git+ssh://",
  "url.cawco::ssh+git://.pushinsteadof=ssh+git://",
  "url.cawco::git@.pushinsteadof=git@",
  "protocol.cawco.allow=always",
  "maintenance.auto=false",
  "gc.auto=0",
];
const HUB_REWRITE = `url.cawco::${HUB_GIT}.insteadof=${HUB_GIT}`;
const LFS = [
  "filter.lfs.clean=git-lfs clean -- %f",
  "filter.lfs.smudge=git-lfs smudge -- %f",
  "filter.lfs.process=git-lfs filter-process",
  "filter.lfs.required=true",
];

const scratch = mkdtempSync(join(tmpdir(), "git-door-words-"));
// No hub as the module loads, so it reads no hub's kept git origins
// (git-credential.ts `keptOrigins`): each case names its own.
delete process.env.CAWCO_HUB_URL;
const { gitDoorEnv } = await import("../packages/agent/src/hub-git");

/** git's environment with none of this process's own git config: only `words`, if any. */
const gitEnv = (words?: string): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !OWN_GIT_CONFIG.test(entry[0])
    )
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  ...(words === undefined ? {} : { GIT_CONFIG_PARAMETERS: words }),
});

/** A clone at `scratch/<name>` whose `origin` is `url`, or none when `url` is empty. */
const cloneWith = (name: string, url: string): string => {
  const at = join(scratch, name);
  mkdirSync(at);
  const steps = [
    ["git", "init", "-q", at],
    ...(url ? [["git", "-C", at, "remote", "add", "origin", url]] : []),
  ];
  for (const argv of steps) {
    const done = Bun.spawnSync(argv, { env: gitEnv() });
    if (done.exitCode !== 0) {
      throw new Error(`${argv.join(" ")}: ${done.stderr.toString()}`);
    }
  }
  return at;
};

const cases: { expected: string[]; hub: boolean; name: string; url: string }[] =
  [
    {
      name: "no hub known",
      hub: false,
      url: OUTSIDE,
      expected: ALWAYS,
    },
    {
      name: "an origin across the network",
      hub: true,
      url: OUTSIDE,
      expected: [
        HUB_REWRITE,
        `url.cawco::${OUTSIDE}.insteadof=${OUTSIDE}`,
        ...ALWAYS,
      ],
    },
    {
      name: "an origin on the hub",
      hub: true,
      url: `${HUB_GIT}probe`,
      expected: [HUB_REWRITE, ...LFS, ...ALWAYS],
    },
    {
      name: "an origin on a local path",
      hub: true,
      url: join(scratch, "elsewhere.git"),
      expected: [HUB_REWRITE, ...ALWAYS],
    },
  ];

const broken: string[] = [];
try {
  for (const [index, one] of cases.entries()) {
    if (one.hub) {
      process.env.CAWCO_HUB_URL = HUB;
    } else {
      delete process.env.CAWCO_HUB_URL;
    }
    const clone = cloneWith(`clone-${index}`, one.url);
    const words = gitDoorEnv(`gdw${index}`, clone).CAWCO_GIT_PARAMETERS;
    for (const [given, value, expected] of [
      ["alone", words, one.expected],
      [
        "after srt's own",
        `${SRT} ${words}`,
        ["http.proxyauthmethod=basic", ...one.expected],
      ],
    ] as const) {
      const listed = Bun.spawnSync(
        ["git", "config", "--list", "--show-scope"],
        { cwd: scratch, env: gitEnv(value) }
      );
      const said =
        `${listed.stdout.toString()}${listed.stderr.toString()}`.trim();
      if (listed.exitCode !== 0) {
        broken.push(
          `Law A, ${one.name}, ${given}: git exited ${listed.exitCode} on GIT_CONFIG_PARAMETERS=${value}\n  ${said}`
        );
        continue;
      }
      const command = listed.stdout
        .toString()
        .split("\n")
        .filter((line) => line.startsWith("command\t"))
        .map((line) => line.slice("command\t".length));
      if (JSON.stringify(command) !== JSON.stringify(expected)) {
        broken.push(
          `Law B, ${one.name}, ${given}: git read\n    ${command.join("\n    ")}\n  where the case expects\n    ${expected.join("\n    ")}`
        );
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (broken.length > 0) {
  console.error(
    `git-door-words-check: ${broken.length} law(s) broken:\n${broken.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `git-door-words-check: the workspace's git config words parse in git (${cases.length} cases, each alone and after srt's own)`
);
