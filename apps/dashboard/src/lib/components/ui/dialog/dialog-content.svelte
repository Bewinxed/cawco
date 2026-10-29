<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The dialog (DESIGN.md, Dialog, sheet and drawer). Past the phone line, a
   * recess tray (18px radius, 6px padding, overlay shadow) holding a raised
   * body (12px radius, 18px padding), 6 + 12 = 18, so the corners are
   * concentric; it enters over --dur-panel on ease-out rising 6px and exits
   * over --dur-exit, and with reduced motion only the scrim fades. Under it
   * (Breakpoints: 640px), the drawer's one bottom sheet: the raised surface
   * full-bleed, flush on the screen's foot, 12px top corners, the hairline
   * on its top edge, the grabber, the content 16px in from the sides and
   * 16px plus the safe area above the foot, up to 85vh; it slides its whole
   * height in over --dur-panel on the drawer curve and out over --dur-exit,
   * fading over --dur-control with reduced motion, and a finger drags it
   * down to put it away. Every kit dialog and alert dialog, with no change
   * at the site.
   */
  export const dialogTrayVariants = tv({
    slots: {
      tray: "fixed phone:top-1/2 phone:left-1/2 z-(--layer-float) flex phone:max-h-c-dialog-max-h w-full phone:max-w-112 phone:-translate-x-1/2 phone:-translate-y-1/2 flex-col phone:rounded-modal phone:bg-surface-recess phone:p-1.5 phone:shadow-overlay outline-none phone:motion-safe:data-closed:animate-dialog-out phone:motion-safe:data-open:animate-dialog-in max-phone:inset-x-0 max-phone:bottom-0 max-phone:max-h-c-sheet-max-h max-phone:w-full max-phone:rounded-t-lg max-phone:border-border-hairline max-phone:border-t max-phone:bg-surface-raised max-phone:shadow-drawer max-phone:motion-reduce:data-closed:animate-sheet-fade-out max-phone:motion-reduce:data-open:animate-sheet-fade-in max-phone:motion-safe:data-closed:animate-sheet-out max-phone:motion-safe:data-open:animate-sheet-in",
      body: "phone:rounded-lg bg-surface-raised phone:p-space-5 max-phone:px-4 max-phone:pb-[calc(--spacing(4)+var(--safe-bottom))]",
      /** The sheet's grabber, the drawer's own (ui/drawer), under the phone line only. */
      grabber: "phone:hidden",
      /** Close: the 30px ghost 12px from the tray body's corner; on the
          sheet, at the trailing edge of the title's line under the grabber. */
      close:
        "absolute top-3 right-3 max-phone:top-[calc(--spacing(7)+var(--c-grabber-h)+(var(--text-title)*var(--leading-ui)-var(--c-btn-h-sm))/2)] max-phone:right-4",
    },
  });

  /** Its callers' widths past the phone, each as they drew it: a form, a
      report (an error's whole text), a document (a diff), Add machine (its
      raised body `c-connect-w` wide, the tray's padding round it, so its
      steps wrap as its height ladder was measured). Every dialog is as tall as its
      content up to the cap (`c-dialog-max-h`; the sheet's 85vh under the
      phone line), its body scrolling inside. */
  const dialogContentVariants = tv({
    variants: {
      width: {
        form: "phone:max-w-128",
        report: "phone:max-w-168",
        document: "phone:max-w-320",
        connect: "phone:max-w-[calc(var(--c-connect-w)+2*--spacing(1.5))]",
      },
    },
  });
  /**
   * The raised body: a frame that holds Close where it stands, and the grid
   * of the caller's content that scrolls inside it, its first row (the
   * header) kept clear of Close. Under a finger a control's touch area
   * reaches past its box (`touch-hit`, to the 44px floor: 10.5px under the
   * smallest), which the grid would count as content and scroll by: there
   * the grid keeps that reach (`--hit-foot`) inside its foot, and the body
   * gives it back from its own, so nothing moves and nothing scrolls.
   * `flush`, for what draws its own padding, gaps and clearance (the safe
   * area still kept on the sheet); `document`, for a document (a diff) that
   * lays itself out in a column and scrolls in its own viewer.
   */
  const dialogBodyVariants = tv({
    slots: {
      frame:
        "relative flex min-h-0 flex-1 flex-col phone:coarse:pb-[calc(var(--space-5)-var(--hit-foot))] text-body text-ink-strong coarse:[--hit-foot:calc((var(--c-touch-floor)-var(--c-btn-h-xs))/2+var(--hit-nudge))] max-phone:coarse:pb-[calc(--spacing(4)+var(--safe-bottom)-var(--hit-foot))]",
      grid: "grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain coarse:pb-(--hit-foot)",
    },
    variants: {
      bodyPad: {
        flush: {
          frame:
            "p-0 phone:p-0 phone:coarse:pb-0 max-phone:px-0 max-phone:coarse:pb-(--safe-bottom) max-phone:pb-(--safe-bottom)",
          grid: "gap-0 coarse:pb-0",
        },
      },
      body: { document: { grid: "flex flex-col overflow-hidden" } },
      closed: { true: { grid: "*:first:pe-9" } },
    },
  });

  type DialogContentLooks = VariantProps<typeof dialogContentVariants> &
    Omit<VariantProps<typeof dialogBodyVariants>, "closed">;
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { IconClose } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import DialogPortal from "./dialog-portal.svelte";
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
    restoreScrollDelay = 0,
    modal = true,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> &
    DialogContentLooks & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
      children: Snippet;
      showCloseButton?: boolean;
      /** Classes for the content grid inside the raised body. */
      bodyClass?: string;
      /**
       * Whether it holds the page (DESIGN.md, The Open Page Rule): false for
       * what only shows something (a diff), which stands over a live page
       * with no scrim, no focus trap and no scroll lock, a press on the page
       * landing there while it waits; Close and Esc put it away.
       */
      modal?: boolean;
    } = $props();

  // A dialog whose body changes (a step, an error, a result) tweens to its
  // new height; it is centred, so it grows from the middle.
  const resize = morph();
  const tray = dialogTrayVariants();
  const body = $derived(
    dialogBodyVariants({
      bodyPad,
      body: bodyLook,
      closed: showCloseButton && bodyPad !== "flush",
    })
  );
  $effect(() => {
    if (ref) {
      return resize(ref);
    }
  });

  /* The sheet under the phone line goes back down under the finger, its
     scrim fading with it (motion/drag.svelte.ts), through its own Close, so
     the site hears it close as it would from Close itself. A dialog with no
     Close is not put away by hand. */
  const sheet = new MediaQuery("width < 640px");
  let scrim = $state<HTMLElement | null>(null);
  let close = $state<HTMLElement | null>(null);
  $effect(() => {
    const closer = close;
    if (ref && closer && sheet.current) {
      return dragToDismiss({
        edge: "bottom",
        dismiss: () => closer.click(),
        fade: () => scrim,
      })(ref);
    }
  });
</script>

<DialogPortal {...portalProps}>
  {#if modal}
    <Dialog.Overlay bind:ref={scrim} />
  {/if}
  <!-- Drawn through `child`: bits-ui then holds the body's lock only while it
       is open, and clears it at once (floating-presence). The sheet's slide
       travels its own height (`--sheet-away`, the kit sheet's). -->
  <DialogPrimitive.Content
    class={cn(tray.tray(), dialogContentVariants({ width }), className)}
    data-slot="dialog-content"
    interactOutsideBehavior={modal ? "close" : "ignore"}
    preventScroll={modal}
    {restoreScrollDelay}
    trapFocus={modal}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      <!-- bits-ui (2.19.5) writes `aria-modal="true"` on every dialog's
           content: one that holds nothing says false, to a screen reader too. -->
      <div
        {...props}
        aria-modal={modal ? "true" : "false"}
        role="dialog"
        style:pointer-events={pressable(open)}
        style:--sheet-away="translate3d(0, 100%, 0)"
      >
        <div data-slot="body" class={cn(tray.body(), body.frame())}>
          <div
            aria-hidden="true"
            class={cn(grabberVariants(), tray.grabber())}
            data-slot="dialog-grabber"
          ></div>
          <div data-slot="grid" class={cn(body.grid(), bodyClass)}>
            {@render children?.()}
          </div>
          {#if showCloseButton}
            <DialogPrimitive.Close data-slot="dialog-close">
              {#snippet child({ props: closeProps })}
                <Button
                  class={tray.close()}
                  size="icon-sm"
                  variant="ghost"
                  bind:ref={close}
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
