/**
 * What a machine is asked to do: whether it is busy, updating it, and reading its folder's configuration and commands.
 */

import { INSPECT_CONFIG } from "@cawco/core/fleet";
import { maskInspection } from "@cawco/core/fleet-secrets";
import { traitsOf } from "@cawco/core/harness/traits";
import {
  AGENT_BUSY,
  UPDATE_CAWCO,
  type UpdateReport,
} from "@cawco/core/protocol";
import { CONTROL_FOLDER_COMMANDS } from "@cawco/core/session/controls";
import type { SupportedCommands } from "@cawco/core/session-messages";
import { secondsOf } from "@cawco/core/time";
import { Elysia, problem, t } from "elysia";
import { machineAccount } from "../accounts";
import type { HubContext } from "../hub-context";
import { BUSY_TIMEOUT_MS, READ_TIMEOUT_MS } from "../machine-read-timeouts";
import type { MachineReadsContext } from "../machine-reads";
import { unansweredStatus } from "../machine-reads";

import { unreachable } from "../unreachable";
import { harnessSchema } from "./harness-schema";

/** An update is a pull, an install and a dashboard build — minutes, not seconds. */
const UPDATE_TIMEOUT_MS = 10 * 60_000;

/**
 * A folder's `/` menu read before a session: a harness started without a
 * turn (Claude Code answers its initialize in 0.3–2.4 s, measured
 * 2026-11-05), with room for a cold start on a busy machine.
 */
const FOLDER_COMMANDS_TIMEOUT_MS = 30_000;

export const agentControlRoutes = (
  ctx: Pick<
    HubContext,
    | "callAgent"
    | "db"
    | "machineFault"
    | "machineName"
    | "readAgent"
    | keyof MachineReadsContext
  >
) => {
  const { callAgent, db, machineFault, machineName, readAgent } = ctx;
  return (
    new Elysia()
      .get("/api/agents/:machineId/busy", async ({ params, set }) => {
        const answer = await readAgent(
          params.machineId,
          AGENT_BUSY,
          [],
          BUSY_TIMEOUT_MS
        );
        switch (answer.kind) {
          case "unanswered":
            return unansweredStatus(ctx, set, params.machineId, answer);
          case "answered":
            return answer.value.ok
              ? (answer.value.result as { busy: number; instances: string[] })
              : problem(500, {
                  code: "busy-probe-failed",
                  detail: answer.value.error ?? "the busy probe failed",
                });
          default:
            throw unreachable(answer);
        }
      })
      // And the update itself: the machine pulls, installs, rebuilds and restarts
      // what it serves, then says what it actually did.
      .post(
        "/api/agents/:machineId/update",
        {
          body: t.Object({
            restartAgent: t.Optional(t.Boolean()),
            force: t.Optional(t.Boolean()),
            // One per press of Install now: the machine acts on a command once.
            commandId: t.Optional(t.String()),
            // The build the person was shown; the machine applies that one only.
            version: t.Optional(t.String()),
          }),
        },
        async ({ params, body }) => {
          const answer = await callAgent(
            params.machineId,
            UPDATE_CAWCO,
            [body],
            UPDATE_TIMEOUT_MS
          );
          switch (answer.kind) {
            case "unanswered":
              // A machine that restarts the hub as part of its update answers
              // into a socket that no longer exists, so this is not proof that
              // nothing happened — only that the hub stopped hearing about it.
              return answer.reason === "dead"
                ? problem(404, {
                    code: "machine-offline",
                    detail: machineFault(params.machineId, "offline"),
                  })
                : problem(504, {
                    code: "didnt-finish-update-within",
                    detail: `${machineName(params.machineId)} didn't finish the update within ${secondsOf(answer.after)} s. Check it once it's back.`,
                  });
            case "answered":
              return answer.value.ok
                ? (answer.value.result as UpdateReport)
                : problem(500, {
                    code: "update-failed",
                    detail: answer.value.error ?? "the update failed",
                  });
            default:
              throw unreachable(answer);
          }
        }
      )
      // What a machine really has, fleet or not (NEW.md §11) — and what a session
      // in `cwd` would see. Nothing is stored: this is the machine's own word at
      // the moment it was asked, and a stale copy of it would be worse than none.
      .post(
        "/api/agents/:machineId/inspect",
        { body: t.Object({ cwd: t.Optional(t.String()) }) },
        async ({ params, body, set }) => {
          const answer = await readAgent(
            params.machineId,
            INSPECT_CONFIG,
            [body.cwd],
            READ_TIMEOUT_MS
          );
          switch (answer.kind) {
            case "unanswered":
              return unansweredStatus(ctx, set, params.machineId, answer);
            case "answered":
              return answer.value.ok
                ? // A machine's own connectors carry their keys: said as set.
                  maskInspection(
                    answer.value
                      .result as import("@cawco/core/fleet").ConfigInspection
                  )
                : problem(500, {
                    code: "config-unread",
                    detail:
                      answer.value.error ??
                      "the machine could not read its config",
                  });
            default:
              throw unreachable(answer);
          }
        }
      )
      // The `/` menu a session of `harness` would open with in `cwd` on this
      // machine on `model`, before one exists: the machine's harness reads it
      // the way that session's own `supportedCommands` does (core
      // `CONTROL_FOLDER_COMMANDS`), so the New Session form lists what the
      // session's composer will. A Claude session's on the account it names,
      // else the machine's. Nothing is stored, like `/inspect` beside it.
      .get(
        "/api/agents/:machineId/commands",
        {
          query: t.Object({
            harness: harnessSchema,
            cwd: t.String({ minLength: 1 }),
            account: t.Optional(t.String()),
            model: t.Optional(t.String()),
          }),
        },
        async ({ params, query, set }) => {
          const account = traitsOf(query.harness).accountDir
            ? (query.account ?? machineAccount(db, params.machineId))
            : undefined;
          const answer = await readAgent(
            params.machineId,
            CONTROL_FOLDER_COMMANDS,
            [query.cwd, account, query.model],
            FOLDER_COMMANDS_TIMEOUT_MS,
            query.harness
          );
          switch (answer.kind) {
            case "unanswered":
              return unansweredStatus(ctx, set, params.machineId, answer);
            case "answered":
              return answer.value.ok
                ? (answer.value.result as SupportedCommands)
                : problem(500, {
                    code: "config-not-written",
                    detail:
                      answer.value.error ??
                      `${machineName(params.machineId)} could not list the commands of ${query.cwd}`,
                  });
            default:
              throw unreachable(answer);
          }
        }
      )
  );
};
