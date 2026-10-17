<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the line in the hairline
      ink, the control's under the pointer and the muted ink while it is
      dragged, its colour easing over --dur-control. A split's side handle
      marks the drag with `data-active`; a pane grid's with paneforge's
      keyboard or pointer state, and eases only with motion. */
  export const resizableHandleVariants = tv({
    variants: {
      look: {
        split:
          "dur-control bg-border-hairline transition-[background-color] ease-out hover:bg-border-control data-active:bg-ink-muted",
        grid: "motion-safe:dur-control bg-border-hairline not-active-keyboard:not-active-pointer:hover:bg-border-control active-keyboard:bg-ink-muted active-pointer:bg-ink-muted motion-safe:transition-[background-color] motion-safe:ease-out motion-reduce:transition-none",
      },
    },
  });

  export type ResizableHandleLooks = VariantProps<
    typeof resizableHandleVariants
  >;
</script>

<script lang="ts">
  import { PaneResizer, type PaneResizerProps } from "paneforge";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    withHandle = false,
    look,
    ...restProps
  }: WithoutChildrenOrChild<PaneResizerProps> &
    ResizableHandleLooks & {
      withHandle?: boolean;
    } = $props();
</script>

<PaneResizer
  class={cn(
    "relative flex w-px items-center",
    "justify-center bg-border after:absolute after:inset-y-0",
    "after:left-1/2 after:w-space-1 after:-translate-x-1/2",
    "data-[direction=vertical]:h-px",
    "data-[direction=vertical]:w-full",
    "data-[direction=vertical]:after:left-0",
    "data-[direction=vertical]:after:h-space-1",
    "data-[direction=vertical]:after:w-full",
    "data-[direction=vertical]:after:translate-x-0",
    "data-[direction=vertical]:after:-translate-y-1/2",
    "[&[data-direction=vertical]>div]:rotate-90",
    resizableHandleVariants({ look }),
    className
  )}
  data-slot="resizable-handle"
  bind:ref
  {...restProps}
>
  {#if withHandle}
    <div
      class="h-6 w-space-1 rounded-[var(--radius-pill)] bg-border z-10 flex shrink-0"
    ></div>
  {/if}
</PaneResizer>
