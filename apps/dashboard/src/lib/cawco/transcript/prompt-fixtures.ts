/**
 * The asks the approval card's stories draw (Prompt.stories.ts, and today's
 * card's in today/Prompt.stories.ts): each one a tool call as a session
 * makes it and what the hub holds when it parks, never a presentation. Each
 * stories file hands these to its own presenter, so every frame carries the
 * words that presenter gives the hub's surfaces, and the two cards are
 * drawn from the same asks.
 */
import type { PermissionUpdate } from "@cawco/core";
import {
  type AdminGroup,
  DESIGN_PROPOSAL_TOOL,
  MEMORY_PROPOSAL_TOOL,
  type PresentationContext,
  type SourceFacts,
} from "@cawco/core/permission-presentation";

export interface AskFixture {
  asker: string;
  input: Record<string, unknown>;
  instanceId: string;
  /** Settings the fleet keeps, by group and key, as the write's input names them. */
  kept?: Partial<Record<AdminGroup, Record<string, Record<string, unknown>>>>;
  /** The fleet's memory: the CLAUDE.md under "", a document under its path. */
  memory?: Record<string, string>;
  /** The delegate types naming a skill or connection, by its name. */
  namedBy?: Record<string, string[]>;
  project?: string;
  projectId?: string;
  requestId: string;
  source?: SourceFacts;
  suggestions?: PermissionUpdate[];
  toolName: string;
}

/** What the hub knows when the fixture's ask parks (hub ask-presentation.ts). */
export const contextOf = (ask: AskFixture): PresentationContext => ({
  asker: ask.asker,
  ...(ask.project ? { project: ask.project } : {}),
  ...(ask.projectId ? { projectId: ask.projectId } : {}),
  current: (group, key) => ask.kept?.[group]?.[key],
  memory: (path) => ask.memory?.[path ?? ""],
  namedBy: (_field, name) => ask.namedBy?.[name] ?? [],
  projectName: (id) => (id === ask.projectId ? ask.project : undefined),
  ...(ask.source ? { source: ask.source } : {}),
});

/** The parked ask as a client holds it, its presentation read by `present`. */
export const requestOf = <P>(
  ask: AskFixture,
  present: (
    toolName: string,
    input: Record<string, unknown>,
    context: PresentationContext
  ) => P
) => ({
  heard: 0,
  input: ask.input,
  instanceId: ask.instanceId,
  requestId: ask.requestId,
  toolName: ask.toolName,
  ...(ask.suggestions ? { suggestions: ask.suggestions } : {}),
  presentation: present(ask.toolName, ask.input, contextOf(ask)),
});

const MOBBIN = {
  asker: "Build Mobbin search MCP from web API",
  instanceId: "s-mobbin",
  project: "better-mobbin-mcp",
  projectId: "p-mobbin",
};
const CAW = {
  asker: "Caw",
  instanceId: "s-caw",
  project: "cockpit",
  projectId: "p-cockpit",
};

const STDIO = {
  command: "/home/bewinxed/.nvm/versions/node/v26.10.0/bin/node",
  args: ["/home/bewinxed/mobbin/dist/index.js"],
};

/** A CLAUDE.md of 318 lines, its Working style section from line 209. */
const claudeMd = (turnLine: string): string =>
  [
    ...Array.from(
      { length: 207 },
      (_, at) => `Line ${at + 1} of the fleet's standing instructions.`
    ),
    "",
    "## Working style",
    "",
    "Drive it into a wall first: stand the thing up, operate it, repair as you go.",
    turnLine,
    ...Array.from(
      { length: 105 },
      (_, at) => `Working style rule ${at + 1}, as the owner wrote it.`
    ),
  ].join("\n");

export const ASKS = {
  /** Wireframe A: an MCP server moved from stdio to HTTP. */
  mcpEdit: {
    ...MOBBIN,
    requestId: "r-mcp-edit",
    toolName: "mcp__cawco__admin_mcp_servers_write",
    input: {
      action: "put",
      name: "mobbin-web",
      config: { type: "http", url: "http://127.0.0.1:8790/mcp" },
      reason:
        "Owner asked to switch the Mobbin MCP to its HTTP+OAuth version and install it to CawCo; the hub signs in and proxies it to every machine.",
    },
    kept: {
      mcp_servers: {
        "mobbin-web": { config: STDIO, enabled: true, projectId: null },
      },
    },
  },
  /** Wireframe B: the curator's change to the fleet's CLAUDE.md. */
  memory: {
    asker: "Memory curator",
    instanceId: "s-curator",
    project: "cawco",
    projectId: "p-cawco",
    requestId: "r-memory",
    toolName: MEMORY_PROPOSAL_TOOL,
    input: {
      files: [
        {
          path: "CLAUDE.md",
          before: claudeMd(
            "A defect you can fix with the tools in hand is fixed in the same turn, then reported."
          ),
          content: claudeMd(
            "A defect you can fix with the tools in hand is fixed in the same turn, then reported; describing it is not done.\nA turn ends when the work is done or nothing can move without the owner.\nA status note goes in the same message as the next tool call."
          ),
        },
      ],
      notes: ["n-0412", "n-0415"],
      project: "cawco",
    },
  },
  /** Wireframe C: Caw runs a command in his own pane. */
  shell: {
    ...CAW,
    requestId: "r-shell",
    toolName: "Bash",
    input: {
      command: "git log origin/main..HEAD --oneline && git status --porcelain",
      description: "Check whether the two commits are on origin/main.",
    },
  },
  /** Wireframe C with the harness's wider rule offered under the answer. */
  shellWiden: {
    ...CAW,
    requestId: "r-shell-widen",
    toolName: "Bash",
    input: {
      command: "git log origin/main..HEAD --oneline",
      description: "List the commits not yet on origin/main.",
    },
    suggestions: [
      {
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "git log:*" }],
        behavior: "allow",
        destination: "projectSettings",
      },
    ],
  },
  /** A delegate type's put that moves all nine of its settings. */
  manyFields: {
    ...CAW,
    requestId: "r-many",
    toolName: "mcp__cawco__admin_delegate_types_write",
    input: {
      action: "put",
      name: "researcher",
      description: "Reads sources whole and answers with quotes.",
      harness: "claude",
      model: "claude-opus-5-5",
      effort: "high",
      skills: ["deep-research", "clearshot"],
      denyTools: ["Edit", "Write"],
      canDelegate: false,
      cawcoTodos: true,
      connections: ["exa"],
      reason:
        "The research leaf needs Exa and the screenshot skill for the approval-card brief.",
    },
    kept: {
      delegate_types: {
        researcher: {
          description: "Reads sources.",
          harness: "opencode",
          model: "gpt-5",
          effort: "medium",
          skills: ["deep-research"],
          denyTools: ["Edit"],
          canDelegate: true,
          cawcoTodos: false,
          connections: [],
        },
      },
    },
  },
  /** A memory document whose path runs to 70 characters. */
  longTarget: {
    ...CAW,
    requestId: "r-long",
    toolName: "mcp__cawco__admin_memory_write",
    input: {
      action: "set_doc",
      path: "projects/better-mobbin-mcp/handover/oauth-proxy-for-every-machine.md",
      content:
        "# OAuth proxy\n\nThe hub signs in once and proxies the server to every machine.\nEach machine reaches it at 127.0.0.1:8790.\n",
      reason: "Record how the proxy reaches each machine before the handover.",
    },
    memory: {
      "projects/better-mobbin-mcp/handover/oauth-proxy-for-every-machine.md":
        "# OAuth proxy\n\nThe hub signs in once and proxies the server to every machine.\n",
    },
  },
  /** A session in no project edits a file. */
  noProject: {
    asker: "Scratch notes",
    instanceId: "s-scratch",
    requestId: "r-no-project",
    toolName: "Edit",
    input: {
      file_path: "/home/bewinxed/notes/today.md",
      old_string: "- [ ] read the approval card reports",
      new_string: "- [x] read the approval card reports\n- [ ] pick a card",
    },
  },
  /** The design system proposes a token change in its project. */
  proposer: {
    asker: "Design system",
    instanceId: "s-design",
    project: "cockpit",
    projectId: "p-cockpit",
    requestId: "r-proposer",
    toolName: DESIGN_PROPOSAL_TOOL,
    input: {
      files: [
        {
          path: "design/tokens/cawco.resolver.json",
          before: '{\n  "dur": {\n    "fade": { "$value": "200ms" }\n  }\n}\n',
          after: '{\n  "dur": {\n    "fade": { "$value": "180ms" }\n  }\n}\n',
        },
      ],
      why: "The owner tuned the decided card's cross-fade to 180ms on the canvas.",
      project: "cockpit",
    },
  },
  /** Wireframe D: removing the stdio server the HTTP one replaced. */
  remove: {
    ...CAW,
    requestId: "r-remove",
    toolName: "mcp__cawco__admin_mcp_servers_write",
    input: {
      action: "remove",
      name: "mobbin-stdio",
      reason: "The HTTP server replaced it; nothing uses the stdio one now.",
    },
    kept: {
      mcp_servers: {
        "mobbin-stdio": { config: STDIO, enabled: true, projectId: null },
      },
    },
  },
  /** Report 2 §3: a skill install with its source's age and stars. */
  install: {
    ...CAW,
    requestId: "r-install",
    toolName: "mcp__cawco__admin_skills_write",
    input: {
      action: "install",
      name: "better-ui",
      source: "github.com/interfaces/skills",
      reason: "The approval card's brief loads better-ui for its polish pass.",
    },
    source: {
      at: "github.com/interfaces/skills",
      since: "2025-03-14T00:00:00Z",
      stars: 1204,
    },
  },
} satisfies Record<string, AskFixture>;
