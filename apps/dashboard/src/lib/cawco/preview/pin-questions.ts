/**
 * The questions a pin's thread carries (tsk-521): each agent reply's open
 * question (core `ThreadEntry.ask`), as PinCard draws it under its reply,
 * and its answer, sent as the asking session's own card sends it. The same
 * question waits in Needs you and in his conversation; answered anywhere, it
 * leaves them all.
 */

import type { Pin } from "@cawco/core/comments/model";
import type { PermissionResult } from "@cawco/core/session-messages";
import { asksStore } from "../stores/asks.svelte";
import { submitCommand } from "../stores/commands.svelte";
import type { PendingPermission } from "../stores/sessions.svelte";

export interface PinQuestions {
  /** Question `ask` answered: the id of the command it went out as, or null when it is no longer open. */
  onanswer: (ask: string, result: PermissionResult) => string | null;
  /** Each open question, by its ask's id. */
  questions: Record<string, PendingPermission>;
}

/** The open questions of `pin`'s thread, and how each is answered. */
export const pinQuestions = (pin: Pin): PinQuestions => {
  const rows = asksStore.pinQuestions(pin.thread.map((entry) => entry.ask));
  return {
    questions: Object.fromEntries(
      Object.entries(rows).map(([id, row]) => [id, row.request])
    ),
    onanswer: (ask, result) => {
      const row = rows[ask];
      return row
        ? submitCommand(row.instanceId, row.machineId, {
            kind: "permission.answer",
            intent: { requestId: ask, result },
          })
        : null;
    },
  };
};
