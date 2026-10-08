<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
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
    children,
    ...restProps
  }: WithoutChild<AlertDialogPrimitive.ContentProps> & {
    size?: "default" | "sm";
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof AlertDialogPortal>
    >;
    overlayProps?: ComponentProps<typeof AlertDialogOverlay>;
  } = $props();

  // A dialog whose body changes (a failure line, a pending label) tweens to
  // its new height, as ui/dialog's content does; it is centred, so it grows
  // from the middle.
  const resize = morph();
  $effect(() => {
    if (ref) {
      return resize(ref);
    }
  });
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay {...overlayProps} />
  <AlertDialogPrimitive.Content
    class={cn(
      "kit-dialog group/alert-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-md",
      className
    )}
    data-size={size}
    data-slot="alert-dialog-content"
    bind:ref
    {...restProps}
  >
    <div class="kit-dialog-body grid gap-6 text-body text-foreground">
      {@render children?.()}
    </div>
  </AlertDialogPrimitive.Content>
</AlertDialogPortal>
