/**
 * What the hub writes back after a move the stories make, and the presses
 * that make it: the task as it stands after Pass on, Send back, Drop or
 * Retry, with the new history row the hub's commit adds, by "you", at the
 * story's clock. Shapes follow the hub's own rows (task-history.ts: `what`
 * "stage review → done", the move's note as the reason).
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";
import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
import type { TaskRead } from "./types";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** The task moved by you to `stage` of `kind`, the hub's row added. */
export function movedByYou(
  task: TaskRead,
  stage: string,
  kind: TaskRead["kind"],
  at: number,
  reason: string | null = null
): TaskRead {
  return {
    ...task,
    stage,
    kind,
    passOn: null,
    sendBack: null,
    closedAt: kind === "done" || kind === "dropped" ? at : task.closedAt,
    closedBy: kind === "done" || kind === "dropped" ? "you" : task.closedBy,
    closeReason: kind === "dropped" ? reason : task.closeReason,
    history: [
      ...task.history,
      {
        at,
        actor: "you",
        what: `stage ${task.stage} → ${stage}`,
        reason,
        stage: { from: task.stage, to: stage },
      },
    ],
  };
}

/** The 502 the hub answers while it restarts, in the move's words. */
export const unanswered = (stage: string): string =>
  words.move.unanswered(stage);

/** Press the button named `name` inside the element `scope` selects. */
export async function press(
  { canvas, userEvent }: Play,
  scope: string,
  name: string
): Promise<void> {
  const button = canvas
    .querySelectorAll(`${scope} button`)
    .find((el) => el.textContent?.trim().startsWith(name));
  if (!button) {
    throw new Error(`No button “${name}” in ${scope}`);
  }
  await userEvent.click(button);
}
