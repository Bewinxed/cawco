<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const inputGroupAddonVariants = tv({
    base: "flex h-auto cursor-text select-none items-center justify-center gap-2 py-2 text-ink-muted type-label group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-icon-md",
    variants: {
      align: {
        "inline-start": "order-first pl-3 has-[>button]:-ml-space-1",
        /* In a bar's search capsule, under a finger, its button stands
           clear of the field before it and its touch area reaches across
           that gap (not the bar's gap round the capsule), so each takes 44
           wide to the midpoint between them (The 44 Touch Rule). */
        "inline-end":
          "order-last pr-3 has-[>button]:-mr-space-1 coarse:in-data-[look=bar]:has-[>button]:ps-space-6 coarse:in-data-[look=bar]:has-[>button]:hit-gap-x-space-6",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3",
        "block-end":
          "order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3",
      },
      /**
       * `unit`: a figure's unit after it, in the figure's own role, muted (a dial's "px");
       * `swatch`: a colour's swatch leading its value, its picker over it.
       */
      look: {
        unit: "ps-space-1 type-body",
        swatch: "relative ps-space-2 pe-0",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  });

  type InputGroupAddonAlign = VariantProps<
    typeof inputGroupAddonVariants
  >["align"];
  type InputGroupAddonLook = VariantProps<
    typeof inputGroupAddonVariants
  >["look"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    align = "inline-start",
    look,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    align?: InputGroupAddonAlign;
    look?: InputGroupAddonLook;
  } = $props();
</script>

<!-- biome-ignore lint/a11y/useKeyWithClickEvents: click only forwards focus to the sibling input, which stays independently keyboard-reachable — no keyboard equivalent needed -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: click only forwards focus to the sibling input; the addon itself exposes no control of its own -->
<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<div
  class={cn(inputGroupAddonVariants({ align, look }), className)}
  data-align={align}
  data-slot="input-group-addon"
  onclick={(e) => {
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    e.currentTarget.parentElement?.querySelector("input")?.focus();
  }}
  role="group"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
