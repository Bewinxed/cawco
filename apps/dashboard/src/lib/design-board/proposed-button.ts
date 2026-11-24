import type { VariantProps } from "tailwind-variants";
import { pressVariants } from "#lib/components/ui/button/press.js";
import { tv } from "#lib/utils.js";

/**
 * The button as a system, proposed for the owner to judge beside today's
 * (design board): three emphases, two intents on any of them, three sizes on
 * the control tokens, and an icon-only square at each size. One look per
 * state: hover a step darker or a fill, pressed the next step and the press
 * scale, focus one outline. Edges are translucent: a secondary button's is
 * the field's ring over a contact shadow, a filled button's a darker ring
 * on its own fill (theme.css `fill-edge`). Every button keeps a transparent
 * border under its ring, so forced-colours mode, which drops shadows, still
 * draws its edge. A glyph leading the words takes 4px less padding on its
 * side, so the pair looks centred.
 */
export const proposedButton = tv({
  base: `${pressVariants({ press: "scale" })} touch-hit inline-flex shrink-0 items-center justify-center gap-space-2 rounded-sm border border-transparent mark-line whitespace-nowrap select-none type-label hit-edge-hair focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-icon-md [&_svg]:shrink-0`,
  variants: {
    emphasis: {
      primary: "text-on-accent fill-edge",
      secondary:
        "bg-bg text-tx shadow-sm ring ring-ui-3 not-pressed:hover:bg-ui pressed:bg-ui-2",
      quiet: "bg-transparent text-tx not-pressed:hover:bg-ui pressed:bg-ui-2",
    },
    intent: { none: "", danger: "", caution: "" },
    size: {
      sm: "h-control-sm px-space-3 has-[>svg:first-child]:ps-space-2",
      md: "h-control-md px-space-4 has-[>svg:first-child]:ps-space-3",
      lg: "h-control-lg px-space-4 has-[>svg:first-child]:ps-space-3",
    },
    icon: { true: "px-0 has-[>svg:first-child]:ps-0" },
  },
  compoundVariants: [
    {
      emphasis: "primary",
      intent: "none",
      class:
        "bg-accent bg-linear-to-b accent-stops hover:accent-stops-hover pressed:brightness-95 pressed:accent-stops-hover",
    },
    {
      emphasis: "primary",
      intent: "danger",
      class: "bg-red not-pressed:hover:brightness-95 pressed:brightness-90",
    },
    {
      emphasis: "primary",
      intent: "caution",
      class: "bg-orange not-pressed:hover:brightness-95 pressed:brightness-90",
    },
    { emphasis: ["secondary", "quiet"], intent: "danger", class: "text-red" },
    {
      emphasis: ["secondary", "quiet"],
      intent: "caution",
      class: "text-orange",
    },
    { icon: true, size: "sm", class: "size-control-sm" },
    { icon: true, size: "md", class: "size-control-md" },
    { icon: true, size: "lg", class: "size-control-lg" },
  ],
  defaultVariants: {
    emphasis: "secondary",
    intent: "none",
    size: "md",
    icon: false,
  },
});

export type ProposedButtonLooks = VariantProps<typeof proposedButton>;
