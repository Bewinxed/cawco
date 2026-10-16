<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";
  import { Button } from "#lib/components/ui/button/index.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    showCloseButton = false,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    showCloseButton?: boolean;
  } = $props();
</script>

<div
  class={cn(
    "flex phone:flex-row flex-col-reverse phone:justify-end gap-2 gap-2",
    className
  )}
  data-slot="dialog-footer"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
  {#if showCloseButton}
    <DialogPrimitive.Close>
      {#snippet child({ props })}
        <Button variant="outline" {...props}>Close</Button>
      {/snippet}
    </DialogPrimitive.Close>
  {/if}
</div>
