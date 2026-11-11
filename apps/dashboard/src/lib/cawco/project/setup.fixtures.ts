/**
 * A project's first minutes as the hub holds them, for the stories of its
 * setup (SetupWell) and the onboarding bench: the person's own test
 * case, a personal PR team that fits no template, typed on the live fleet
 * (2026-11-02). Their words, the calls Caw makes as he sets it up, the
 * questions he asks as he drafts (his `ask` calls, parked as the hub parks
 * them: pending.ts `askEnvelope`), and the draft his setup page holds.
 */
import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import {
  PROJECT_SETTINGS_TOOL,
  presentPermission,
} from "@cawco/core/permission-presentation";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import type { BlockedRequest } from "../client.svelte";
import type { Message } from "../types";
import type { Stage as DraftStage, SetupDelegate } from "./setup-stage";

/** The name Caw gives it in his first turn. */
export const PR_NAME = "Your PR team";

/** The stages Caw drafts from their words, as his setup page holds them, each with its look. */
export const PR_DRAFT: DraftStage[] = [
  { name: "Inbox", kind: "todo", icon: "inbox", color: "cyan" },
  {
    name: "Researching",
    kind: "active",
    icon: "search",
    color: "cyan",
    hooks: { runs: "researcher" },
  },
  {
    name: "Drafted",
    kind: "active",
    icon: "pen",
    color: "amber",
    hooks: { runs: "writer" },
  },
  { name: "Your call", kind: "you" },
  { name: "Sent", kind: "waiting", icon: "send", color: "orange" },
  {
    name: "Waiting on reply",
    kind: "waiting",
    icon: "hourglass",
    color: "orange",
    hooks: { after: "7d" },
  },
  { name: "Done", kind: "done", icon: "done", color: "green" },
  { name: "Dropped", kind: "dropped", icon: "trash" },
];

/** What it is for, as his setup page holds it. */
export const PR_AIM =
  "A personal PR team: the job search, visa applications and renewals, travel booked around them, and a public voice. Research and drafts are done by delegates; every message, post and application goes out only once you send it.";

/** The delegate types he proposes, as his setup page holds them. */
export const PR_DELEGATES: SetupDelegate[] = [
  {
    id: "researcher",
    name: "Researcher",
    brief: "Finds roles, visa rules and travel options, with sources.",
    runs: "Claude Code · Sonnet",
  },
  {
    id: "writer",
    name: "Writer",
    brief: "Drafts applications, posts and replies in your voice.",
    runs: "Claude Code · Opus",
  },
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
};

/** One of his questions, parked as the hub parks his `ask` call for his conversation. */
const ask = (
  id: string,
  question: string,
  options: string[],
  stance:
    { blocks: true; waiting: string } | { blocks: false; meanwhile: string }
): BlockedRequest => {
  const input = {
    questions: [
      {
        header: question.split(" ").slice(0, 2).join(" "),
        multiSelect: false,
        question,
        options: options.map((label) => ({ label, description: "" })),
      },
    ],
    ...stance,
  };
  return {
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
      input,
      // As the hub presents it: its line says whether work waits on it.
      presentation: presentPermission(ASK_USER_QUESTION, input, {
        asker: "Caw",
        current: () => undefined,
        memory: () => undefined,
        project: PR_NAME,
        projectName: () => undefined,
      }),
    },
  };
};

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

/**
 * The skills and servers Caw proposes the PR team's sessions start with
 * (the project-setup skill's starting set), each with every session's calls
 * of it on the fleet: kind, name, days since its last call (null: none in
 * the days the hub keeps) and how many sessions called it.
 */
const PR_SET: [
  kind: "skill" | "server",
  name: string,
  ago: number | null,
  sessions: number,
][] = [
  ["skill", "humanizer", 1, 64],
  ["skill", "interfaces:better-writing", 4, 22],
  ["skill", "x-twitter-growth-system", 23, 3],
  ["skill", "x-account-warmup", null, 0],
  ["skill", "zele", 44, 1],
  ["skill", "deep-research", 9, 17],
  ["skill", "clean-copy", 5, 52],
  ["server", "Exa_ai", 1, 178],
  ["server", "crw", 2, 88],
  ["server", "claude.ai Gmail", 6, 12],
  ["server", "claude.ai Google Drive", 13, 8],
];

/** His proposal of the PR team's starting set, parked as the hub parks `project_settings` with `ask: true`. */
export const PR_SET_ASK: BlockedRequest = (() => {
  const now = Date.now();
  const set = {
    skills: PR_SET.filter(([kind]) => kind === "skill").map(([, name]) => name),
    servers: PR_SET.filter(([kind]) => kind === "server").map(
      ([, name]) => name
    ),
  };
  const input = {
    changes: [{ kind: "set_starting_set", startingSet: set }],
    reason:
      "Sessions writing posts, applications and email on the fleet called these; your PR team's work needs the same.",
    ask: true,
    project: PR_NAME,
  };
  return {
    cwd: "/srv/cawco/projects/pr-team",
    hostname: "hub",
    instanceId: "pr-team-conversation",
    machineId: "hub",
    stale: false,
    request: {
      heard: 0,
      instanceId: "pr-team-conversation",
      requestId: "ask-starting-set",
      toolName: PROJECT_SETTINGS_TOOL,
      input,
      presentation: presentPermission(PROJECT_SETTINGS_TOOL, input, {
        asker: "Caw",
        current: () => undefined,
        memory: () => undefined,
        project: PR_NAME,
        projectName: () => undefined,
        startingSet: () => ({
          set: null,
          label: `${PR_NAME}'s starting set`,
          days: 120,
          calls: [],
          fleetCalls: () =>
            PR_SET.flatMap(([kind, name, ago, sessions]) =>
              ago === null
                ? []
                : [
                    {
                      kind,
                      name,
                      lastAt: now - ago * DAY_MS - 2 * HOUR_MS,
                      sessions,
                    },
                  ]
            ),
        }),
      }),
    },
  };
})();
