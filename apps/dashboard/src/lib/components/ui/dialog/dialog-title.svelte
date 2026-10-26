<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a title led by a glyph, a step apart, the glyph
      centred on the title's line box (`mark-line`); or a path, cut to one
      line from its start (its leaf stays, wrapped in a `<bdi>`) in the mono
      face at the label size. Read out but not drawn
      (`visible: false`) where the dialog's content names itself on screen. */
  const dialogTitleVariants = tv({
    base: "text-title",
    variants: {
      lead: { glyph: "mark-line flex items-center gap-2" },
      look: { path: "dir-rtl truncate font-mono text-label" },
      visible: { true: "", false: "sr-only" },
    },
    defaultVariants: { visible: true },
  });

  type DialogTitleLooks = VariantProps<typeof dialogTitleVariants>;
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    lead,
    look,
    visible,
    ...restProps
  }: DialogPrimitive.TitleProps & DialogTitleLooks = $props();
</script>

<DialogPrimitive.Title
  class={cn(dialogTitleVariants({ lead, look, visible }), className)}
  data-slot="dialog-title"
  bind:ref
  {...restProps}
/>
