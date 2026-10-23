/**
 * `bun run signal:check`: every signal CawCo sends goes through core's
 * signalling module (packages/core/src/signal.ts, which sends through
 * signal-wall.ts, imported alone by a process that must not load core's
 * index: the srt host), the wall that refuses any
 * pid that is not an integer above 1 before anything is sent. On 2026-10-18 a
 * probe spec's own `process.kill(… ?? -1, "SIGKILL")` ended every process of
 * the owner's user, and the hub was down for over four hours.
 *
 * So anywhere else in the repository's code, each of these fails the check
 * with its file and line:
 * - a direct `process.kill(`;
 * - a group kill, `.kill(-…`, on any receiver;
 * - a spawn of the `kill`, `pkill` or `killall` binary (`["kill", …]`, a
 *   Bun shell `` $`kill …` ``);
 * - a cast to the module's `Pid` brand (`as Pid`, `<Pid>value`, `is Pid`):
 *   a Pid is made by the module's own makers, from a real source, alone.
 *
 * Shell text a script writes (a runner, a wrapper) is read by hand: no
 * pattern here can tell its `kill` from a word.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** The wall itself (its sending half, which signal.ts re-exports), and this check, which names what it looks for. */
const OWN = new Set([
  "packages/core/src/signal-wall.ts",
  "scripts/signal-check.ts",
]);

/** Files that may make a Pid of a value the wall must refuse: the probe that proves it does. */
const FORGES = new Set(["scripts/probe-kit/signal-wall-child.ts"]);

/**
 * Files that still signal on their own, each with why. A file here with no
 * raw call left fails the check too, so the list holds only what is still
 * true.
 */
const KNOWN = new Map<string, string>([
  [
    "packages/agent/src/harnesses/opencode-plugin.ts",
    "the plugin's text runs inside OpenCode's own process, which cannot load core: its one group kill keeps the wall's rule by hand (a pid its spawn made, an integer above 1)",
  ],
]);

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/;

/** What sends a signal itself, by name. */
const RAW: [string, RegExp][] = [
  ["process.kill", /(?<![\w$.])process\.kill\s*\(/],
  ["a group kill", /\.kill\s*\(\s*-/],
  [
    "a spawn of kill",
    /\[\s*["'`](?:\/(?:usr\/)?bin\/)?(?:kill|pkill|killall)["'`]|\$`\s*(?:kill|pkill|killall)\b/,
  ],
];
const FORGED = /\bas\s+Pid\b|(?<![\w$])<Pid>|\bis\s+Pid\b/;

const listed = Bun.spawnSync(
  ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
);
if (listed.exitCode !== 0) {
  console.error(
    `signal:check could not list the repository's files: ${listed.stderr.toString().trim()}`
  );
  process.exit(1);
}
const files = listed.stdout
  .toString()
  .split("\0")
  .filter((file) => CODE.test(file) && !OWN.has(file));

const hits: string[] = [];
const known = new Map<string, number>();
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(join(ROOT, file), "utf8");
  } catch {
    // Listed, and deleted in the working tree since.
    continue;
  }
  for (const [index, line] of text.split("\n").entries()) {
    const at = `${file}:${index + 1}: ${line.trim()}`;
    const raw = RAW.find(([, pattern]) => pattern.test(line));
    if (raw && KNOWN.has(file)) {
      known.set(file, (known.get(file) ?? 0) + 1);
    } else if (raw) {
      hits.push(`${raw[0]}: ${at}`);
    }
    if (FORGED.test(line) && !FORGES.has(file)) {
      hits.push(`a cast to Pid: ${at}`);
    }
  }
}
const stale = [...KNOWN.keys()].filter((file) => !known.has(file));

if (hits.length > 0 || stale.length > 0) {
  const parts = [
    ...(hits.length > 0
      ? [
          `Every signal goes through core's signalling module (packages/core/src/signal.ts, or signal-wall.ts where core's index cannot load); these send one another way:\n${hits.join("\n")}`,
        ]
      : []),
    ...(stale.length > 0
      ? [
          `Listed as still signalling on their own, with no raw call left; take them off scripts/signal-check.ts's list:\n${stale.join("\n")}`,
        ]
      : []),
  ];
  console.error(parts.join("\n\n"));
  process.exit(1);
}
console.log(
  `signals: ${files.length} files, every signal through core's signalling module but ${[...known].map(([file, n]) => `${file} (${n}, ${KNOWN.get(file)})`).join("; ")}`
);
