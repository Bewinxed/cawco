import { tv } from "#lib/utils.js";

/**
 * The Press Rule (DESIGN.md): "The hand feels a control before release, in
 * one of two ways chosen by size. A compact standalone control (a button, an
 * icon button, a chip, a switch, about 44px tall at most) scales to 0.97 over
 * 160ms on ease-out. Anything wide, large or grouped (rows, cards, card
 * heads, tabs in a strip, segments) tints to `surface-fill` and moves
 * nothing." The scale runs only with motion allowed and never on a disabled
 * or busy control; the tint always runs. The kit Button's `press` is these;
 * a compact control the kit draws no part for (an attachment chip's remove,
 * a sheet's close) takes them by name.
 *
 * - `scale`: the control's colours over --dur-control, its transform over
 *   --dur-toggle, pressed to --press-scale.
 * - `tint`: `press-tint`, with the control's colours eased.
 * - `pressable`: the house's own compact press (app.css `.pressable`): it
 *   scales and eases only its transform and shadow, so its colours change at
 *   once.
 */
export const pressVariants = tv({
  variants: {
    press: {
      scale:
        "[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)] motion-safe:pressed:not-disabled:not-aria-busy:[transform:scale(var(--press-scale))]",
      tint: "press-tint [transition:var(--transition-control)]",
      pressable: "pressable",
    },
  },
});
