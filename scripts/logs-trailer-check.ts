/**
 * `bun scripts/logs-trailer-check.ts`: the `Agent-Logs-Url` stamp the hub
 * puts on every commit it lands (hub landing.ts `stampedRebase`,
 * `stampCommand`), run with real git in a scratch repository, through the
 * same `git` shell function the hub's commands start with (core safe-git.ts
 * `SAFE_GIT_SHELL`).
 *
 * A branch of four commits, each with its own author date, (one with a `Co-Authored-By` trailer, one with
 * another session's link above one, one whose subject starts with `#`, one
 * with no body) is stamped, stamped again, rebased onto a newer upstream
 * and stamped, and a second branch is stamped where it stands
 * (`keepBase`). After each, the laws:
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
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any law broken.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAFE_GIT_SHELL } from "../packages/core/src/safe-git";
import { LOGS_TRAILER, stampedRebase } from "../packages/hub/src/landing";

const URL_NOW = "https://hub.example.ts.net:3455/session/3f2a9c1e";
const URL_OLD = "http://old-host:3455/session/77aa00bb";

const dir = mkdtempSync(join(tmpdir(), "logs-trailer-"));
const env = {
  ...process.env,
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

const commit = (file: string, message: string): void => {
  writeFileSync(join(dir, file), `${file} ${message}\n`);
  authored += 60_000;
  env.GIT_AUTHOR_DATE = `${new Date(authored).toISOString().slice(0, 19)}${ZONES[(authored / 60_000) % 2]}`;
  sh(
    `git add -A && printf '%s\\n' ${JSON.stringify(message)} | git commit -q --cleanup=verbatim -F -`
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
    "b",
    `Add b\n\n${LOGS_TRAILER}: ${URL_OLD}\nCo-Authored-By: Claude <noreply@anthropic.com>`
  );
  commit("c", "#12 add c\n\nA body line.");
  commit("d", "Add d");
  const before = shapes("main..ws");

  sh(stampedRebase("main", URL_NOW));
  stampedAsBefore("first stamp", "main..ws", before);

  const head = sh("git rev-parse HEAD").trim();
  sh(stampedRebase("main", URL_NOW));
  law(
    "Law C (second stamp)",
    sh("git rev-parse HEAD").trim() === head,
    "HEAD moved"
  );
  stampedAsBefore("second stamp", "main..ws", before);

  sh("git checkout -q main");
  commit("e", "Upstream e");
  sh("git checkout -q ws");
  const stamped = shapes("main..ws");
  sh(stampedRebase("main", URL_NOW));
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
  commit("g", "Add g");
  const fork = sh("git merge-base main own").trim();
  const ownBefore = shapes("main..own");
  sh(stampedRebase("main", URL_NOW, true));
  law(
    "Law D (keep base)",
    sh("git rev-parse HEAD~2").trim() === fork,
    "the commits moved off the commit they started from"
  );
  stampedAsBefore("keep base", "main..own", ownBefore);
  const ownHead = sh("git rev-parse HEAD").trim();
  sh(stampedRebase("main", URL_NOW, true));
  law(
    "Law C (keep base, again)",
    sh("git rev-parse HEAD").trim() === ownHead,
    "HEAD moved"
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(
    `logs-trailer-check: ${failures.length} broken\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  "logs-trailer-check: laws A–E held over 4 stamps of 6 commits (first, again, rebased onto a newer upstream, kept on its base)"
);
