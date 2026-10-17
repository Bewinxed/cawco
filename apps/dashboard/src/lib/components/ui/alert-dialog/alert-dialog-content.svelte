<script lang="ts">
  /* eslint-disable shadcn/no-inline-styles -- style:pointer-events overrides bits-ui's run-time inline pointer-events: auto, which no class can (floating-presence.ts pressable) */
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import {
    cn,
    type WithoutChild,
    type WithoutChildrenOrChild,
  } from "#lib/utils.js";
  import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
  import AlertDialogPortal from "./alert-dialog-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    size = "default",
    portalProps,
    overlayProps,
    restoreScrollDelay = 0,
    children,
    ...restProps
  }: WithoutChild<AlertDialogPrimitive.ContentProps> & {
    size?: "default" | "sm";
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof AlertDialogPortal>
    >;
    overlayProps?: ComponentProps<typeof AlertDialogOverlay>;
  } = $props();

  // A dialog whose body changes (a failure line, a pending label, a row
  // folding shut) tweens to its new height; the tray around it follows. It is
  // centred, so it grows from the middle.
  const resize = morph();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay {...overlayProps} />
  <AlertDialogPrimitive.Content
    class={cn(
      "kit-dialog group/alert-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none data-[size=default]:max-w-80 data-[size=default]:phone:max-w-112 data-[size=sm]:max-w-80",
      className
    )}
    data-size={size}
    data-slot="alert-dialog-content"
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    <!-- Drawn through `child`: bits-ui then holds the body's lock only while
         it is open, and clears it at once (floating-presence). -->
    {#snippet child({ props, open })}
      <div {...props} style:pointer-events={pressable(open)}>
        <!-- One column no wider than the tray: a row's unwrapping title is cut
             to it, never pushes past it. -->
        <div
          data-slot="grid"
          class="kit-dialog-body grid grid-cols-[minmax(0,1fr)] gap-6 text-body text-ink-strong"
          {@attach resize}
        >
          {@render children?.()}
        </div>
      </div>
    {/snippet}
  </AlertDialogPrimitive.Content>
</AlertDialogPortal>
