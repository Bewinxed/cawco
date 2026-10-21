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
  base: "pressable bg-(image:--action-surface) can-hover:enabled:hover:bg-(image:--action-surface-hover) relative grid size-c-composer-field flex-none place-items-center rounded-composer-control border-0 bg-action-solid text-on-action can-hover:enabled:hover:bg-action-hover disabled:bg-none disabled:opacity-50 disabled:shadow-none [&_svg]:size-icon-md",
});
