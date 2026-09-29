<script lang="ts">
  import { PaneResizer, type PaneResizerProps } from "paneforge";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    withHandle = false,
    ...restProps
  }: WithoutChildrenOrChild<PaneResizerProps> & {
    withHandle?: boolean;
  } = $props();
</script>

<PaneResizer
  class={cn("cn-resizable-handle relative flex w-px items-center", "justify-center bg-border after:absolute after:inset-y-0", "after:left-1/2 after:w-1 after:-translate-x-1/2", "data-[direction=vertical]:h-px", "data-[direction=vertical]:w-full", "data-[direction=vertical]:after:left-0", "data-[direction=vertical]:after:h-1", "data-[direction=vertical]:after:w-full", "data-[direction=vertical]:after:translate-x-0", "data-[direction=vertical]:after:-translate-y-1/2", "[&[data-direction=vertical]>div]:rotate-90", className)}
  data-slot="resizable-handle"
  bind:ref
  {...restProps}
>
  {#if withHandle}
    <div
      class="h-6 w-1 rounded-[var(--radius-pill)] bg-border z-10 flex shrink-0"
    ></div>
  {/if}
</PaneResizer>
