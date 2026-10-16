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
 *  - "Decide the chip's wrap", in the project: a decision page it made;
 *  - "Split the chip audit": a delegate it started (`delegate`), which
 *    worked and reported back (the delegate's transcript inline);
 *  - "Run the chip audit": a workflow run it started (`workflow_run`), its
 *    step's session handing in its result (`submit_result`);
 *  - the project "cawco": tasks, a routine and a made view; a task in
 *    review with two attempts (one failed, one finished handing in a post,
 *    notes and the chip-wrap page), and a task whose one attempt failed,
 *    their attempts filed as the hub files them (work items, no live
 *    delegate: ios-task-review.ts's seed); a thread where Caw names those
 *    two tasks (their cards, and what each needs);
 *  - the project "tray", with Caw on and an empty board: its starters
 *    (Jev's stand-in, `sceneHub`);
 *  - the project "launch-q4": three linked decision pages and their graph
 *    (decisions-preview/seed.ts);
 *  - a workflow and one finished run of it with a step, and a workflow
 *    drawn as a graph;
 *  - a second Claude account, signed in once every session has started;
 *  - `~/code/chip-tray` on the machine, for the spawn sheet's folder browser.
 * The mock model plays a script per session: its first message carries
 * `PROBE-STEP:<name>`, and each request after it takes the plan's next step
 * by the tool results the conversation holds since (artifacts.ts's shape).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CLAUDE_DIR_NAME,
  CLAUDE_JSON_NAME,
} from "../../../packages/core/src/claude-dirs";
import { seedDecisions } from "../../decisions-preview/seed";
import type { Reply, Seen } from "../../scratch-fleet";
import { ACCOUNT, MACHINE, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import type { Kit, KitFleet } from "../kit";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;
/** A made view (views spec's good draft): figures, a table, the board by stage and a month, over the view tools. */
const WEEK_VIEW = `root = Column([title, figures, table, board, month])
tasks = Query("tasks", {}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("Chip week", "title")
figures = Row([StatTile("All tasks", stages.total), StatTile("Waiting on you", stages.byKind.you, "attn")])
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])
board = Board(@Each(stages.stages, "s", StageColumn(s, tasks.rows)), "By stage")
month = Calendar(tasks.rows, "dates.createdAt", "month")
`;
/** The second account, signed in after every session started (the spawn sheet's account chip, the routing's two). */
const SECOND_ACCOUNT = "acct-scratch-second";
/** The review task's outputs, as its finished attempt handed them in. */
const POST = {
  kind: "x-post",
  account: "@cawco",
  text: "The tray's chips keep their badge whole now.\n\nA long branch name clips with an ellipsis instead of pushing the count out.",
  alternates: ["Long branch names no longer push the tray's count out."],
  media: { plan: "A before and after of the tray at 390px." },
};
const AUDIT = `# The push probe's misses

- It never reads a push sent while the phone is locked.
- A burst of three reads as one, and the probe counts one.
`;
const REVIEW_TASK = `---
stage: review
outputs: [push.post.json, audit.md]
lands: none
---
# Audit the push probe

Read the push probe's last runs and say what it misses.

## Acceptance criteria

Every miss is named with the run it came from.

## To-dos

- [x] [td-1] Read the last runs
- [x] [td-2] Name each miss
`;
const REVIEW_TITLE = "Audit the push probe";
const REVIEW_HEADLINE = "The push probe misses two kinds of push.";
const REVIEW_REPORT =
  "I read the push probe's last six runs. It never reads a push sent while the phone is locked, and it counts a burst of three as one. The post says what changed for the tray; the notes list each miss with its run.";
const FAILED_WHY =
  "The attempt's session ended before it handed anything in: the token sheet's build failed on a missing font.";
/** Caw's words in the cawco project's thread, over the two tasks that wait on you. */
const CAW_SAYS =
  "The push probe audit is ready for your review, and the token sheet's attempt failed: it needs you to say whether to try again.";
/** A workflow drawn as a graph (the editor's canvas): start, one step, end. */
const GRAPH = {
  nodes: [
    {
      id: "start-1",
      kind: "start",
      title: "Start",
      position: { x: 80, y: 120 },
      inputs: [],
    },
    {
      id: "step-1",
      kind: "step",
      title: "Audit the chip row",
      position: { x: 320, y: 120 },
      harness: "claude",
      model: "claude-haiku-4-5",
      prompt: "Read the chip row and say what overflows.",
      outputSchema: { type: "object", properties: {} },
      retries: 2,
      timeoutMinutes: 60,
      failedPorts: ["fail"],
    },
    {
      id: "end-1",
      kind: "end",
      title: "End",
      position: { x: 560, y: 120 },
      outputs: {},
    },
  ],
  edges: [
    {
      id: "e1",
      from: { node: "start-1", port: "out" },
      to: { node: "step-1" },
    },
    { id: "e2", from: { node: "step-1", port: "out" }, to: { node: "end-1" } },
  ],
};
/** A workflow that sets one slot and runs one step (its session hands in `overflows`), then returns. */
const WORKFLOW = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  const count = w.state("count", z.number());
  await count.set(3);
  const audit = await w.run({
    title: "Audit the chip row",
    harness: "claude",
    model: "claude-haiku-4-5",
    prompt: "Read the chip row and say whether it overflows. PROBE-STEP:step",
    output: z.object({ overflows: z.boolean() }),
  });
  return { chips: await count.get(), overflows: audit.overflows };
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
  decision: [
    {
      tool: {
        name: "ToolSearch",
        input: { query: `select:${ARTIFACT_CREATE}`, max_results: 1 },
      },
    },
    {
      tool: {
        name: ARTIFACT_CREATE,
        input: { kind: "page", name: "chip-decision", html: ARTIFACT_PAGE },
      },
    },
    { words: "The decision is on the project's page." },
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
  split: [
    {
      tool: {
        name: DELEGATE,
        input: {
          title: DELEGATE_TITLE,
          prompt: "Read the chip row and say what overflows. PROBE-STEP:child",
          checks: [{ name: "Nothing to check", command: "true" }],
          lands: "none",
        },
      },
    },
    { words: "The chip row's check is with a delegate." },
  ],
  child: [
    {
      tool: {
        name: "Bash",
        input: { command: "ls", description: "List the chip row's files" },
      },
    },
    {
      tool: {
        name: FINISH_ITEM,
        input: {
          headline: "The label never shrinks, so the badge is cut first.",
          summary:
            "The chip row is a flex row with no wrap, and each label keeps its whole width: a long branch name pushes the count badge out.",
        },
      },
    },
    { words: "Reported." },
  ],
  runner: [
    {
      tool: {
        name: "ToolSearch",
        input: { query: `select:${WORKFLOW_RUN}`, max_results: 1 },
      },
    },
    {
      tool: {
        name: WORKFLOW_RUN,
        input: {
          name: WORKFLOW_NAME,
          inputs: {},
          workspace: { path: repo, machineId: MACHINE },
        },
      },
    },
    { words: "The chip audit is running." },
  ],
  step: [
    {
      tool: {
        name: "ToolSearch",
        input: { query: `select:${SUBMIT_RESULT}`, max_results: 1 },
      },
    },
    {
      tool: { name: SUBMIT_RESULT, input: { result: { overflows: true } } },
    },
    { words: "Handed in." },
  ],
});

const ARTIFACT_CREATE = "mcp__cawco__artifact_create";
/** CawCo's own tools a plan calls: `delegate` and `finish_item` load upfront, the workflow ones are deferred. */
const DELEGATE = "mcp__cawco__delegate";
const FINISH_ITEM = "mcp__cawco__finish_item";
const WORKFLOW_RUN = "mcp__cawco__workflow_run";
const SUBMIT_RESULT = "mcp__cawco__submit_result";
/** The delegate the "split" session starts: its card's name in the parent's transcript. */
export const DELEGATE_TITLE = "Check the chip row";
const WORKFLOW_NAME = "Chip audit";
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
    // The session's own marker is its first message's: a delegate's report
    // the parent later hears may quote the delegate's brief, and its marker.
    const [marker] = [...request.all.matchAll(STEP)];
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
  decision: string;
  /** The project with three linked decision pages and their graph. */
  decisions: string;
  /** The task whose one attempt failed. */
  failed: string;
  graph: string;
  permission: string;
  project: string;
  /** The task in review: two attempts, the newest's result. */
  review: string;
  run: string;
  /** The session that started a workflow run (its RunBlock). */
  runner: string;
  second: string;
  /**
   * The session that started a delegate; "" in a tape recorded without one
   * (`--record --without-delegate`: a workspace has no user namespaces, so
   * only a host makes a delegate's workspace).
   */
  split: string;
  task: string;
  /** The project with Caw on, its board empty. */
  tray: string;
  workflow: string;
  [name: string]: string;
}

/**
 * What the hub must hear before it starts: Jev's stand-in (jev-mock.ts, on
 * `CAWCO_TYPESAFE_URL`), which the scene turns on for the Caw project's
 * starters, and caw-dock.ts's short starters pace (1.5 s quiet, 5 s gap).
 * Returns its stop.
 */
export function sceneHub(fleet: KitFleet): () => void {
  const jev = jevMock();
  fleet.env.CAWCO_TYPESAFE_URL = jev.url;
  fleet.env.CAWCO_STARTERS_PACE = "1500/5000";
  return jev.stop;
}

/**
 * Stands the scene up on `fleet` (its services up, the account signed in;
 * `sceneHub` heard by the hub), with its delegate when `delegate` (a host
 * only: a delegate's workspace needs user namespaces).
 */
export async function seedScene(
  kit: Kit,
  fleet: KitFleet,
  { delegate }: { delegate: boolean }
): Promise<Scene> {
  await writeFile(
    join(fleet.repo, "README.md"),
    "# Tray\n\nThe tray holds a session's chips: its branch, its machine and its count.\n"
  );
  await Bun.$`git -C ${fleet.repo} -c user.email=p@p -c user.name=p add -A && git -C ${fleet.repo} -c user.email=p@p -c user.name=p commit -qm 'The tray readme'`.quiet();
  // The machine's home as the spawn sheet's folder browser lists it: a
  // person's identity for the delegate's workspace, and `~/code/chip-tray`.
  await writeFile(
    join(fleet.home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await mkdir(join(fleet.home, "code", "chip-tray"), { recursive: true });

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
      // The agent's sidecar (denied-tools.ts `SIDECAR`), in the fleet's own HOME.
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
  // A delegate it starts, which reports back: its card, transcript inline.
  const split = delegate
    ? await fleet.spawn("claude", "Split the chip audit", fleet.repo)
    : "";
  if (split) {
    await fleet.send(
      split,
      "Hand the chip row's check to a delegate. PROBE-STEP:split"
    );
  }

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "cawco",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
    template: "code",
  });
  const titles = [
    "Fix tray chip overflow",
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

  const put = async (projectId: string, path: string, content: string) => {
    const response = await fetch(
      `${fleet.base}/api/projects/${projectId}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `PUT ${path}: ${response.status} ${await response.text()}`
      );
    }
  };
  // A made view, kept, as a hand-written view file is (views.ts: files are the truth).
  await put(project.id, "views/week.oui", WEEK_VIEW);

  // A task in review (the code template's `review` stage waits on you), its
  // outputs in the folder; its attempts' sessions, the finished one with a
  // turn so its transcript has rows (ios-task-review.ts's seed).
  const review = await fleet.api<{ id: string; path: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: REVIEW_TITLE, stage: "review" }
  );
  await put(project.id, review.path, REVIEW_TASK);
  await put(
    project.id,
    `assets/${review.id}/push.post.json`,
    JSON.stringify(POST, null, 2)
  );
  await put(project.id, `assets/${review.id}/audit.md`, AUDIT);
  const attempt = (title: string) =>
    fleet.spawn("claude", title, fleet.repo, { projectId: project.id });
  const reviewDone = await attempt("Attempt 2");
  const reviewFailed = await attempt("Attempt 1");
  const tokenFailed = await attempt("Attempt 1");
  await fleet.send(reviewDone, "Audit the push probe's last runs.");

  // A decision: a page a session of the project made (written to its decisions/).
  const decision = await fleet.spawn(
    "claude",
    "Decide the chip's wrap",
    fleet.repo,
    { projectId: project.id }
  );
  await fleet.send(
    decision,
    "Put the chip decision on the project's page. PROBE-STEP:decision"
  );
  // A workflow drawn as a graph.
  const graph = await fleet.api<{ id: string }>("/api/workflows", {
    name: "Chip triage",
    graph: GRAPH,
  });

  // A workflow, and one run of it that has finished (its step's session
  // handing in its result); and a session that runs it (its RunBlock).
  const workflow = await fleet.api<{ id: string }>("/api/workflows", {
    name: WORKFLOW_NAME,
    program: WORKFLOW,
  });
  const { runId } = await fleet.api<{ runId: string }>(
    `/api/workflows/${workflow.id}/runs`,
    { workspace: { path: fleet.repo, machineId: MACHINE } }
  );
  const runDone = (what: string, id: string) =>
    until(
      what,
      () => fleet.api<{ status: string }>(`/api/workflow-runs/${id}`),
      (run) => !["running", "waiting"].includes(run.status),
      180_000
    );
  await runDone("the workflow's run done", runId);
  const runner = await fleet.spawn("claude", "Run the chip audit", fleet.repo);
  await fleet.send(runner, "Run the chip audit workflow. PROBE-STEP:runner");
  const runnerRun = await until(
    "the runner session's workflow run",
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM workflow_runs WHERE workflow_id = ? AND id <> ?",
        workflow.id,
        runId
      )[0]?.id,
    Boolean,
    180_000
  );
  await runDone("the runner session's run done", runnerRun as string);

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
    ["the decision session's turn done", decision],
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

  // The attempts, filed as the hub files them (work items in an archived
  // workspace): the review task's failed one and its finished one, whose
  // result leads with the chip-wrap page and hands in the post and the
  // notes; and the token sheet's one failed attempt.
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'archived', ?, ?)",
    "ws-review",
    MACHINE,
    fleet.repo,
    fleet.repo,
    "ws/review",
    reviewDone,
    now - 60 * MINUTE
  );
  const tokenTask = tasks[1] as string;
  const item = (
    id: string,
    instance: string,
    task: { id: string; title: string },
    state: "done" | "failed",
    started: number,
    words: { error?: string; headline?: string; summary?: string },
    result: object | null
  ) =>
    fleet.write(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, task_id, project_id, harness, state, summary, headline, error, outputs, task_result, created_at, ended_at) VALUES (?, 'ws-review', ?, ?, ?, ?, ?, ?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      reviewDone,
      instance,
      `Your work item is an attempt at ${task.id}.`,
      task.title,
      task.id,
      project.id,
      state,
      words.summary ?? null,
      words.headline ?? null,
      words.error ?? null,
      JSON.stringify(task.id === review.id ? ["push.post.json", "audit.md"] : []),
      result === null ? null : JSON.stringify(result),
      started,
      started + (state === "done" ? 65_000 : 3 * MINUTE)
    );
  item(
    "wi-review-1",
    reviewFailed,
    { id: review.id, title: REVIEW_TITLE },
    "failed",
    now - 40 * MINUTE,
    { error: FAILED_WHY },
    null
  );
  item(
    "wi-review-2",
    reviewDone,
    { id: review.id, title: REVIEW_TITLE },
    "done",
    now - 10 * MINUTE,
    { summary: REVIEW_REPORT, headline: REVIEW_HEADLINE },
    {
      at: now - 10 * MINUTE + 65_000,
      summary: REVIEW_REPORT,
      check: [
        "The post reads in under a minute.",
        "Each miss names its run.",
      ],
      artifacts: [
        {
          kind: "artifact",
          artifactId: artifact as string,
          name: "Chip wraps",
          primary: true,
        },
        { kind: "post", path: "push.post.json" },
        { kind: "file", path: "audit.md" },
      ],
    }
  );
  item(
    "wi-token-1",
    tokenFailed,
    { id: tokenTask, title: titles[1] as string },
    "failed",
    now - 25 * MINUTE,
    { error: FAILED_WHY },
    null
  );

  // A thread in the project where Caw names the two tasks that wait on you:
  // their cards, and what each needs under it (TaskNeedsFor).
  const thread = crypto.randomUUID();
  const said = crypto.randomUUID();
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    thread,
    project.id,
    "Where the push probe stands",
    now - 5 * MINUTE,
    now - 4 * MINUTE
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'you', ?, ?)",
    crypto.randomUUID(),
    thread,
    "Where do the push probe audit and the token sheet stand?",
    now - 5 * MINUTE
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'caw', ?, ?)",
    said,
    thread,
    CAW_SAYS,
    now - 4 * MINUTE
  );
  for (const taskId of [review.id, tokenTask]) {
    fleet.write(
      "INSERT INTO thread_message_tasks (message_id, project_id, task_id) VALUES (?, ?, ?)",
      said,
      project.id,
      taskId
    );
  }

  // Jev on (the record's stand-in answers it, style-snapshot.ts `record`),
  // then a project with Caw on and nothing on its board: its starters.
  await jevOn(fleet.base);
  const trayPlace = join(fleet.sandbox, "tray");
  await mkdir(trayPlace, { recursive: true });
  await writeFile(
    join(trayPlace, "README.md"),
    "# Tray\n\nThe tray holds a session's chips.\n"
  );
  const tray = await fleet.api<{ id: string }>("/api/projects", {
    name: "tray",
    machineId: MACHINE,
    cwd: trayPlace,
    caw: true,
    template: "code",
  });
  await until(
    "the tray project's starters",
    () =>
      fleet
        .api<{ starters: unknown[] }>(`/api/projects/${tray.id}/stages`)
        .then((stages) => stages.starters.length)
        .catch(() => 0),
    (count) => count > 0,
    120_000
  );

  // Three linked decision pages and their graph, in a project of their own.
  const launchPlace = join(fleet.sandbox, "launch");
  await mkdir(launchPlace, { recursive: true });
  const decisions = await seedDecisions(fleet, {
    name: "launch-q4",
    machineId: MACHINE,
    cwd: launchPlace,
  });

  // A second Claude account, signed in on the machine with a fake login of
  // its own (scratch-fleet.ts `furnish`'s shape), filed after every session
  // has started so each runs on the first: two signed in is what the spawn
  // sheet's account chip and the routing's strategy are for.
  const secondDir = join(
    fleet.home,
    ".cawco",
    "accounts",
    SECOND_ACCOUNT,
    "claude"
  );
  await mkdir(secondDir, { recursive: true });
  await writeFile(
    join(secondDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-fake-scratch-second",
        refreshToken: "sk-ant-ort01-fake-scratch-second",
        expiresAt: now + 365 * DAY,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(secondDir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: "second@scratch-fleet.test",
        organizationName: "Scratch Fleet",
        accountUuid: "00000000-0000-4000-8000-000000000003",
        organizationUuid: "00000000-0000-4000-8000-000000000002",
      },
    })
  );
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Second', 'amber', 1, 0, ?)",
    SECOND_ACCOUNT,
    now
  );
  await until(
    "the second account signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        SECOND_ACCOUNT
      )[0]?.state,
    (state) => state === "signed-in",
    180_000
  );

  // The delegate done and its report heard: the parent's turns at rest.
  if (split) {
    await until(
      "the delegate's item done",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE parent_instance_id = ? AND task_id IS NULL",
          split
        )[0]?.state,
      (state) => state === "done",
      300_000
    );
  }
  for (const [what, id] of [
    ...(split ? [["the split session's turn done", split] as const] : []),
    ["the runner session's turn done", runner] as const,
    ["the review attempt's turn done", reviewDone] as const,
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time
    await until(
      what,
      () => fleet.instance(id),
      (row) => row?.status === "running" && row.turn_open_at === null,
      180_000
    );
  }

  if (unoffered.length > 0) {
    throw new Error(`the scene is not what it says: ${unoffered.join("; ")}`);
  }
  kit.note(
    `scene: sessions ${chips}, ${ask}, ${permission}, ${art}, ${answered}, ${split}, ${runner}; artifact ${artifact}; project ${project.id} with ${tasks.length + 1} tasks; tray ${tray.id}; decisions ${decisions.projectId}`
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
    review: review.id,
    failed: tokenTask,
    workflow: workflow.id,
    graph: graph.id,
    decision,
    decisions: decisions.projectId,
    run: runId,
    runner,
    split,
    tray: tray.id,
    account: ACCOUNT,
    second: SECOND_ACCOUNT,
  };
}
