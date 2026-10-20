<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const collapsibleTriggerVariants = tv({
    variants: {
      /** Inside a surface that sets its own type and ink (the new-session
          dialog, `ns-theme`): the trigger takes the surface's font and ink as
          every button there does, and eases the control's colours, with the
          press's transform where motion is welcome. */
      skin: {
        surface:
          "font-inherit text-inherit transition-control motion-safe:transition-control-press",
      },
      /**
       * The trigger by its role (DESIGN.md, Components). Its words and ink
       * come from the row it heads unless the role names them.
       * - `head`: a disclosure head (Transcript, Subagent: "a disclosure
       *   head (26px, 44px on a coarse pointer)"), on the rail's edges
       *   (`rail-line`) or a list's; as wide as its card, so it tints on
       *   press (The Press Rule).
       * - `note`: a rail note's fold, its words inline on the rail's edges
       *   in the note's own ink.
       * - `fold`: a fold's toggle: its words and its turning chevron in the
       *   muted ink, strong under the pointer (Caw's panel: "A fold's toggle
       *   shows it is open by its words and its flipped chevron").
       * - `chevron`: a row's trailing chevron alone, as a tool row's.
       * - `opener`: a list row's name that opens it; its press covers the
       *   row (the row is `relative`).
       */
      look: {
        head: "rail-line press-tint min-h-c-mark coarse:min-h-c-btn-h-lg min-w-0 cursor-pointer rounded-xs text-start text-size-label font-medium transition-[color] dur-control ease-out",
        note: "rail-line inline-flex cursor-pointer text-start",
        fold: "mark-line press-tint inline-flex cursor-pointer items-center gap-space-1 rounded-xs py-space-1 text-start type-label text-ink-muted transition-[color] dur-control ease-out hover:text-ink-strong",
        chevron:
          "grid cursor-pointer place-items-center text-ink-muted press-tint",
        opener: "focus-inset block cursor-pointer text-start after:absolute after:inset-0",
      },
      /** An event that woke a project's Caw is code: its fold stands in a
          1px dashed box in the control edge, the box its one marker. */
      edge: {
        code: "rounded-xs border border-dashed border-border-control px-space-2",
      },
    },
  });

  export type CollapsibleTriggerLooks = VariantProps<
    typeof collapsibleTriggerVariants
  >;
</script>

<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    skin,
    look,
    edge,
    ...restProps
  }: CollapsiblePrimitive.TriggerProps & CollapsibleTriggerLooks = $props();
</script>

<CollapsiblePrimitive.Trigger
  class={cn(collapsibleTriggerVariants({ skin, look, edge }), className)}
  data-slot="collapsible-trigger"
  bind:ref
  {...restProps}
/>
