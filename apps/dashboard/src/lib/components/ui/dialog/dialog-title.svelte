<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a title led by a glyph, a step apart; or a path,
      cut to one line in the mono face at the label size. */
  export const dialogTitleVariants = tv({
    variants: {
      gap: { glyph: "gap-2" },
      look: { path: "truncate font-mono text-label" },
    },
  });

  export type DialogTitleLooks = VariantProps<typeof dialogTitleVariants>;
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    gap,
    look,
    ...restProps
  }: DialogPrimitive.TitleProps & DialogTitleLooks = $props();
</script>

<DialogPrimitive.Title
  class={cn("text-title", dialogTitleVariants({ gap, look }), className)}
  data-slot="dialog-title"
  bind:ref
  {...restProps}
/>
