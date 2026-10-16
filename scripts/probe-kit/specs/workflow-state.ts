/**
 * A workflow run's state lives in rows (db `workflow_run_slots`,
 * `workflow_run_notes`, `workflow_runs.ending_*`), and the engine reads and
 * writes it through them.
 *
 * A scratch fleet's hub and agent. One program sets a state slot, updates
 * it, reads it back, sleeps while the owner steers a note in, and returns
 * what it read and the notes it took. Another sleeps and is cancelled.
 *
 * (a) The first run ends done with the slot's value and the note.
 * (b) Its view's `state` is its slot; the slot's row holds the value and no
 *     note is left to take twice.
 * (c) The cancelled run ends cancelled, its stop over: no ending left on
 *     its row.
 *
 *   bun scripts/probe-kit/run.ts workflow-state
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const NOTE = "probe note from the owner";

const STATE_PROGRAM = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  const count = w.state("count", z.number());
  await count.set(1);
  await count.update((current) => (current as number) + 1);
  const seen = await count.get();
  await w.sleep(6000);
  const notes = await w.notes();
  return { seen, notes };
}
`;

const SLEEP_PROGRAM = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  await w.sleep(600000);
  return "slept";
}
`;

interface RunView {
  result: unknown;
  state: Record<string, unknown>;
  status: string;
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    const place = join(fleet.sandbox, "workflow-place");
    await mkdir(place, { recursive: true });
    await writeFile(join(place, "README.md"), "# Workflow probe\n");
    const launch = async (name: string, program: string) => {
      const workflow = await fleet.api<{ id: string }>("/api/workflows", {
        name,
        program,
      });
      const { runId } = await fleet.api<{ runId: string }>(
        `/api/workflows/${workflow.id}/runs`,
        { workspace: { path: place, machineId: MACHINE } }
      );
      return runId;
    };
    const view = (runId: string) =>
      fleet.api<RunView>(`/api/workflow-runs/${runId}`);
    const ended = (runId: string, label: string) =>
      until(
        label,
        () => view(runId),
        (one) => !["running", "waiting"].includes(one.status),
        120_000
      );

    // (a) a slot set, updated and read, and a note steered in.
    const stateRun = await launch("State probe", STATE_PROGRAM);
    await until(
      "the slot's first value",
      () =>
        fleet.query<{ value: string | null }>(
          "SELECT value FROM workflow_run_slots WHERE run_id = ? AND name = 'count'",
          stateRun
        )[0]?.value,
      (value) => value === "2",
      60_000
    );
    const steered = await fetch(
      `${fleet.base}/api/workflow-runs/${stateRun}/steer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: { type: "note", text: NOTE } }),
      }
    );
    const done = await ended(stateRun, "the state run to end");
    const result = done.result as { notes?: string[]; seen?: number } | null;
    kit.check(
      "a: the run ends done with the slot's value and the steered note",
      steered.ok &&
        done.status === "done" &&
        result?.seen === 2 &&
        JSON.stringify(result.notes) === JSON.stringify([NOTE]),
      `steer ${steered.status}; ${done.status} ${JSON.stringify(done.result)}`
    );

    // (b) the view's state is its slot; the rows hold it, no note is left.
    const slots = fleet.query<{ name: string; value: string | null }>(
      "SELECT name, value FROM workflow_run_slots WHERE run_id = ?",
      stateRun
    );
    const notesLeft = fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM workflow_run_notes WHERE run_id = ?",
      stateRun
    )[0]?.n;
    kit.check(
      "b: the view's state is the slot, its row holds 2, no note is left",
      JSON.stringify(done.state) === JSON.stringify({ count: 2 }) &&
        slots.length === 1 &&
        slots[0]?.value === "2" &&
        notesLeft === 0,
      `state ${JSON.stringify(done.state)}; rows ${JSON.stringify(slots)}; notes left ${notesLeft}`
    );

    // (c) a run cancelled mid-sleep ends cancelled, its stop over.
    const sleepRun = await launch("Cancel probe", SLEEP_PROGRAM);
    await until(
      "the sleeping run to be under way",
      () => view(sleepRun),
      (one) => one.status === "running" || one.status === "waiting",
      60_000
    );
    const cancelled = await fetch(
      `${fleet.base}/api/workflow-runs/${sleepRun}/cancel`,
      { method: "POST" }
    );
    const stopped = await ended(sleepRun, "the cancelled run to end");
    const [row] = fleet.query<{
      ending_status: string | null;
      pending: number;
    }>(
      "SELECT ending_status, (SELECT count(*) FROM workflow_run_pending_ends WHERE run_id = workflow_runs.id) AS pending FROM workflow_runs WHERE id = ?",
      sleepRun
    );
    kit.check(
      "c: the cancelled run ends cancelled, no ending left on its row",
      cancelled.ok &&
        stopped.status === "cancelled" &&
        row?.ending_status === null &&
        row.pending === 0,
      `cancel ${cancelled.status}; ${stopped.status}; row ${JSON.stringify(row)}`
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "workflow-state", run } satisfies Spec;
