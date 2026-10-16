/**
 * The fleet the surfaces are measured on, stood up once in a scratch fleet
 * and recorded onto the hub tape (hub-tape.ts): `style-snapshot --record`.
 * Nothing here runs when a snapshot is taken; the tape answers for it.
 *
 * One machine (the scratch fleet's), its signed-in Claude account, and:
 *  - "Fix tray chip overflow": a finished turn, a tool group (TodoWrite,
 *    Bash, Read, Write, Grep) and a reply with every markdown block the
 *    transcript draws (heading, list, code, table, quote, link);
 *  - "Pick the chip's wrap": parked on an AskUserQuestion card;
 *  - "Approve the deploy push": parked on a Bash permission;
 *  - the project "cawco": tasks across its stages, a routine and Caw's thread.
 * The mock model plays a script per message: the message carries
 * `PROBE-STEP:<name>`, and each request after it takes the plan's next step
 * by the tool results the conversation holds since (artifacts.ts's shape).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Reply, Seen } from "../../scratch-fleet";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet } from "../kit";

const DAY = 24 * 60 * 60 * 1000;
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
    { words: REPLY },
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

/** Each marker's plan as its first request found the tools: a ToolSearch step goes when the tool it looks for is offered already. */
const settled = new Map<string, Step[]>();

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
      plan = written.filter(
        (one, i) =>
          !(
            "tool" in one &&
            one.tool.name === "ToolSearch" &&
            (() => {
              const next = written[i + 1];
              return (
                next !== undefined &&
                "tool" in next &&
                request.toolNames.includes(next.tool.name)
              );
            })()
          )
      );
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

/** What the scene made, by name: the tape's `scene`, read by the surfaces' routes. */
export interface Scene {
  art: string;
  artifact: string;
  ask: string;
  chips: string;
  permission: string;
  project: string;
  task: string;
  [name: string]: string;
}

/** Stands the scene up on `fleet` (its services up, the account signed in). */
export async function seedScene(kit: Kit, fleet: KitFleet): Promise<Scene> {
  await writeFile(
    join(fleet.repo, "README.md"),
    "# Tray\n\nThe tray holds a session's chips: its branch, its machine and its count.\n"
  );
  await Bun.$`git -C ${fleet.repo} -c user.email=p@p -c user.name=p add -A && git -C ${fleet.repo} -c user.email=p@p -c user.name=p commit -qm 'The tray readme'`.quiet();

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

  // Every turn at rest: the chips and art sessions done, the other two parked on their asks.
  for (const [what, id] of [
    ["the chips session's turn done", chips],
    ["the art session's turn done", art],
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
  kit.note(
    `scene: sessions ${chips}, ${ask}, ${permission}, ${art}; artifact ${artifact}; project ${project.id} with ${tasks.length} tasks`
  );
  return {
    chips,
    ask,
    permission,
    art,
    artifact: artifact as string,
    project: project.id,
    task: tasks[0] as string,
  };
}
