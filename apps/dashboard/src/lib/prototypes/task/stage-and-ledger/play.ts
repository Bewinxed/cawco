/**
 * What a flow's `play` is handed on the canvas (core stage-play.ts), and
 * the presses the stage-and-ledger states files make: a button found by
 * its words, pressed with a real pointer, then the screen given what the
 * hub answers.
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** Presses the button named `name` (its words or its accessible name). */
export async function press(
  { canvas, userEvent }: Play,
  name: string | RegExp
): Promise<void> {
  await userEvent.click(canvas.getByRole("button", { name }));
}

/** Presses the last button named `name`: the moves on the strip or handle, past the head's. */
export async function pressLast(
  { canvas, userEvent }: Play,
  name: string
): Promise<void> {
  const all = canvas
    .querySelectorAll("button")
    .filter((button) => button.textContent?.trim() === name);
  const last = all.at(-1);
  if (last) {
    await userEvent.click(last);
  }
}

/** Approve pressed on the session's ask, and the ask as the hub carried it. */
export async function approve(
  context: Play,
  label: string,
  answered: unknown
): Promise<void> {
  await press(context, label);
  await context.update({ ask: answered });
}
