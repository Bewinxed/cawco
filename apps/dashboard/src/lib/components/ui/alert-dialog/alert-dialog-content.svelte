<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
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
    children,
    ...restProps
  }: WithoutChild<AlertDialogPrimitive.ContentProps> & {
    size?: "default" | "sm";
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof AlertDialogPortal>
    >;
  } = $props();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay />
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
