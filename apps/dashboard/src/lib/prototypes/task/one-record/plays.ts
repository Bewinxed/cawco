/**
 * What the "One record" states files' moves do on the live instance (CSF's
 * play, as the canvas hands it): press a control inside one part of the
 * screen by its words, as the person would, then let the hub's answer
 * arrive as new props. Nothing is posted before the hub answers, so each
 * move passes through its pending state first.
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** How long the hub takes to answer a move, ms: long enough to read the pending state. */
const HUB_ANSWERS = 700;

/** Presses the button inside `scope` named `name`, by its words or its accessible name. */
export const press = async (
  { canvas, userEvent }: Play,
  scope: string,
  name: string
): Promise<void> => {
  const button = canvas
    .querySelectorAll(`${scope} button`)
    .find(
      (el) =>
        el.getAttribute("aria-label") === name ||
        el.textContent?.trim() === name
    );
  if (button) {
    await userEvent.click(button);
  }
};

/** Types into the first field inside `scope`. */
export const typeIn = async (
  { canvas, userEvent }: Play,
  scope: string,
  text: string
): Promise<void> => {
  const field = canvas.querySelector(`${scope} textarea`);
  if (field) {
    await userEvent.type(field, text);
  }
};

/** A pressed act: pending while the hub reads it, then the hub's answer. */
export const answered = async (
  { update, userEvent }: Play,
  pending: string,
  answer: Record<string, unknown>
): Promise<void> => {
  await update({ pending });
  await userEvent.wait(HUB_ANSWERS);
  await update({ pending: null, ...answer });
};

/** What every story of the screen shares: nothing open, nothing pending, the hub answering, every press heard and let go. */
export const screenArgs = {
  besideState: "ready",
  pending: null,
  asking: null,
  stale: null,
  onopen: () => undefined,
  onclose: () => undefined,
  onact: () => undefined,
  onback: () => undefined,
} as const;
