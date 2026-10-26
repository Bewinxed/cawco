<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { dialogTrayVariants } from "#lib/components/ui/dialog/dialog-content.svelte";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import SheetFrame from "#lib/components/ui/sheet/sheet-frame.svelte";
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
  // centred, so it grows from the middle. Under the phone line it is the
  // dialog's bottom sheet (dialogTrayVariants), grabber and all.
  const resize = morph();
  const tray = dialogTrayVariants();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay {...overlayProps} />
  <AlertDialogPrimitive.Content
    class={cn(
      tray.tray(),
      "group/alert-dialog-content data-[size=sm]:phone:max-w-80",
      className
    )}
    data-size={size}
    data-slot="alert-dialog-content"
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      <SheetFrame away="translate3d(0, 100%, 0)" {open} {props}>
        <!-- One column no wider than the tray: a row's unwrapping title is cut
             to it, never pushes past it. -->
        <div
          data-slot="grid"
          class={cn(
            tray.body(),
            "grid grid-cols-[minmax(0,1fr)] gap-6 text-body text-ink-strong"
          )}
          {@attach resize}
        >
          <div
            aria-hidden="true"
            class={cn(grabberVariants(), tray.grabber(), "-mb-3")}
            data-slot="alert-dialog-grabber"
          ></div>
          {@render children?.()}
        </div>
      </SheetFrame>
    {/snippet}
  </AlertDialogPrimitive.Content>
</AlertDialogPortal>
