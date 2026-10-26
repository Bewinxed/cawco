/**
 * Git moves a workspace's worktree over the clone-side deny paths (core
 * clone-denies.ts `cloneDenies`: `.mcp.json`, OpenCode's config, Claude
 * Code's project settings) without dropping one, a session in the boundary
 * still cannot rewrite them, and no workspace's commit carries a change to
 * them. On a scratch fleet (real hub, agent and sessiond; Claude Code against
 * the mock model). This spec delegates, so its fleet cuts workspaces: it runs
 * on the host, outside every boundary, on macOS (Seatbelt) and Linux (srt).
 *
 * What happened on the Mac on 2026-10-23: the gate's iOS build failed in its
 * gate workspace before building, "git checkout --quiet failed in workspace
 * 14e11a48-…: error: unable to create file .mcp.json: Operation not
 * permitted". The checkout ran inside that workspace's own boundary, whose
 * profile denies every write to `.mcp.json` (agent boundary-policy.ts
 * `seatbeltProfile`), and the clone lacked the file. The landing's rebase ran
 * there too, and a checkout without `--force` there exits 0 with the file
 * gone.
 *
 * Main tracks `.mcp.json` and `opencode.json`, as the person committed them.
 *
 * - (a) A delegate commits a file of its own, tries to rename `.git` (which
 *   holds the denied `.git/config` and `.git/hooks`), and stops blocked: the
 *   rename fails (on the Mac it passed before, and hooks written under the
 *   new name went past the deny), and its workspace is held at its commit.
 * - (b) A second delegate commits a file; main then changes `.mcp.json` and
 *   drops `opencode.json`, and the delegate finishes. Its landing rebases
 *   onto that main and lands (hub landing.ts, the rebase a move, agent
 *   hub-command.ts `movedCommand`): origin's main is its commit on
 *   main's, with main's new `.mcp.json` and no `opencode.json`, and the
 *   agent's log says the rebase ran on the host with the sandbox down. The
 *   landed workspace retires at once, so its clone is read through its
 *   archive: it held nothing past origin and stood at the landed commit
 *   (agent workspace.ts `closeClone`'s line). Before the fix: "unable to
 *   unlink old '.mcp.json'".
 * - (c) The parent delegates `from` the held workspace. The new workspace is
 *   cut at main as it is now, then moved to the source's commit, which has
 *   the older `.mcp.json` and an `opencode.json` (agent workspace.ts
 *   `workspaceAt`): its HEAD is that commit, its status is clean, both files
 *   on the host hold that commit's texts, and the agent's log says it is
 *   there. Before the fix: "unable to create file opencode.json".
 * - (d) The new delegate, in its boundary, writes, removes and renames
 *   `.mcp.json` and writes `opencode.json`, each path spelled apart so only
 *   the boundary judges it: every one fails, and on the host both files
 *   still hold the commit's texts, nothing at the rename's target.
 * - (e) A delegate commits another `.mcp.json` through git's index alone
 *   (`git update-index --cacheinfo`, no file written) and finishes: its
 *   landing is refused, its finish naming `.mcp.json` as harness project
 *   config no workspace's commit changes, and origin's main is as (b) left
 *   it (hub-command.ts `ownConfigChanges`).
 * - (f) In (d)'s boundary the session's own `git checkout --detach
 *   origin/main`, whose `.mcp.json` differs from HEAD's, exits non-zero
 *   naming `.mcp.json`, and the worktree is as it was: the same HEAD, the
 *   same `.mcp.json`, a clean status (agent worktree-guard.ts `gitShim`, the
 *   `git` first on every command's PATH there). Before the fix git printed
 *   "unable to unlink old '.mcp.json'" and the checkout moved the rest.
 *
 * Harness config is judged at any depth and in any letter case (core
 * clone-denies.ts `HARNESS_CONFIG`; agent worktree-guard.ts
 * `denyPathspecs(…, "config")` with case-insensitive globs at any depth;
 * boundary-policy.ts `anyCase`):
 *
 * - (g) A delegate writes `.MCP.json` (mixed case, spelled apart so the
 *   sandbox judges the path, not the command's words) at the clone root. On
 *   macOS the boundary denies it in any letter case — on APFS `.MCP.json` is
 *   the file Claude Code reads as `.mcp.json` — so the write fails; on Linux
 *   srt's literal deny leaves it a distinct file the commit check still keeps
 *   from landing, so the write exits 0. Either way `.mcp.json` on the host is
 *   unchanged.
 * - (h) A delegate commits a nested `pkg/.pi/extensions/x.ts` and, through
 *   git's index alone, a mixed-case `.MCP.json`, then finishes: the landing is
 *   refused, the finish naming BOTH as harness config no workspace's commit
 *   changes (`ownConfigChanges` over the depth-and-case pathspecs), and
 *   origin's main does not move.
 *
 *   bun scripts/probe-kit/run.ts cut-tracked-denies
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "../../../packages/core/src/safe-git";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The parent's message that names the held workspace to cut `from`. */
const ASK = "PROBE-TRACKED-ASK";
const SOURCE = "PROBE-TRACKED-SOURCE";
const SOURCE_MADE = "PROBE-TRACKED-SOURCE-MADE";
const SOURCE_COMMIT = "Probe commit of the held source";
const NEW = "PROBE-TRACKED-NEW";
const NEW_END = "PROBE-TRACKED-NEW-END";
const NEW_TITLE = "Tracked denies probe";
const LAND = "PROBE-REBASE-LAND";
const LAND_MADE = "PROBE-REBASE-LAND-MADE";
const LAND_TITLE = "Land over a moved .mcp.json";
const LAND_COMMIT = "Probe commit landed over a moved .mcp.json";
const CONFIG = "PROBE-CONFIG-COMMIT";
const CONFIG_MADE = "PROBE-CONFIG-COMMIT-MADE";
const CONFIG_TITLE = "Commit a .mcp.json change";
const DEPTH = "PROBE-TRACKED-DEPTH";
const DEPTH_END = "PROBE-TRACKED-DEPTH-END";
const DEPTH_TITLE = "Harness config at depth and in case";
/** A nested harness-config path: srt denies only the root `.pi`, the commit check reaches here. */
const PI_FILE = "pkg/.pi/extensions/x.ts";
const FINISH = "mcp__cawco__finish_item";
const DELEGATE = "mcp__cawco__delegate";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";
/** git's own words for a checkout's write the boundary refused (entry.c, unpack-trees.c). */
const GIT_REFUSED = /unable to (create file|unlink old) /u;
/** What a refused move of config says (hub-command.ts `ownConfigWords`). */
const CONFIG_REFUSED = "which no workspace's commit changes";
/** The start of `ownConfigWords`, before the changed paths: where its excerpt begins, so it never opens inside a presence reminder's tail. */
const CONFIG_CHANGE = "its commits change";
/** What the boundary's git says of a move it refused before it ran (worktree-guard.ts `gitShim`). */
const SHIM_REFUSED = "did not run, and the worktree is as it was";
/** The agent's line for a move it ran on the host (hub-command.ts `onHost`). */
const ON_HOST = "ran on the host, its sandbox down, as it writes";
/** A held workspace's settle: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
/** The file in the land delegate's scratch dir the spec writes once main has moved: it finishes after. */
const MAIN_MOVED = "main-moved";

/** `.mcp.json` as main first tracks it. */
const MAIN_MCP = '{ "mcpServers": {} }\n';
/** `opencode.json` as main first tracks it: no stand-in's text. */
const MAIN_OPENCODE = '{ "$schema": "https://opencode.ai/config.json" }\n';
/** `.mcp.json` as main changes it while (b)'s branch is open. */
const MOVED_MCP = '{\n  "mcpServers": {},\n  "probe": "main moved"\n}\n';
/** What (d) tries to write into `.mcp.json`, and (e) commits as one. */
const HOSTILE_MCP = `{"mcpServers":{"probe":{"command":"${systemProgram("true")}"}}}`;

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 4)}""${marker.slice(4)}"`;

/**
 * Each deny path's name spelled apart, so only the boundary judges a command
 * that names it, never a rule that reads the command's words.
 */
const NAMES = `m=".mc""p.json"; o="open""code.json"; g=".g""it"`;

/** A commit of `file` and `subject`, as a delegate makes it. */
const commitOf = (file: string, subject: string): string =>
  `echo probe > ${file} && git add ${file} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm '${subject}'`;

/** (a): a commit, then a try at renaming `.git`, put back at once when it passes. */
const SOURCE_COMMAND = [
  NAMES,
  commitOf("source-probe.txt", SOURCE_COMMIT),
  `if mv "$g" "$g-probe" 2>/dev/null; then mv "$g-probe" "$g"; echo ${apart("GIT-MV:")}0; else echo ${apart("GIT-MV:")}1; fi`,
  `echo ${apart(SOURCE_MADE)}`,
].join("\n");

/** (b): a commit, then a wait for main to move. */
const LAND_COMMAND = [
  commitOf("land-probe.txt", LAND_COMMIT),
  `for i in $(seq 240); do [ -e "$TMPDIR/${MAIN_MOVED}" ] && break; sleep 1; done`,
  `echo ${apart(LAND_MADE)}`,
].join("\n");

/** (d): each write to a deny path, by a name spelled apart, then its exit. */
const NEW_COMMAND = [
  NAMES,
  `printf '%s\\n' '${HOSTILE_MCP}' > "$m" 2>/dev/null; echo ${apart("MCP-WRITE:")}$?`,
  `rm -f "$m" 2>/dev/null; echo ${apart("MCP-RM:")}$?`,
  `mv "$m" moved-probe.json 2>/dev/null; echo ${apart("MCP-MV:")}$?`,
  `printf '{}\\n' > "$o" 2>/dev/null; echo ${apart("OPENCODE-WRITE:")}$?`,
  `git checkout -q --detach origin/main 2> "$TMPDIR/co.err"; echo ${apart("CO-EXIT:")}$?`,
  `echo ${apart("CO-SAID:")}"$(tr '\\n ' '__' < "$TMPDIR/co.err")"`,
  `echo ${apart("CO-HEAD:")}"$(git rev-parse HEAD)"`,
  `echo ${apart(NEW_END)}`,
].join("\n");

/** (e): another `.mcp.json` committed through the object store and the index alone. */
const CONFIG_COMMAND = [
  "set -e",
  NAMES,
  `git update-index --cacheinfo "100644,$(printf '%s\\n' '${HOSTILE_MCP}' | git hash-object -w --stdin),$m"`,
  'git update-index --skip-worktree "$m"',
  `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Probe commit of another .mcp.json'`,
  `echo ${apart(CONFIG_MADE)}`,
].join("\n");

/**
 * (g)+(h): a mixed-case `.MCP.json` write at the clone root (its name spelled
 * apart so the sandbox judges the path, not a rule reading the command), then
 * a commit of a nested `pkg/.pi/extensions/x.ts` and a commit of a mixed-case
 * `.MCP.json` through the index alone (no working write the sandbox would
 * deny on either platform). `set +e` so the macOS deny of the first write does
 * not abort the rest.
 */
const DEPTH_COMMAND = [
  "set +e",
  `M=".MC""P.json"`,
  `printf '%s\\n' '${HOSTILE_MCP}' > "$M" 2>/dev/null; echo ${apart("MCP2-WRITE:")}$?`,
  `mkdir -p pkg/.pi/extensions && printf 'export const x = 1;\\n' > ${PI_FILE} && git add ${PI_FILE} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Probe commit of a nested .pi extension'`,
  `git update-index --add --cacheinfo "100644,$(printf '%s\\n' '${HOSTILE_MCP}' | git hash-object -w --stdin),$M"`,
  'git update-index --skip-worktree "$M"',
  `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Probe commit of a mixed-case .MCP.json'`,
  `echo ${apart(DEPTH_END)}`,
].join("\n");

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
const bash = (command: string, description: string): Reply =>
  useTool("Bash", { command, description, timeout: 300_000 });

/** The held workspace the parent's message names. */
const ASKED = new RegExp(`${ASK} ([0-9a-f-]{36})`, "u");

/** Which session has made its one call already. */
const called = {
  delegate: false,
  finish: false,
  land: false,
  config: false,
  depth: false,
};

/** `name` called once, after finding it: `done` from then on. */
const once = (
  request: Seen,
  which: keyof typeof called,
  name: string,
  input: object,
  done: string
): Reply => {
  if (called[which]) {
    return text(done);
  }
  called[which] = request.toolNames.includes(name);
  return found(request, name, input);
};

/** Every session's answer, by the tag its words carry: the parent's first, whose turn may read its delegates' briefs. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  const asked = ASKED.exec(request.all)?.[1];
  if (asked) {
    return once(
      request,
      "delegate",
      DELEGATE,
      {
        prompt: `${NEW}: try the deny paths, then finish.`,
        title: NEW_TITLE,
        harness: "claude",
        model: "claude-haiku-4-5",
        from: asked,
        lands: "none",
      },
      "Delegated."
    );
  }
  if (request.all.includes(SOURCE)) {
    if (request.all.includes(BLOCKED)) {
      return text("Stopped.");
    }
    if (!request.all.includes(SOURCE_MADE)) {
      return bash(SOURCE_COMMAND, "Commit, and try renaming .git");
    }
    return found(request, FINISH, {
      headline: "Committed and stopped.",
      summary: "Committed and stopped.",
      blocked: { command: "probe", error: "the probe stops this item here" },
    });
  }
  if (request.all.includes(NEW)) {
    if (!request.all.includes(NEW_END)) {
      return bash(NEW_COMMAND, "Try the deny paths");
    }
    return once(
      request,
      "finish",
      FINISH,
      { headline: "Done.", summary: "Done." },
      "Done."
    );
  }
  if (request.all.includes(LAND)) {
    if (!request.all.includes(LAND_MADE)) {
      return bash(LAND_COMMAND, "Commit, then wait for main");
    }
    return once(
      request,
      "land",
      FINISH,
      { headline: "Landed.", summary: "Committed land-probe.txt." },
      "Landed."
    );
  }
  if (request.all.includes(CONFIG)) {
    if (!request.all.includes(CONFIG_MADE)) {
      return bash(CONFIG_COMMAND, "Commit another .mcp.json");
    }
    return once(
      request,
      "config",
      FINISH,
      { headline: "Committed.", summary: "Committed another .mcp.json." },
      "Stopped."
    );
  }
  if (request.all.includes(DEPTH)) {
    if (!request.all.includes(DEPTH_END)) {
      return bash(
        DEPTH_COMMAND,
        "Write mixed-case .MCP.json; commit a nested .pi extension and an index .MCP.json"
      );
    }
    return once(
      request,
      "depth",
      FINISH,
      {
        headline: "Committed.",
        summary: "Committed a nested .pi extension and a mixed-case .MCP.json.",
      },
      "Stopped."
    );
  }
  return text("ok");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
}

/** git on the host in `dir`, as safe-git.ts says; its stdout, trimmed. */
const gitIn = (dir: string, ...args: string[]): Promise<string> =>
  Bun.$`git ${SAFE_GIT_FLAGS} -C ${dir} ${args}`
    .env({ ...process.env, ...SAFE_GIT_ENV })
    .quiet()
    .nothrow()
    .text()
    .then((out) => out.trim());

const workspaceOf = (fleet: KitFleet, id: string): Workspace | undefined =>
  fleet.query<Workspace>(
    "SELECT id, path, state FROM workspaces WHERE id = ?",
    id
  )[0];

/** A file's text on the host, or undefined when there is none. */
const textAt = (path: string): Promise<string | undefined> =>
  readFile(path, "utf8").catch(() => undefined);

/** What the command said after `marker`, up to the end of its word. */
const after = (said: string, marker: string): string | undefined =>
  new RegExp(`${marker}(\\S*)`, "u").exec(said)?.[1];

/**
 * The config refusal in `answer`, from the `its commits change` that precedes
 * it (the delegate's own words), never a fixed-length tail that would open
 * inside the presence reminder before it. Empty when it holds no refusal.
 */
const refusalFrom = (answer: string | undefined): string => {
  if (!answer) {
    return "";
  }
  const at = answer.lastIndexOf(CONFIG_REFUSED);
  if (at < 0) {
    return "";
  }
  const start = answer.lastIndexOf(CONFIG_CHANGE, at);
  return answer.slice(start >= 0 ? start : Math.max(0, at - 400), at + 200);
};

/** The lines of `log` that say git refused a write. */
const refusedIn = (log: string): string[] =>
  log.split("\n").filter((line) => GIT_REFUSED.test(line));

/** The item's state once it ended, or its last state when it had not. */
const ended = (fleet: KitFleet, id: string) =>
  until(
    `item ${id} ended`,
    () =>
      fleet.query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        id
      )[0],
    (one) => ["done", "failed", "cancelled"].includes(one?.state ?? ""),
    600_000
  ).catch(() => undefined);

/** A delegate of `parent`, in a workspace cut from `src`, told `tag`. */
const delegate = (
  fleet: KitFleet,
  parent: string,
  src: string,
  title: string,
  prompt: string
) =>
  fleet.api<{ workItemId: string; workspaceId: string }>("/api/work-items", {
    parentInstanceId: parent,
    title,
    prompt,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
  });

/** The fleet up, a project whose main tracks `.mcp.json` and `opencode.json`, and its parent session. */
const scene = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await writeFile(join(src, ".mcp.json"), MAIN_MCP);
  await writeFile(join(src, "opencode.json"), MAIN_OPENCODE);
  await writeFile(join(src, "README.md"), "tracked denies\n");
  await Bun.$`sh -c ${"git init -q -b main && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Tracked denies",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  return { bare, fleet, parent, src };
};

/** (a) The source delegate's workspace, held at its own commit: the row and its HEAD. */
const sourcePhase = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string
): Promise<{ head: string; source: Workspace } | undefined> => {
  const started = await delegate(
    fleet,
    parent,
    src,
    "Commit and stop",
    `${SOURCE}: commit, then stop.`
  );
  const item = await ended(fleet, started.workItemId);
  const source = await until(
    "its workspace held",
    () => workspaceOf(fleet, started.workspaceId),
    (row) => row?.state === "held",
    SETTLE_MS
  ).catch(() => workspaceOf(fleet, started.workspaceId));
  const head = source ? await gitIn(source.path, "rev-parse", "HEAD") : "";
  const subject = source
    ? await gitIn(source.path, "log", "-1", "--format=%s")
    : "";
  const said = fleet.seen.find((one) => one.all.includes(SOURCE_MADE))?.all;
  const renamed = after(said ?? "", "GIT-MV:");
  check(
    "(a) in its boundary the delegate's rename of .git (which holds the denied .git/config and .git/hooks) fails",
    renamed === "1",
    `GIT-MV ${renamed ?? "unread"}`
  );
  check(
    "(a) the delegate committed and stopped blocked, its workspace held at its commit",
    item?.state === "failed" &&
      source?.state === "held" &&
      subject === SOURCE_COMMIT,
    `item ${item?.state}; workspace ${source?.state}; HEAD ${head.slice(0, 9)} "${subject}"`
  );
  return source && subject === SOURCE_COMMIT ? { head, source } : undefined;
};

/** (b) A delegate's landing rebased onto a main that changed `.mcp.json` and dropped `opencode.json` while its branch was open. */
const landPhase = async (
  { check, note }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string,
  bare: string
): Promise<void> => {
  const watched = await fleet.logMark("agent");
  const started = await delegate(
    fleet,
    parent,
    src,
    LAND_TITLE,
    `${LAND}: commit, wait for main, then finish.`
  );
  const row = await until(
    "the land delegate committed",
    async () => {
      const [one] = fleet.query<{ path: string; tmp: string | null }>(
        "SELECT path, tmp FROM workspaces WHERE id = ?",
        started.workspaceId
      );
      return one?.path &&
        (await gitIn(one.path, "log", "-1", "--format=%s")) === LAND_COMMIT
        ? one
        : undefined;
    },
    Boolean,
    300_000
  ).catch(() => undefined);
  if (!row) {
    check("(b) the land delegate committed in its clone", false, "no commit");
    return;
  }
  const mover = join(fleet.sandbox, "main-mover");
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`git clone -q ${bare} ${mover}`.env(env).quiet();
  await writeFile(join(mover, ".mcp.json"), MOVED_MCP);
  await Bun.$`git rm -q opencode.json && git add -A && git commit -qm 'Main changes .mcp.json and drops opencode.json' && git push -q origin HEAD:main`
    .cwd(mover)
    .env(env)
    .quiet();
  const moved = await gitIn(mover, "rev-parse", "HEAD");
  await writeFile(join(row.tmp ?? "", MAIN_MOVED), "");
  const state = await ended(fleet, started.workItemId);
  const main = await Bun.$`git --git-dir ${bare} log -2 --format=%H%x09%s main`
    .quiet()
    .nothrow()
    .text();
  const [top = "", below = ""] = main.trim().split("\n");
  const landed = top.split("\t")[0] ?? "";
  note(main.trim());
  check(
    "(b) the landing rebased onto the main that changed .mcp.json and dropped opencode.json, and landed: origin's main is the delegate's commit on main's",
    state?.state === "done" &&
      top.endsWith(`\t${LAND_COMMIT}`) &&
      below.startsWith(`${moved}\t`),
    `item ${state?.state} ${state?.error ?? ""}; main ${JSON.stringify(main.trim())}`
  );
  // A landed item's workspace retires at once (its session put to sleep, its
  // clone archived), so the clone is read through its archive: archived it
  // held nothing past origin (no change, no stash, no commit of its own) and
  // stood at the landed commit, which the archive's line names, or the
  // archive would have kept it ("not archived: its clone … holds …").
  const archivedLine = `[workspace] ${started.workspaceId}: archived; its clone ${row.path}`;
  const archived = await until(
    "the land delegate's workspace archived",
    async () =>
      (await watched.since())
        .split("\n")
        .find((line) => line.startsWith(archivedLine)),
    Boolean,
    SETTLE_MS
  ).catch(() => undefined);
  const log = await watched.since();
  const tracked =
    await Bun.$`git --git-dir ${bare} show ${`${landed}:.mcp.json`}`
      .quiet()
      .nothrow()
      .text();
  const tracksOpencode = (
    await Bun.$`git --git-dir ${bare} ls-tree --name-only ${landed} opencode.json`
      .quiet()
      .nothrow()
      .text()
  ).trim();
  check(
    "(b) its clone held nothing past origin and stood at the landed commit when it retired, whose .mcp.json is main's new text and which tracks no opencode.json",
    landed.length === 40 &&
      archived?.includes(` ${landed.slice(0, 9)} `) === true &&
      tracked === MOVED_MCP &&
      tracksOpencode === "",
    `${archived ?? "no archive line"}; landed .mcp.json ${JSON.stringify(tracked)}; tracks ${JSON.stringify(tracksOpencode)}`
  );
  const onHost = log
    .split("\n")
    .some(
      (line) => line.includes(started.workspaceId) && line.includes(ON_HOST)
    );
  const refused = refusedIn(log);
  check(
    "(b) the agent ran the rebase on the host with its sandbox down, and no git write was refused: a move that left .mcp.json other than HEAD has it fails the landing (hub-command.ts `movedCommand`)",
    onHost && refused.length === 0,
    `on-host line ${onHost}; ${refused.join(" / ").slice(0, 600) || "no refusal"}`
  );
};

/** (c) and (d): the `from` cut moved to the held source's commit, and its delegate's writes refused. */
const cutPhase = async (
  { check, note }: Kit,
  fleet: KitFleet,
  parent: string,
  held: { head: string; source: Workspace }
): Promise<void> => {
  const { head, source } = held;
  const watched = await fleet.logMark("agent");
  await fleet.send(parent, `${ASK} ${source.id}`);
  const item = await until(
    "the parent's delegate from the held workspace",
    () =>
      fleet.query<{ workspace_id: string | null }>(
        "SELECT workspace_id FROM work_items WHERE title = ?",
        NEW_TITLE
      )[0]?.workspace_id,
    Boolean,
    300_000
  ).catch(() => undefined);
  const said =
    (await until(
      "the new delegate's command finished",
      () => fleet.seen.find((one) => one.all.includes(NEW_END))?.all,
      Boolean,
      300_000
    ).catch(() => undefined)) ?? "";
  const made = item ? workspaceOf(fleet, item) : undefined;
  const clone = made?.path ?? "";
  const madeHead = clone ? await gitIn(clone, "rev-parse", "HEAD") : "";
  const status = clone ? await gitIn(clone, "status", "--porcelain") : "?";
  const log = await watched.since();
  const atLine = `[workspace] ${item}: at ${head.slice(0, 9)}, the commit of workspace ${source.id}`;
  const refused = refusedIn(log);
  check(
    "(c) the from cut, cut at main as it is now, is moved to the source's commit: its HEAD is that commit, its status is clean, and the agent's log says so, with no refused write",
    made !== undefined &&
      madeHead === head &&
      status === "" &&
      log.includes(atLine) &&
      refused.length === 0,
    `workspace ${item ?? "none"}; HEAD ${madeHead.slice(0, 9)} against ${head.slice(0, 9)}; status ${JSON.stringify(status.slice(0, 300))}; at-line ${log.includes(atLine)}; ${refused.join(" / ").slice(0, 600) || "no refusal"}`
  );
  const mcp = await textAt(join(clone, ".mcp.json"));
  const opencode = await textAt(join(clone, "opencode.json"));
  check(
    "(c) its .mcp.json (rewritten) and opencode.json (made again) on the host hold the source commit's texts",
    mcp === MAIN_MCP && opencode === MAIN_OPENCODE,
    `.mcp.json ${JSON.stringify(mcp)}; opencode.json ${JSON.stringify(opencode)}`
  );
  note(said.slice(said.indexOf("MCP-WRITE:"), said.indexOf(NEW_END)));
  const exits = {
    write: after(said, "MCP-WRITE:"),
    rm: after(said, "MCP-RM:"),
    mv: after(said, "MCP-MV:"),
    opencode: after(said, "OPENCODE-WRITE:"),
  };
  const mcpAfter = await textAt(join(clone, ".mcp.json"));
  const opencodeAfter = await textAt(join(clone, "opencode.json"));
  const moved = existsSync(join(clone, "moved-probe.json"));
  check(
    "(d) in its boundary the delegate's write, rm and rename of .mcp.json and its write of opencode.json each fail, and on the host both still hold the commit's texts, nothing at the rename's target",
    Object.values(exits).every((exit) => exit !== undefined && exit !== "0") &&
      mcpAfter === MAIN_MCP &&
      opencodeAfter === MAIN_OPENCODE &&
      !moved,
    `exits ${JSON.stringify(exits)}; .mcp.json ${JSON.stringify(mcpAfter)}; opencode.json ${JSON.stringify(opencodeAfter)}; moved-probe.json ${moved ? "there" : "absent"}`
  );
  const checkedOut = {
    exit: after(said, "CO-EXIT:"),
    said: after(said, "CO-SAID:")?.replaceAll("_", " ") ?? "",
    head: after(said, "CO-HEAD:"),
  };
  const statusAfter = clone ? await gitIn(clone, "status", "--porcelain") : "?";
  check(
    "(f) in its boundary the session's own git checkout of origin/main, whose .mcp.json differs, exits non-zero naming .mcp.json, and the worktree is as it was: HEAD, .mcp.json and a clean status",
    checkedOut.exit !== undefined &&
      checkedOut.exit !== "0" &&
      checkedOut.said.includes(".mcp.json") &&
      checkedOut.said.includes(SHIM_REFUSED) &&
      checkedOut.head === head &&
      (await textAt(join(clone, ".mcp.json"))) === MAIN_MCP &&
      statusAfter === "",
    `${JSON.stringify(checkedOut)}; status ${JSON.stringify(statusAfter.slice(0, 300))}`
  );
};

/** (e) A delegate's commit of another `.mcp.json`, made through the index alone: its landing refused, main as it was. */
const configPhase = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string,
  bare: string
): Promise<void> => {
  const before = await Bun.$`git --git-dir ${bare} rev-parse main`
    .quiet()
    .nothrow()
    .text();
  await delegate(
    fleet,
    parent,
    src,
    CONFIG_TITLE,
    `${CONFIG}: commit another .mcp.json, then finish.`
  );
  const answer = await until(
    "the config delegate's finish answered",
    () =>
      fleet.seen.find(
        (one) =>
          one.all.includes(CONFIG_MADE) && one.all.includes(CONFIG_REFUSED)
      )?.all,
    Boolean,
    300_000
  ).catch(() => undefined);
  const now = await Bun.$`git --git-dir ${bare} rev-parse main`
    .quiet()
    .nothrow()
    .text();
  const refusal = refusalFrom(answer);
  check(
    "(e) a delegate's commit of another .mcp.json, made through the index alone, does not land: its finish names .mcp.json as config no workspace's commit changes, and origin's main is as it was",
    refusal.includes(".mcp.json") &&
      refusal.includes(CONFIG_REFUSED) &&
      before.trim() === now.trim(),
    `${refusal || "no refusal seen"}; main ${before.trim().slice(0, 9)} → ${now.trim().slice(0, 9)}`
  );
};

/**
 * (g) A mixed-case `.MCP.json` write at the clone root, and (h) commits of a
 * nested `pkg/.pi/extensions/x.ts` and a mixed-case `.MCP.json` that do not
 * land. Harness config is denied at any depth and in any letter case.
 */
const depthPhase = async (
  { check, note }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string,
  bare: string
): Promise<void> => {
  const before = (
    await Bun.$`git --git-dir ${bare} rev-parse main`.quiet().nothrow().text()
  ).trim();
  // Origin's own `.mcp.json`, whatever the earlier phases left main at: the
  // clone is cut from it, so the host file equals it unless the write changed
  // it.
  const originMcp = await Bun.$`git --git-dir ${bare} show main:.mcp.json`
    .quiet()
    .nothrow()
    .text();
  const started = await delegate(
    fleet,
    parent,
    src,
    DEPTH_TITLE,
    `${DEPTH}: write a mixed-case .MCP.json, commit a nested .pi extension and an index .MCP.json, then finish.`
  );
  const clone =
    (await until(
      "the depth delegate's clone",
      () => workspaceOf(fleet, started.workspaceId)?.path,
      Boolean,
      300_000
    ).catch(() => undefined)) ?? "";
  const said =
    (await until(
      "the depth command finished",
      () => fleet.seen.find((one) => one.all.includes(DEPTH_END))?.all,
      Boolean,
      300_000
    ).catch(() => undefined)) ?? "";
  const wrote = after(said, "MCP2-WRITE:");
  const mcpOnHost = clone ? await textAt(join(clone, ".mcp.json")) : undefined;
  // macOS folds `.MCP.json` onto `.mcp.json` (APFS) and the boundary denies it
  // in any case, so the write fails; Linux's literal srt leaves it a distinct
  // file (the write exits 0), and the commit check keeps it from landing. On
  // both, the harness's lowercase `.mcp.json` on the host is untouched.
  const macDenied = process.platform !== "darwin" || wrote !== "0";
  check(
    "(g) a mixed-case .MCP.json write at the clone root cannot corrupt the harness's .mcp.json: macOS denies it in any letter case (APFS folds it onto .mcp.json), Linux leaves it a distinct file the commit check still keeps from landing; either way .mcp.json on the host holds origin's text",
    mcpOnHost === originMcp && macDenied,
    `platform ${process.platform}; .MCP.json write exit ${wrote ?? "unread"}; .mcp.json on host ${JSON.stringify(mcpOnHost)}; origin ${JSON.stringify(originMcp)}`
  );
  const answer = await until(
    "the depth delegate's finish answered",
    () =>
      fleet.seen.find(
        (one) => one.all.includes(DEPTH_END) && one.all.includes(CONFIG_REFUSED)
      )?.all,
    Boolean,
    300_000
  ).catch(() => undefined);
  const now = (
    await Bun.$`git --git-dir ${bare} rev-parse main`.quiet().nothrow().text()
  ).trim();
  const refusal = refusalFrom(answer);
  note(refusal);
  check(
    "(h) commits adding a nested pkg/.pi/extensions/x.ts and a mixed-case .MCP.json (through the index alone) do not land: the finish names BOTH as harness config no workspace's commit changes, at any depth and in any letter case, and origin's main does not move",
    refusal.includes(".MCP.json") &&
      refusal.includes(".pi/extensions/x.ts") &&
      refusal.includes(CONFIG_REFUSED) &&
      before === now,
    `${refusal || "no refusal seen"}; main ${before.slice(0, 9)} → ${now.slice(0, 9)}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "cut-tracked-denies",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { bare, fleet, parent, src } = await scene(kit);
    const held = await sourcePhase(kit, fleet, parent, src);
    await landPhase(kit, fleet, parent, src, bare);
    if (held) {
      await cutPhase(kit, fleet, parent, held);
    }
    await configPhase(kit, fleet, parent, src, bare);
    await depthPhase(kit, fleet, parent, src, bare);
  },
};

export default spec;
