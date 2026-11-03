/**
 * A project's first minutes as the hub holds them, for the stories of its
 * setup (SetupScene, SetupWell) and the preview page: the person's own test
 * case, a personal PR team that fits no template, typed on the live fleet
 * (2026-11-02). Their words, the calls Caw makes as he sets it up, the
 * questions he asks as he drafts (his `ask` calls, parked as the hub parks
 * them: pending.ts `askEnvelope`), and the stages he drafts with their look.
 */
import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import type { Stage } from "@cawco/core/task-views";
import { DAY_MS } from "@cawco/core/time";
import type { BlockedRequest } from "../client.svelte";
import type { Message } from "../types";

/** The name Caw gives it in his first turn. */
export const PR_NAME = "Your PR team";

/** The stages Caw drafts from their words, each with the look he gives it. */
export const PR_STAGES: Stage[] = [
  { name: "inbox", kind: "todo", hooks: {}, icon: "inbox", color: "cyan" },
  {
    name: "researching",
    kind: "active",
    hooks: { runs: "researcher" },
    icon: "search",
    color: "cyan",
  },
  {
    name: "drafted",
    kind: "active",
    hooks: { runs: "writer" },
    icon: "pen",
    color: "amber",
  },
  { name: "your-call", kind: "you", hooks: {} },
  { name: "sent", kind: "waiting", hooks: {}, icon: "send", color: "orange" },
  {
    name: "waiting-on-reply",
    kind: "waiting",
    hooks: { after: "7d", afterMs: 7 * DAY_MS },
    icon: "hourglass",
    color: "orange",
  },
  { name: "done", kind: "done", hooks: {}, icon: "done", color: "green" },
  { name: "dropped", kind: "dropped", hooks: {}, icon: "trash" },
];

const call = (id: string, tool: string, input: object, second: number) =>
  ({
    id,
    instanceId: "pr-team-conversation",
    type: "tool.use",
    content: "",
    timestamp: new Date(Date.UTC(2026, 10, 2, 6, 29, second)).toISOString(),
    toolCallId: id,
    metadata: {
      toolName: tool,
      toolInput: input as Record<string, unknown>,
      toolStatus: "success",
    },
  }) satisfies Message;

/** What Caw calls as he sets it up, by the beat it has reached. */
export const SETUP_CALLS = {
  sent: [] as Message[],
  read: [call("t1", "mcp__cawco__project_setup", {}, 9)],
  named: [
    call("t1", "mcp__cawco__project_setup", {}, 9),
    call("t2", "mcp__cawco__project_name", { name: PR_NAME }, 11),
  ],
  page: [
    call("t1", "mcp__cawco__project_setup", {}, 9),
    call("t2", "mcp__cawco__project_name", { name: PR_NAME }, 11),
    call(
      "t6",
      "mcp__cawco__folder_write",
      { path: "decisions/setup/page.html" },
      96
    ),
    call(
      "t7",
      "mcp__cawco__artifact_create",
      { kind: "page", name: "setup" },
      118
    ),
  ],
};

/** One of his questions, parked as the hub parks his `ask` call for his conversation. */
const ask = (
  id: string,
  question: string,
  options: string[],
  stance:
    { blocks: true; waiting: string } | { blocks: false; meanwhile: string }
): BlockedRequest => ({
  cwd: "/srv/cawco/projects/pr-team",
  hostname: "hub",
  instanceId: "pr-team-conversation",
  machineId: "hub",
  stale: false,
  request: {
    heard: 0,
    instanceId: "pr-team-conversation",
    requestId: id,
    toolName: ASK_USER_QUESTION,
    input: {
      questions: [
        {
          header: question.split(" ").slice(0, 2).join(" "),
          multiSelect: false,
          question,
          options: options.map((label) => ({ label, description: "" })),
        },
      ],
      ...stance,
    },
    presentation: {
      asker: "Caw",
      changes: [],
      fields: [],
      project: PR_NAME,
      summary: question,
    },
  },
});

/** The PR team's questions, from what their words leave open. */
export const PR_ASKS: BlockedRequest[] = [
  ask(
    "ask-visa",
    "Is the visa a renewal, or a new application?",
    ["A renewal", "A new application", "Not sure yet"],
    { blocks: true, waiting: "drafting the visa stages" }
  ),
  ask(
    "ask-socials",
    "Which accounts does it post from?",
    ["LinkedIn", "X", "LinkedIn and X"],
    { blocks: false, meanwhile: "drafting for LinkedIn and X" }
  ),
  ask(
    "ask-where",
    "Where are you job hunting?",
    ["Remote", "Where I live", "Abroad"],
    { blocks: false, meanwhile: "a researcher who looks at remote roles first" }
  ),
];
