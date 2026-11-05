/**
 * What the five places' states files share: the three widths the option is
 * drawn at (each with its frame's height, the structure canvas's), and what
 * a flow's `play` is handed on the canvas (core stage-play.ts).
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";

export interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** A desk at 1440: the shell's rail, the row of five, Caw docked when open. */
export const DESK = {
  args: { height: 920 },
  parameters: { viewport: 1440 },
} as const;

/** 900: the row stays, the rail is the shell's sheet, Caw an overlay drawer. */
export const MID = {
  args: { height: 920 },
  parameters: { viewport: 900 },
} as const;

/** A phone at 390: the bottom bar, panes as drawers, Caw full screen. */
export const PHONE = {
  args: { height: 844 },
  parameters: { viewport: 390 },
} as const;

/** A press on the first control whose name matches. */
export const press =
  (role: string, name: RegExp) =>
  async ({ canvas, userEvent }: Play) => {
    await userEvent.click(canvas.getByRole(role, { name }));
  };

/** A story at one of the widths, with the args it changes. */
export const at = (
  form: typeof DESK | typeof MID | typeof PHONE,
  args: Record<string, unknown> = {}
) => ({
  args: { ...form.args, ...args },
  parameters: form.parameters,
});
