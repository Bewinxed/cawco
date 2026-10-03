<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    children?: Snippet;
  } = $props();

  const hasContent = $derived(!!children);
</script>

<div
  class={cn(
    "relative -my-2 h-5 text-label group-data-[variant=outline]/field-group:-mb-2",
    className
  )}
  data-content={hasContent}
  data-slot="field-separator"
  bind:this={ref}
  {...restProps}
>
  <Separator class="absolute inset-0 top-1/2" />
  {#if children}
    <span
      class="px-2 text-muted-foreground relative mx-auto block w-fit bg-background"
      data-slot="field-separator-content"
    >
      {@render children()}
    </span>
  {/if}
</div>
