<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import {
    type LayerPlacement,
    layerProps,
  } from "#lib/components/ui/anchored.svelte.js";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import { isOpen } from "./tooltip-open";
  import TooltipPortal from "./tooltip-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 0,
    side = "top",
    align = "center",
    alignOffset = 0,
    collisionPadding = 0,
    customAnchor,
    interactOutsideBehavior = "defer-otherwise-close",
    escapeKeydownBehavior = "defer-otherwise-close",
    children,
    arrowClasses,
    portalProps,
    ...restProps
  }: Omit<TooltipPrimitive.ContentStaticProps, "child" | keyof LayerPlacement> &
    LayerPlacement & {
      arrowClasses?: string;
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof TooltipPortal>
      >;
    } = $props();
  /** Its root is open: only then is its portal in the body (tooltip-open.ts). */
  const open = isOpen();

  /** How far its arrow stands out of its side, which it stands off its anchor by too. */
  const ARROW = 5;

  /** Its layer's box: on its trigger, or the element its site names (anchored.svelte.ts). */
  const layer = layerProps(() => ({
    side,
    align,
    sideOffset: sideOffset + ARROW,
    alignOffset,
    collisionPadding,
    customAnchor,
  }));
</script>

<!-- A press outside and Escape go to the layer it stands in
     (`defer-otherwise-close`): bits-ui lets only the top-most layer that
     closes or ignores answer a press outside or Escape (dismissible-layer
     `isResponsibleLayer`, escape-layer `isResponsibleEscapeLayer`), and a
     tooltip open over a popover or menu was that layer, so the popover
     stayed open, its focus trap holding the page (the owner, on the usage
     popover: "clicking outside the usage doesn't dismiss it"). Deferring, it
     closes with the layer it stands in, and on its own when none is open. -->
{#if open()}
  <TooltipPortal {...portalProps}>
    <TooltipPrimitive.ContentStatic
      class={cn(
        /* Solid ink, never coral (DESIGN.md, Tooltip): the ink fill, the text
         on it, meta type, 8px radius. A tooltip that waited its delay fades in
         over --duration-base settling `--tip-rise` toward its trigger
         (`--kit-tip-from`, by the side its layer took), one opened while
         another has just been open (bits-ui's `instant-open`), from the
         keyboard or by a tap stands at once, as does every leaving, so moving
         on is never held up. With reduced motion only the first one's fade
         runs. */
        "group/tip relative rounded-sm bg-tx text-bg type-meta [--kit-tip-from:0_2px] data-[side=bottom]:[--kit-tip-from:0_calc(-1*2px)] data-[side=left]:[--kit-tip-from:2px_0] data-[side=right]:[--kit-tip-from:calc(-1*2px)_0] data-[state=delayed-open]:animate-fade-in motion-safe:data-[state=delayed-open]:animate-tip-in",
        "inline-flex w-fit max-w-80 origin-(--kit-origin) items-center gap-1.5 px-2.5 py-1.5",
        className
      )}
      data-slot="tooltip-content"
      {escapeKeydownBehavior}
      {interactOutsideBehavior}
      bind:ref
      {...restProps}
    >
      {#snippet child({ props })}
        <div {...layer}>
          <div {...props}>
            {@render children?.()}
            <!-- Its arrow, drawn on the side it opened from and pointing at
                 its anchor's centre (`--kit-arrow-at`, its layer's), kept
                 clear of its rounded corners: a square of its ink turned
                 half out of its edge. -->
            <span
              aria-hidden="true"
              class={cn(
                "pointer-events-none absolute size-2.5 rotate-45 rounded-xs bg-tx",
                "group-data-[side=top]/tip:top-full group-data-[side=bottom]/tip:bottom-full group-data-[side=top]/tip:left-[clamp(var(--spacing-space-2),var(--kit-arrow-at),calc(100%-var(--spacing-space-2)))] group-data-[side=bottom]/tip:left-[clamp(var(--spacing-space-2),var(--kit-arrow-at),calc(100%-var(--spacing-space-2)))] group-data-[side=top]/tip:-translate-x-1/2 group-data-[side=bottom]/tip:-translate-x-1/2 group-data-[side=top]/tip:-translate-y-[calc(50%+2px)] group-data-[side=bottom]/tip:translate-y-[calc(50%+2px)]",
                "group-data-[side=left]/tip:left-full group-data-[side=right]/tip:right-full group-data-[side=left]/tip:top-[clamp(var(--spacing-space-2),var(--kit-arrow-at),calc(100%-var(--spacing-space-2)))] group-data-[side=right]/tip:top-[clamp(var(--spacing-space-2),var(--kit-arrow-at),calc(100%-var(--spacing-space-2)))] group-data-[side=left]/tip:-translate-y-1/2 group-data-[side=right]/tip:-translate-y-1/2 group-data-[side=left]/tip:-translate-x-[calc(50%+2px)] group-data-[side=right]/tip:translate-x-[calc(50%+2px)]",
                arrowClasses
              )}
              data-slot="tooltip-arrow"
            ></span>
          </div>
        </div>
      {/snippet}
    </TooltipPrimitive.ContentStatic>
  </TooltipPortal>
{/if}
