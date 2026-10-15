/**
 * Archiving a workspace whose commits are on main always succeeds, and its
 * carry holds only the person's own files (agent workspace.ts `ignoredOwn`,
 * `closeClone`; carry.ts `copyStrays`; hub work-items.ts `archive`). On
 * 2026-10-15 workspaces 530d3d74 and eb0a41b7, landed and clean, could not be
 * archived: the project ignores `.claude/` whole, so the listing of the
 * clone's own ignored files walked into it and listed the boundary's
 * stand-ins (`.claude/settings.local.json`); the boundary took them away as it
 * closed, and the carry's copy failed on ENOENT. `discard` failed the same
 * way, and 530d3d74's 91 MB of ignored files left no other way out.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included. The project ignores `.probe/`,
 * `node_modules`, `.env*` and `.claude/`. Three delegates each commit a file
 * and land it, then the runner writes into their clones, where the boundary
 * keeps its stand-ins under `.claude/`:
 *
 * (a) A: `.probe/frames/blob.bin`, 70 MB. Archive refuses (409) naming one
 *     ignored file of its own past the 64 MB an archive saves, and says
 *     discard archives without saving them; archive with discard succeeds
 *     with no carry, the clone gone and the row archived.
 * (b) B: a skill of the person's own, `.claude/skills/mine/SKILL.md`, and
 *     `.probe/notes.md`. Archive succeeds; its carry's `ignored/` holds both
 *     as written and none of the stand-ins.
 * (c) C: `.probe/vanish.txt` and `.probe/stays.txt`. The runner deletes
 *     `vanish.txt` as the carry's git part appears in the workspace's scratch
 *     dir: after the listing, before the copy. Archive succeeds; the carry
 *     holds `stays.txt` and not `vanish.txt`, and its README counts the two
 *     listed.
 *
 *   bun scripts/probe-kit/run.ts archive-standins
 */
import { existsSync } from "node:fs";
import { mkdir, open, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const TAG = /PROBE-ARCHIVE-([ABC])/;
const FINISH = "mcp__cawco__finish_item";
/** Past core `IGNORED_CARRY_LIMIT` (64 MB). */
const BIG_BYTES = 70e6;
/** Paths the boundary stands in for under `.claude/` (boundary-host.ts `PROTECTED`). */
const STAND_INS = [
  "settings.json",
  "settings.local.json",
  "hooks",
  "commands",
  "agents",
].map((name) => projectClaudeDir("", name));
/** The person's own skill, by its path in the clone. */
const SKILL = projectClaudeDir("", "skills", "mine", "SKILL.md");

const commitCommand = (tag: string) =>
  [
    `echo 'made by ${tag}' > landed-${tag}.txt`,
    `git add landed-${tag}.txt`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed landed-${tag}.txt.`,
      summary: `Committed landed-${tag}.txt.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
}

interface Archived {
  carry: string | null;
}

/** What every case reads and asks through. */
interface Ctx {
  check: Kit["check"];
  fleet: KitFleet;
  home: string;
}

const workspaceOf = (fleet: KitFleet, id: string) =>
  fleet.query<Workspace>(
    "SELECT id, path, state FROM workspaces WHERE id = ?",
    id
  )[0] as Workspace;

/** The archive route: its status, its words, and the carry it names. */
const archive = async (fleet: KitFleet, id: string, discard?: boolean) => {
  const response = await fetch(`${fleet.base}/api/workspaces/${id}/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(discard ? { discard: true } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  const carry =
    response.status === 200 ? (JSON.parse(text) as Archived).carry : undefined;
  return { status: response.status, text, carry };
};

const standInsIn = (clone: string) =>
  STAND_INS.filter((path) => existsSync(join(clone, path))).join(", ") ||
  "none";

const tree = async (dir: string | null | undefined) =>
  dir
    ? (await Bun.$`find ${dir}`.quiet().nothrow()).stdout.toString()
    : "no carry";

const read = (path: string) =>
  Bun.file(path)
    .text()
    .catch(() => "");

/** (a) Past the limit: refused, its words naming discard; then discarded. */
const pastLimit = async ({ check, fleet }: Ctx, w: Workspace) => {
  await mkdir(join(w.path, ".probe", "frames"), { recursive: true });
  const blob = await open(join(w.path, ".probe", "frames", "blob.bin"), "w");
  await blob.truncate(BIG_BYTES);
  await blob.close();
  const refused = await archive(fleet, w.id);
  check(
    "(a) archive refuses with 409, naming one ignored file of its own past the 64 MB an archive saves (no stand-in counted)",
    refused.status === 409 &&
      refused.text.includes("1 ignored file of its own (70 MB)") &&
      refused.text.includes("past the 64 MB an archive saves"),
    `${refused.status} ${refused.text}; stand-ins in the clone: ${standInsIn(w.path)}`
  );
  check(
    "(a) the refusal says discard archives without saving the ignored files, unlanded commits still kept",
    refused.text.includes(
      "pass discard: true to archive without saving its ignored files; unlanded commits, changes and stashes are still kept"
    ),
    refused.text
  );
  check(
    "(a) the clone still stands after the refusal",
    existsSync(w.path) && workspaceOf(fleet, w.id).state === "active",
    workspaceOf(fleet, w.id).state
  );
  const standIns = standInsIn(w.path);
  const discarded = await archive(fleet, w.id, true);
  check(
    `(a) archive with discard succeeds with no carry; the clone is gone, its row archived (stand-ins there before: ${standIns})`,
    discarded.status === 200 &&
      discarded.carry === null &&
      !existsSync(w.path) &&
      workspaceOf(fleet, w.id).state === "archived",
    `${discarded.status} ${discarded.text.slice(0, 600)}; clone ${existsSync(w.path) ? "stands" : "gone"}`
  );
};

/** (b) Small: the person's skill and notes carried, the stand-ins not. */
const smallCarry = async ({ check, fleet, home }: Ctx, w: Workspace) => {
  const skill = "---\nname: mine\ndescription: the person's own\n---\nMine.\n";
  await mkdir(dirname(join(w.path, SKILL)), { recursive: true });
  await writeFile(join(w.path, SKILL), skill);
  await mkdir(join(w.path, ".probe"), { recursive: true });
  await writeFile(join(w.path, ".probe", "notes.md"), "notes\n");
  const standIns = standInsIn(w.path);
  const small = await archive(fleet, w.id);
  const carry = small.carry ?? "";
  const ignored = join(carry, "ignored");
  check(
    `(b) archive succeeds with a carry; the clone is gone (stand-ins there before: ${standIns})`,
    small.status === 200 &&
      carry.startsWith(join(home, ".cawco", "carries", `${w.id}-`)) &&
      !existsSync(w.path) &&
      workspaceOf(fleet, w.id).state === "archived",
    `${small.status} ${small.text.slice(0, 600)}`
  );
  check(
    "(b) the carry's ignored/ holds the person's skill and notes as written",
    carry !== "" &&
      (await read(join(ignored, SKILL))) === skill &&
      (await read(join(ignored, ".probe", "notes.md"))) === "notes\n",
    await tree(carry)
  );
  check(
    "(b) none of the boundary's stand-ins is in the carry",
    carry !== "" && STAND_INS.every((path) => !existsSync(join(ignored, path))),
    await tree(carry)
  );
  const readme = carry ? await read(join(carry, "README.md")) : "";
  check(
    "(b) its README counts the two files of the person's own",
    readme.includes("2 files git ignores that its work wrote"),
    readme.slice(0, 600)
  );
};

/**
 * (c) A listed file gone before the copy. The carry's git part is written in
 * the workspace's scratch dir after the listing and before the boundary
 * closes, and moved to the carries dir; the copy of the ignored files
 * follows the close. The file goes as soon as either appears.
 */
const vanishes = async ({ check, fleet, home }: Ctx, w: Workspace) => {
  await mkdir(join(w.path, ".probe"), { recursive: true });
  await writeFile(join(w.path, ".probe", "vanish.txt"), "vanish\n");
  await writeFile(join(w.path, ".probe", "stays.txt"), "stays\n");
  const scratch = join(home, ".cawco", "tmp", w.id.slice(0, 8));
  const carries = join(home, ".cawco", "carries");
  const seen: { at?: "scratch" | "carries"; on: boolean } = { on: true };
  const watch = (async () => {
    while (seen.on) {
      // biome-ignore lint/performance/noAwaitInLoops: a poll, one look at a time
      const [inScratch, inCarries] = await Promise.all([
        readdir(scratch).catch(() => [] as string[]),
        readdir(carries).catch(() => [] as string[]),
      ]);
      if (inScratch.some((name) => name.startsWith(".cawco-carry-"))) {
        seen.at = "scratch";
      } else if (inCarries.some((name) => name.startsWith(`${w.id}-`))) {
        seen.at = "carries";
      }
      if (seen.at) {
        await rm(join(w.path, ".probe", "vanish.txt"), { force: true });
        return;
      }
      await Bun.sleep(2);
    }
  })();
  const archived = await archive(fleet, w.id);
  seen.on = false;
  await watch;
  const carry = archived.carry ?? "";
  const ignored = join(carry, "ignored");
  check(
    `(c) with vanish.txt deleted between listing and copy (as its carry appeared in ${seen.at ?? "neither place"}), archive succeeds; the clone is gone`,
    seen.at !== undefined &&
      archived.status === 200 &&
      carry !== "" &&
      !existsSync(w.path) &&
      workspaceOf(fleet, w.id).state === "archived",
    `${archived.status} ${archived.text.slice(0, 600)}`
  );
  const readme = carry ? await read(join(carry, "README.md")) : "";
  check(
    "(c) the carry holds stays.txt and not vanish.txt, and its README counts the two listed",
    (await read(join(ignored, ".probe", "stays.txt"))) === "stays\n" &&
      !existsSync(join(ignored, ".probe", "vanish.txt")) &&
      readme.includes("2 files git ignores that its work wrote"),
    `${await tree(carry)}\n${readme.slice(0, 600)}`
  );
};

const spec: Spec = {
  name: "archive-standins",
  run: async (kit: Kit) => {
    const { check } = kit;
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
    await Bun.$`sh -c ${"git init -q -b main && echo kept > README.md && printf '.probe/\\nnode_modules\\n.env*\\n.claude/\\n' > .gitignore && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Archive",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const delegate = async (tag: "A" | "B" | "C") => {
      const started = await fleet.api<{
        workItemId: string;
        workspaceId: string;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit and land ${tag}`,
        prompt: `PROBE-ARCHIVE-${tag}: commit a file.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        checks: [{ name: "Probe check", command: "true" }],
      });
      const item = await until(
        `work item ${tag} ended`,
        () =>
          fleet.query<{ state: string; error: string | null }>(
            "SELECT state, error FROM work_items WHERE id = ?",
            started.workItemId
          )[0],
        (row) =>
          row !== undefined &&
          ["done", "failed", "cancelled"].includes(row.state),
        300_000
      );
      check(
        `${tag} is done, its commit landed`,
        item.state === "done",
        `${item.state} ${item.error ?? ""}`
      );
      return workspaceOf(fleet, started.workspaceId);
    };
    const ctx: Ctx = { check, fleet, home };
    await pastLimit(ctx, await delegate("A"));
    await smallCarry(ctx, await delegate("B"));
    await vanishes(ctx, await delegate("C"));

    const enoent = (await fleet.logs("agent"))
      .split("\n")
      .filter(
        (line) => line.includes("ENOENT") && line.includes("[workspace]")
      );
    check(
      "the agent logged no ENOENT for an archive",
      enoent.length === 0,
      enoent.join(" | ")
    );
  },
};

export default spec;
