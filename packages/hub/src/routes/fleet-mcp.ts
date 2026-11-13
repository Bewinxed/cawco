/**
 * The fleet's MCP servers: adding, removing and signing one in.
 */

import {
  type ConfigInspection,
  type FleetMcpConfig,
  INSPECT_CONFIG,
  MCP_PLATFORMS,
} from "@cawco/core/fleet";
import { mergeMcpSecrets } from "@cawco/core/fleet-secrets";
import { mcpWords } from "@cawco/core/words/mcp";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import type { RouteSet } from "../machine-answers";
import { READ_TIMEOUT_MS } from "../machine-read-timeouts";
import { type MachineReadsContext, unansweredStatus } from "../machine-reads";
import { boundFields } from "./bound-fields";

/**
 * Why the hub will not store this server, or nothing. The config itself is
 * stored verbatim — what a server means is the CLI's affair — but an entry
 * missing the one field that makes it startable is a row no machine can apply.
 */
const mcpProblem = (
  name: string,
  config: Record<string, unknown>
): string | undefined => {
  if (!MCP_NAME.test(name)) {
    return `${name} is not a usable MCP server name`;
  }
  if (RESERVED_MCP_NAMES.includes(name)) {
    return `${name} is Claude Code's own`;
  }
  if ("url" in config || config.type === "http" || config.type === "sse") {
    return typeof config.type === "string" && typeof config.url === "string"
      ? undefined
      : "a remote MCP server needs both a type and a url";
  }
  return typeof config.command === "string"
    ? undefined
    : "a stdio MCP server needs a command";
};

/** A config that names what starts it, as a fleet server holds it: a stdio server's command, a remote one's url and its type, http or sse. */
const startable = (
  config: Record<string, unknown>
): config is Record<string, unknown> & FleetMcpConfig =>
  "url" in config || config.type === "http" || config.type === "sse"
    ? (config.type === "http" || config.type === "sse") &&
      typeof config.url === "string"
    : typeof config.command === "string" &&
      (config.type === undefined || config.type === "stdio");

/** What the CLI will take as an MCP server name — it keys `~/.claude.json` by it. */
const MCP_NAME = /^[A-Za-z0-9_-]+$/u;

/** And the names Claude Code keeps for its own servers, which are not the user's to take. */
const RESERVED_MCP_NAMES = [
  "workspace",
  "claude-in-chrome",
  "computer-use",
  "Claude Preview",
  "Claude Browser",
];

export const fleetMcpRoutes = (
  ctx: Pick<
    HubContext,
    | "announceMcp"
    | "boundProblem"
    | "db"
    | "fleetMcp"
    | "machineName"
    | "maskedMcp"
    | "sharedProblem"
    | keyof MachineReadsContext
  >
) => {
  const {
    announceMcp,
    boundProblem,
    db,
    fleetMcp,
    machineName,
    maskedMcp,
    readAgent,
    sharedProblem,
  } = ctx;
  /**
   * The unmanaged MCP server `name` a machine has, config and keys as it
   * holds them: what an adoption takes into the fleet. Read here and kept
   * here, so no screen is sent it (core fleet-secrets.ts).
   */
  const machineMcpConfig = async (
    machineId: string,
    name: string,
    cwd: string | undefined,
    set: RouteSet
  ) => {
    const asked = await readAgent(
      machineId,
      INSPECT_CONFIG,
      [cwd],
      READ_TIMEOUT_MS
    );
    if (asked.kind === "unanswered") {
      return unansweredStatus(ctx, set, machineId, asked);
    }
    if (!asked.value.ok) {
      return problem(400, {
        code: "config-unread",
        detail: asked.value.error ?? "the machine could not read its config",
      });
    }
    const found = (asked.value.result as ConfigInspection).mcp.find(
      (row) => row.name === name && !row.managed
    );
    return found
      ? { config: { ...found.config } }
      : problem(404, {
          code: "mcp-unmanaged-unknown",
          detail: `${machineName(machineId)} has no unmanaged MCP server ${name}`,
        });
  };
  /** Why a server's config and placement cannot be stored, or nothing. */
  const mcpWriteProblem = (
    name: string,
    config: Record<string, unknown>,
    body: Parameters<typeof boundProblem>[0] & { shared?: boolean }
  ): string | undefined => {
    const held = db.getMcpServer(name);
    return (
      mcpProblem(name, config) ??
      boundProblem(body) ??
      sharedProblem(
        name,
        config,
        body.projectId === undefined && body.areaId === undefined
          ? (held?.projectId ?? held?.areaId)
          : (body.projectId ?? body.areaId),
        body.shared ?? held?.shared ?? false
      )
    );
  };
  return (
    new Elysia()
      .put(
        "/api/fleet/mcp/:name",
        {
          body: t.Object({
            // Stored as written once its secrets are settled (core
            // fleet-secrets.ts `mergeMcpSecrets`), so the schema only asks that
            // it be an object; `mcpProblem` checks the one field that makes it
            // startable. Left out with `fromMachine`: the config that machine
            // has under the name.
            config: t.Optional(t.Record(t.String(), t.Unknown())),
            /** Adopt the unmanaged server the machine has under this name (its config is read here, never sent to a screen). */
            fromMachine: t.Optional(t.String()),
            /** The checkout a project-scoped server was discovered in. */
            cwd: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            ...boundFields,
            /**
             * The machine platforms it runs on (`machine_capabilities.platform`):
             * any other machine is never sent it. Null or empty: every
             * machine. Left out: as it was.
             */
            platforms: t.Optional(
              t.Union([t.Array(t.UnionEnum(MCP_PLATFORMS)), t.Null()])
            ),
            /**
             * One instance on each machine for all its sessions, started at
             * its first call (core `FleetMcpServer.shared`). Left out: as it
             * was.
             */
            shared: t.Optional(t.Boolean()),
          }),
        },
        async ({ params, body, set }) => {
          const held = db.getMcpServer(params.name)?.config;
          const read = body.fromMachine
            ? await machineMcpConfig(
                body.fromMachine,
                params.name,
                body.cwd,
                set
              )
            : { config: body.config };
          if (read instanceof ElysiaStatus) {
            return read;
          }
          const written = read.config;
          if (!written) {
            return problem(400, {
              code: "mcp-config-missing",
              detail: "name a config, or the machine to adopt the server from",
            });
          }
          // What the write does not name of a secret, the server keeps; an
          // adoption is the machine's config whole.
          const settled = mergeMcpSecrets(
            written,
            body.fromMachine ? undefined : held,
            {
              dropped: mcpWords.secretsLeft,
              missing: mcpWords.secretNotHeld,
              notText: mcpWords.secretNotText,
            }
          );
          if (!settled.ok) {
            return problem(400, {
              code: "mcp-secrets-unsettled",
              detail: settled.problem,
            });
          }
          const { config } = settled;
          const misfit = mcpWriteProblem(params.name, config, body);
          if (misfit) {
            return problem(400, { code: "mcp-server-invalid", detail: misfit });
          }
          if (!startable(config)) {
            return problem(400, {
              code: "mcp-server-invalid",
              detail: "a remote MCP server's type is http or sse",
            });
          }

          db.putMcpServer({
            name: params.name,
            config,
            enabled: body.enabled,
            projectId: body.projectId,
            areaId: body.areaId,
            platforms: body.platforms,
            shared: body.shared,
          });
          await fleetMcp.probe(params.name);
          announceMcp();
          const saved = maskedMcp(params.name);
          if (!saved) {
            return problem(404, {
              code: "mcp-server-was-removed",
              detail: "MCP server was removed while probing.",
            });
          }
          return saved;
        }
      )
      // Into the trash with its sign-in, off every machine at once.
      .delete("/api/fleet/mcp/:name", ({ params }) => {
        const trashed = db.trash.put(
          { kind: "mcp", key: params.name },
          Date.now()
        );
        if (trashed === undefined) {
          return problem(404, {
            code: "no-mcp",
            detail: `the fleet keeps no MCP server ${params.name}`,
          });
        }
        fleetMcp.forget(params.name);
        announceMcp();
        return undoable(trashed);
      })
      .post(
        "/api/fleet/mcp/:name/sign-in",
        {
          body: t.Optional(
            t.Object({
              /**
               * The access to ask the provider for (core `ConnectAccess`),
               * a connect ask's pick. Left out: the access the last
               * sign-in asked for, else every scope the server names.
               */
              access: t.Optional(
                t.Union([t.Literal("read"), t.Literal("write")])
              ),
            })
          ),
        },
        async ({ params, body }) => {
          try {
            return await fleetMcp.start(params.name, body?.access);
          } catch (error) {
            return problem(400, {
              code: "mcp-server-not-saved",
              detail:
                error instanceof Error
                  ? error.message
                  : "Sign-in could not start. Save this server and retry sign-in.",
            });
          }
        }
      )
      .post(
        "/api/fleet/mcp/oauth/complete",
        {
          body: t.Object({
            code: t.String({ minLength: 1 }),
            state: t.String({ minLength: 1 }),
            iss: t.Optional(t.String()),
          }),
        },
        async ({ body }) => {
          try {
            return await fleetMcp.complete(body.code, body.state, body.iss);
          } catch (error) {
            return problem(400, {
              code: "mcp-server-not-saved",
              detail:
                error instanceof Error
                  ? error.message
                  : "Sign-in could not finish. Start sign-in again.",
            });
          }
        }
      )
  );
};
