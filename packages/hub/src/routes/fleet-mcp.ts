/**
 * The fleet's MCP servers: adding, removing and signing one in.
 */

import { MCP_PLATFORMS } from "@cawco/core/fleet";
import { mergeMcpSecrets } from "@cawco/core/fleet-secrets";
import { mcpWords } from "@cawco/core/words/mcp";
import { Elysia, t } from "elysia";
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
  machineMcpConfig,
  maskedMcp,
  sharedProblem,
}: Pick<
  HubContext,
  | "announceMcp"
  | "boundProblem"
  | "db"
  | "fleetMcp"
  | "machineMcpConfig"
  | "maskedMcp"
  | "sharedProblem"
>) => {
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
        async ({ params, body, set, status }) => {
          const held = db.getMcpServer(params.name)?.config;
          const read = body.fromMachine
            ? await machineMcpConfig(
                body.fromMachine,
                params.name,
                body.cwd,
                set
              )
            : { ok: true as const, config: body.config };
          if (!read.ok) {
            return status(read.code, read.said);
          }
          const written = read.config;
          if (!written) {
            return status(
              400,
              "name a config, or the machine to adopt the server from"
            );
          }
          // What the write does not name of a secret, the server keeps; an
          // adoption is the machine's config whole.
          const settled = mergeMcpSecrets(
            written,
            body.fromMachine ? undefined : held,
            {
              dropped: mcpWords.secretsLeft,
              empty: mcpWords.secretEmpty,
              missing: mcpWords.secretNotHeld,
              notText: mcpWords.secretNotText,
            }
          );
          if (!settled.ok) {
            return status(400, settled.problem);
          }
          const config = settled.config as unknown as Record<string, unknown>;
          const problem = mcpWriteProblem(params.name, config, body);
          if (problem) {
            return status(400, problem);
          }

          db.putMcpServer({
            name: params.name,
            config: settled.config,
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
            return status(404, "MCP server was removed while probing.");
          }
          return saved;
        }
      )
      // Into the trash with its sign-in, off every machine at once.
      // Into the trash with its sign-in, off every machine at once.
      .delete("/api/fleet/mcp/:name", ({ params, status }) => {
        const trashed = db.trash.put(
          { kind: "mcp", key: params.name },
          Date.now()
        );
        if (trashed === undefined) {
          return status(404, `the fleet keeps no MCP server ${params.name}`);
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
        async ({ params, body, status }) => {
          try {
            return await fleetMcp.start(params.name, body?.access);
          } catch (error) {
            return status(
              400,
              error instanceof Error
                ? error.message
                : "Sign-in could not start. Save this server and retry sign-in."
            );
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
        async ({ body, status }) => {
          try {
            return await fleetMcp.complete(body.code, body.state, body.iss);
          } catch (error) {
            return status(
              400,
              error instanceof Error
                ? error.message
                : "Sign-in could not finish. Start sign-in again."
            );
          }
        }
      )
  );
};
