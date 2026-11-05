/**
 * What a flow's `play` is handed on the canvas (core stage-play.ts), and
 * the one act the prototype's flows take: a press on a control by its
 * role and name, as the person would.
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** A press on the first control of `role` whose name matches. */
export const press =
  (name: string | RegExp, role = "button") =>
  async ({ canvas, userEvent }: Play) => {
    await userEvent.click(canvas.getByRole(role, { name }));
  };
