<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** The room under it before the content: the grid's gap, or a report's
      wider one (ErrorDialog, its text set apart from its title). */
  const dialogHeaderVariants = tv({
    base: "absolute inset-x-0 top-0 z-2 flex flex-col gap-2 pb-6 phone:px-space-5 phone:pt-space-5 phone:pe-[calc(var(--spacing-space-5)+--spacing(9))] max-phone:px-4 max-phone:pt-[calc(--spacing(7)+var(--spacing-c-grabber-h))] max-phone:pe-[calc(--spacing(4)+--spacing(9))]",
    variants: { foot: { report: "pb-space-7" } },
  });

  type DialogHeaderLooks = VariantProps<typeof dialogHeaderVariants>;
</script>

<script lang="ts">
  /**
   * The dialog's header floats over its content (DESIGN.md, The Title Bars
   * Follow Liquid Glass Rule), as every bar does: laid over the raised
   * body's top (`absolute z-2`), Close at its trailing edge, the body's
   * scroller running to that top beneath it. Its height is the body's room
   * (HeadRoom, `--dialog-room`): the scroller's first line clears the
   * header by it at rest, and scrolled it blurs and fades under it
   * (HeadFade). It stands where the body's own padding put it in flow: the
   * body's inset round it, under the grabber on the phone's sheet, Close's
   * room at its end, the grid's gap under it.
   */
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { headRoom } from "./head-room.svelte.js";

  let {
    ref = $bindable(null),
    class: className,
    foot,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    DialogHeaderLooks = $props();

  const room = headRoom();
  const sized: Attachment<HTMLElement> = (node) => {
    const stop = frameSize(
      (one: HTMLElement) => one.offsetHeight,
      (value) => {
        room.height = value;
      }
    )(node);
    return () => {
      stop?.();
      room.height = null;
    };
  };
</script>

<div
  class={cn(dialogHeaderVariants({ foot }), className)}
  data-slot="dialog-header"
  bind:this={ref}
  {@attach sized}
  {...restProps}
>
  {@render children?.()}
</div>
