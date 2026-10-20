<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
  class={cn(
    "text-left text-ink-muted text-meta leading-root",
    "group-data-[orientation=horizontal]/field:text-balance",
    "[[data-variant=legend]+&]:-mt-1.5",
    "not-[[data-variant=legend]+&]:nth-last-2:-mt-space-1",
    "not-[[data-variant=legend]+&]:not-nth-last-2:last:mt-0",
    "[&>a:hover]:text-link-ink [&>a]:underline [&>a]:underline-offset-4",
    className
  )}
  data-slot="field-description"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</p>
