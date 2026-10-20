<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The scrim (DESIGN.md, Materials: "the page's own background at 72% with
   * a 2px blur, behind dialogs and sheets"), every kit dialog's, alert
   * dialog's, sheet's and drawer's. It fades in over --dur-panel and out
   * over --dur-exit with its surface. One that leaves before its dialog
   * says it is closed (the lightbox flying its picture home, `leaving`)
   * fades out then.
   */
  export const scrimVariants = tv({
    base: "bg-scrim backdrop-blur-(--scrim-blur) data-closed:animate-kit-fade-out data-open:animate-scrim-in data-[leaving]:animate-kit-fade-out",
  });

  export type ScrimLooks = VariantProps<typeof scrimVariants>;
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { scrimMark } from "#lib/cawco/page-marks.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    leaving = false,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.OverlayProps> & {
    /** It leaves ahead of its dialog's close (the lightbox's flight home). */
    leaving?: boolean;
  } = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence);
     open or closing, it is said on the root for the screen's edges (page-marks). -->
<DialogPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 isolate z-50", className)}
  data-leaving={leaving || undefined}
  data-slot="dialog-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <div
      {...props}
      style:pointer-events={pressable(open)}
      {@attach scrimMark}
    ></div>
  {/snippet}
</DialogPrimitive.Overlay>
