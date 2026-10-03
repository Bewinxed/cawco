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
  class={cn("ml-auto text-meta text-muted-foreground tracking-widest group-focus/context-menu-item:text-foreground", className)}
  data-slot="context-menu-shortcut"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</span>
