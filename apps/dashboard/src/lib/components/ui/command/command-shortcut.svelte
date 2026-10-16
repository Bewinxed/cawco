<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
  class={cn(
    "ml-auto text-ink-muted text-meta tracking-widest group-data-selected/command-item:text-ink-strong",
    className
  )}
  data-slot="command-shortcut"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</span>
