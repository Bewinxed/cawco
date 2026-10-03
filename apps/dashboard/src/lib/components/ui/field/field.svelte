<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const fieldVariants = tv({
    base: "group/field flex w-full gap-3 data-[invalid=true]:text-destructive",
    variants: {
      orientation: {
        vertical:
          "cn-field-orientation-vertical flex-col [&>*]:w-full [&>.sr-only]:w-auto",
        horizontal:
          "cn-field-orientation-horizontal flex-row items-center has-[>[data-slot=field-content]]:items-start [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "cn-field-orientation-responsive @md/field-group:flex-row flex-col @md/field-group:items-center @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:[&>*]:w-auto [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  });

  export type FieldOrientation = VariantProps<
    typeof fieldVariants
  >["orientation"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    orientation = "vertical",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    orientation?: FieldOrientation;
  } = $props();
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<div
  class={cn(fieldVariants({ orientation }), className)}
  data-orientation={orientation}
  data-slot="field"
  role="group"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
