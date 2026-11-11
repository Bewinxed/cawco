/**
 * What sessions once did on the person's routes, as their own tools, so a
 * hub that requires paired devices still lets them (hub-auth.ts). No
 * session archives a workspace: a landed one retires itself, and a held one
 * ends only by the person's Continue or Discard (work-items.ts `settle`).
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
 *
 * One list, made here: the MCP server lists it to sessions (server.ts) and
 * the role budgets measure it (role-budgets.ts).
 */
import type { InstanceRow } from "@cawco/core";
import { z } from "zod";
import {
  CALLS_DEFAULT_DAYS,
  CALLS_MAX_DAYS,
  type CapabilityCallsReport,
} from "./capability-calls";
import type { DesignFinding, DesignPick } from "./db/schema";
import {
  DESIGN_WRITE_FILES,
  type DesignFileIn,
  type DesignWritten,
} from "./design-system";
import { FIND_TOOL, type FindTool, findToolDefinition } from "./find-tool";
import { hubHttpUrl, selfFetch } from "./hub-self";
import { sentence, tool } from "./mcp-tool";
import {
  capabilityCallsWords,
  designVerdictWords,
  designWrittenWords,
  machinesUpdatedWords,
} from "./presenters/hub";
import { FOLDER_CONTENT_LIMIT, FOLDER_ENCODINGS } from "./project-folder";
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
]);

/** A verifier's verdict as `design_verdict` takes it. */
export interface DesignVerdict {
  findings: DesignFinding[];
  pick?: DesignPick;
  summary: string;
}

/** A hub route's answer, read as JSON; its own words when it refuses. */
const said = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `the hub answered ${response.status}`);
  }
  return JSON.parse(text) as unknown;
};

/** The newest CawCo build, looked for and told to every machine. */
const lookForBuild = async () =>
  (await said(
    await selfFetch(`${hubHttpUrl()}/api/binary-updates/check`, {
      method: "POST",
    })
  )) as { version: string };

/**
 * The newest build installed on `machines`, each answering for itself: what
 * `update_machines` runs, at once or once the person approved it
 * (asks.ts `carryOut`).
 */
export const installBuild = async (machines: readonly string[]) => {
  const found = await lookForBuild();
  const updates = await Promise.all(
    machines.map(async (id) => {
      try {
        return {
          machine: id,
          report: await said(
            await selfFetch(
              `${hubHttpUrl()}/api/agents/${encodeURIComponent(id)}/update`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  version: found.version,
                  commandId: crypto.randomUUID(),
                }),
                timeout: false,
              }
            )
          ),
        };
      } catch (error) {
        return {
          machine: id,
          error: error instanceof Error ? error.message : String(error),
        };
      }
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
  /** A design check's verdict from its verifier (design-verify.ts `verdict`). */
  designVerdict: (
    actor: InstanceRow,
    verdict: DesignVerdict
  ) => Promise<{ finished: string; recorded: string }>;
  /** Writes the caller's project's design system, or proposes the change (design-system.ts `write`). */
  designWrite: (
    actor: InstanceRow,
    files: DesignFileIn[],
    why: string | undefined,
    toolUseId: string | undefined
  ) => Promise<
    DesignWritten | { files: string[]; proposal: string; waiting: string }
  >;
  /** One `find` call for the calling session (find-tool.ts `call`). */
  find: FindCall;
  /** The machines registered now: an install naming none goes to each. */
  machineIds: () => string[];
  /** Whether the hub requires paired devices (hub-auth.ts): an install asks the person first. */
  pairing: () => boolean;
  /** The projects, by id and name. */
  projects: () => { id: string; name: string }[];
  /** A trim run's proposals put to the person (unused-trim.ts `propose`): the headline it finishes with. */
  trimPropose: (
    actor: InstanceRow,
    toolUseId: string | undefined
  ) => Promise<string>;
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
      tool(
        "update_machines",
        "Look for a new CawCo build and tell every machine (check_only), or install it on one machine or every online machine. Installing asks the person first when the hub requires paired devices.",
        {
          machine: z
            .string()
            .optional()
            .describe("A machine id; every online machine when left out."),
          check_only: z.boolean().optional(),
          reason: z
            .string()
            .max(300)
            .optional()
            .describe("One sentence on why: the person reads it on the ask."),
        },
        async (input) => {
          const caller = me();
          if (input.check_only) {
            return { found: await lookForBuild() };
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
          return recorded ?? (await installBuild(machines));
        },
        (answer) =>
          typeof answer === "string" ? answer : machinesUpdatedWords(answer)
      ),
      tool(
        "design_write",
        "Write design/ files per the design-system skill: content, or from a file where you work. Changing an existing system is a proposal (why).",
        {
          files: z
            .array(
              z.object({
                path: z.string().min(1),
                content: z.string().max(FOLDER_CONTENT_LIMIT).optional(),
                encoding: z.enum(FOLDER_ENCODINGS).optional(),
                from: z.string().min(1).optional(),
              })
            )
            .min(1)
            .max(DESIGN_WRITE_FILES),
          why: z.string().max(500).optional(),
        },
        ({ files, why }) => deps.designWrite(me(), files, why, toolUseId),
        designWrittenWords
      ),
      tool(
        DESIGN_VERDICT,
        "Your verdict as this design check's verifier, once: every must-fix finding tied to one element (its file and line, its CSS selector, what is wrong and what the system says instead), or no findings for a pass. It finishes your item.",
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
            .max(50),
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
        (verdict) => deps.designVerdict(me(), verdict),
        designVerdictWords
      ),
      findToolDefinition((input, format) => deps.find(me(), input, format)),
      tool(
        "calls_by_role",
        `Which skills and MCP servers each role's sessions called in the last days: per role and name, how many sessions called it and when last. A role is a delegate type, or person for the sessions the person started. Project "all" also lists what sessions had installed and none called.`,
        {
          project: z
            .string()
            .min(1)
            .optional()
            .describe(
              'A name or id; "all" for every project. Default: your own project, else all.'
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
            .describe("Only this role's rows, like build or person."),
        },
        ({ project, days, role }) => {
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
        },
        (report) => capabilityCallsWords(report),
        {
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        }
      ),
      tool(
        TRIM_PROPOSE,
        "Put this run's trimmed starting sets to the person, each through its set's own approval; nothing changes until they approve. Call once; it answers the headline to finish with.",
        {},
        () => deps.trimPropose(me(), toolUseId),
        sentence
      ),
    ];
  };
