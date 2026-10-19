/**
 * A machine's link to the hub stays up while it makes workspaces and their
 * items finish under load (agent daemon.ts, the link's deadline; core
 * wire.ts, the outbox's stall clock). On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model). This spec delegates, so
 * its fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * The load is the one that dropped obelisk's link on 2026-10-19: a conductor
 * delegating lanes at once, each with 14 inputs. Every input crosses the
 * machine's link twice, read up from the parent's machine and written down
 * into the lane's workspace (agent inputs.ts), here about 48 MiB of
 * incompressible files per lane, base64 on the wire, so the link carries
 * well over 15 s of sending in each direction while the lanes start.
 *
 * - Every delegate call is answered: each lane's workspace is made, none
 *   fails as "The machine disconnected during this request".
 * - Every lane reads its 14 inputs and calls finish_item; every item is done.
 * - The agent never drops its link: no "hub link silent", no close for
 *   falling behind ("fell behind", "not reading"), one register all run.
 *
 *   bun scripts/probe-kit/run.ts link-under-load
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-LINK-LOAD";
const FINISH = "mcp__cawco__finish_item";
/** Lanes delegated at once. Our choice: a conductor's burst, as on obelisk. */
const LANES = 16;
/** Inputs per lane, as each of obelisk's lanes was handed. */
const INPUTS = 14;
/** Bytes per input: 14 of them come to about 48 MiB, under the 64 MiB a delegation carries. */
const INPUT_BYTES = Math.floor((48 * 1024 * 1024) / INPUTS / 4) * 3;
/** How each lane's brief names it, and nothing else does. */
const LANE = new RegExp(`${TAG} lane-(\\d+): count your inputs`);
/** What a dropped link leaves in the agent's log. */
const DROPS = ["hub link silent", "fell behind", "not reading"];
const DISCONNECTED = "The machine disconnected during this request";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Where each lane is: 0 counts its inputs, 1 finishes, 2 is done. */
const stages = new Map<string, number>();

/**
 * A lane counts its inputs, loads finish_item and calls it; the parent and
 * every later turn answer "ok".
 */
const respond = (request: Seen): Reply => {
  const lane = request.tools ? LANE.exec(request.all)?.[1] : undefined;
  if (lane === undefined) {
    return text("ok");
  }
  const stage = stages.get(lane) ?? 0;
  if (stage === 0) {
    stages.set(lane, 1);
    return useTool("Bash", {
      command: 'ls "$TMPDIR/inputs" | wc -l',
      description: "Count the inputs",
    });
  }
  if (stage === 1) {
    if (!request.toolNames.includes(FINISH)) {
      return request.toolNames.includes("ToolSearch")
        ? useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 })
        : text(`${FINISH} is not offered`);
    }
    stages.set(lane, 2);
    const headline = `Lane ${lane} counted its inputs.`;
    return useTool(FINISH, {
      headline,
      summary: `${headline}\n\n\`ls "$TMPDIR/inputs" | wc -l\` listed them.`,
    });
  }
  return text("ok");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

/** The fleet up, a repository in a project, and its parent session running. */
const setUp = async (
  kit: Kit
): Promise<{ fleet: Fleet; parent: string; src: string }> => {
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
  await Bun.$`sh -c ${"git init -q -b main && echo load > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Link under load",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, parent, src };
};

/** Each lane's inputs: random bytes as base64 text, which no deflate shrinks. */
const writeInputs = async (dir: string): Promise<string[][]> => {
  await mkdir(dir, { recursive: true });
  const lanes: string[][] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const paths: string[] = [];
    for (let input = 0; input < INPUTS; input += 1) {
      const path = join(dir, `lane-${lane}-input-${input}.txt`);
      // biome-ignore lint/performance/noAwaitInLoops: one file at a time, each a few MiB
      await writeFile(path, randomBytes(INPUT_BYTES).toString("base64"));
      paths.push(path);
    }
    lanes.push(paths);
  }
  return lanes;
};

const count = (log: string, needle: string): number =>
  log.split(needle).length - 1;

const spec: Spec = {
  name: "link-under-load",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    const { fleet, parent, src } = await setUp(kit);
    const registersBefore = count(await fleet.logs("agent"), "registered with");
    const inputs = await writeInputs(join(fleet.sandbox, "parent-files"));

    const startedAt = Date.now();
    const calls = await Promise.allSettled(
      inputs.map((paths, lane) =>
        fleet.api<Started>("/api/work-items", {
          parentInstanceId: parent,
          title: `Link load ${lane}`,
          prompt: `${TAG} lane-${lane}: count your inputs, then finish.`,
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: src,
          lands: "none",
          inputs: paths,
        })
      )
    );
    const refused = calls.flatMap((call, lane) =>
      call.status === "rejected" ? [`lane ${lane}: ${String(call.reason)}`] : []
    );
    check(
      `all ${LANES} delegate calls, each with ${INPUTS} inputs, are answered with a workspace`,
      refused.length === 0,
      `${Math.round((Date.now() - startedAt) / 1000)} s; ${refused.join(" | ").slice(0, 1200)}`
    );
    const started = calls.flatMap((call) =>
      call.status === "fulfilled" ? [call.value] : []
    );

    const ended = await until(
      "every lane's item ended",
      () => {
        const rows = started.map(
          (one) =>
            fleet.query<{ state: string; result: string | null }>(
              "SELECT state, result FROM work_items WHERE id = ?",
              one.workItemId
            )[0]
        );
        return rows.every(
          (row) => row && ["done", "failed", "cancelled"].includes(row.state)
        )
          ? rows
          : undefined;
      },
      Boolean,
      600_000
    ).catch(() => undefined);
    const notDone = (ended ?? []).flatMap((row, lane) =>
      row?.state === "done"
        ? []
        : [`lane ${lane}: ${row?.state} ${(row?.result ?? "").slice(0, 200)}`]
    );
    check(
      "every lane reads its inputs and finishes, and every item is done",
      ended !== undefined && notDone.length === 0,
      ended === undefined
        ? "not every item ended within 10 minutes"
        : notDone.join(" | ").slice(0, 1200)
    );
    const counted = fleet.seen.filter(
      (one) =>
        one.afterTool &&
        LANE.test(one.all) &&
        new RegExp(`\\b${INPUTS}\\b`).test(one.last)
    );
    check(
      `each lane's Bash listed its ${INPUTS} inputs`,
      new Set(counted.map((one) => LANE.exec(one.all)?.[1])).size ===
        started.length,
      `${new Set(counted.map((one) => LANE.exec(one.all)?.[1])).size} of ${started.length}`
    );

    const agentLog = await fleet.logs("agent");
    const hubLog = await fleet.logs("hub");
    const drops = agentLog
      .split("\n")
      .filter((line) => DROPS.some((drop) => line.includes(drop)));
    check(
      "the agent never drops its link to the hub",
      drops.length === 0,
      drops.slice(0, 5).join(" | ")
    );
    const registers = count(agentLog, "registered with") - registersBefore;
    check(
      "the agent registers no more after the load began",
      registers === 0,
      `${registers} register(s) during the load`
    );
    check(
      `no request to the machine failed as "${DISCONNECTED}"`,
      !(hubLog.includes(DISCONNECTED) || agentLog.includes(DISCONNECTED)),
      `${count(hubLog, DISCONNECTED)} in the hub's log`
    );
  },
};

export default spec;
