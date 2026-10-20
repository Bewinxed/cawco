<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import TooltipPortal from "./tooltip-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 0,
    side = "top",
    children,
    arrowClasses,
    portalProps,
    ...restProps
  }: TooltipPrimitive.ContentProps & {
    arrowClasses?: string;
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
  } = $props();
</script>

<TooltipPortal {...portalProps}>
  <TooltipPrimitive.Content
    class={cn(
      /* Solid ink, never coral (DESIGN.md, Tooltip): the ink fill, the text
         on it, meta type, 8px radius. It fades in over --dur-fade settling
         2px toward its trigger (`--kit-tip-from`, by its side); it leaves at
         once, so moving on is never held up by the last one. With reduced
         motion only the fade runs. */
      "rounded-sm bg-ink-solid text-on-ink type-meta [--kit-tip-from:0_2px] data-[side=bottom]:[--kit-tip-from:0_-2px] data-[side=left]:[--kit-tip-from:2px_0] data-[side=right]:[--kit-tip-from:-2px_0] data-[state$=open]:animate-tip-fade motion-safe:data-[state$=open]:animate-tip-in",
      "z-50 inline-flex w-fit max-w-80 origin-(--bits-tooltip-content-transform-origin) items-center gap-1.5 px-2.5 py-1.5",
      className
    )}
    data-slot="tooltip-content"
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
            "z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-hair bg-[var(--ink-solid)] fill-[var(--ink-solid)] data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]",
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
