/**
 * What the five places' states files share: what a flow's `play` is
 * handed on the canvas (core stage-play.ts), and a press by name.
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** A press on the first control whose name matches. */
export const press =
  (role: string, name: RegExp) =>
  async ({ canvas, userEvent }: Play) => {
    await userEvent.click(canvas.getByRole(role, { name }));
  };
