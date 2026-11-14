/**
 * A machine's tools: their list, signing one in, and changing one; what the
 * fleet does with a copy CawCo does not run, and updating every such copy.
 */

import { type ToolUpdatesState, toolsBehind } from "@cawco/core/tool-updates";
import {
  CONTROL_BEGIN_TOOL_SIGNIN,
  CONTROL_COMPLETE_TOOL_SIGNIN,
  TOOL_CATALOG,
  TOOL_UPDATES,
  type ToolSigninChallenge,
  toolSpec,
} from "@cawco/core/tools";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";
import { peekToolStatus } from "../machine-answers";

import { unreachable } from "../unreachable";

export const toolRoutes = ({
  TOOL_SIGNIN_BEGIN_MS,
  TOOL_SIGNIN_COMPLETE_MS,
  autoInstall,
  awayWords,
  callAgent,
  db,
  pendingToolSignins,
  publishInstances,
  registry,
  toolReleases,
  updateAll,
}: Pick<
  HubContext,
  | "TOOL_SIGNIN_BEGIN_MS"
  | "TOOL_SIGNIN_COMPLETE_MS"
  | "autoInstall"
  | "awayWords"
  | "callAgent"
  | "db"
  | "pendingToolSignins"
  | "publishInstances"
  | "registry"
  | "toolReleases"
  | "updateAll"
>) => {
  /** The fleet's choice and each tool some machine is behind on, as the cells stand now. */
  const fleetUpdates = (): ToolUpdatesState => {
    const updates = db.toolUpdates();
    const releases = Object.fromEntries(
      TOOL_CATALOG.flatMap((spec) => {
        const newest = toolReleases.newest(spec.id);
        return newest ? [[spec.id, newest]] : [];
      })
    );
    const machines = db.namedMachines().map(({ machineId }) => ({
      machineId,
      status: registry.agent(machineId) ? "online" : "offline",
      tools: db.agentTools(machineId),
    }));
    return {
      updates,
      releases,
      behind: toolsBehind(machines, updates, releases),
    };
  };
  return (
    new Elysia()
      // What the fleet does with a machine's copy of a tool at a version CawCo
      // does not run (core `ToolUpdates`): "update" (the default) or "ask".
      // Machines read it too: a build's `cawco binary-pins` puts its pins on
      // before the swap only under "update" (agent pin-record.ts).
      .get("/api/tool-updates", (): ToolUpdatesState => fleetUpdates())
      .put(
        "/api/tool-updates",
        {
          body: t.Object({
            updates: t.UnionEnum(TOOL_UPDATES),
          }),
        },
        ({ body }): ToolUpdatesState => {
          const before = db.toolUpdates();
          db.setToolUpdates(body.updates);
          if (before !== body.updates) {
            console.info(
              `[hub] a copy of a tool at a version CawCo doesn't run: ${body.updates === "update" ? "CawCo updates its own copies" : "nothing installs until a person presses Update"}`
            );
          }
          // Turned to update: every machine connected now is sent what it is
          // owed, rather than whenever it next reports.
          if (body.updates === "update") {
            for (const machineId of registry.machineIds()) {
              const agent = registry.agent(machineId);
              if (agent) {
                autoInstall(machineId, agent);
              }
            }
          }
          return fleetUpdates();
        }
      )
      // Update all: a person's Update of the tool on every machine whose copy
      // is one its CawCo does not run (tool-installs.ts `updateAll`). Each
      // machine's cell reads `installing` until it answers, on the `instances`
      // frame, as after its own Update.
      .post("/api/tools/:id/update-all", ({ params }) => {
        if (!toolSpec(params.id)) {
          return problem(404, {
            code: "no-tool",
            detail: `no tool ${params.id}`,
          });
        }
        return updateAll(params.id);
      })
      // The catalog is code, so it ships with the answer rather than being stored:
      // a dashboard reads what tools exist and what the fleet has decided about
      // them here, and each machine's own status off the `instances` frame.
      .get("/api/tools", () => ({
        catalog: TOOL_CATALOG,
        policies: db.listToolPolicies(),
      }))
      // A tool's own sign-in on a machine (core `ToolSpec.signin`: the
      // Antigravity CLI's Google sign-in): the machine runs the tool's own
      // sign-in and answers its link, which the person opens in their own
      // browser. A sign-in already waiting there answers its kept link.
      .post(
        "/api/machines/:machineId/tools/:toolId/signin",
        async ({ params }) => {
          const spec = toolSpec(params.toolId);
          if (!spec?.signin) {
            return problem(404, {
              code: "has-no-sign-own",
              detail: `${params.toolId} has no sign-in of its own.`,
            });
          }
          const key = `${params.machineId}:${params.toolId}`;
          const kept = pendingToolSignins.get(key);
          if (kept && kept.expiresAt > Date.now()) {
            return kept;
          }
          pendingToolSignins.delete(key);
          const answer = await callAgent(
            params.machineId,
            CONTROL_BEGIN_TOOL_SIGNIN,
            [params.toolId],
            TOOL_SIGNIN_BEGIN_MS
          );
          switch (answer.kind) {
            case "unanswered":
              return problem(503, {
                code: "machine-away",
                detail: awayWords(params.machineId, answer),
              });
            case "answered": {
              if (!answer.value.ok) {
                return problem(422, {
                  code: "tool-signin-not-started",
                  detail: answer.value.error ?? "The sign-in did not start.",
                });
              }
              const challenge = answer.value.result as ToolSigninChallenge;
              pendingToolSignins.set(key, challenge);
              return challenge;
            }
            default:
              throw unreachable(answer);
          }
        }
      )
      // The code the person pasted, typed into the machine's waiting
      // sign-in; answered with the tool's status there, its sign-in read
      // again, which is the machine's cell from now.
      .post(
        "/api/machines/:machineId/tools/:toolId/signin/complete",
        { body: t.Object({ code: t.String() }) },
        async ({ params, body }) => {
          const spec = toolSpec(params.toolId);
          if (!spec?.signin) {
            return problem(404, {
              code: "has-no-sign-own",
              detail: `${params.toolId} has no sign-in of its own.`,
            });
          }
          const answer = await callAgent(
            params.machineId,
            CONTROL_COMPLETE_TOOL_SIGNIN,
            [params.toolId, body.code],
            TOOL_SIGNIN_COMPLETE_MS
          );
          switch (answer.kind) {
            case "unanswered":
              return problem(503, {
                code: "machine-away",
                detail: awayWords(params.machineId, answer),
              });
            case "answered": {
              // Used or refused, the machine's sign-in is spent.
              pendingToolSignins.delete(`${params.machineId}:${params.toolId}`);
              const tool = peekToolStatus({ result: answer.value.result });
              if (!(answer.value.ok && tool)) {
                return problem(422, {
                  code: "tool-signin-not-finished",
                  detail: answer.value.error ?? "The sign-in did not finish.",
                });
              }
              db.setAgentToolCell(params.machineId, tool);
              publishInstances(params.machineId);
              return tool;
            }
            default:
              throw unreachable(answer);
          }
        }
      )
      .put(
        "/api/tools/:id",
        {
          body: t.Object({
            required: t.Optional(t.Boolean()),
            pinnedVersion: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
        ({ params, body }) => {
          if (!toolSpec(params.id)) {
            return problem(404, {
              code: "no-tool",
              detail: `no tool ${params.id}`,
            });
          }

          const policy = db.putToolPolicy(params.id, body);
          // The click: every machine that is online and missing it starts now,
          // rather than whenever it next happens to reconnect.
          if (policy.required) {
            for (const machineId of registry.machineIds()) {
              const agent = registry.agent(machineId);
              if (agent) {
                autoInstall(machineId, agent);
              }
            }
          }
          return policy;
        }
      )
  );
};
