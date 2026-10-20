import { tv } from "#lib/utils.js";

/**
 * Send (DESIGN.md, Composer controls: "Send/Stop (coral action), each at the
 * concentric 5px radius. They scale to 0.97 on press"): the one coral control
 * in a dock shell, a square of the composer's field height, concentric with
 * the shell (its radius less the inset that seats it), its glyph 16px. Its
 * hover is every primary action's (DESIGN.md, Buttons: Primary). Disabled it
 * fades to 50% (DESIGN.md, Buttons: Disabled) and drops the gradient for the
 * flat brand under it. A compact standalone control: it presses by scale
 * (`pressable`, The Press Rule).
 */
export const sendVariants = tv({
  base: "pressable relative grid size-c-composer-field flex-none cursor-pointer place-items-center rounded-[calc(var(--radius-lg)-var(--c-composer-inset))] border-0 bg-action-solid bg-(image:--action-surface) text-on-action can-hover:enabled:hover:bg-action-hover can-hover:enabled:hover:bg-(image:--action-surface-hover) disabled:cursor-default disabled:bg-none disabled:opacity-50 disabled:shadow-none [&_svg]:size-icon-md",
});
