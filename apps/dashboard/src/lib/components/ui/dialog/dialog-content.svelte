<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The dialog (DESIGN.md, Dialog): a recess tray (18px radius, 6px
   * padding, overlay shadow) holding a raised body (12px radius, 18px
   * padding), 6 + 12 = 18, so the corners are concentric. It enters over
   * --dur-panel on ease-out rising 6px and exits over --dur-exit; with
   * reduced motion only the scrim fades. Every kit dialog and alert dialog.
   */
  export const dialogTrayVariants = tv({
    slots: {
      tray: "rounded-modal bg-surface-recess p-1.5 shadow-overlay motion-safe:data-closed:animate-dialog-out motion-safe:data-open:animate-dialog-in",
      body: "rounded-lg bg-surface-raised p-space-5",
    },
  });

  /** Its callers' widths past the phone, each as they drew it: a form, a
      report (an error's whole text), a document (a diff). Every dialog is as
      tall as its content up to the cap (`c-dialog-max-h`), its body
      scrolling inside; a document stands at the cap from the first frame. */
  export const dialogContentVariants = tv({
    variants: {
      width: {
        form: "phone:max-w-128",
        report: "phone:max-w-168",
        document: "phone:max-w-320",
      },
      height: { cap: "h-c-dialog-max-h" },
    },
  });
  /**
   * The raised body: a frame that holds Close where it stands, and the grid
   * of the caller's content that scrolls inside it. `flush`, for what draws
   * its own padding and gaps; `document`, for a document at the cap (a
   * diff) that lays itself out in a column and scrolls in its own viewer.
   */
  export const dialogBodyVariants = tv({
    slots: {
      frame: "relative flex min-h-0 flex-1 flex-col text-body text-ink-strong",
      grid: "grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain",
    },
    variants: {
      bodyPad: { flush: { frame: "p-0", grid: "gap-0" } },
      body: { document: { grid: "flex flex-col overflow-hidden" } },
    },
  });

  export type DialogContentLooks = VariantProps<typeof dialogContentVariants> &
    VariantProps<typeof dialogBodyVariants>;
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { IconClose } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import DialogPortal from "./dialog-portal.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Dialog from "./index.js";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    showCloseButton = true,
    bodyClass,
    width,
    bodyPad,
    body: bodyLook,
    height,
    restoreScrollDelay = 0,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> &
    DialogContentLooks & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
      children: Snippet;
      showCloseButton?: boolean;
      /** Classes for the content grid inside the raised body. */
      bodyClass?: string;
    } = $props();

  // A dialog whose body changes (a step, an error, a result) tweens to its
  // new height; it is centred, so it grows from the middle.
  const resize = morph();
  const tray = dialogTrayVariants();
  const body = $derived(dialogBodyVariants({ bodyPad, body: bodyLook }));
  $effect(() => {
    if (ref) {
      return resize(ref);
    }
  });
</script>

<DialogPortal {...portalProps}>
  <Dialog.Overlay />
  <!-- Drawn through `child`: bits-ui then holds the body's lock only while it
       is open, and clears it at once (floating-presence). -->
  <DialogPrimitive.Content
    class={cn(
      tray.tray(),
      "fixed top-1/2 left-1/2 z-(--layer-float) flex max-h-c-dialog-max-h w-full max-w-[calc(100%-2rem)] phone:max-w-112 -translate-x-1/2 -translate-y-1/2 flex-col outline-none",
      dialogContentVariants({ width, height }),
      className
    )}
    data-slot="dialog-content"
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      <div {...props} style:pointer-events={pressable(open)}>
        <div data-slot="body" class={cn(tray.body(), body.frame())}>
          <div data-slot="grid" class={cn(body.grid(), bodyClass)}>
            {@render children?.()}
          </div>
          {#if showCloseButton}
            <DialogPrimitive.Close data-slot="dialog-close">
              {#snippet child({ props: closeProps })}
                <Button
                  class="absolute top-3 right-3"
                  size="icon-sm"
                  variant="ghost"
                  {...closeProps}
                >
                  <IconClose />
                  <span class="sr-only">Close</span>
                </Button>
              {/snippet}
            </DialogPrimitive.Close>
          {/if}
        </div>
      </div>
    {/snippet}
  </DialogPrimitive.Content>
</DialogPortal>
