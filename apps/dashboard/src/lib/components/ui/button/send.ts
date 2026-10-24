import { tv } from "#lib/utils.js";

/**
 * Send (DESIGN.md, Composer controls: "Send/Stop (coral action), each at the
 * concentric 4px radius. They scale to 0.97 on press"): the one coral control
 * in a dock shell, a square of the composer's field height, concentric with
 * the shell (its radius less the inset and the edge that seat it), its glyph
 * 16px. Its
 * hover is every primary action's (DESIGN.md, Buttons: Primary). Disabled it
 * fades to 50% (DESIGN.md, Buttons: Disabled) and drops the gradient for the
 * flat brand under it. A compact standalone control: it presses by scale
 * (`pressable`, The Press Rule).
 */
export const sendVariants = tv({
  base: "relative grid size-c-composer-field flex-none pressable place-items-center concentric-xs border-0 bg-(image:--action-surface) bg-action-solid text-on-action disabled:bg-none disabled:opacity-50 disabled:shadow-none can-hover:enabled:hover:bg-(image:--action-surface-hover) can-hover:enabled:hover:bg-action-hover [&_svg]:size-icon-md",
});
