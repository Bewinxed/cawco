<script lang="ts">
  import {
    Toaster as Sonner,
    type ToasterProps as SonnerProps,
  } from "svelte-sonner";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    IconError,
    IconInfo,
    IconSuccess,
    IconWarningTriangle,
  } from "$lib/icons";
  import { theme } from "$lib/theme.svelte";
  import { dur } from "$lib/whiffle/motion/curves.svelte";

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

  /**
   * A toast arriving is marked `data-entering` for the length of its
   * entrance, so the stylesheet below can give the arrival its --dur-panel
   * rise while the toasts already there make room on the shorter stack
   * timing: sonner draws both from the same attribute change.
   */
  $effect(() => {
    if (!layer) {
      return;
    }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const enter = (toast: HTMLElement) => {
      toast.dataset.entering = "";
      const timer = setTimeout(() => {
        timers.delete(timer);
        delete toast.dataset.entering;
      }, dur("--dur-panel"));
      timers.add(timer);
    };
    // The first toast arrives inside the list sonner draws for it, so an
    // added node is searched, not only matched.
    const arrivals = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (node.dataset.sonnerToast !== undefined) {
            enter(node);
          }
          for (const toast of node.querySelectorAll<HTMLElement>(
            "[data-sonner-toast]"
          )) {
            enter(toast);
          }
        }
      }
    });
    arrivals.observe(layer, { childList: true, subtree: true });
    return () => {
      arrivals.disconnect();
      for (const timer of timers) {
        clearTimeout(timer);
      }
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
        <Spinner class="size-4" />
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
  /* The toast's action and cancel buttons: the label role, an item's radius,
     and the press every control gives. */
  :global(
    [data-sonner-toaster] [data-sonner-toast][data-styled="true"] [data-button]
  ) {
    border-radius: var(--radius-sm);
    font: var(--type-label);
    transition: transform var(--dur-toggle) var(--ease-out);

    @media (prefers-reduced-motion: no-preference) {
      &:active {
        transform: scale(var(--press-scale));
      }
    }
  }

  /* Motion on the kit's scale (app.css). Sonner has no timing options, so
     its transitions are restated here, one attribute more specific than its
     own rules.
     - Enter: from --pop-rise short of its place on the side of the edge it
       comes from (below at the desktop's bottom-right, above at the phone's
       top-centre), fading and moving over --dur-panel on --ease-out. The
       toast is marked `data-entering` for that length (the script above).
     - The stack closing up or making room: --dur-fade on --ease-in-out.
     - Exit: toward the edge it came from (sonner's own direction) over
       --dur-exit on --ease-out, inside sonner's 200ms before unmount; a toast
       swiped away leaves the way the finger threw it, on the same timing.
     - A toast under a finger keeps sonner's own "no transition", so it tracks
       the finger 1:1; sonner dismisses past 45px or on a flick faster than
       0.11px/ms.
     No height tween: the stack stands expanded (`expand`, in the root
     layout), every toast at its own height, so an arrival grows nothing. */
  :global(
    [data-sonner-toaster]
      [data-sonner-toast][data-y-position="bottom"][data-mounted="false"]
  ) {
    --y: translateY(var(--pop-rise));
  }
  :global(
    [data-sonner-toaster]
      [data-sonner-toast][data-y-position="top"][data-mounted="false"]
  ) {
    --y: translateY(calc(-1 * var(--pop-rise)));
  }
  :global(
    [data-sonner-toaster] [data-sonner-toast]:not([data-swiping="true"])
  ) {
    transition:
      transform var(--dur-fade) var(--ease-in-out),
      opacity var(--dur-fade) var(--ease-out),
      box-shadow var(--dur-control) var(--ease-out);
  }
  :global(
    [data-sonner-toaster]
      [data-sonner-toast][data-entering]:not([data-swiping="true"])
  ) {
    transition:
      transform var(--dur-panel) var(--ease-out),
      opacity var(--dur-panel) var(--ease-out),
      box-shadow var(--dur-control) var(--ease-out);
  }
  :global(
    [data-sonner-toaster]
      [data-sonner-toast][data-removed="true"]:not([data-swiping="true"])
  ) {
    transition:
      transform var(--dur-exit) var(--ease-out),
      opacity var(--dur-exit) var(--ease-out);
  }
  :global([data-sonner-toaster] [data-sonner-toast][data-swipe-out="true"]) {
    animation-duration: var(--dur-exit);
    animation-timing-function: var(--ease-out);
  }
  /* Reduced motion: sonner turns every transition off; the fades stay, and
     a toast swiped away fades where it was let go. */
  @media (prefers-reduced-motion: reduce) {
    :global([data-sonner-toaster] [data-sonner-toast]) {
      transition: opacity var(--dur-panel) var(--ease-out) !important;
    }
    :global([data-sonner-toaster] [data-sonner-toast][data-removed="true"]) {
      opacity: 0;
      transition: opacity var(--dur-exit) var(--ease-out) !important;
    }
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
