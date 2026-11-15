import type { SessionCustody } from "@cawco/core/protocol";
import { CONTROL_GET_SESSION_INFO } from "@cawco/core/session/controls";
import { Elysia, problem } from "elysia";
import type { HubContext } from "../hub-context";
import { unansweredIn } from "../machine-answers";
import { READ_TIMEOUT_MS } from "../machine-read-timeouts";

import { unreachable } from "../unreachable";

export const instanceDeleteRoutes = ({
  db,
  endSession,
  forgetInstances,
  heldSessions,
  inCustody,
  machineCustody,
  moves,
  publishInstances,
  readAgent,
}: Pick<
  HubContext,
  | "db"
  | "endSession"
  | "forgetInstances"
  | "heldSessions"
  | "inCustody"
  | "machineCustody"
  | "moves"
  | "publishInstances"
  | "readAgent"
>) =>
  new Elysia()
    // A session with no transcript — one that never started, or whose
    // transcript is gone from its machine — and no process has nothing a
    // transcript delete or a discard could act on, and every failed start
    // used to leave one on the board for good. This removes exactly those,
    // with the same delete Remove machine runs per session. Whether the
    // transcript is there is its machine's to say: the row's key only says
    // one was named once.
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one refusal-checked removal covers live custody, transcript presence, and the persisted end decision
    .delete("/api/instances/:id", async ({ params }) => {
      const [row] = db.getInstancesByIds([params.id]);
      if (!row) {
        return problem(404, {
          code: "no-session",
          detail: "No session with that id on this hub.",
        });
      }
      if (moves.holds(row.id)) {
        return problem(409, {
          code: "sessions-project-still-moving",
          detail:
            "This session's project is still moving. Cancel the move in its pane instead.",
        });
      }
      if (
        ["running", "starting"].includes(row.status) ||
        (machineCustody.get(row.machineId)?.state === "available" &&
          (
            machineCustody.get(row.machineId) as Extract<
              SessionCustody,
              { state: "available" }
            >
          ).instances.includes(row.id)) ||
        heldSessions.has(row.id) ||
        inCustody.has(row.id)
      ) {
        return problem(409, {
          code: "session-still-running-stop",
          detail: "This session is still running. Stop it first",
        });
      }
      if (row.sessionId) {
        const stored = await readAgent(
          row.machineId,
          CONTROL_GET_SESSION_INFO,
          [row.sessionId, row.cwd || undefined],
          READ_TIMEOUT_MS,
          row.harness
        );
        switch (stored.kind) {
          case "unanswered":
            return unansweredIn(row.machineId, stored, {
              away: "This session's machine isn't connected, so whether its transcript is still there can't be checked. Try again once it is back.",
              silent:
                "This session's machine is not answering, so whether its transcript is still there can't be checked. Try again in a moment.",
            });
          case "answered":
            if (!stored.value.ok) {
              return problem(502, {
                code: "machine-could-not-check",
                detail: `The machine could not check this session's transcript: ${stored.value.error ?? "no reason given"}`,
              });
            }
            break;
          default:
            throw unreachable(stored);
        }
        if (stored.value.result) {
          return problem(409, {
            code: "session-has-transcript-delete",
            detail:
              "This session has a transcript. Delete the transcript instead.",
          });
        }
      }
      endSession(row.id, "delete", { kind: "person" });
      forgetInstances([row.id]);
      publishInstances(row.machineId);
      return { ok: true };
    });
