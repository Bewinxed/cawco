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
    ...restProps
  }: CollapsiblePrimitive.TriggerProps & CollapsibleTriggerLooks = $props();
</script>

<CollapsiblePrimitive.Trigger
  class={cn(collapsibleTriggerVariants({ skin }), className)}
  data-slot="collapsible-trigger"
  bind:ref
  {...restProps}
/>
