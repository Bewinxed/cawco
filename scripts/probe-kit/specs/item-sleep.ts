/**
 * A work item is `running` only while something works on it or legitimately
 * waits: one whose session lost its process without a turn ending is woken,
 * or ends `failed` with why (hub work-items.ts `wakeAsleep`). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model).
 *
 * Five delegates of one parent, each in its own workspace:
 *
 * - W is in a long Bash when its process is killed through the keeper, its
 *   open turn not on record (as obelisk's OpenCode item f3fca633 had none:
 *   `turn_ended_at` and `last_request_at` NULL), so nothing hands a turn
 *   back and its row is filed asleep. The sweep wakes it with "Your work
 *   item is still open: continue it", the hub's log says so, and it calls
 *   finish_item: its item ends `done`.
 * - F the same, and its conversation deleted once asleep: the wake's resume
 *   finds it gone, and its item ends `failed` with Claude Code's
 *   conversation-gone reason; its parent gets that report.
 * - A declares a wait (wait_item, 30 minutes) and is put to sleep at rest:
 *   left alone through two sweeps, running, its wait standing, no wake sent.
 * - I is interrupted by its parent (`interrupt_delegate`, the fleet's
 *   pause) mid-turn and put to sleep at rest: left alone the same way.
 *
 * Then F's workspace, its item over and nothing of its own in it, retires on
 * its own (hub work-items.ts `settle`).
 *
 * - C is in a long Bash, its open turn on record (`turn_open_at`), when the
 *   agent and the hub stop; its process is killed through the keeper while
 *   nothing is there to hear it, and its row set back past the register's
 *   restore horizon (server.ts `RESTORE_HORIZON_MS`), as a restart's cut
 *   turn no restore reaches. Both start again: the register files it asleep
 *   and restores nothing for it, and the sweep (no longer a register-time
 *   settle of its own) wakes it once; it calls finish_item and ends `done`.
 *
 *   bun scripts/probe-kit/run.ts item-sleep
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = /PROBE-SLEEP-([WFAIC])/;
/** A /proc entry that is a process. */
const PID = /^\d+$/;
const FINISH = "mcp__cawco__finish_item";
const WAIT = "mcp__cawco__wait_item";
/** The sweep's wake (work-items.ts `STILL_OPEN`). */
const STILL_OPEN = "Your work item is still open: continue it.";
/** Claude Code's conversation gone (core `CLAUDE_CONVERSATION_GONE`), its opening words. */
const CONVERSATION_GONE = "This Claude Code conversation is gone";
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
/** The hub's sweep period (work-items.ts `BUDGET_SWEEP_MS`), and two of them with room. */
const SWEEP_MS = 30_000;
const TWO_SWEEPS_MS = 2 * SWEEP_MS + 10_000;
/** Past the register's restore horizon (server.ts `RESTORE_HORIZON_MS`, 30 minutes). */
const PAST_RESTORE_MS = 2 * 3_600_000;

/** The Bash a delegate is in when its process is stopped: named, so /proc finds it. */
const longRun = (tag: string) => `echo RUNNING-${tag} && sleep 600`;

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

const played: Record<string, { ran?: boolean; done?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  played[tag] ??= {};
  const step = played[tag];
  if (step.done) {
    return text("ok");
  }
  if (tag === "A") {
    const reply = found(request, WAIT, {
      minutes: 30,
      reason: "PROBE A waits on purpose",
    });
    if (reply.tool?.name === WAIT) {
      step.done = true;
    }
    return reply;
  }
  // Woken by the sweep: finish the item.
  if (request.all.includes(STILL_OPEN)) {
    const headline = `${tag} carried on after the wake.`;
    const reply = found(request, FINISH, { headline, summary: headline });
    if (reply.tool?.name === FINISH) {
      step.done = true;
    }
    return reply;
  }
  if (!step.ran) {
    step.ran = true;
    return useTool("Bash", {
      command: longRun(tag),
      description: "Run long",
      timeout: 600_000,
    });
  }
  return text("ok");
};

/** Whether a process whose command line names `marker` runs on this host. */
const running = async (marker: string): Promise<boolean> => {
  for (const entry of await readdir("/proc")) {
    if (!PID.test(entry)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
    const line = await Bun.file(`/proc/${entry}/cmdline`)
      .text()
      .catch(() => "");
    if (line.includes(marker) && line.includes("sleep 600")) {
      return true;
    }
  }
  return false;
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

interface ItemRow {
  error: string | null;
  state: string;
  wait_until: number | null;
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** What every phase reads: the fleet, the parent, the five delegates. */
interface Probe {
  a: Started;
  c: Started;
  check: Kit["check"];
  f: Started;
  fleet: Fleet;
  home: string;
  i: Started;
  parent: string;
  w: Started;
}

const itemOf = (fleet: Fleet, id: string): ItemRow => {
  const [row] = fleet.query<ItemRow>(
    "SELECT state, error, wait_until FROM work_items WHERE id = ?",
    id
  );
  return row as ItemRow;
};
const statusOf = (fleet: Fleet, instanceId: string): string =>
  fleet.instance(instanceId)?.status ?? "gone";
/** How many of the sweep's wakes were sent to a session. */
const wakesTo = (fleet: Fleet, instanceId: string): number => {
  const [row] = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
    instanceId,
    `%${STILL_OPEN}%`
  );
  return row?.n ?? 0;
};
/** An item's end, or how it stands when it has not ended in `ms`. */
const ended = (fleet: Fleet, id: string, label: string, ms: number) =>
  until(
    label,
    () => itemOf(fleet, id),
    (row) => row.state !== "running" && row.state !== "starting",
    ms
  ).catch(() => itemOf(fleet, id));

/** The fleet up, a repository, a project, and its parent session running. */
const setUp = async (
  kit: Kit
): Promise<{ fleet: Fleet; home: string; parent: string; src: string }> => {
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
  await Bun.$`mkdir -p ${src}`;
  await Bun.write(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo sleep > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Sleep",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, home, parent, src };
};

/** Each delegate in its place: W, F, I and C in their long Bash, A waiting at rest. */
const placed = async ({ fleet, a }: Probe): Promise<void> => {
  for (const tag of ["W", "F", "I", "C"]) {
    // biome-ignore lint/performance/noAwaitInLoops: four delegates, each found once
    await until(
      `${tag}'s long Bash running`,
      () => running(`RUNNING-${tag}`),
      Boolean,
      180_000
    );
  }
  await until(
    "A's wait declared and its turn ended",
    () => ({
      row: itemOf(fleet, a.workItemId),
      at: fleet.query<{ t: number | null }>(
        "SELECT turn_ended_at AS t FROM instances WHERE id = ?",
        a.instanceId
      )[0]?.t,
    }),
    ({ row, at }) => row.wait_until !== null && !!at,
    180_000
  );
};

/** I: its parent interrupts it, the fleet's pause, and its turn stops. */
const interruptI = async ({ check, fleet, i, parent }: Probe) => {
  const credential = (
    await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text()
  )
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length);
  const interrupted = await fetch(
    `${fleet.base}/api/delegation/call/${parent}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${credential ?? ""}`,
      },
      body: JSON.stringify({
        name: "interrupt_delegate",
        arguments: { target: i.instanceId },
      }),
    }
  );
  check(
    "I: its parent's interrupt_delegate is taken",
    interrupted.ok,
    `${interrupted.status} ${await interrupted.text()}`
  );
  await until(
    "I's interrupted turn over",
    () => running("RUNNING-I"),
    (still) => !still,
    60_000
  );
};

/**
 * W and F: each process killed through the keeper with no turn on record, so
 * the hub files it asleep and hands nothing back; then F's conversation is
 * deleted wherever its account keeps it, before any wake.
 */
const killWF = async ({ check, fleet, home, w, f }: Probe) => {
  for (const [tag, run] of [
    ["W", w],
    ["F", f],
  ] as const) {
    fleet.write(
      "UPDATE instances SET turn_open_at = NULL WHERE id = ?",
      run.instanceId
    );
    // biome-ignore lint/performance/noAwaitInLoops: two processes, one at a time
    const pid = await fleet.sessionPid(run.instanceId);
    check(`${tag}: the keeper runs its process`, pid !== undefined);
    if (pid !== undefined) {
      await fleet.killTree(pid, "SIGKILL");
    }
  }
  await until(
    "W and F asleep",
    () => [statusOf(fleet, w.instanceId), statusOf(fleet, f.instanceId)],
    (both) => both.every((one) => one === "sleeping"),
    60_000
  );
  const [row] = fleet.query<{ s: string | null }>(
    "SELECT session_id AS s FROM instances WHERE id = ?",
    f.instanceId
  );
  const session = row?.s;
  const transcripts = session
    ? await Array.fromAsync(
        new Bun.Glob(`**/${session}.jsonl`).scan({
          cwd: home,
          dot: true,
          absolute: true,
        })
      )
    : [];
  for (const path of transcripts) {
    // biome-ignore lint/performance/noAwaitInLoops: a file or two
    await rm(path, { force: true });
  }
  check(
    "F: its conversation found and deleted while asleep",
    transcripts.length > 0,
    `${session ?? "no session id"}: ${transcripts.join(", ") || "none found"}`
  );
};

/** A and I put to sleep at rest, by the sleep control a dashboard sends. */
const sleepAI = async ({ fleet, a, i }: Probe) => {
  for (const [tag, run] of [
    ["A", a],
    ["I", i],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: two sessions, each until asleep
    await until(
      `${tag} asleep`,
      async () => {
        if (statusOf(fleet, run.instanceId) !== "sleeping") {
          await fleet.control(run.instanceId, "sleep");
        }
        return statusOf(fleet, run.instanceId);
      },
      (now) => now === "sleeping",
      120_000
    );
  }
};

/** W woken by the sweep and done; F failed with its conversation gone, its parent told. */
const outcomes = async ({ check, fleet, w, f, parent }: Probe) => {
  const wEnd = await ended(fleet, w.workItemId, "W's item ended", 240_000);
  const hubLog = await fleet.logs("hub");
  check(
    "W: the sweep woke its session once, and the hub's log says so",
    hubLog.includes(
      `[work-items] ${w.workItemId}: its session ${w.instanceId} was asleep with the item open; woke it`
    ) && wakesTo(fleet, w.instanceId) === 1,
    `${wakesTo(fleet, w.instanceId)} wake(s) sent`
  );
  check(
    "W: woken, it carried on and its item ended done",
    wEnd.state === "done",
    `${wEnd.state} ${wEnd.error ?? ""}`
  );
  const fEnd = await ended(fleet, f.workItemId, "F's item ended", 240_000);
  check(
    "F: its item ended failed with the conversation-gone reason",
    fEnd.state === "failed" && !!fEnd.error?.includes(CONVERSATION_GONE),
    `${fEnd.state} ${fEnd.error ?? ""}`
  );
  const reports = await until(
    "F's failure reported to its parent",
    () =>
      fleet.query<{ payload: string }>(
        "SELECT payload FROM delegate_events WHERE instance_id = ? AND parent_instance_id = ? AND kind = 'report'",
        f.instanceId,
        parent
      ),
    (rows) => rows.some((one) => one.payload.includes(CONVERSATION_GONE)),
    60_000
  ).catch(() => []);
  check(
    "F: its parent got the report, with the reason",
    reports.length > 0,
    `${reports.length} report(s)`
  );
};

/** A and I left alone through two sweeps since they went to sleep. */
const holdsStand = async ({ check, fleet, a, i }: Probe, asleepAt: number) => {
  const left = TWO_SWEEPS_MS - (Date.now() - asleepAt);
  if (left > 0) {
    await Bun.sleep(left);
  }
  const aNow = itemOf(fleet, a.workItemId);
  check(
    "A: its declared wait leaves it alone through two sweeps: running, its wait standing, asleep, no wake sent",
    aNow.state === "running" &&
      aNow.wait_until !== null &&
      statusOf(fleet, a.instanceId) === "sleeping" &&
      wakesTo(fleet, a.instanceId) === 0,
    `${aNow.state}, wait ${aNow.wait_until}, ${statusOf(fleet, a.instanceId)}, ${wakesTo(fleet, a.instanceId)} wake(s)`
  );
  const iNow = itemOf(fleet, i.workItemId);
  check(
    "I: its parent's interrupt leaves it alone through two sweeps: running, asleep, no wake sent",
    iNow.state === "running" &&
      statusOf(fleet, i.instanceId) === "sleeping" &&
      wakesTo(fleet, i.instanceId) === 0,
    `${iNow.state} ${iNow.error ?? ""}, ${statusOf(fleet, i.instanceId)}, ${wakesTo(fleet, i.instanceId)} wake(s)`
  );
};

/**
 * F's item over, its workspace holding nothing of its own (no commit, no
 * change), retires on its own once nothing holds it (hub work-items.ts
 * `settle`).
 */
const retireF = async ({ check, fleet, f }: Probe) => {
  const stateOf = () =>
    fleet.query<{ state: string }>(
      "SELECT state FROM workspaces WHERE id = ?",
      f.workspaceId
    )[0]?.state;
  const state = await until(
    "F's workspace retired",
    stateOf,
    (now) => now === "archived",
    SETTLE_MS
  ).catch(stateOf);
  check(
    "F's workspace retires on its own once its item is over: its row archived",
    state === "archived",
    `F's workspace ${state}`
  );
};

/**
 * C: a restart's cut turn that no restore reaches. Its open turn on record,
 * the agent and the hub stop, its process is killed through the keeper with
 * nobody to hear it, and its row is set back past the restore horizon; both
 * start again, and the sweep wakes it once, and it ends done.
 */
const restartC = async ({ check, fleet, c }: Probe) => {
  const [open] = fleet.query<{ t: number | null }>(
    "SELECT turn_open_at AS t FROM instances WHERE id = ?",
    c.instanceId
  );
  check(
    "C: its open turn is on record before the restart",
    open?.t !== null && open?.t !== undefined,
    `turn_open_at ${open?.t}`
  );
  await fleet.stop("agent");
  await fleet.stop("hub");
  const pid = await fleet.sessionPid(c.instanceId);
  check("C: the keeper runs its process", pid !== undefined);
  if (pid !== undefined) {
    await fleet.killTree(pid, "SIGKILL");
  }
  await until(
    "C's long Bash gone",
    () => running("RUNNING-C"),
    (still) => !still,
    30_000
  );
  fleet.write(
    "UPDATE instances SET updated_at = ? WHERE id = ?",
    Date.now() - PAST_RESTORE_MS,
    c.instanceId
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const cEnd = await ended(fleet, c.workItemId, "C's item ended", 240_000);
  const hubLog = await fleet.logs("hub");
  check(
    "C: after the restart the sweep woke its session once, and the hub's log says so",
    hubLog.includes(
      `[work-items] ${c.workItemId}: its session ${c.instanceId} was asleep with the item open; woke it`
    ) && wakesTo(fleet, c.instanceId) === 1,
    `${wakesTo(fleet, c.instanceId)} wake(s) sent`
  );
  check(
    "C: woken, it carried on and its item ended done",
    cEnd.state === "done",
    `${cEnd.state} ${cEnd.error ?? ""}`
  );
};

const spec: Spec = {
  name: "item-sleep",
  run: async (kit: Kit) => {
    const { fleet, home, parent, src } = await setUp(kit);
    const delegate = (tag: "W" | "F" | "A" | "I" | "C") =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: `Sleep probe ${tag}`,
        prompt: `PROBE-SLEEP-${tag}: do the work.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        lands: "none",
      });
    const probe: Probe = {
      check: kit.check,
      fleet,
      home,
      parent,
      w: await delegate("W"),
      f: await delegate("F"),
      a: await delegate("A"),
      i: await delegate("I"),
      c: await delegate("C"),
    };
    await placed(probe);
    await interruptI(probe);
    await killWF(probe);
    await sleepAI(probe);
    const asleepAt = Date.now();
    await outcomes(probe);
    await holdsStand(probe, asleepAt);
    await retireF(probe);
    await restartC(probe);
  },
};

export default spec;
