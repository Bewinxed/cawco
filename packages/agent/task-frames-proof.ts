/**
 * Measurement proof for the task-frame shape hypothesis behind the "plain
 * Bash renders as a subagent card" bug. Drives the real claude harness in
 * isolation — its own scratch git dir, its own session, no hub/daemon/dashboard
 * — and records every neutral frame the harness emits, then prints every
 * `system` frame whose subtype starts with `task_` as a DIAG JSON line.
 *
 * Scenarios, in order:
 *   A  one foreground Bash tool call (the bug's trigger) — M1.
 *   B  one Agent/Task subagent call, if the model reaches for it — M2's runtime
 *      half. If it does not, M2 is left measured only by the tool_use-input
 *      half (which is code-verified in frames.ts `subagentSpawn`).
 *
 * Measured result (SDK 0.3.220):
 *   A (foreground Bash): an instant `echo` emits NO task_* frames at all; a
 *      ~3s command (`sleep 3 && …`, `task_type: 'local_bash'`) emits exactly
 *      two — task_started (subagent_type ABSENT, description set) and
 *      task_notification (subagent_type ABSENT, description ABSENT, status
 *      'completed', summary == the description). So the production card came
 *      from the *slow* foreground path, and `subagent_type` is the discriminator.
 *   B (Agent tool): tool_use input carries `subagent_type: 'general-purpose'`
 *      (so `subagentSpawn` mints the branch at the tool_use); task_started /
 *      task_progress carry `subagent_type`; task_notification carries NONE
 *      (only tool_use_id + status + summary == the subagent's report), and a
 *      bare task_updated names only the task. The branch therefore exists before
 *      any task frame arrives, and task_notification is indistinguishable from a
 *      plain task's by shape alone — only branch existence tells them apart.
 *
 * Run with `bun task-frames-proof.ts`. Prints a DIAG line per task_* frame and
 * per assistant tool_use block, so the branch-creation rule can be read off the
 * wire rather than guessed.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NeutralMessage } from "@cawco/core";
import type { HarnessContext, HarnessSession } from "./src/harness";
import { claudeHarness } from "./src/harnesses/claude";

const PROOF_DIR = join(tmpdir(), "task-frames-proof");

await Bun.$`rm -rf ${PROOF_DIR}`.quiet().nothrow();
await Bun.$`mkdir -p ${PROOF_DIR}`.quiet();
await Bun.$`git -C ${PROOF_DIR} init`.quiet().nothrow();

const frames: NeutralMessage[] = [];
let session: HarnessSession | null = null;
const failures: string[] = [];

const ctx: HarnessContext = {
  instanceId: "task-frames-proof",
  cwd: PROOF_DIR,
  frame: (message) => {
    frames.push(message);
  },
  permission: (request) => {
    setTimeout(() => {
      session?.resolvePermission(request.requestId, { behavior: "allow" });
    }, 100);
  },
  busy: () => {
    // not measured by this proof
  },
  session: () => {
    // not measured by this proof
  },
  failed: (error) => {
    failures.push(`failed(): ${String(error)}`);
  },
  emit: () => {
    // not measured by this proof
  },
  closed: () => {
    // not measured by this proof
  },
};

interface TaskFrameShape {
  description?: string;
  status?: string;
  subagent_type?: string;
  subtype?: string;
  summary?: string;
  task_type?: string;
  tool_use_id?: string;
}

/** One DIAG line per task_* system frame, in the shape the branch rule reads. */
function dumpTaskFrames(label: string, from: number): number {
  let count = 0;
  for (const f of frames.slice(from)) {
    if (f.type !== "system") {
      continue;
    }
    const shape = f as unknown as TaskFrameShape;
    if (!shape.subtype?.startsWith("task_")) {
      continue;
    }
    count += 1;
    console.log(
      `DIAG ${label} task_frame: ${JSON.stringify({
        subtype: shape.subtype,
        tool_use_id: shape.tool_use_id ?? null,
        subagent_type: shape.subagent_type ?? null,
        description: shape.description ?? null,
        status: shape.status ?? null,
        task_type: shape.task_type ?? null,
        summary:
          typeof shape.summary === "string" ? shape.summary.slice(0, 80) : null,
      })}`
    );
  }
  return count;
}

/** One DIAG line per assistant tool_use block — the tool_use-input half of M2. */
function dumpToolUses(label: string, from: number): number {
  let count = 0;
  for (const f of frames.slice(from)) {
    if (f.type !== "assistant") {
      continue;
    }
    const { message } = f as unknown as { message?: { content?: unknown[] } };
    for (const block of message?.content ?? []) {
      if ((block as { type?: string }).type !== "tool_use") {
        continue;
      }
      count += 1;
      const tu = block as {
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      };
      console.log(
        `DIAG ${label} tool_use: ${JSON.stringify({
          id: tu.id ?? null,
          name: tu.name ?? null,
          subagent_type: tu.input?.subagent_type ?? null,
          description: tu.input?.description ?? null,
          command: tu.input?.command ?? null,
        })}`
      );
    }
  }
  return count;
}

function waitForResult(
  sinceIndex: number,
  timeoutMs: number
): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (frames.slice(sinceIndex).some((f) => f.type === "result")) {
        return resolve(true);
      }
      if (Date.now() - started >= timeoutMs) {
        return resolve(false);
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

const TIMEOUT = 180_000;

const spawned = await claudeHarness.spawn(
  { instanceId: "task-frames-proof", cwd: PROOF_DIR, persistSession: false },
  ctx
);
if (!spawned) {
  console.error("spawn returned no session");
  process.exit(2);
}
session = spawned;

const user = (content: string): NeutralMessage =>
  ({
    type: "user",
    message: { role: "user", content },
  }) as unknown as NeutralMessage;

// ---- A: one foreground Bash tool call (slow enough to survive the instant
// path, matching the ~3s production command) ----
{
  const start = frames.length;
  session.send(
    user(
      "Run exactly one Bash command now: `sleep 3 && echo TASK-FRAMES-PROOF-MARKER-$PWD`. " +
        "Use the Bash tool (not any other tool) and give the command a clear, specific description."
    ),
    {}
  );
  const got = await waitForResult(start, TIMEOUT);
  console.log(`DIAG A: result frame arrived = ${got}`);
  const uses = dumpToolUses("A", start);
  const tasks = dumpTaskFrames("A", start);
  console.log(`DIAG A: tool_use blocks = ${uses}, task_* frames = ${tasks}`);
  if (failures.length) {
    console.log(`DIAG A failed(): ${failures.join(" | ")}`);
  }
}

// ---- B: one Agent/Task subagent call (M2 runtime half) ----
{
  const start = frames.length;
  session.send(
    user(
      "Delegate a quick task to a subagent using the Task tool: ask it to run " +
        "`echo SUBAGENT-PROOF-MARKER` in Bash and report the output back. Then tell me " +
        "exactly what the subagent reported."
    ),
    {}
  );
  const got = await waitForResult(start, TIMEOUT);
  console.log(`DIAG B: result frame arrived = ${got}`);
  const uses = dumpToolUses("B", start);
  const tasks = dumpTaskFrames("B", start);
  console.log(`DIAG B: tool_use blocks = ${uses}, task_* frames = ${tasks}`);
  if (failures.length) {
    console.log(`DIAG B failed(): ${failures.join(" | ")}`);
  }
}

await session.stop().catch(() => {
  // best effort: the proof is done either way
});

console.log("task-frames-proof: done");
process.exit(failures.length ? 1 : 0);
