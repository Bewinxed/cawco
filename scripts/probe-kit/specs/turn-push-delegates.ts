/**
 * A finished turn pushes to the person's phone only when its session waits
 * on them: a session whose delegate is still at work is waiting on its own
 * work (hub push.ts `turnEnded`, `ownWork`). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model) with a stand-in
 * Cawrier that keeps every push and one paired device:
 *
 * - (a) A top-level session delegates and ends its turn while its delegate
 *   runs: no turn push for it while the delegate is at work, past the
 *   push's look grace and its burst.
 * - (b) The delegate finishes and reports; the session's turn that reads
 *   the report ends with nothing of its own left: one turn push goes.
 *
 * It delegates, so its fleet cuts workspaces: it runs on the host, outside
 * every boundary. turn-push proves the background legs and a plain turn.
 *
 *   bun scripts/probe-kit/run.ts turn-push-delegates
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { atRest, notifyLines, standInPhone } from "./turn-push";

const ORCHESTRATE = "PROBE-ORCHESTRATE";
const CHILD = "PROBE-DELEGATE-CHILD";
const DELEGATE = "mcp__cawco__delegate";
const FINISH = "mcp__cawco__finish_item";
/** How a delegate's report to its parent opens (core `reportMarker`). */
const REPORT = "[Report from delegate ";
/** How long the delegate works before it finishes: past the quiet window. */
const WORK_SECONDS = 50;
/** The hub's look grace, its burst's quiet, and room (turn-push's `QUIET_WATCH_MS`). */
const QUIET_WATCH_MS = 25_000;
const PUSH_WAIT_MS = 60_000;

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

let repo = "";
let delegated = false;
let worked = false;
let finished = false;

/**
 * The orchestrator delegates once, then answers "ok"; the delegate works a
 * while (a foreground command), then finishes its item.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CHILD)) {
    if (!worked) {
      worked = true;
      return useTool("Bash", {
        command: `sleep ${WORK_SECONDS} && echo PROBE-WORKED`,
        description: "The delegate's work",
        timeout: 600_000,
      });
    }
    if (!finished) {
      const reply = found(request, FINISH, {
        headline: "Done.",
        summary: "Done.",
      });
      if (reply.tool?.name === FINISH) {
        finished = true;
      }
      return reply;
    }
    return text("Done.");
  }
  if (request.all.includes(ORCHESTRATE) && !delegated) {
    const reply = found(request, DELEGATE, {
      title: "Turn push probe",
      prompt: `${CHILD}: work a while, then finish your item.`,
      cwd: repo,
      lands: "none",
    });
    if (reply.tool?.name === DELEGATE) {
      delegated = true;
    }
    return reply;
  }
  return text("ok");
};

const spec: Spec = {
  name: "turn-push-delegates",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(respond);
    const device = standInPhone(fleet);
    try {
      const home = fleet.env.HOME as string;
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      await device.pair();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      repo = join(fleet.sandbox, "src");
      await mkdir(repo, { recursive: true });
      await writeFile(
        join(home, ".gitconfig"),
        "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
      );
      await Bun.$`sh -c ${"git init -q -b main && echo turn-push > README.md && git add -A && git commit -qm 'First commit'"}`
        .cwd(repo)
        .env({ ...process.env, HOME: home })
        .quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "Turn push",
        machineId: MACHINE,
        cwd: repo,
      });
      const orch = await fleet.spawn("claude", "Orchestrator", repo, {
        projectId: project.id,
      });
      const then = await fleet.logMark("hub");
      await fleet.send(orch, `${ORCHESTRATE}: delegate the work.`);
      const item = await until(
        "the delegate's item live",
        () =>
          fleet.query<{ id: string; state: string }>(
            "SELECT id, state FROM work_items WHERE parent_instance_id = ?",
            orch
          )[0],
        (row) => row?.state === "running",
        180_000
      );
      await atRest(fleet, orch);
      await Bun.sleep(QUIET_WATCH_MS);
      const [during] = fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        item.id
      );
      const quietPushes = await device.turns(orch);
      kit.check(
        "(a) a top-level session that delegated ended its turn while its delegate ran, and no turn push went",
        quietPushes === 0 && during?.state === "running",
        `${quietPushes} turn push(es) in ${QUIET_WATCH_MS / 1000} s after its turn ended, the item ${during?.state}; hub: ${await notifyLines(orch, then)}`
      );
      await until(
        "the delegate's item done",
        () =>
          fleet.query<{ state: string }>(
            "SELECT state FROM work_items WHERE id = ?",
            item.id
          )[0]?.state,
        (state) => state === "done",
        WORK_SECONDS * 1000 + 180_000
      );
      await until(
        "the orchestrator's turn on the report",
        () =>
          fleet.seen.some(
            (one) =>
              one.tools &&
              one.all.includes(ORCHESTRATE) &&
              one.all.includes(REPORT)
          ) || null,
        Boolean,
        120_000
      );
      await atRest(fleet, orch);
      const pushes = await until(
        "the push after the report's turn",
        () => device.turns(orch),
        (count) => count > 0,
        PUSH_WAIT_MS
      ).catch(() => device.turns(orch));
      kit.check(
        "(b) once its delegate reported, the turn that read the report ended with nothing left and pushed once",
        pushes === 1,
        `${pushes} turn push(es); hub: ${await notifyLines(orch, then)}`
      );
      kit.note(`every push the phone took: ${device.ids().join(", ")}`);
    } finally {
      await device.stop();
    }
  },
};

export default spec;
