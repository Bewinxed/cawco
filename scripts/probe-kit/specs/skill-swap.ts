/**
 * A fleet skill keeps receiving updates unless someone changed a file the
 * fleet carries for it, and an update never loses a file someone added.
 *
 * Before, a skill's drift was its whole folder's hash: a skill whose script
 * ran Python made `__pycache__`, read as "edited on this machine", and took
 * no fleet update again. Now drift is the files the fleet carried
 * (`.cawco-carried.json` in the skill's tree, agent tree-swap.ts `heldHash`),
 * and an update takes every other file along into the new tree.
 *
 * A scratch hub resolves the skill from a `.tar.gz` this spec serves, as it
 * does any URL source, and a refresh re-reads it after the spec rebuilds it.
 * The skill's script imports a sibling module, so running it makes
 * `__pycache__`.
 *
 * (a) The script runs from the machine's copy and makes `__pycache__`; with
 *     that and a hand-added `notes.md` there, an unchanged sync still reads
 *     the skill applied at the hub's hash, and the next fleet update (the
 *     module's value v1 → v2) lands: the script prints v2.
 * (b) The hand-added `notes.md` is in the updated skill, word for word.
 * (c) An edit to a carried file (SKILL.md) freezes the skill: the next
 *     update (v2 → v3) is refused as edited on this machine, the script still
 *     prints v2, and the edit is still there.
 *
 * The same skill bound to a project is placed in each delegate's clone. Each
 * clone is then deleted by hand down to what CawCo placed in it (the skill's
 * link in `.claude/skills` and its tree in `.claude/.cawco-trees`), as a
 * clone deleted under its workspace leaves it, and archived:
 *
 * (d) One whose skill ran its script (`__pycache__` holding the bytecode of
 *     the carried `scripts/helper.py`) and holds nothing else archives as a
 *     husk: the agent logs "its husk", and the folder is gone with no carry.
 * (e) One that also holds a `notes.md` added in the skill keeps it as
 *     someone's. An archive without `discard` refuses any folder holding an
 *     entry of its own (hub work-items.ts `archive`: `if
 *     (!holdsNothing(held)) { throw new WorkspaceHoldsWork(held); }`): 409,
 *     "1 entry of its own in a folder that is no git clone" (the note alone,
 *     the bytecode not counted), the workspace still active, and the note on
 *     disk untouched.
 *
 *   bun scripts/probe-kit/run.ts skill-swap
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CLAUDE_DIR_NAME,
  projectClaudeRelative,
} from "../../../packages/core/src/claude-dirs";
import type { FleetSyncReport } from "../../../packages/core/src/fleet";
import { TREE_STORE_DIR } from "../../../packages/core/src/paths";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SKILL = "probe-py";
/** The same skill, bound to a project and placed in its clones. */
const PLACED = "probe-placed";
const NOTE = "My own notes on this skill.\n";
const EDIT = "\nA line added on this machine.\n";
const TAG = /PROBE-SWAP-([DE])/;
const FINISH = "mcp__cawco__finish_item";

interface AgentRow {
  fleet?: FleetSyncReport;
  machineId: string;
}

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

/** Each delegate calls finish_item; everything else answers in a word. */
const respond = (request: Seen): Reply => {
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return { everyMs: 5, words: ["ok"] };
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: "Nothing to change.",
      summary: "Nothing to change.",
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return { everyMs: 5, words: ["done"] };
};

/** The skill's script run as a session runs it, from a copy of the skill. */
const runIn = async (copy: string) => {
  const child = Bun.spawn(["python3", join(copy, "scripts", "run.py")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
};

const spec: Spec = {
  name: "skill-swap",
  run: async (kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);

    // The source: a skill folder, served packed as the hub fetches a URL.
    const source = join(fleet.sandbox, "skill-source");
    const archiveOf = (name: string) => join(fleet.sandbox, `${name}.tar.gz`);
    const pack = async (name: string, value: string) => {
      const folder = join(source, name);
      await mkdir(join(folder, "scripts"), { recursive: true });
      await writeFile(
        join(folder, "SKILL.md"),
        `---\nname: ${name}\ndescription: Prints the value its helper holds.\n---\n\nRun \`scripts/run.py\`.\n`
      );
      await writeFile(
        join(folder, "scripts", "run.py"),
        "import helper\nprint(helper.VALUE)\n"
      );
      await writeFile(
        join(folder, "scripts", "helper.py"),
        `VALUE = "${value}"\n`
      );
      await rm(archiveOf(name), { force: true });
      await Bun.$`tar -czf ${archiveOf(name)} -C ${source} ${name}`.quiet();
    };
    await pack(SKILL, "v1");
    await pack(PLACED, "v1");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        new Response(
          Bun.file(join(fleet.sandbox, new URL(request.url).pathname.slice(1)))
        ),
    });
    const urlOf = (name: string) =>
      `http://127.0.0.1:${server.port}/${name}.tar.gz`;
    const url = urlOf(SKILL);

    try {
      // The machine's copy, where a session runs the skill's script from.
      const copy = join(fleet.home, CLAUDE_DIR_NAME, "skills", SKILL);
      const run = () => runIn(copy);
      const machine = async () =>
        (await fleet.api<AgentRow[]>("/api/agents")).find(
          (row) => row.machineId === MACHINE
        );
      const hubHash = () =>
        fleet.query<{ hash: string | null }>(
          "SELECT hash FROM skills WHERE name = ?",
          SKILL
        )[0]?.hash ?? "";
      /** The machine's first report after `since` that `done` accepts. */
      const reportAfter = (
        what: string,
        since: number,
        done: (report: FleetSyncReport) => boolean
      ) =>
        until(
          what,
          async () => (await machine())?.fleet,
          (report) => report !== undefined && report.at > since && done(report),
          240_000
        ).catch(async () => (await machine())?.fleet);
      const send = async (method: string, path: string, body?: unknown) => {
        const response = await fetch(`${fleet.base}${path}`, {
          method,
          ...(body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }),
          signal: AbortSignal.timeout(120_000),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`${method} ${path}: ${response.status} ${text}`);
        }
        return text ? (JSON.parse(text) as unknown) : undefined;
      };
      /** A new version upstream, fetched again; answers the hub's new hash. */
      const update = async (value: string, previous: string) => {
        await pack(SKILL, value);
        await send("POST", `/api/fleet/skills/${SKILL}/refresh`);
        return await until(
          `the hub's hash after ${value}`,
          async () => hubHash(),
          (hash) => hash !== "" && hash !== previous,
          120_000
        );
      };

      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      // Installed: the first sync writes the skill.
      const t0 = Date.now();
      await send("PUT", `/api/fleet/skills/${SKILL}`, { source: url });
      const v1 = await until(
        "the hub carrying the skill",
        async () => hubHash(),
        (hash) => hash !== "",
        120_000
      );
      const installed = await reportAfter(
        "the skill installed",
        t0,
        (report) => report.have?.skills?.[SKILL] === v1
      );
      const first = await run();
      check(
        "the first sync writes the skill, and its script prints v1 and makes __pycache__",
        installed?.skills?.[SKILL]?.state === "applied" &&
          first.code === 0 &&
          first.out === "v1" &&
          existsSync(join(copy, "scripts", "__pycache__")),
        `${JSON.stringify(installed?.skills?.[SKILL])}; ${JSON.stringify(first)}`
      );

      // (a) __pycache__ and a hand-added note are no edit.
      await writeFile(join(copy, "notes.md"), NOTE);
      const t1 = Date.now();
      await send("PATCH", `/api/fleet/skills/${SKILL}`, { enabled: true });
      const unchanged = await reportAfter(
        "an unchanged sync",
        t1,
        (report) => report.skills?.[SKILL] !== undefined
      );
      check(
        "(a) with __pycache__ and notes.md in it, an unchanged sync reads the skill applied at the hub's hash",
        unchanged?.skills?.[SKILL]?.state === "applied" &&
          unchanged.have?.skills?.[SKILL] === v1,
        `${JSON.stringify(unchanged?.skills?.[SKILL])}, holding ${unchanged?.have?.skills?.[SKILL]?.slice(0, 7)} of ${v1.slice(0, 7)}`
      );
      const t2 = Date.now();
      const v2 = await update("v2", v1);
      const updated = await reportAfter(
        "v2 on the machine",
        t2,
        (report) => report.have?.skills?.[SKILL] === v2
      );
      const second = await run();
      check(
        "(a) the next fleet update lands: applied at the new hash, and the script prints v2",
        updated?.skills?.[SKILL]?.state === "applied" &&
          second.code === 0 &&
          second.out === "v2",
        `${JSON.stringify(updated?.skills?.[SKILL])}; ${JSON.stringify(second)}`
      );

      // (b) The note is in the new version.
      const survived = await readFile(join(copy, "notes.md"), "utf8").catch(
        () => undefined
      );
      check(
        "(b) the hand-added notes.md survives the update, word for word",
        survived === NOTE,
        JSON.stringify(survived)
      );

      // (c) An edit to a carried file freezes the skill.
      const skillMd = join(copy, "SKILL.md");
      const edited = `${await readFile(skillMd, "utf8")}${EDIT}`;
      await writeFile(skillMd, edited);
      const t3 = Date.now();
      await update("v3", v2);
      const frozen = await reportAfter(
        "the update after the edit",
        t3,
        (report) => report.skills?.[SKILL]?.state === "failed"
      );
      const third = await run();
      check(
        "(c) after SKILL.md is edited, the next update is refused as edited on this machine",
        frozen?.skills?.[SKILL]?.state === "failed" &&
          (frozen.skills[SKILL]?.detail ?? "").includes(
            "edited on this machine"
          ),
        JSON.stringify(frozen?.skills?.[SKILL])
      );
      check(
        "(c) the frozen skill keeps v2 and the edit",
        third.out === "v2" &&
          (await readFile(skillMd, "utf8").catch(() => "")) === edited,
        JSON.stringify(third)
      );

      // (d) and (e): the skill placed in a delegate's clone, the clone
      // deleted by hand down to what CawCo placed there, then archived.
      const src = join(fleet.sandbox, "src");
      await mkdir(src, { recursive: true });
      await writeFile(
        join(fleet.home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      await Bun.$`sh -c ${"git init -q -b main && echo swap > README.md && git add -A && git commit -qm 'First commit'"}`
        .cwd(src)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Swap",
        machineId: MACHINE,
        cwd: src,
      });
      await send("PUT", `/api/fleet/skills/${PLACED}`, {
        source: urlOf(PLACED),
        projectId: project.id,
      });
      const parent = await fleet.spawn("claude", "Parent", src, {
        projectId: project.id,
      });
      const deletedClone = async (tag: "D" | "E", note?: string) => {
        const started = await fleet.api<{
          workItemId: string;
          workspaceId: string;
        }>("/api/work-items", {
          parentInstanceId: parent,
          title: `End at once ${tag}`,
          prompt: `PROBE-SWAP-${tag}: call finish_item.`,
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: src,
          checks: [{ name: "Probe check", command: "true" }],
        });
        const { path } = fleet.query<{ path: string }>(
          "SELECT path FROM workspaces WHERE id = ?",
          started.workspaceId
        )[0] as { path: string };
        await until(
          `${tag}'s item ended`,
          () =>
            fleet.query<{ state: string }>(
              "SELECT state FROM work_items WHERE id = ?",
              started.workItemId
            )[0]?.state,
          (state) => ["done", "failed", "cancelled"].includes(state ?? ""),
          300_000
        );
        const placed = join(path, projectClaudeRelative("skills", PLACED));
        await until(
          `${PLACED} placed in ${tag}'s clone`,
          async () => existsSync(join(placed, "scripts", "run.py")),
          (there) => there,
          120_000
        ).catch(() => false);
        const ran = await runIn(placed);
        const bytecode = (
          await readdir(join(placed, "scripts", "__pycache__")).catch(
            () => [] as string[]
          )
        ).filter((name) => name.startsWith("helper."));
        if (note) {
          await writeFile(join(placed, "notes.md"), note);
        }
        // Deleted by hand: everything but what CawCo placed in `.claude`.
        for (const entry of await readdir(path)) {
          if (entry !== CLAUDE_DIR_NAME) {
            // biome-ignore lint/performance/noAwaitInLoops: a handful of entries
            await rm(join(path, entry), { recursive: true, force: true });
          }
        }
        for (const entry of await readdir(join(path, CLAUDE_DIR_NAME))) {
          if (entry !== "skills" && entry !== TREE_STORE_DIR) {
            // biome-ignore lint/performance/noAwaitInLoops: a handful of entries
            await rm(join(path, CLAUDE_DIR_NAME, entry), {
              recursive: true,
              force: true,
            });
          }
        }
        const response = await fetch(
          `${fleet.base}/api/workspaces/${started.workspaceId}/archive`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            signal: AbortSignal.timeout(120_000),
          }
        );
        const text = await response.text();
        const carry =
          response.status === 200
            ? (JSON.parse(text) as { carry: string | null }).carry
            : undefined;
        const line =
          (await fleet.logs("agent"))
            .split("\n")
            .find((one) =>
              one.includes(`${started.workspaceId}: archived; its `)
            ) ?? "";
        return {
          workspaceId: started.workspaceId,
          path,
          ran,
          bytecode,
          status: response.status,
          text,
          carry,
          line,
        };
      };

      const d = await deletedClone("D");
      check(
        "(d) the placed skill's script ran in D's clone and made bytecode of its carried helper.py",
        d.ran.code === 0 && d.ran.out === "v1" && d.bytecode.length > 0,
        `${JSON.stringify(d.ran)}; __pycache__: ${d.bytecode.join(", ")}`
      );
      check(
        "(d) D, holding only the placed skill and its bytecode, archives as a husk: gone, no carry",
        d.status === 200 &&
          !d.carry &&
          d.line.includes(`its husk ${d.path}`) &&
          !existsSync(d.path),
        `${d.status} ${d.text.slice(0, 300)}; ${d.line}`
      );

      const e = await deletedClone("E", NOTE);
      const keptNote = await readFile(
        join(e.path, projectClaudeRelative("skills", PLACED), "notes.md"),
        "utf8"
      ).catch(() => undefined);
      const eState = fleet.query<{ state: string }>(
        "SELECT state FROM workspaces WHERE id = ?",
        e.workspaceId
      )[0]?.state;
      check(
        "(e) E, with a notes.md added in the skill, is refused: 409, 1 entry of its own (the note; the bytecode not counted), still active",
        e.status === 409 &&
          e.text.includes(
            "1 entry of its own in a folder that is no git clone"
          ) &&
          eState === "active",
        `${e.status} ${e.text.slice(0, 300)}; state ${eState}`
      );
      check(
        "(e) the note is still on disk, untouched",
        keptNote === NOTE,
        JSON.stringify(keptNote)
      );
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
