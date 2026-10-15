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
 *   bun scripts/probe-kit/run.ts skill-swap
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { FleetSyncReport } from "../../../packages/core/src/fleet";
import { MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const SKILL = "probe-py";
const NOTE = "My own notes on this skill.\n";
const EDIT = "\nA line added on this machine.\n";

interface AgentRow {
  fleet?: FleetSyncReport;
  machineId: string;
}

const spec: Spec = {
  name: "skill-swap",
  run: async (kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 10, words: ["ok"] }));

    // The source: a skill folder, served packed as the hub fetches a URL.
    const source = join(fleet.sandbox, "skill-source");
    const folder = join(source, SKILL);
    const archive = join(fleet.sandbox, `${SKILL}.tar.gz`);
    const pack = async (value: string) => {
      await rm(archive, { force: true });
      await writeFile(
        join(folder, "scripts", "helper.py"),
        `VALUE = "${value}"\n`
      );
      await Bun.$`tar -czf ${archive} -C ${source} ${SKILL}`.quiet();
    };
    await mkdir(join(folder, "scripts"), { recursive: true });
    await writeFile(
      join(folder, "SKILL.md"),
      "---\nname: probe-py\ndescription: Prints the value its helper holds.\n---\n\nRun `scripts/run.py`.\n"
    );
    await writeFile(
      join(folder, "scripts", "run.py"),
      "import helper\nprint(helper.VALUE)\n"
    );
    await pack("v1");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(Bun.file(archive)),
    });
    const url = `http://127.0.0.1:${server.port}/${SKILL}.tar.gz`;

    try {
      // The machine's copy, where a session runs the skill's script from.
      const copy = join(fleet.home, CLAUDE_DIR_NAME, "skills", SKILL);
      const run = async () => {
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
        await pack(value);
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
      fleet.launch("agent");
      await fleet.agentUp();

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
      const note = await readFile(join(copy, "notes.md"), "utf8").catch(
        () => undefined
      );
      check(
        "(b) the hand-added notes.md survives the update, word for word",
        note === NOTE,
        JSON.stringify(note)
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
    } finally {
      await server.stop(true);
    }
  },
};

export default spec;
