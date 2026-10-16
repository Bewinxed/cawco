/**
 * The fleet the surfaces are measured on, stood up once in a scratch fleet
 * and recorded onto the hub tape (hub-tape.ts): `style-snapshot --record`.
 * Nothing here runs when a snapshot is taken; the tape answers for it.
 *
 * One machine (the scratch fleet's), its signed-in Claude account, and:
 *  - "Fix tray chip overflow": a finished turn, a tool group (TodoWrite,
 *    Bash, Read, Write, Grep), a subagent it ran (Task), and a reply with
 *    every markdown block the transcript draws (heading, list, code, table,
 *    quote, link);
 *  - "Pick the chip's wrap": parked on an AskUserQuestion card;
 *  - "Approve the deploy push": parked on a Bash permission;
 *  - "Lay out the chip wraps": an artifact page it made;
 *  - "Name the hang card's states": a question it asked, answered;
 *  - the project "cawco": tasks and a routine;
 *  - a workflow and one finished run of it.
 * The mock model plays a script per message: the message carries
 * `PROBE-STEP:<name>`, and each request after it takes the plan's next step
 * by the tool results the conversation holds since (artifacts.ts's shape).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { Reply, Seen } from "../../scratch-fleet";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet } from "../kit";

const DAY = 24 * 60 * 60 * 1000;
/** A workflow that sets one slot and returns: its run ends at once. */
const WORKFLOW = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  const count = w.state("count", z.number());
  await count.set(3);
  return { chips: await count.get() };
}
`;
const STEP = /PROBE-STEP:([a-z-]+)/g;

type Step = { tool: { input: object; name: string } } | { words: string };

/** The markdown a reply draws: one of each block the transcript renders. */
const REPLY = `## What overflows

The tray's chips take their label's whole width, so a long branch name pushes the last chip out of the tray.

- The chip row is a flex row with no wrap.
- Each chip's label has no \`min-width: 0\`, so it never shrinks.
- The count badge sits after the label and is cut first.

1. Let the label shrink: \`min-inline-size: 0\` on the label.
2. Clip it with an ellipsis.
3. Keep the badge whole.

\`\`\`css
.chip .label {
  min-inline-size: 0;
  overflow: clip;
  text-overflow: ellipsis;
}
\`\`\`

| Chip | Before | After |
| --- | --- | --- |
| feature/tray-chips | 212px | 160px |
| main | 64px | 64px |

> The badge never shrinks: it is the one number the row is for.

See [the tray spec](https://example.test/tray) for the measurements.`;

/** Each message's plan, by its marker. */
const plans = (repo: string): Record<string, Step[]> => ({
  chips: [
    {
      tool: {
        name: "TodoWrite",
        input: {
          todos: [
            {
              content: "Read the tray's chip row",
              status: "completed",
              activeForm: "Reading the tray's chip row",
            },
            {
              content: "Let the label shrink",
              status: "in_progress",
              activeForm: "Letting the label shrink",
            },
            {
              content: "Keep the badge whole",
              status: "pending",
              activeForm: "Keeping the badge whole",
            },
          ],
        },
      },
    },
    {
      tool: {
        name: "Bash",
        input: { command: "ls -la", description: "List the repository" },
      },
    },
    {
      tool: {
        name: "Read",
        input: { file_path: join(repo, "README.md") },
      },
    },
    {
      tool: {
        name: "Write",
        input: {
          file_path: join(repo, "chip.css"),
          content:
            ".chip .label {\n  min-inline-size: 0;\n  overflow: clip;\n  text-overflow: ellipsis;\n}\n",
        },
      },
    },
    {
      tool: {
        name: "Grep",
        input: { pattern: "chip", path: repo, output_mode: "content" },
      },
    },
    {
      tool: {
        name: SUBAGENT,
        input: {
          description: "Audit the chip row",
          prompt: "Read the chip row and say what overflows. PROBE-STEP:sub",
          subagent_type: "general-purpose",
        },
      },
    },
    { words: REPLY },
  ],
  sub: [{ words: "The label never shrinks, so the badge is cut first." }],
  named: [
    {
      tool: {
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: NAMED_QUESTION,
              header: "Names",
              multiSelect: false,
              options: [
                {
                  label: NAMED_ANSWER,
                  description:
                    "The card at rest, standing open, and hanging from its tab.",
                },
                {
                  label: "Shut, standing, hanging",
                  description: "Named for what the card is doing.",
                },
              ],
            },
          ],
        },
      },
    },
    { words: "I'll name them rest, open and hung." },
  ],
  wrap: [
    {
      tool: {
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "How should a chip whose label is too long behave?",
              header: "Wrap",
              multiSelect: false,
              options: [
                {
                  label: "Truncate",
                  description:
                    "Clip the label with an ellipsis; the badge stays whole.",
                },
                {
                  label: "Wrap to two lines",
                  description:
                    "The chip grows taller and the row keeps its width.",
                },
                {
                  label: "Scroll the row",
                  description:
                    "The row scrolls sideways and every chip keeps its width.",
                },
              ],
            },
          ],
        },
      },
    },
    { words: "Done." },
  ],
  push: [
    {
      tool: {
        name: "Bash",
        input: {
          command: "git push origin main",
          description: "Push the deploy key's commit",
        },
      },
    },
    { words: "Pushed." },
  ],
  art: [
    {
      tool: {
        name: "ToolSearch",
        input: { query: `select:${ARTIFACT_CREATE}`, max_results: 1 },
      },
    },
    {
      tool: {
        name: ARTIFACT_CREATE,
        input: { kind: "page", name: "chip-wrap", html: ARTIFACT_PAGE },
      },
    },
    { words: "The three wraps are on the page." },
  ],
});

const ARTIFACT_CREATE = "mcp__cawco__artifact_create";
/** The question the "named" session asks and the scene answers: the transcript's answered card. */
const NAMED_QUESTION = "Which names do the hang card's three states take?";
const NAMED_ANSWER = "Rest, open, hung";
/** Claude Code's subagent tool, by the name a plan writes it under; its other name is `Agent`. */
const SUBAGENT = "Task";
const SUBAGENT_NAMES = ["Task", "Agent"];
const ARTIFACT_PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Chip wraps</title></head>
  <body>
    <h1>Three ways a long chip wraps</h1>
    <div data-cawco-choice="wrap">
      <button data-option="truncate" type="button">Truncate</button>
      <button data-option="wrap" type="button">Wrap to two lines</button>
      <button data-option="scroll" type="button">Scroll the row</button>
    </div>
  </body>
</html>`;

/** Each marker's plan as its first request found the tools (`settle`). */
const settled = new Map<string, Step[]>();
/** A plan step whose tool the session was not offered: the scene stops on it once its turns rest (`seedScene`). */
const unoffered: string[] = [];

/**
 * A plan as the tools its first request offers make it: the subagent step
 * under the name Claude Code offers it by (`Task`, or `Agent`); a
 * ToolSearch step gone when the tool it looks for is offered already. A
 * subagent step neither name is offered for is kept and said
 * (`unoffered`): the scene is then not what it says it is.
 */
function settle(marker: string, written: Step[], offered: string[]): Step[] {
  const subagent = SUBAGENT_NAMES.find((n) => offered.includes(n));
  const named = written.map((one): Step => {
    if (!("tool" in one && one.tool.name === SUBAGENT)) {
      return one;
    }
    if (!subagent) {
      unoffered.push(
        `${marker}: neither ${SUBAGENT_NAMES.join(" nor ")} is offered (the fleet denies Claude Code's subagents)`
      );
      return one;
    }
    return { tool: { ...one.tool, name: subagent } };
  });
  return named.filter((one, i) => {
    const next = named[i + 1];
    return !(
      "tool" in one &&
      one.tool.name === "ToolSearch" &&
      next !== undefined &&
      "tool" in next &&
      offered.includes(next.tool.name)
    );
  });
}

/** The mock's answer: the step the conversation's tool results have reached in its newest marker's plan. */
export const scriptedReply =
  (repo: () => string) =>
  (request: Seen): Reply => {
    if (!request.tools) {
      return { everyMs: 5, words: ["Probe title"] };
    }
    const markers = [...request.all.matchAll(STEP)];
    const marker = markers.at(-1);
    const name = marker?.[1] ?? "";
    const written = plans(repo())[name];
    if (!(marker && written)) {
      return { everyMs: 5, words: ["ok"] };
    }
    let plan = settled.get(name);
    if (!plan) {
      plan = settle(name, written, request.toolNames);
      settled.set(name, plan);
    }
    // The tool results since the marker's message: the steps already taken.
    const at = request.body.lastIndexOf(`PROBE-STEP:${marker[1]}`);
    const taken = (request.body.slice(at).match(/"tool_result"/g) ?? []).length;
    const step = plan[Math.min(taken, plan.length - 1)] as Step;
    if ("words" in step) {
      return { everyMs: 2, words: [step.words] };
    }
    return { everyMs: 2, words: [], tool: step.tool };
  };

/** A permission the hub holds, as `/api/pending` lists it. */
interface PendingAsk {
  instanceId: string;
  machineId: string;
  payload: { input: Record<string, unknown> };
  requestId: string;
}

/** What the scene made, by name: the tape's `scene`, read by the surfaces' routes. */
export interface Scene {
  account: string;
  answered: string;
  art: string;
  artifact: string;
  ask: string;
  chips: string;
  permission: string;
  project: string;
  run: string;
  task: string;
  workflow: string;
  [name: string]: string;
}

/** Stands the scene up on `fleet` (its services up, the account signed in). */
export async function seedScene(kit: Kit, fleet: KitFleet): Promise<Scene> {
  await writeFile(
    join(fleet.repo, "README.md"),
    "# Tray\n\nThe tray holds a session's chips: its branch, its machine and its count.\n"
  );
  await Bun.$`git -C ${fleet.repo} -c user.email=p@p -c user.name=p add -A && git -C ${fleet.repo} -c user.email=p@p -c user.name=p commit -qm 'The tray readme'`.quiet();

  // Claude Code's own subagents allowed, so the chips turn runs one: the
  // fleet's "Use delegates instead" off (fleet-choices.ts), heard by the
  // machine before the session spawns (its sidecar, which spawns read).
  const choices = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delegates: false }),
  });
  if (!choices.ok) {
    throw new Error(
      `PUT /api/fleet/choices: ${choices.status} ${await choices.text()}`
    );
  }
  await until(
    "the machine allowing Claude Code's subagents",
    () =>
      Bun.file(join(fleet.home, CLAUDE_DIR_NAME, "cawco-fleet.json"))
        .text()
        .catch(() => ""),
    (text) => text.length > 0 && !text.includes('"Task"'),
    60_000
  );

  const chips = await fleet.spawn(
    "claude",
    "Fix tray chip overflow",
    fleet.repo
  );
  await fleet.send(
    chips,
    "Look at the tray's chips and fix the overflow. PROBE-STEP:chips"
  );
  const ask = await fleet.spawn("claude", "Pick the chip's wrap", fleet.repo, {
    permissionMode: "default",
  });
  await fleet.send(ask, "Ask me how the chip should wrap. PROBE-STEP:wrap");
  const permission = await fleet.spawn(
    "claude",
    "Approve the deploy push",
    fleet.repo,
    { permissionMode: "default" }
  );
  await fleet.send(permission, "Push the deploy key's commit. PROBE-STEP:push");
  const art = await fleet.spawn("claude", "Lay out the chip wraps", fleet.repo);
  await fleet.send(art, "Put the three wraps on a page. PROBE-STEP:art");
  const answered = await fleet.spawn(
    "claude",
    "Name the hang card's states",
    fleet.repo,
    { permissionMode: "default" }
  );
  await fleet.send(
    answered,
    "Ask me what the hang card's states are called. PROBE-STEP:named"
  );

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "cawco",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
    template: "code",
  });
  const titles = [
    "Fix tray chip overflow",
    "Audit the push probe",
    "Rebuild the token sheet",
    "Name the hang card's states",
    "Measure the board's columns on a phone",
  ];
  const tasks: string[] = [];
  for (const title of titles) {
    // biome-ignore lint/performance/noAwaitInLoops: the board's order is the order they are filed
    const made = await fleet.api<{ id: string }>(
      `/api/projects/${project.id}/tasks`,
      { title }
    );
    tasks.push(made.id);
  }
  const now = Date.now();
  fleet.write(
    "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, expires_at, next_slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 1, 'session', 0, ?, ?, ?)",
    "routine-weekly-digest",
    project.id,
    "Weekly digest",
    "0 9 * * 1",
    "UTC",
    "delegate",
    "Write the week's digest.",
    now + 7 * DAY,
    now + 365 * DAY,
    now - DAY
  );
  await mkdir(join(fleet.repo, "notes"), { recursive: true });

  // A workflow, and one run of it that has finished.
  const workflow = await fleet.api<{ id: string }>("/api/workflows", {
    name: "Chip audit",
    program: WORKFLOW,
  });
  const { runId } = await fleet.api<{ runId: string }>(
    `/api/workflows/${workflow.id}/runs`,
    { workspace: { path: fleet.repo, machineId: MACHINE } }
  );
  await until(
    "the workflow's run done",
    () => fleet.api<{ status: string }>(`/api/workflow-runs/${runId}`),
    (run) => !["running", "waiting"].includes(run.status),
    120_000
  );

  // The named session's question, answered as the dashboard answers it:
  // its transcript keeps the answered card (QuestionCard).
  const asked = await until(
    "the named session parked on its question",
    () =>
      fleet
        .api<PendingAsk[]>("/api/pending")
        .then((rows) => rows.find((row) => row.instanceId === answered))
        .catch(() => undefined),
    Boolean,
    180_000
  );
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: asked.machineId,
    sessionId: answered,
    payload: {
      instanceId: answered,
      requestId: asked.requestId,
      method: "resolvePermission",
      args: [
        asked.requestId,
        {
          behavior: "allow",
          updatedInput: {
            ...asked.payload.input,
            answers: { [NAMED_QUESTION]: NAMED_ANSWER },
          },
        },
      ],
    },
  });

  // Every turn at rest: the chips, art and named sessions done, the other two parked on their asks.
  for (const [what, id] of [
    ["the chips session's turn done", chips],
    ["the art session's turn done", art],
    ["the named session's turn done", answered],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time
    await until(
      what,
      () => fleet.instance(id),
      (row) => row?.status === "running" && row.turn_open_at === null,
      180_000
    );
  }
  const artifact = await until(
    "the art session's artifact filed",
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM artifacts WHERE instance_id = ?",
        art
      )[0]?.id,
    Boolean,
    60_000
  );
  for (const parked of [ask, permission]) {
    // biome-ignore lint/performance/noAwaitInLoops: one parked ask at a time
    await until(
      "a session parked on its ask",
      () =>
        fleet
          .api<{ requestId: string; instanceId: string }[]>("/api/pending")
          .catch(() => []),
      (rows) =>
        Array.isArray(rows) && rows.some((row) => row.instanceId === parked),
      180_000
    );
  }
  if (unoffered.length > 0) {
    throw new Error(`the scene is not what it says: ${unoffered.join("; ")}`);
  }
  kit.note(
    `scene: sessions ${chips}, ${ask}, ${permission}, ${art}, ${answered}; artifact ${artifact}; project ${project.id} with ${tasks.length} tasks`
  );
  return {
    chips,
    ask,
    permission,
    art,
    answered,
    artifact: artifact as string,
    project: project.id,
    task: tasks[0] as string,
    workflow: workflow.id,
    run: runId,
    account: ACCOUNT,
  };
}
