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
/** A made view (views spec's good draft): figures, a table, the board by stage, each task's card and a month, over the view tools. */
const WEEK_VIEW = `root = Column([title, figures, table, board, cards, month])
tasks = Query("tasks", {}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("Chip week", "title")
figures = Row([StatTile("All tasks", stages.total), StatTile("Waiting on you", stages.byKind.you, "attn")])
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])
board = Board(@Each(stages.stages, "s", StageColumn(s, tasks.rows)), "By stage")
cards = Column(@Each(tasks.rows, "t", TaskCard(t)))
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
/** The words the scene's rule watches for, which only the "todo" session says. */
const TODO_PHRASE = "TODO:";
/** The fleet's memory, saved twice: the second keeps the first as a version. */
const MEMORY_V1 = "# Fleet\n\nSay what changed and how it was proven.\n";
const MEMORY_V2 =
  "# Fleet\n\nSay what changed and how it was proven.\n\nRead a file whole before editing it.\n";
/** A model's document under the memory (a models/<model>.md). */
const MODEL_DOC = "models/claude-opus-5-5.md";
const MCP_NAME = "tray-docs";
const HOOK_ID = "lint-written";
/** The second machine: a Mac, offline, its keychain locked. */
export const STUDIO_HOST = "studio";
const STUDIO_MACHINE = "machine-studio-mac";
/** The file Caw says he wrote in the cawco project's folder (his message's `files`). */
const BRIEF_FILE = "notes/tray-brief.md";
const BRIEF = `# The tray's brief

- The count badge never shrinks.
- A long branch name clips with an ellipsis.
`;
/** The note pasted beside your picture in the thread. */
const PHONE_NOTES =
  "At 390px the badge is cut after the second chip.\nThe branch name was 40 characters.";
/** The picture your thread message carried: a 4×2 PNG, the tray's two chips in its two hues. */
const TRAY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAGElEQVR4nGOwaPlv0fL//yqN/6s0GJA5ALfCDjHN4/54AAAAAElFTkSuQmCC";
/** Caw's words in the cawco project's thread, over the two tasks that wait on you. */
const CAW_SAYS =
  "The push probe audit is ready for your review, and the token sheet's attempt failed: it needs you to say whether to try again.";
/** A workflow drawn as a graph (the editor's canvas): start, one step, a branch on what it found, end. */
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
      // Whether the step found an overflow: its condition, then the else.
      id: "branch-1",
      kind: "branch",
      title: "Overflows?",
      position: { x: 560, y: 120 },
      cases: [
        { port: "overflows", when: { op: "truthy", path: "step-1.overflows" } },
        { port: "else" },
      ],
    },
    {
      id: "end-1",
      kind: "end",
      title: "End",
      position: { x: 800, y: 120 },
      outputs: {},
    },
  ],
  edges: [
    {
      id: "e1",
      from: { node: "start-1", port: "out" },
      to: { node: "step-1" },
    },
    {
      id: "e2",
      from: { node: "step-1", port: "out" },
      to: { node: "branch-1" },
    },
    {
      id: "e3",
      from: { node: "branch-1", port: "overflows" },
      to: { node: "end-1" },
    },
    { id: "e4", from: { node: "branch-1", port: "else" }, to: { node: "end-1" } },
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
  todo: [
    {
      words: `The chip's label shrinks now. ${TODO_PHRASE} measure it on a phone.`,
    },
  ],
  memory: [
    {
      tool: {
        name: "ToolSearch",
        input: { query: `select:${ADMIN_MEMORY_READ}`, max_results: 1 },
      },
    },
    { tool: { name: ADMIN_MEMORY_READ, input: { action: "get" } } },
    { words: "The fleet's memory asks for a proof with every change." },
  ],
  skill: [
    {
      tool: {
        name: "Skill",
        input: { skill: SKILL_NAME, args: "Measure the chip row at 390px." },
      },
    },
    { words: "The tray check passed." },
  ],
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
/** CawCo's fleet-memory read (admin-tools.ts `admin_<group>_read`), deferred. */
const ADMIN_MEMORY_READ = "mcp__cawco__admin_memory_read";
/** A skill on the machine (`~/.claude/skills`), which the "skill" session runs. */
const SKILL_NAME = "tray-check";
const SKILL = `---
name: ${SKILL_NAME}
description: Check the tray's chip row at a phone's width.
---
# Tray check

Measure the chip row at 390px and say whether the count badge is whole.
`;
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
  // A rule, and a session whose every turn ends on a TODO: the rule fires
  // once and its reply is the session's next message (a rule's row), and,
  // the next turn ending on it again, it stays waiting on an answer (the
  // rules page's count). Its phrase is in no other session's words.
  const rule = await send("/api/rules", "POST", {
    name: "Finish the TODO",
    enabled: true,
    matchKind: "phrase",
    pattern: TODO_PHRASE,
    caseSensitive: true,
    wholeWord: false,
    repeat: false,
    reply: "Finish the TODO before you stop.",
    scope: {},
    timing: "turn",
    watch: "text",
  });
  const todo = await fleet.spawn("claude", "Leave the TODO", fleet.repo);
  await fleet.send(todo, "Say what is left on the chip. PROBE-STEP:todo");
  // A session that reads the fleet's memory through CawCo's tool, and one
  // that runs a skill on the machine: each tool's own card.
  const memoryRead = await fleet.spawn(
    "claude",
    "Read the fleet memory",
    fleet.repo
  );
  await fleet.send(memoryRead, "What does the fleet memory ask? PROBE-STEP:memory");
  const skillDir = join(fleet.home, CLAUDE_DIR_NAME, "skills", SKILL_NAME);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), SKILL);
  const skillRun = await fleet.spawn("claude", "Run the tray check", fleet.repo);
  await fleet.send(skillRun, "Run the tray check skill. PROBE-STEP:skill");
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
  // The first task filled in as a person fills one (its description,
  // criteria, labels, checks and to-dos), waiting on the second and related
  // to the third, and the fourth its child: the task pane's fields and
  // relations, and the board's task graph (the Canvas tab, `taskEdges`).
  const [chipTask, tokenSheet, hangNames, boardPhone] = tasks as [
    string,
    string,
    string,
    string,
  ];
  await send(`/api/projects/${project.id}/tasks/${chipTask}`, "PATCH", {
    description:
      "A long branch name pushes the tray's count badge out of the row.",
    acceptance: "The badge stays whole at 390px with a 40-character branch.",
    labels: ["tray", "ui"],
    checks: ["bun run lint"],
  });
  for (const text of ["Let the label shrink", "Keep the badge whole"]) {
    // biome-ignore lint/performance/noAwaitInLoops: the list's order is the order they are added
    await fleet.api(`/api/projects/${project.id}/tasks/${chipTask}/todos`, {
      text,
    });
  }
  for (const [from, edge, to] of [
    [chipTask, "after", tokenSheet],
    [chipTask, "related", hangNames],
    [boardPhone, "parent", chipTask],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one edge at a time, each a write to the task's file
    await fleet.api(`/api/projects/${project.id}/tasks/${from}/links`, {
      edge,
      to,
    });
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

  async function send(path: string, method: string, body: object) {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `${method} ${path}: ${response.status} ${await response.text()}`
      );
    }
    // A create answers with the row it made (its `id`); a save, with what it saved.
    return response.json() as Promise<{ id: string }>;
  }
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
    ["the memory session's turn done", memoryRead],
    ["the skill session's turn done", skillRun],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time
    await until(
      what,
      () => fleet.instance(id),
      (row) => row?.status === "running" && row.turn_open_at === null,
      180_000
    );
  }
  // The TODO session's rule fired and still waiting on an answer, and the
  // turn its reply started (ending on the TODO again) at rest.
  await until(
    "the TODO session's rule waiting on an answer",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM rule_state WHERE rule_id = ? AND instance_id = ?",
        rule.id,
        todo
      )[0]?.status,
    (status) => status === "pending",
    180_000
  );
  await Bun.sleep(3000);
  await until(
    "the TODO session's answer to its rule done",
    () => fleet.instance(todo),
    (row) => row?.status === "running" && row.turn_open_at === null,
    180_000
  );
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
  // Before that: your words with a picture and a pasted note riding on them
  // (the row's chips, the picture's lightbox), Caw's reply naming the file
  // he wrote in the folder (FolderFiles), and the notes of a routine made
  // and of his design-system offer (their actions under the line).
  await put(project.id, BRIEF_FILE, BRIEF);
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, images, attachments, created_at) VALUES (?, ?, 'you', ?, ?, ?, ?)",
    crypto.randomUUID(),
    thread,
    "Here is the tray at 390px, and my notes from the phone.",
    JSON.stringify([{ mediaType: "image/png", src: TRAY_PNG }]),
    JSON.stringify([
      { kind: "text", name: "phone-notes.txt", content: PHONE_NOTES },
    ]),
    now - 9 * MINUTE
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, files, created_at) VALUES (?, ?, 'caw', ?, ?, ?)",
    crypto.randomUUID(),
    thread,
    "I wrote the tray's brief into the folder from your notes.",
    JSON.stringify([BRIEF_FILE]),
    now - 8 * MINUTE
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, note_title, event, created_at) VALUES (?, ?, 'event', '', ?, ?, ?)",
    crypto.randomUUID(),
    thread,
    "A session made the routine Weekly digest",
    JSON.stringify({
      kind: "routine-made",
      by: "session",
      expiresAt: now + 7 * DAY,
      instanceId: chips,
      name: "Weekly digest",
      routineId: "routine-weekly-digest",
      schedule: {
        cron: "0 9 * * 1",
        nextAt: now + 3 * DAY,
        timeZone: "UTC",
        words: "At 09:00, on Monday (UTC)",
      },
      why: "You asked for the week's digest every Monday.",
    }),
    now - 7 * MINUTE
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, note_title, event, created_at) VALUES (?, ?, 'event', '', ?, ?, ?)",
    crypto.randomUUID(),
    thread,
    "Caw offers to build the project's design system",
    JSON.stringify({
      kind: "design-offer",
      projectId: project.id,
      sources: ["the repository's styles and components"],
      taskId: review.id,
    }),
    now - 6 * MINUTE
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

  // The TODO session moved by hand onto the second account, as its row's
  // account menu moves it: the hub's line in its transcript, and its row's
  // account dot (two Claude accounts, it on the second).
  await send(`/api/instances/${todo}/account`, "POST", {
    accountId: SECOND_ACCOUNT,
  });
  await until(
    "the TODO session on the second account",
    () =>
      fleet.query<{ account_id: string | null }>(
        "SELECT account_id FROM instances WHERE id = ?",
        todo
      )[0]?.account_id,
    (account) => account === SECOND_ACCOUNT,
    180_000
  );
  await until(
    "the moved TODO session at rest",
    () => fleet.instance(todo),
    (row) => row?.status === "running" && row.turn_open_at === null,
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

  // The fleet's configuration, filed once every turn is at rest so no
  // session runs under it: the memory saved twice (a version behind it) and
  // a model's document, an MCP server the hub signs in to (McpSignIn), a
  // hook saved twice (its previous version), and a rule.
  await send("/api/fleet/memory", "PUT", { content: MEMORY_V1 });
  await send("/api/fleet/memory", "PUT", { content: MEMORY_V2 });
  await send("/api/fleet/memory/docs", "PUT", {
    path: MODEL_DOC,
    content: "# Opus\n\nKeep each brief under a page.\n",
  });
  await send(`/api/fleet/mcp/${MCP_NAME}`, "PUT", {
    config: { type: "http", url: "https://mcp.tray-docs.test/mcp" },
    enabled: true,
    projectId: null,
  });
  // Its server asks for OAuth, as the hub learns on its first read of it
  // (fleet-mcp.ts): signed in by no one yet.
  fleet.write(
    "UPDATE mcp_servers SET auth_mode = 'oauth' WHERE name = ?",
    MCP_NAME
  );
  for (const command of ["bunx biome check --write", "bunx biome check"]) {
    // biome-ignore lint/performance/noAwaitInLoops: the second save keeps the first as a version
    await send(`/api/fleet/hooks/${HOOK_ID}`, "PUT", {
      name: "Lint what was written",
      enabled: true,
      event: "PostToolUse",
      matcher: "Write|Edit",
      handler: { type: "command", command },
    });
  }
  // A second machine, a Mac, offline since its last report: its keychain
  // locked Claude Code's login (`unreadable-credentials`, the machine
  // menu's Unlock keychain…), and its last converge failed to write the
  // memory, the model's document and the MCP server (each row's fault).
  const denied = (path: string) =>
    `EACCES: permission denied, open '/Users/owner/${path}'`;
  fleet.write(
    "INSERT INTO agents (machine_id, hostname, home, os, status, auth, fleet, last_seen_at, created_at) VALUES (?, ?, '/Users/owner', 'darwin', 'offline', 'unreadable-credentials', ?, ?, ?)",
    STUDIO_MACHINE,
    STUDIO_HOST,
    JSON.stringify({
      at: now - 2 * 60 * MINUTE,
      marketplaces: {},
      mcp: {
        [MCP_NAME]: { state: "failed", detail: denied(".claude.json") },
      },
      memory: { state: "failed", detail: denied(".claude/CLAUDE.md") },
      memoryDocs: {
        [MODEL_DOC]: {
          state: "failed",
          detail: denied(`.claude/memories/${MODEL_DOC}`),
        },
      },
    }),
    now - 2 * 60 * MINUTE,
    now - 30 * DAY
  );

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
    rule: rule.id,
    todo,
    memoryRead,
    skillRun,
    hook: HOOK_ID,
    memoryDoc: MODEL_DOC,
  };
}
