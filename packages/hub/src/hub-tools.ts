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
 *   caller's repository or in its project's folder (design-system.ts).
 *
 * One list, made here: the MCP server lists it to sessions (server.ts) and
 * the role budgets measure it (role-budgets.ts).
 */
import type { InstanceRow } from "@cawco/core";
import { z } from "zod";
import { tool } from "./admin-tools";
import { DESIGN_WRITE_FILES, type DesignFile } from "./design-system";
import { hubHttpUrl, selfFetch } from "./hub-self";
import { FOLDER_CONTENT_LIMIT, FOLDER_ENCODINGS } from "./project-folder";

/** The hub's own session tools, by name: what a call is routed by (delegation-mcp.ts). */
export const HUB_TOOLS: ReadonlySet<string> = new Set([
  "update_machines",
  "design_write",
]);

export interface HubToolsDeps {
  /** Parks the call as the person's ask and waits for their answer (admin-asks.ts). */
  askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<void>;
  /** Writes the caller's project's design system (design-system.ts `write`). */
  designWrite: (actor: InstanceRow, files: DesignFile[]) => Promise<unknown>;
  /** The machines registered now: an install naming none goes to each. */
  machineIds: () => string[];
  /** Whether the hub requires paired devices (hub-auth.ts): an install asks the person first. */
  pairing: () => boolean;
}

/** The hub's own session tools, bound to the calling session (none for a listing). */
export const createHubTools =
  (deps: HubToolsDeps) => (actor: InstanceRow | undefined) => {
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
        "Write files of the project's design system (design/, paths inside it); bytes as base64. tokens.css and tokens.ts are generated from tokens.json; every token needs a source in manifest.json. A file the person edited is kept.",
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
        },
        async ({ files }) => ok(await deps.designWrite(me(), files))
      ),
    ];
  };
