<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";
  export const inputGroupAddonVariants = tv({
    base: "flex h-auto cursor-text select-none items-center justify-center gap-2 py-2 font-medium text-label text-muted-foreground group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-4",
    variants: {
      align: {
        "inline-start":
          "order-first pl-3 has-[>button]:-ml-1 has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "order-last pr-3 has-[>button]:-mr-1 has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-3 [.border-b]:pb-3",
        "block-end":
          "order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-3 [.border-t]:pt-3",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  });

  export type InputGroupAddonAlign = VariantProps<
    typeof inputGroupAddonVariants
  >["align"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    align = "inline-start",
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    align?: InputGroupAddonAlign;
  } = $props();
</script>

<!-- biome-ignore lint/a11y/useKeyWithClickEvents: click only forwards focus to the sibling input, which stays independently keyboard-reachable — no keyboard equivalent needed -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: click only forwards focus to the sibling input; the addon itself exposes no control of its own -->
<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<div
  class={cn(inputGroupAddonVariants({ align }), className)}
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
