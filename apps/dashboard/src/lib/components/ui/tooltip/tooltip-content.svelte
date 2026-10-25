<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import { isOpen } from "./tooltip-open";
  import TooltipPortal from "./tooltip-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 0,
    side = "top",
    interactOutsideBehavior = "defer-otherwise-close",
    escapeKeydownBehavior = "defer-otherwise-close",
    children,
    arrowClasses,
    portalProps,
    ...restProps
  }: TooltipPrimitive.ContentProps & {
    arrowClasses?: string;
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
  } = $props();
  /** Its root is open: only then is its portal in the body (tooltip-open.ts). */
  const open = isOpen();
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
    <TooltipPrimitive.Content
      class={cn(
        /* Solid ink, never coral (DESIGN.md, Tooltip): the ink fill, the text
         on it, meta type, 8px radius. It fades in over --dur-fade settling
         2px toward its trigger (`--kit-tip-from`, by its side); it leaves at
         once, so moving on is never held up by the last one. With reduced
         motion only the fade runs. */
        "type-meta rounded-sm bg-ink-solid text-on-ink [--kit-tip-from:0_2px] data-[state$=open]:animate-tip-fade motion-safe:data-[state$=open]:animate-tip-in data-[side=bottom]:[--kit-tip-from:0_-2px] data-[side=left]:[--kit-tip-from:2px_0] data-[side=right]:[--kit-tip-from:-2px_0]",
        "z-(--layer-float) inline-flex w-fit max-w-80 origin-(--bits-tooltip-content-transform-origin) items-center gap-1.5 px-2.5 py-1.5",
        className
      )}
      data-slot="tooltip-content"
      {escapeKeydownBehavior}
      {interactOutsideBehavior}
      {side}
      {sideOffset}
      bind:ref
      {...restProps}
    >
      {@render children?.()}
      <TooltipPrimitive.Arrow>
        {#snippet child({ props })}
          <div
            class={cn(
              "z-1 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-hair bg-ink-solid fill-ink-solid data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]",
              "data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%+2px)]",
              "data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%+1px)]",
              "data-[side=right]:translate-x-[calc(50%+2px)] data-[side=right]:translate-y-1/2",
              "data-[side=left]:-translate-y-[calc(50%-3px)]",
              arrowClasses
            )}
            {...props}
          ></div>
        {/snippet}
      </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
  </TooltipPortal>
{/if}
