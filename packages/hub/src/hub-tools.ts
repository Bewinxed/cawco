/**
 * What sessions once did on the person's routes, as their own tools, so a
 * hub that requires paired devices still lets them (hub-auth.ts). No
 * session archives a workspace: a landed one retires itself, and a held one
 * ends only by the person's Continue or Discard (work-items.ts `settle`).
 *
 * - `update_machines`, for `POST /api/binary-updates/check` and `POST
 *   /api/agents/:id/update`: the check runs at once; installing asks the
 *   person first when the hub requires paired devices (admin-asks.ts), and
 *   runs at once while it trusts its network.
 * - `design_write`: the project's design system, written at the root of the
 *   caller's repository or in its project's folder (design-system.ts): a
 *   system being built is written at once; a change to one the project
 *   already had is a proposal the person approves.
 * - `design_verdict`: a design check's verifier's one answer (design-verify.ts):
 *   its must-fix findings, each tied to an element, or none for a pass.
 *
 * One list, made here: the MCP server lists it to sessions (server.ts) and
 * the role budgets measure it (role-budgets.ts).
 */
import type { InstanceRow } from "@cawco/core";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { DesignFinding, DesignPick } from "./db/schema";
import { DESIGN_WRITE_FILES, type DesignFile } from "./design-system";
import { hubHttpUrl, selfFetch } from "./hub-self";
import { FOLDER_CONTENT_LIMIT, FOLDER_ENCODINGS } from "./project-folder";

/** The hub's own session tools, by name: what a call is routed by (delegation-mcp.ts). */
/** A design check's verifier's verdict: listed to verifier sessions alone (delegation-mcp.ts). */
export const DESIGN_VERDICT = "design_verdict";

export const HUB_TOOLS: ReadonlySet<string> = new Set([
  "update_machines",
  "design_write",
  DESIGN_VERDICT,
]);

/** A verifier's verdict as `design_verdict` takes it. */
export interface DesignVerdict {
  findings: DesignFinding[];
  pick?: DesignPick;
  summary: string;
}

export interface HubToolsDeps {
  /** Parks the call as the person's ask and waits for their answer (admin-asks.ts). */
  askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<void>;
  /** A design check's verdict from its verifier (design-verify.ts `verdict`). */
  designVerdict: (
    actor: InstanceRow,
    verdict: DesignVerdict
  ) => Promise<unknown>;
  /** Writes the caller's project's design system, or proposes the change (design-system.ts `write`). */
  designWrite: (
    actor: InstanceRow,
    files: DesignFile[],
    why: string | undefined,
    toolUseId: string | undefined
  ) => Promise<unknown>;
  /** The machines registered now: an install naming none goes to each. */
  machineIds: () => string[];
  /** Whether the hub requires paired devices (hub-auth.ts): an install asks the person first. */
  pairing: () => boolean;
}

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
    const ok = (data: unknown) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
    });
    const said = async (response: Response): Promise<unknown> => {
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `the hub answered ${response.status}`);
      }
      return JSON.parse(text) as unknown;
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
          const machines = input.machine ? [input.machine] : deps.machineIds();
          // The person first, before anything runs: installing the newest
          // build on these machines.
          if (!input.check_only && deps.pairing()) {
            await deps.askPerson(caller, "update_machines", {
              ...input,
              machines,
            });
          }
          const found = (await said(
            await selfFetch(`${hubHttpUrl()}/api/binary-updates/check`, {
              method: "POST",
            })
          )) as { version: string };
          if (input.check_only) {
            return ok({ found });
          }
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
          return ok({ found, updates });
        }
      ),
      tool(
        "design_write",
        "Write files of the project's design/ system, as the design-system skill says. Changing a system the project already had is a proposal, with your why; you hear the person's answer.",
        {
          files: z
            .array(
              z.object({
                path: z.string().min(1),
                content: z.string().max(FOLDER_CONTENT_LIMIT),
                encoding: z.enum(FOLDER_ENCODINGS).optional(),
              })
            )
            .min(1)
            .max(DESIGN_WRITE_FILES),
          why: z.string().max(500).optional(),
        },
        async ({ files, why }) =>
          ok(await deps.designWrite(me(), files, why, toolUseId))
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
        async (verdict) => ok(await deps.designVerdict(me(), verdict))
      ),
    ];
  };
