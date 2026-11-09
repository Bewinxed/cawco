/**
 * A machine's tools: their list, signing one in, and changing one.
 */
import {
  CONTROL_BEGIN_TOOL_SIGNIN,
  CONTROL_COMPLETE_TOOL_SIGNIN,
  TOOL_CATALOG,
  type ToolSigninChallenge,
  toolSpec,
} from "@cawco/core/tools";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { peekToolStatus } from "../machine-answers";
import { refusal } from "../refusal";
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
>) =>
  new Elysia()
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
          return refusal(
            404,
            "has-no-sign-own",
            `${params.toolId} has no sign-in of its own.`
          );
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
            return refusal(
              503,
              "machine-away",
              awayWords(params.machineId, answer)
            );
          case "answered": {
            if (!answer.value.ok) {
              return refusal(
                422,
                "tool-signin-not-started",
                answer.value.error ?? "The sign-in did not start."
              );
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
          return refusal(
            404,
            "has-no-sign-own",
            `${params.toolId} has no sign-in of its own.`
          );
        }
        const answer = await callAgent(
          params.machineId,
          CONTROL_COMPLETE_TOOL_SIGNIN,
          [params.toolId, body.code],
          TOOL_SIGNIN_COMPLETE_MS
        );
        switch (answer.kind) {
          case "unanswered":
            return refusal(
              503,
              "machine-away",
              awayWords(params.machineId, answer)
            );
          case "answered": {
            // Used or refused, the machine's sign-in is spent.
            pendingToolSignins.delete(`${params.machineId}:${params.toolId}`);
            const tool = peekToolStatus({ result: answer.value.result });
            if (!(answer.value.ok && tool)) {
              return refusal(
                422,
                "tool-signin-not-finished",
                answer.value.error ?? "The sign-in did not finish."
              );
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
          return refusal(404, "no-tool", `no tool ${params.id}`);
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
    );
