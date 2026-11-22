/**
 * What sessions once did on the person's routes, as their own tools, so a
 * hub that requires paired devices still lets them (hub-auth.ts). No
 * session archives a workspace: a landed one retires itself, and a held one
 * ends only by the person's Continue or Discard (workspaces.ts `settle`).
 *
 * - `update_machines`, for `POST /api/binary-updates/check` and `POST
 *   /api/agents/:id/update`: the check runs at once; installing asks the
 *   person first when the hub requires paired devices (asks.ts), the
 *   hub installing it once they approve ({@link installBuild}), and runs at
 *   once while it trusts its network.
 * - `design_write`: the project's design system, written at the root of the
 *   caller's repository or in its project's folder (design-system.ts): a
 *   system being built is written at once; a change to one the project
 *   already had is a proposal the person approves.
 * - `design_verdict`: a design check's verifier's one answer (design-verify.ts):
 *   its must-fix findings, each tied to an element, or none for a pass.
 * - `find`, for `GET /api/find`: the dashboard's Finder, the same engine,
 *   narrowed and read as a session needs it (find-tool.ts).
 * - `calls_by_role`, for `GET /api/capability-calls`: which skills and MCP
 *   servers each role's sessions called (capability-calls.ts), a project
 *   named by its name too.
 * - `trim_propose`: a run of the unused skills and servers routine puts the
 *   hub's trimmed starting sets to the person, each through its set's own
 *   approval (unused-trim.ts), and is told the headline to finish with.
 * - `project_create`, for `POST /api/projects`: a new project made with
 *   Caw from the person's words, its conversation started to set it up
 *   (project-create.ts).
 *
 * One list, made here: the MCP server lists it to sessions (server.ts) and
 * the role budgets measure it (role-budgets.ts).
 */
import type { InstanceRow } from "@cawco/core/protocol";
import { z } from "zod";
import type { createBinaryUpdates } from "./binary-updates";
import {
  CALLS_DEFAULT_DAYS,
  CALLS_MAX_DAYS,
  type CapabilityCallsReport,
} from "./capability-calls";
import { type createDesignSystem, DESIGN_WRITE_FILES } from "./design-system";
import type { createDesignVerify } from "./design-verify";
import {
  FIND_TOOL,
  type FindTool,
  findListed,
  findToolDefinition,
} from "./find-tool";
import { answered, defineTool, sentence } from "./mcp-tool";
import {
  capabilityCallsWords,
  designVerdictWords,
  designWrittenWords,
  machinesUpdatedWords,
} from "./presenters/hub";
import {
  type createProjectCreate,
  PROJECT_CREATE,
  PROJECT_CREATE_DEFINITION,
} from "./project-create";
import { FOLDER_CONTENT_LIMIT, FOLDER_ENCODINGS } from "./project-folder";
import type { agentUpdate } from "./routes/agent-control";
import { TRIM_PROPOSE } from "./unused-trim";

/** One `find` for a session: its input, and the form it asked. */
type FindCall = (
  actor: InstanceRow,
  ...asked: Parameters<FindTool["call"]> extends [InstanceRow, ...infer Rest]
    ? Rest
    : never
) => ReturnType<FindTool["call"]>;

/** The hub's own session tools, by name: what a call is routed by (delegation-mcp.ts). */
/** A design check's verifier's verdict: listed to verifier sessions alone (delegation-mcp.ts). */
export const DESIGN_VERDICT = "design_verdict";

export const HUB_TOOLS: ReadonlySet<string> = new Set([
  "update_machines",
  "design_write",
  DESIGN_VERDICT,
  FIND_TOOL,
  "calls_by_role",
  TRIM_PROPOSE,
  PROJECT_CREATE,
]);

/**
 * The newest build installed on `machines`, each answering for itself: what
 * `update_machines` runs, at once or once the person approved it
 * (asks.ts `carryOut`).
 */
export const installBuild = async (
  deps: Pick<HubToolsDeps, "checkBuild" | "updateAgent">,
  machines: readonly string[]
) => {
  const found = await deps.checkBuild();
  if (!answered(found)) {
    return found;
  }
  const updates = await Promise.all(
    machines.map(async (id) => {
      const report = await deps.updateAgent(id, {
        version: found.version,
        commandId: crypto.randomUUID(),
      });
      return answered(report)
        ? { machine: id, report }
        : { machine: id, error: report.response.detail };
    })
  );
  return { found, updates };
};

export interface HubToolsDeps {
  /**
   * Records the call as the person's ask (asks.ts): what the call
   * answers; undefined in Full Send, when it runs now.
   */
  askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<string | undefined>;
  /** The count of skill and server calls by role (capability-calls.ts), for a project or every one. */
  capabilityCalls: (asked: {
    days?: number;
    projectId?: string;
  }) => CapabilityCallsReport;
  /** The newest CawCo build, looked for and told to every machine (binary-updates.ts `check`). */
  checkBuild: ReturnType<typeof createBinaryUpdates>["check"];
  /** A design check's verdict from its verifier (design-verify.ts `verdict`). */
  designVerdict: ReturnType<typeof createDesignVerify>["verdict"];
  /** Writes the caller's project's design system, or proposes the change (design-system.ts `write`). */
  designWrite: ReturnType<typeof createDesignSystem>["write"];
  /** One `find` call for the calling session (find-tool.ts `call`). */
  find: FindCall;
  /** The machines registered now: an install naming none goes to each. */
  machineIds: () => string[];
  /** Whether the hub requires paired devices (hub-auth.ts): an install asks the person first. */
  pairing: () => boolean;
  /** A new project for the calling session (project-create.ts). */
  projectCreate: ReturnType<typeof createProjectCreate>;
  /** The projects, by id and name. */
  projects: () => { id: string; name: string }[];
  /** A trim run's proposals put to the person (unused-trim.ts `propose`): the headline it finishes with. */
  trimPropose: (
    actor: InstanceRow,
    toolUseId: string | undefined
  ) => Promise<string>;
  /** A machine's update, as its route answers it (routes/agent-control.ts `agentUpdate`). */
  updateAgent: ReturnType<typeof agentUpdate>;
}

/** The project `asked` names, by id or name; undefined for every project. */
const projectNamed = (
  asked: string,
  projects: { id: string; name: string }[]
): string | undefined => {
  const name = asked.trim();
  if (name.toLowerCase() === "all") {
    return;
  }
  const found =
    projects.find((project) => project.id === name) ??
    projects.find(
      (project) => project.name.toLowerCase() === name.toLowerCase()
    );
  if (!found) {
    throw new Error(
      `project "${asked}" is no project of this fleet. Projects: ${projects.map((project) => project.name).join(", ") || "none"}. Example: {"project": "all", "days": 30}`
    );
  }
  return found.id;
};

/** The hub's own session tools, bound to the calling session (none for a listing). */
export const createHubTools =
  (deps: HubToolsDeps) =>
  (actor: InstanceRow | undefined, toolUseId?: string) => {
    const me = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    return [
      UPDATE_MACHINES_DEFINITION.run(async (input) => {
        const caller = me();
        if (input.check_only) {
          const found = await deps.checkBuild();
          return answered(found) ? { found } : found;
        }
        const machines = input.machine ? [input.machine] : deps.machineIds();
        // The person first, before anything runs: installing the newest
        // build on these machines.
        const recorded = deps.pairing()
          ? await deps.askPerson(caller, "update_machines", {
              ...input,
              machines,
            })
          : undefined;
        return recorded ?? (await installBuild(deps, machines));
      }),
      DESIGN_WRITE_DEFINITION.run(({ files, why }) =>
        deps.designWrite(me(), files, why, toolUseId)
      ),
      DESIGN_VERDICT_DEFINITION.run((verdict) =>
        deps.designVerdict(me(), verdict)
      ),
      findToolDefinition((input, format) => deps.find(me(), input, format)),
      CALLS_BY_ROLE_DEFINITION.run(({ project, days, role }) => {
        const projectId =
          project === undefined
            ? (me().projectId ?? undefined)
            : projectNamed(project, deps.projects());
        const report = deps.capabilityCalls({ days, projectId });
        return Promise.resolve(
          role === undefined
            ? report
            : {
                ...report,
                rows: report.rows.filter((row) => row.role === role),
              }
        );
      }),
      TRIM_PROPOSE_DEFINITION.run(() => deps.trimPropose(me(), toolUseId)),
      PROJECT_CREATE_DEFINITION.run((asked) => deps.projectCreate(me(), asked)),
    ];
  };

const UPDATE_MACHINES_DEFINITION = defineTool(
  "update_machines",
  "Checks for a new CawCo build, or installs it on one machine or every online machine. Use it when the person asks to update CawCo on the fleet or a machine.",
  {
    machine: z
      .string()
      .optional()
      .describe("A machine id; every online machine when left out."),
    check_only: z
      .boolean()
      .optional()
      .describe("true only looks for a new build and tells every machine."),
    reason: z
      .string()
      .max(300)
      .optional()
      .describe("One sentence on why: the person reads it on the ask."),
  },
  (answer: string | Parameters<typeof machinesUpdatedWords>[0]) =>
    typeof answer === "string" ? answer : machinesUpdatedWords(answer)
);

const DESIGN_WRITE_DEFINITION = defineTool(
  "design_write",
  "Writes the project's design/ files, each from its content or a file where you work. Use it while following the design-system skill.",
  {
    files: z
      .array(
        z.object({
          path: z.string().min(1),
          content: z.string().max(FOLDER_CONTENT_LIMIT).optional(),
          encoding: z.enum(FOLDER_ENCODINGS).optional(),
          from: z
            .string()
            .min(1)
            .optional()
            .describe("A file where you work, in place of content."),
        })
      )
      .min(1)
      .max(DESIGN_WRITE_FILES),
    why: z
      .string()
      .max(500)
      .optional()
      .describe("Required to change an existing system: why."),
  },
  designWrittenWords
);

const DESIGN_VERDICT_DEFINITION = defineTool(
  DESIGN_VERDICT,
  "Your verdict as this design check's verifier, which finishes your item. Use it once, when you have checked the result against the system.",
  {
    findings: z
      .array(
        z.object({
          file: z.string().min(1),
          line: z.number().int().min(1),
          selector: z.string().min(1),
          problem: z.string().min(1).max(1000),
        })
      )
      .max(50)
      .describe(
        "Every must-fix finding, each tied to one element: its file and line, its CSS selector, what is wrong and what the system says instead. None for a pass."
      ),
    pick: z
      .object({
        variant: z.string().min(1),
        why: z.string().min(1).max(500),
      })
      .optional()
      .describe(
        "When the result offers variants: the one that holds to the system best, and why."
      ),
    summary: z.string().min(1).max(2000),
  },
  designVerdictWords
);

const CALLS_BY_ROLE_DEFINITION = defineTool(
  "calls_by_role",
  "Which skills and MCP servers each role's sessions called in the last days: per role and name, how many sessions called it and when last. Use it to see what a role uses before trimming its starting set or removing a skill or server.",
  {
    project: z
      .string()
      .min(1)
      .optional()
      .describe(
        'A name or id; "all" for every project, which also lists what sessions had installed and none called. Default: your own project, else all.'
      ),
    days: z
      .number()
      .int()
      .min(1)
      .max(CALLS_MAX_DAYS)
      .optional()
      .describe(`Default ${CALLS_DEFAULT_DAYS}.`),
    role: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Only this role's rows: a delegate type, like build, or person for the sessions the person started."
      ),
  },
  (report: Parameters<typeof capabilityCallsWords>[0]) =>
    capabilityCallsWords(report),
  {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }
);

const TRIM_PROPOSE_DEFINITION = defineTool(
  TRIM_PROPOSE,
  "This run's trimmed starting sets, put to the person each through its set's own approval; nothing changes until they approve. Use it once in the unused skills and servers run, before finish_item.",
  {},
  sentence
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const HUB_DEFINITIONS = [
  UPDATE_MACHINES_DEFINITION.listed(),
  DESIGN_WRITE_DEFINITION.listed(),
  DESIGN_VERDICT_DEFINITION.listed(),
  findListed,
  CALLS_BY_ROLE_DEFINITION.listed(),
  TRIM_PROPOSE_DEFINITION.listed(),
  PROJECT_CREATE_DEFINITION.listed(),
];
