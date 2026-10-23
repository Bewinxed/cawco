/**
 * A workspace moved to another workspace's commit (agent workspace.ts
 * `workspaceAt`: the landing gate's workspace on another machine, the iOS
 * build's on a Mac, and a `from` cut) checks out every tracked file of that
 * commit, the clone-side deny paths among them (core workspace-policy.ts
 * `cloneDenies`: `.mcp.json`, OpenCode's config, Claude Code's project
 * settings), and a session in its boundary still cannot rewrite one. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model). This spec delegates, so its fleet cuts workspaces: it runs on the
 * host, outside every boundary, on macOS (Seatbelt) and Linux (srt) alike.
 *
 * What happened on the Mac on 2026-10-23: the gate's iOS build failed in its
 * gate workspace before building, "git checkout --quiet failed in workspace
 * 14e11a48-…: error: unable to create file .mcp.json: Operation not
 * permitted". The checkout ran inside that workspace's own boundary, whose
 * profile denies every write to `.mcp.json` (`(deny file-write* (subpath
 * "<clone>/.mcp.json"))`, agent boundary-policy.ts `seatbeltProfile`), and
 * the clone lacked the file.
 *
 * - (a) Main tracks `.mcp.json` (one text) and no `opencode.json`. A delegate
 *   commits another text of `.mcp.json` and a new `opencode.json` through
 *   git's index alone (it writes neither file: its boundary refuses both),
 *   and stops blocked: its workspace is held at that commit.
 * - (b) The parent delegates `from` that workspace. The new workspace is cut
 *   at main (`.mcp.json` as main has it, no `opencode.json`), then moved to
 *   the source's commit: its HEAD is that commit, its `.mcp.json` and
 *   `opencode.json` on the host hold the commit's texts, its status is
 *   clean, and the agent's log says it is at that commit. Before the fix
 *   the move failed: "unable to unlink old '.mcp.json'" / "unable to create
 *   file opencode.json: Operation not permitted".
 * - (c) The new delegate, in its boundary, writes, removes and renames
 *   `.mcp.json` and writes `opencode.json`, each path spelled apart so only
 *   the boundary judges it: every one fails, and on the host both files
 *   still hold the commit's texts, with nothing at the rename's target.
 * - (d) A delegate whose branch is open commits a file and tries to rename
 *   `.git` (which holds the denied `.git/config` and `.git/hooks`): the
 *   rename fails (on the Mac it passed before, and the hooks under the new
 *   name were written). Main then changes `.mcp.json`, and the delegate
 *   finishes: the landing rebases onto that main and lands (hub landing.ts,
 *   the rebase a move, agent workflow-command.ts `movedCommand`): origin's
 *   main is the delegate's commit on main's, the clone's HEAD is it, its
 *   status is clean and its `.mcp.json` on the host is main's new text,
 *   and the agent's log says the rebase ran on the host with the sandbox
 *   down. Before the fix the rebase failed inside the boundary: "unable to
 *   unlink old '.mcp.json'".
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
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The parent's message that names the held workspace to cut `from`. */
const ASK = "PROBE-TRACKED-ASK";
const SOURCE = "PROBE-TRACKED-SOURCE";
const SOURCE_MADE = "PROBE-TRACKED-SOURCE-MADE";
const NEW = "PROBE-TRACKED-NEW";
const NEW_END = "PROBE-TRACKED-NEW-END";
const NEW_TITLE = "Tracked denies probe";
const COMMIT = "Probe commit of tracked deny paths";
const FINISH = "mcp__cawco__finish_item";
const DELEGATE = "mcp__cawco__delegate";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";
/** git's own words for a checkout's write the boundary refused (entry.c, unpack-trees.c). */
const GIT_REFUSED = /unable to (create file|unlink old) /;
/** A held workspace's settle: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;

/** `.mcp.json` as main tracks it. */
const MAIN_MCP = '{ "mcpServers": {} }\n';
/** `.mcp.json` as the source's commit tracks it: valid, and no stand-in's text. */
const SOURCE_MCP = '{\n  "mcpServers": {}\n}\n';
/** `opencode.json`, which only the source's commit tracks. */
const SOURCE_OPENCODE = '{ "$schema": "https://opencode.ai/config.json" }\n';
/** What the new delegate tries to write into `.mcp.json`. */
const HOSTILE_MCP = '{"mcpServers":{"probe":{"command":"/usr/bin/true"}}}';

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 4)}""${marker.slice(4)}"`;

/**
 * A blob of `text` (which ends in a newline) into the index at the path in
 * shell variable `path`, written through git's object store alone.
 */
const staged = (blob: string, path: string): string =>
  `git update-index --add --cacheinfo "100644,$(git hash-object -w --stdin <<'BLOB'\n${blob}BLOB\n),$${path}"`;

/**
 * Each deny path's name spelled apart, so only the boundary judges a command
 * that names it, never a rule that reads the command's words.
 */
const NAMES = `m=".mc""p.json"; o="open""code.json"`;

/**
 * The source delegate's one command: both deny paths committed through the
 * index, its worktree left as the boundary keeps it (skip-worktree, so its
 * status is clean), and one file of its own.
 */
const SOURCE_COMMAND = [
  "set -e",
  NAMES,
  staged(SOURCE_MCP, "m"),
  staged(SOURCE_OPENCODE, "o"),
  'git update-index --skip-worktree "$m" "$o"',
  "echo source > tracked-probe.txt && git add tracked-probe.txt",
  `git -c user.name=Delegate -c user.email=d@probe.test commit -qm '${COMMIT}'`,
  `echo ${apart(SOURCE_MADE)}`,
].join("\n");

/** The new delegate's one command: each write to a deny path, by a name spelled apart, then its exit. */
const NEW_COMMAND = [
  NAMES,
  `printf '%s\\n' '${HOSTILE_MCP}' > "$m" 2>/dev/null; echo ${apart("MCP-WRITE:")}$?`,
  `rm -f "$m" 2>/dev/null; echo ${apart("MCP-RM:")}$?`,
  `mv "$m" moved-probe.json 2>/dev/null; echo ${apart("MCP-MV:")}$?`,
  `printf '{}\\n' > "$o" 2>/dev/null; echo ${apart("OPENCODE-WRITE:")}$?`,
  `echo ${apart(NEW_END)}`,
].join("\n");

const LAND = "PROBE-REBASE-LAND";
const LAND_MADE = "PROBE-REBASE-LAND-MADE";
const LAND_TITLE = "Land over a moved .mcp.json";
const LAND_COMMIT = "Probe commit landed over a moved .mcp.json";
/** The file in the land delegate's scratch dir the spec writes once main has moved: it finishes after. */
const MAIN_MOVED = "main-moved";
/** `.mcp.json` as main changes it while the land delegate's branch is open. */
const MOVED_MCP = '{\n  "mcpServers": {},\n  "probe": "main moved"\n}\n';
/** The agent's line for a move it ran on the host (workflow-command.ts `onHost`). */
const ON_HOST = "ran on the host, its sandbox down, as it writes .mcp.json";

/**
 * The land delegate's one command: a commit of its own, a try at renaming
 * `.git` (put back at once when it passes), then a wait for main to move.
 */
const LAND_COMMAND = [
  "echo land > land-probe.txt && git add land-probe.txt",
  `git -c user.name=Delegate -c user.email=d@probe.test commit -qm '${LAND_COMMIT}'`,
  `g=".g""it"; if mv "$g" "$g-probe" 2>/dev/null; then mv "$g-probe" "$g"; echo ${apart("GIT-MV:")}0; else echo ${apart("GIT-MV:")}1; fi`,
  `for i in $(seq 240); do [ -e "$TMPDIR/${MAIN_MOVED}" ] && break; sleep 1; done`,
  `echo ${apart(LAND_MADE)}`,
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

/** The held workspace the parent's message names. */
const ASKED = new RegExp(`${ASK} ([0-9a-f-]{36})`);

/** Which session has made its one call already: the parent its delegate, the new delegate its finish. */
const called = { delegate: false, finish: false, land: false };

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
      return useTool("Bash", {
        command: SOURCE_COMMAND,
        description: "Commit the deny paths",
      });
    }
    return found(request, FINISH, {
      headline: "Committed and stopped.",
      summary: "Committed and stopped.",
      blocked: { command: "probe", error: "the probe stops this item here" },
    });
  }
  if (request.all.includes(NEW)) {
    if (!request.all.includes(NEW_END)) {
      return useTool("Bash", {
        command: NEW_COMMAND,
        description: "Try the deny paths",
      });
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
      return useTool("Bash", {
        command: LAND_COMMAND,
        description: "Commit, then wait for main",
        timeout: 300_000,
      });
    }
    return once(
      request,
      "land",
      FINISH,
      { headline: "Landed.", summary: "Committed land-probe.txt." },
      "Landed."
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
  new RegExp(`${marker}(\\S*)`).exec(said)?.[1];

/** The fleet up, a project whose main tracks `.mcp.json`, and its parent session. */
const scene = async (
  kit: Kit
): Promise<{
  fleet: KitFleet;
  parent: string;
  project: string;
  src: string;
}> => {
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
  return { fleet, parent, project: project.id, src };
};

/** (a) The source delegate's workspace, held at its commit of both deny paths: the row and its HEAD. */
const sourcePhase = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string
): Promise<{ head: string; source: Workspace } | undefined> => {
  const started = await fleet.api<{ workItemId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Commit the deny paths",
      prompt: `${SOURCE}: commit the deny paths, then stop.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    }
  );
  const item = await until(
    "the source delegate's item failed as blocked",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        started.workItemId
      )[0]?.state,
    (state) => state === "failed",
    300_000
  ).catch(() => undefined);
  const source = await until(
    "its workspace held",
    () => workspaceOf(fleet, started.workspaceId),
    (row) => row?.state === "held",
    SETTLE_MS
  ).catch(() => workspaceOf(fleet, started.workspaceId));
  const head = source ? await gitIn(source.path, "rev-parse", "HEAD") : "";
  const tracked = head
    ? {
        mcp: await gitIn(source?.path ?? "", "show", `${head}:.mcp.json`),
        opencode: await gitIn(
          source?.path ?? "",
          "show",
          `${head}:opencode.json`
        ),
        subject: await gitIn(source?.path ?? "", "log", "-1", "--format=%s"),
      }
    : undefined;
  check(
    "(a) the source delegate committed another .mcp.json and a new opencode.json through the index, and its workspace is held at that commit",
    item === "failed" &&
      source?.state === "held" &&
      tracked?.subject === COMMIT &&
      `${tracked.mcp}\n` === SOURCE_MCP &&
      `${tracked.opencode}\n` === SOURCE_OPENCODE,
    `item ${item}; workspace ${source?.state}; HEAD ${head.slice(0, 9)} ${JSON.stringify(tracked)}`
  );
  return source && head && tracked?.subject === COMMIT
    ? { head, source }
    : undefined;
};

/** (b) and (c): the `from` cut moved to the source's commit, and its delegate's writes refused. */
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
  const refused = log.split("\n").filter((line) => GIT_REFUSED.test(line));
  check(
    "(b) the from cut is moved to the source's commit: its HEAD is that commit, its status is clean, and the agent's log says so, with no refused write",
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
    "(b) its .mcp.json (changed) and opencode.json (new) on the host hold the source commit's texts",
    mcp === SOURCE_MCP && opencode === SOURCE_OPENCODE,
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
    "(c) in its boundary the delegate's write, rm and rename of .mcp.json and its write of opencode.json each fail, and on the host both still hold the commit's texts, nothing at the rename's target",
    Object.values(exits).every((exit) => exit !== undefined && exit !== "0") &&
      mcpAfter === SOURCE_MCP &&
      opencodeAfter === SOURCE_OPENCODE &&
      !moved,
    `exits ${JSON.stringify(exits)}; .mcp.json ${JSON.stringify(mcpAfter)}; opencode.json ${JSON.stringify(opencodeAfter)}; moved-probe.json ${moved ? "there" : "absent"}`
  );
};

/** (d) A delegate's landing rebased onto a main that changed `.mcp.json` while its branch was open. */
const landPhase = async (
  { check, note }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string,
  projectId: string
): Promise<void> => {
  const watched = await fleet.logMark("agent");
  const started = await fleet.api<{ workItemId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: LAND_TITLE,
      prompt: `${LAND}: commit, wait for main, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    }
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
    check("(d) the land delegate committed in its clone", false, "no commit");
    return;
  }
  const bare = join(fleet.sandbox, "hub", "git", `${projectId}.git`);
  const mover = join(fleet.sandbox, "main-mover");
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`git clone -q ${bare} ${mover}`.env(env).quiet();
  await writeFile(join(mover, ".mcp.json"), MOVED_MCP);
  await Bun.$`git add -A && git commit -qm 'Main changes .mcp.json' && git push -q origin HEAD:main`
    .cwd(mover)
    .env(env)
    .quiet();
  const moved = await gitIn(mover, "rev-parse", "HEAD");
  await writeFile(join(row.tmp ?? "", MAIN_MOVED), "");
  const state = await until(
    "the land delegate's item ended",
    () =>
      fleet.query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        started.workItemId
      )[0],
    (one) => ["done", "failed", "cancelled"].includes(one?.state ?? ""),
    600_000
  ).catch(() => undefined);
  const said = fleet.seen.find((one) => one.all.includes(LAND_MADE))?.all ?? "";
  const renamed = after(said, "GIT-MV:");
  check(
    "(d) in its boundary the delegate's rename of .git (which holds the denied .git/config and .git/hooks) fails",
    renamed === "1",
    `GIT-MV ${renamed ?? "unread"}`
  );
  const main = await Bun.$`git --git-dir ${bare} log -2 --format=%H%x09%s main`
    .quiet()
    .nothrow()
    .text();
  const [top, below] = main.trim().split("\n");
  const head = await gitIn(row.path, "rev-parse", "HEAD");
  const status = await gitIn(row.path, "status", "--porcelain");
  const mcp = await textAt(join(row.path, ".mcp.json"));
  const log = await watched.since();
  note(main.trim());
  check(
    "(d) the landing rebased onto the main that changed .mcp.json and landed: origin's main is the delegate's commit on main's, the clone's HEAD is it, its status is clean",
    state?.state === "done" &&
      top?.endsWith(`\t${LAND_COMMIT}`) === true &&
      below?.startsWith(`${moved}\t`) === true &&
      top.startsWith(`${head}\t`) &&
      status === "",
    `item ${state?.state} ${state?.error ?? ""}; main ${JSON.stringify(main.trim())}; clone HEAD ${head.slice(0, 9)}; status ${JSON.stringify(status.slice(0, 300))}`
  );
  const refused = log.split("\n").filter((line) => GIT_REFUSED.test(line));
  check(
    "(d) its .mcp.json on the host is main's new text, the agent ran the rebase on the host with its sandbox down, and no git write was refused",
    mcp === MOVED_MCP &&
      log
        .split("\n")
        .some(
          (line) => line.includes(started.workspaceId) && line.includes(ON_HOST)
        ) &&
      refused.length === 0,
    `.mcp.json ${JSON.stringify(mcp)}; on-host line ${log.includes(ON_HOST)}; ${refused.join(" / ").slice(0, 600) || "no refusal"}`
  );
};

const spec: Spec = {
  name: "cut-tracked-denies",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { fleet, parent, project, src } = await scene(kit);
    const held = await sourcePhase(kit, fleet, parent, src);
    if (held) {
      await cutPhase(kit, fleet, parent, held);
    }
    await landPhase(kit, fleet, parent, src, project);
  },
};

export default spec;
