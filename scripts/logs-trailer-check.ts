/**
 * `bun scripts/logs-trailer-check.ts`: the `Agent-Logs-Url` stamp the hub
 * puts on every commit it lands (hub landing.ts `stampedRebase`,
 * `stampCommand`) and the rebase that carries it (`landedRebase`: off the
 * working tree, then one `git reset --keep`), run with real git in a scratch
 * repository, through the same `git` shell function the hub's commands start
 * with (core safe-git.ts `SAFE_GIT_SHELL`).
 *
 * A branch of four commits, each with its own author date, (one with a `Co-Authored-By` trailer, one with
 * another session's link above one, one whose subject starts with `#`, one
 * with no body) is stamped, stamped again, rebased onto a newer upstream
 * and stamped, a second branch is stamped where it stands (`keepBase`), and
 * a third conflicts with its upstream. After each, the laws:
 *
 * - Law A: each commit carries exactly one `Agent-Logs-Url`, a link into
 *   the session.
 * - Law B: every other line of each message is kept, its other trailers
 *   among them, and each commit's tree is the one it had.
 * - Law C: a stamp of stamped commits changes nothing: HEAD stays the same
 *   commit.
 * - Law D: `keepBase` leaves the commits on the commit they started from.
 * - Law E: that link is exactly the session's, at the commit's own author
 *   date: `<url>?at=<%aI, its + as %2B>`, the moment it was made, kept
 *   through every stamp, the rebase onto a newer upstream among them.
 * - Law F: a landing whose commits keep HEAD's tree (every stamp here, the
 *   first included, which rewrites every message) writes no file of the
 *   working tree: each keeps its inode and its change time, and none comes
 *   or goes.
 * - Law G: the rebase onto a newer upstream writes only the files the old
 *   and new HEAD differ in; every other keeps its inode and change time, and
 *   the worktree ends clean.
 * - Law H: a rebase that conflicts (the same new file added on both sides,
 *   below a folder the rebase's sparse worktree leaves out) answers
 *   `conflict` naming it, and leaves HEAD, the index and every file as they
 *   were.
 * - Law I: no landing leaves its rebase's worktree behind: `git worktree
 *   list` names the repository's own alone, and the scratch dir is empty.
 * - Law J: after each landing, the report's commits (`keptCommits`, from
 *   the moment the branch's work began) are the branch's own as HEAD holds
 *   them now, stamped and rebased, and none of upstream's: upstream's
 *   commit is made outside this checkout, as another session's lands on
 *   main.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any law broken.
 */
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CommandResult } from "../packages/core/src/harness";
import { SAFE_GIT_SHELL } from "../packages/core/src/safe-git";
import {
  keptCommits,
  LOGS_TRAILER,
  landedRebase,
} from "../packages/hub/src/landing";

const URL_NOW = "https://hub.example.ts.net:3455/session/3f2a9c1e";
const URL_OLD = "http://old-host:3455/session/77aa00bb";

const dir = mkdtempSync(join(tmpdir(), "logs-trailer-"));
/** The commands' `TMPDIR`, where the rebase makes its worktree: empty again after each landing (Law I). */
const scratch = mkdtempSync(join(tmpdir(), "logs-trailer-scratch-"));
const env = {
  ...process.env,
  TMPDIR: scratch,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Session",
  GIT_AUTHOR_EMAIL: "session@example.com",
  GIT_COMMITTER_NAME: "Hub",
  GIT_COMMITTER_EMAIL: "hub@example.com",
  // Set by each `commit`.
  GIT_AUTHOR_DATE: "",
};

/** Each commit's author date, a minute apart in two zones, so each link names its own moment. */
let authored = Date.parse("2026-10-30T09:00:00Z");
const ZONES = ["+03:00", "-05:00"] as const;

/** One shell line in the scratch repository, as the hub runs it; its stdout, or a throw with git's words. */
const sh = (cmd: string): string => {
  const done = Bun.spawnSync(["sh", "-c", `${SAFE_GIT_SHELL}${cmd}`], {
    cwd: dir,
    env,
  });
  if (done.exitCode !== 0) {
    throw new Error(
      `${cmd}\nexit ${done.exitCode}: ${done.stderr.toString()}${done.stdout.toString()}`
    );
  }
  return done.stdout.toString();
};

/** One command as the hub's landing runs it (work-items.ts `runIn`): the shell function first, its result whatever it exits with. */
const run = (cmd: string): Promise<CommandResult> => {
  const done = Bun.spawnSync(["sh", "-c", `${SAFE_GIT_SHELL}${cmd}`], {
    cwd: dir,
    env,
  });
  return Promise.resolve({
    exitCode: done.exitCode,
    stdout: done.stdout.toString(),
    stderr: done.stderr.toString(),
  });
};

/** The hub's rebase of the checked-out branch onto `upstream`, as both landings run it. */
const land = (upstream: string, keepBase = false) =>
  landedRebase(run, upstream, URL_NOW, keepBase, false);

/** {@link land}, which must have rebased: HEAD where it is now. */
const landed = async (upstream: string, keepBase = false): Promise<string> => {
  const outcome = await land(upstream, keepBase);
  if (outcome.kind !== "rebased") {
    throw new Error(`the landing onto ${upstream}: ${JSON.stringify(outcome)}`);
  }
  return outcome.head;
};

/** Every file of the working tree, `.git` aside, by path: its inode and its change time, which any write moves. */
const written = (): Map<string, string> => {
  const files = new Map<string, string>();
  const walk = (at: string) => {
    for (const entry of readdirSync(join(dir, at), { withFileTypes: true })) {
      const path = at ? `${at}/${entry.name}` : entry.name;
      if (path === ".git") {
        continue;
      }
      if (entry.isDirectory()) {
        walk(path);
      } else {
        const stat = lstatSync(join(dir, path), { bigint: true });
        files.set(path, `${stat.ino}:${stat.ctimeNs}`);
      }
    }
  };
  walk("");
  return files;
};

/** Law F, G or H's look: the paths of `before` and `now` that changed, came or went, `differ` aside. */
const touched = (
  before: Map<string, string>,
  now: Map<string, string>,
  differ: ReadonlySet<string> = new Set()
): string[] =>
  [...new Set([...before.keys(), ...now.keys()])].filter(
    (path) => !differ.has(path) && before.get(path) !== now.get(path)
  );

/** Law I's look, after each landing. */
const leftNothing = (when: string): void => {
  const worktrees = sh("git worktree list --porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
  const left = readdirSync(scratch);
  law(
    `Law I (${when})`,
    worktrees.length === 1 && left.length === 0,
    `worktrees ${JSON.stringify(worktrees)}, scratch holds ${JSON.stringify(left)}`
  );
};

/** The next commit's author date, a minute on from the last. */
const nextAuthored = (): void => {
  authored += 60_000;
  env.GIT_AUTHOR_DATE = `${new Date(authored).toISOString().slice(0, 19)}${ZONES[(authored / 60_000) % 2]}`;
};

const commit = (file: string, message: string): void => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), `${file} ${message}\n`);
  nextAuthored();
  sh(
    `git add -A && printf '%s\\n' ${JSON.stringify(message)} | git commit -q --cleanup=verbatim -F -`
  );
};

/**
 * A commit on `main` made outside this checkout, as another session's lands
 * there: through an index of its own, so HEAD, its reflog and the working
 * tree never see it.
 */
const upstreamCommit = (file: string, message: string): void => {
  nextAuthored();
  sh(
    `export GIT_INDEX_FILE="$(git rev-parse --absolute-git-dir)/upstream-index" && git read-tree main && b=$(printf '%s\\n' ${JSON.stringify(`${file} ${message}`)} | git hash-object -w --stdin) && git update-index --add --cacheinfo "100644,$b,${file}" && t=$(git write-tree) && rm -f "$GIT_INDEX_FILE" && c=$(printf '%s\\n' ${JSON.stringify(message)} | git commit-tree "$t" -p main) && git update-ref refs/heads/main "$c"`
  );
};

/** When the branch's work began, in unix seconds: the report reads its commits from here (work-items.ts `changesSince`). */
const began = Math.floor(Date.now() / 1000);

/** Law J's look, after each landing: the report's commits, read as the hub reads them (its stdout, whatever it exits with), against `range`, the branch's own. */
const reportedAsOwn = async (when: string, range: string): Promise<void> => {
  const reported = (await run(keptCommits(began))).stdout
    .split("\n")
    .filter(Boolean)
    .sort();
  const own = sh(`git rev-list ${range}`).split("\n").filter(Boolean).sort();
  law(
    `Law J (${when})`,
    reported.length > 0 && reported.join(" ") === own.join(" "),
    `the report names ${JSON.stringify(reported)}, the branch's own are ${JSON.stringify(own)}`
  );
};

interface Shape {
  date: string;
  message: string;
  tree: string;
}

/** Each commit `range` holds, oldest first: its message and its tree. */
const shapes = (range: string): Shape[] =>
  sh(`git rev-list --reverse ${range}`)
    .split("\n")
    .filter(Boolean)
    .map((sha) => ({
      date: sh(`git log -1 --format=%aI ${sha}`).trim(),
      message: sh(`git log -1 --format=%B ${sha}`).trimEnd(),
      tree: sh(`git rev-parse ${sha}^{tree}`).trim(),
    }));

/** A message's lines but its `Agent-Logs-Url` trailers. */
const otherLines = (message: string): string[] =>
  message
    .split("\n")
    .filter((line) => !line.startsWith(`${LOGS_TRAILER}:`))
    .filter((line, at, all) => line !== "" || at < all.length - 1);

const failures: string[] = [];
const law = (name: string, held: boolean, said: string): void => {
  if (!held) {
    failures.push(`${name}: ${said}`);
  }
};

/** Laws A and B over `range`, against `before`, its commits' shapes before the stamp. */
const stampedAsBefore = (when: string, range: string, before: Shape[]) => {
  const after = shapes(range);
  law(
    `Law B (${when})`,
    after.length === before.length,
    `${before.length} commits became ${after.length}`
  );
  after.forEach((now, at) => {
    const was = before[at];
    const links = sh(
      `git log -1 --format='%(trailers:key=${LOGS_TRAILER},valueonly)' $(git rev-list --reverse ${range} | sed -n ${at + 1}p)`
    )
      .split("\n")
      .filter(Boolean);
    law(
      `Law A (${when}, commit ${at + 1})`,
      links.length === 1 && links[0]?.startsWith(`${URL_NOW}?at=`) === true,
      `its ${LOGS_TRAILER} trailers are ${JSON.stringify(links)}`
    );
    const date = sh(
      `git log -1 --format=%aI $(git rev-list --reverse ${range} | sed -n ${at + 1}p)`
    ).trim();
    const moment = `${URL_NOW}?at=${date.replace("+", "%2B")}`;
    law(
      `Law E (${when}, commit ${at + 1})`,
      links[0] === moment && date === was?.date,
      `its link is ${JSON.stringify(links[0])}, its author date ${date} (was ${was?.date}), not ${moment}`
    );
    law(
      `Law B (${when}, commit ${at + 1})`,
      was !== undefined &&
        JSON.stringify(otherLines(now.message)) ===
          JSON.stringify(otherLines(was.message)) &&
        now.tree === was.tree,
      `was ${JSON.stringify(was)}, is ${JSON.stringify(now)}`
    );
  });
};

try {
  sh("git init -q -b main .");
  commit("base", "Base");
  sh("git checkout -q -b ws");
  commit(
    "a",
    "Add a\n\nWhy a.\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
  );
  commit(
    "src/deep/b",
    `Add b\n\n${LOGS_TRAILER}: ${URL_OLD}\nCo-Authored-By: Claude <noreply@anthropic.com>`
  );
  commit("c", "#12 add c\n\nA body line.");
  commit("src/d", "Add d");
  const before = shapes("main..ws");

  let files = written();
  await landed("main");
  stampedAsBefore("first stamp", "main..ws", before);
  await reportedAsOwn("first stamp", "main..ws");
  law(
    "Law F (first stamp)",
    touched(files, written()).length === 0,
    `it wrote ${JSON.stringify(touched(files, written()))}`
  );
  leftNothing("first stamp");

  const head = sh("git rev-parse HEAD").trim();
  files = written();
  await landed("main");
  law(
    "Law C (second stamp)",
    sh("git rev-parse HEAD").trim() === head,
    "HEAD moved"
  );
  stampedAsBefore("second stamp", "main..ws", before);
  await reportedAsOwn("second stamp", "main..ws");
  law(
    "Law F (second stamp)",
    touched(files, written()).length === 0,
    `it wrote ${JSON.stringify(touched(files, written()))}`
  );
  leftNothing("second stamp");

  upstreamCommit("src/deep/e", "Upstream e");
  const stamped = shapes("main..ws");
  const old = sh("git rev-parse HEAD").trim();
  files = written();
  const moved = await landed("main");
  const differ = new Set(
    sh(`git diff --name-only ${old} ${moved}`).split("\n").filter(Boolean)
  );
  law(
    "Law G (rebased)",
    differ.size === 1 &&
      differ.has("src/deep/e") &&
      touched(files, written(), differ).length === 0 &&
      sh("git status --porcelain").trim() === "",
    `the trees differ in ${JSON.stringify([...differ])}; it also wrote ${JSON.stringify(touched(files, written(), differ))}; status ${JSON.stringify(sh("git status --porcelain"))}`
  );
  leftNothing("rebased");
  await reportedAsOwn("rebased", "main..ws");
  const rebased = shapes("main..ws");
  law(
    "Law B (rebased)",
    rebased.every((one, at) => one.message === stamped[at]?.message),
    "a message changed in the rebase onto a newer upstream"
  );
  // The trees now hold upstream's `e` too: compare messages, then laws A on each.
  stampedAsBefore(
    "rebased",
    "main..ws",
    rebased.map((one, at) => ({
      date: before[at]?.date ?? "",
      message: before[at]?.message ?? "",
      tree: one.tree,
    }))
  );

  sh("git checkout -q -b own main~1");
  commit("f", "Add f\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
  commit("src/g", "Add g");
  const fork = sh("git merge-base main own").trim();
  const ownBefore = shapes("main..own");
  files = written();
  await landed("main", true);
  law(
    "Law D (keep base)",
    sh("git rev-parse HEAD~2").trim() === fork,
    "the commits moved off the commit they started from"
  );
  stampedAsBefore("keep base", "main..own", ownBefore);
  await reportedAsOwn("keep base", "main..own");
  law(
    "Law F (keep base)",
    touched(files, written()).length === 0,
    `it wrote ${JSON.stringify(touched(files, written()))}`
  );
  leftNothing("keep base");
  const ownHead = sh("git rev-parse HEAD").trim();
  await landed("main", true);
  law(
    "Law C (keep base, again)",
    sh("git rev-parse HEAD").trim() === ownHead,
    "HEAD moved"
  );
  leftNothing("keep base, again");

  sh("git checkout -q -b clash main~1");
  commit("src/deep/e", "Clashing e");
  const clashHead = sh("git rev-parse HEAD").trim();
  const clashIndex = sh("git ls-files -s");
  files = written();
  const clash = await land("main");
  law(
    "Law H (conflict)",
    clash.kind === "conflict" &&
      clash.files === "src/deep/e" &&
      sh("git rev-parse HEAD").trim() === clashHead &&
      sh("git ls-files -s") === clashIndex &&
      sh("git status --porcelain").trim() === "" &&
      touched(files, written()).length === 0,
    `it came to ${JSON.stringify(clash)}; it wrote ${JSON.stringify(touched(files, written()))}; status ${JSON.stringify(sh("git status --porcelain"))}`
  );
  leftNothing("conflict");
  await reportedAsOwn("conflict", "main..clash");
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(
    `logs-trailer-check: ${failures.length} broken\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  "logs-trailer-check: laws A–J held over 6 landings of 6 commits (first, again, rebased onto a newer upstream, kept on its base, again) and one that conflicts"
);
