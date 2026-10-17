<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' widths past the phone, each as they drew it: a form, a
      report (an error's whole text), a document (a diff). */
  export const dialogContentVariants = tv({
    variants: {
      width: {
        form: "phone:max-w-128",
        report: "phone:max-w-168",
        document: "phone:max-w-320",
      },
    },
  });
  /** The raised body's looks: flush, for what draws its own padding and gaps. */
  export const dialogBodyVariants = tv({
    variants: { bodyPad: { flush: "gap-0 p-0" } },
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
    restoreScrollDelay = 0,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> &
    DialogContentLooks & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
      children: Snippet;
      showCloseButton?: boolean;
      /** Classes for the raised body inside the tray. */
      bodyClass?: string;
    } = $props();

  // A dialog whose body changes (a step, an error, a result) tweens to its
  // new height; it is centred, so it grows from the middle.
  const resize = morph();
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
      "kit-dialog fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] phone:max-w-112 -translate-x-1/2 -translate-y-1/2 outline-none",
      dialogContentVariants({ width }),
      className
    )}
    data-slot="dialog-content"
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      <div {...props} style:pointer-events={pressable(open)}>
        <div
          data-slot="grid"
          class={cn(
            "kit-dialog-body relative grid gap-6 text-body text-ink-strong",
            dialogBodyVariants({ bodyPad }),
            bodyClass
          )}
        >
          {@render children?.()}
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
