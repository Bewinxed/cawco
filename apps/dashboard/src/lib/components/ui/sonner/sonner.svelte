<script lang="ts">
  import {
    Toaster as Sonner,
    type ToasterProps as SonnerProps,
  } from "svelte-sonner";
  import {
    IconError,
    IconInfo,
    IconSpinner,
    IconSuccess,
    IconWarningTriangle,
  } from "$lib/icons";
  import { theme } from "$lib/theme.svelte";

  let { ...restProps }: SonnerProps = $props();

  /**
   * Toasts paint above everything on the page, a modal dialog included.
   *
   * The layer is a fixed, full-viewport sheet stacked above all app chrome
   * that lets taps through everywhere but on the toasts. A modal `<dialog>`
   * (the image viewer) sits in the browser's top layer, above any z-index,
   * and makes everything outside itself inert: a toast left outside would be
   * hidden under it and take no tap. So while a modal dialog is open the
   * layer moves inside the topmost one, and when it closes the layer goes
   * back home.
   */
  let home = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();

  $effect(() => {
    if (!(home && layer)) {
      return;
    }
    const base = home;
    const toasts = layer;
    /** Moves the layer into the topmost modal dialog, or home when there is none. */
    const settle = () => {
      // Every <dialog> here opens with showModal(), so an open one is modal.
      const modals = [
        ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
      ];
      const into = modals.at(-1) ?? base;
      if (toasts.parentElement !== into) {
        into.append(toasts);
      }
    };
    settle();
    const watcher = new MutationObserver((changes) => {
      if (
        changes.some((change) => change.target instanceof HTMLDialogElement)
      ) {
        settle();
      }
    });
    watcher.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      watcher.disconnect();
      base.append(toasts);
    };
  });
</script>

<!-- sonner paints its toasts from these three variables. They name the
     floating-surface tokens (`.kit-pop` in app.css): the shadcn
     `--color-popover*` names they used to point at are gone from the token
     set, and an unresolved `var()` left every toast transparent — the page
     under it showed through, and its text and buttons read as painted over
     the toast even though the toast was on top and taking the taps. -->
<div class="toast-home" bind:this={home}>
  <div class="toast-layer" bind:this={layer}>
    <Sonner
      class="toaster group"
      style="--normal-bg: var(--surface-raised); --normal-text: var(--ink-strong); --normal-border: var(--border-control);"
      theme={theme.current}
      {...restProps}
    >
      {#snippet loadingIcon()}
        <IconSpinner class="size-4 animate-spin" />
      {/snippet}
      {#snippet successIcon()}
        <IconSuccess class="size-4" />
      {/snippet}
      {#snippet errorIcon()}
        <IconError class="size-4" />
      {/snippet}
      {#snippet infoIcon()}
        <IconInfo class="size-4" />
      {/snippet}
      {#snippet warningIcon()}
        <IconWarningTriangle class="size-4" />
      {/snippet}
    </Sonner>
  </div>
</div>

<style>
  /* Where the layer lives when no modal dialog has it; no box of its own. */
  .toast-home {
    display: contents;
  }

  /* A sheet over the viewport, above the app chrome (the highest is the
     shell's 100), that takes no taps itself; the toasts take their own. */
  .toast-layer {
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
  }
  .toast-layer :global([data-sonner-toast]) {
    pointer-events: auto;
  }

  /* The kit's floating surface, over sonner's own box. One attribute more
     specific than sonner's `[data-sonner-toast][data-styled=true]`, so the
     order the two stylesheets load in does not decide it. */
  :global([data-sonner-toaster] [data-sonner-toast][data-styled="true"]) {
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);
    font: var(--type-body);
  }

  /* A phone's toast sits at the top, under the top bar: at the bottom it
     lands on the composer, which is exactly where the reader is typing.
     Full width less 12px a side. The bar does not pad for the notch, so the
     inset is added here. Sonner's own narrow rules stop at 600px; these hold
     to 640px, where the layout puts the toaster top-centre. */
  @media (max-width: 640px) {
    :global(
      [data-sonner-toaster][data-y-position="top"][data-x-position="center"]
    ) {
      top: calc(env(safe-area-inset-top) + var(--c-top-bar-h) + var(--space-2));
      right: 12px;
      left: 12px;
      width: auto;
      transform: none;
    }
    :global(
      [data-sonner-toaster][data-y-position="top"][data-x-position="center"]
        [data-sonner-toast]
    ) {
      right: 0;
      left: 0;
      width: 100%;
    }
  }
</style>
