<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Every trigger reaches 44 under a finger (DESIGN.md, The 44 Touch Rule:
   * `.touch-hit`, its drawn size unchanged); `opener`'s press is its row's
   * already, so it stays unpositioned and its `::after` covers the row.
   */
  const collapsibleTriggerVariants = tv({
    base: "touch-hit",
    variants: {
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
        head: "rail-line press-tint coarse:min-h-c-btn-h-lg min-h-c-mark min-w-0 rounded-xs text-start font-medium text-size-label transition-[color] duration-(--dur-control) ease-out",
        note: "rail-line inline-flex text-start",
        fold: "mark-line press-tint type-label inline-flex items-center gap-space-1 rounded-xs py-space-1 text-start text-ink-muted transition-[color] duration-(--dur-control) ease-out hover:text-ink-strong",
        chevron: "press-tint grid place-items-center text-ink-muted",
        opener:
          "focus-inset static block text-start after:absolute after:inset-0",
      },
    },
  });

  type CollapsibleTriggerLooks = VariantProps<
    typeof collapsibleTriggerVariants
  >;
</script>

<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    look,
    ...restProps
  }: CollapsiblePrimitive.TriggerProps & CollapsibleTriggerLooks = $props();
</script>

<CollapsiblePrimitive.Trigger
  class={cn(collapsibleTriggerVariants({ look }), className)}
  data-slot="collapsible-trigger"
  bind:ref
  {...restProps}
/>
