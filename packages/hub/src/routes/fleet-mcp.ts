/**
 * The fleet's MCP servers: adding, removing and signing one in.
 */

import { type FleetMcpConfig, MCP_PLATFORMS } from "@cawco/core/fleet";
import { Elysia, problem, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";

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

export const fleetMcpRoutes = ({
  announceMcp,
  boundProblem,
  db,
  fleetMcp,
  sharedProblem,
}: Pick<
  HubContext,
  "announceMcp" | "boundProblem" | "db" | "fleetMcp" | "sharedProblem"
>) =>
  new Elysia()
    .put(
      "/api/fleet/mcp/:name",
      {
        body: t.Object({
          // Stored and written verbatim, so the schema only asks that it be an
          // object; `mcpProblem` checks the one field that makes it startable.
          config: t.Record(t.String(), t.Unknown()),
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
      async ({ params, body }) => {
        const misfit =
          mcpProblem(params.name, body.config) ??
          boundProblem(body) ??
          sharedProblem(
            params.name,
            body.config,
            body.projectId === undefined && body.areaId === undefined
              ? (db.getMcpServer(params.name)?.projectId ??
                  db.getMcpServer(params.name)?.areaId)
              : (body.projectId ?? body.areaId),
            body.shared ?? db.getMcpServer(params.name)?.shared ?? false
          );
        if (misfit) {
          return problem(400, { code: "mcp-server-invalid", detail: misfit });
        }

        db.putMcpServer({
          name: params.name,
          config: body.config as unknown as FleetMcpConfig,
          enabled: body.enabled,
          projectId: body.projectId,
          areaId: body.areaId,
          platforms: body.platforms,
          shared: body.shared,
        });
        await fleetMcp.probe(params.name);
        announceMcp();
        const saved = db
          .fleetConfig()
          .mcp.find((row) => row.name === params.name);
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
    );
