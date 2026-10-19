<script lang="ts">
  import {
    Toaster as Sonner,
    type ToasterProps as SonnerProps,
  } from "svelte-sonner";
  import { navSheet } from "#lib/cawco/motion/clock.svelte.js";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconError,
    IconInfo,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { cn } from "#lib/utils.js";

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
   * entrance, so app.css's sonner rules can give the arrival its --dur-panel
   * rise while the toasts already there make room on the shorter stack
   * timing: sonner draws both from the same attribute change.
   *
   * With reduced motion, sonner's own sheet turns every transition and
   * animation off, so a toast would appear and vanish in one frame. Reduced
   * motion means stillness, not an instant swap (DESIGN.md, Reduced Motion
   * Rule): the toast still fades in over --dur-panel and out over --dur-exit,
   * both on --ease-out, through the Web Animations API, which that sheet does
   * not reach. A toast sonner keeps hidden (past the visible count) is left
   * hidden. With motion allowed, the transitions below do all of it.
   */
  $effect(() => {
    if (!layer) {
      return;
    }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const fades = new WeakMap<HTMLElement, Animation>();
    const fade = (
      toast: HTMLElement,
      from: number | string,
      to: number,
      length: "--dur-panel" | "--dur-exit"
    ) => {
      if (motionOk.current || toast.dataset.visible === "false") {
        return;
      }
      fades.get(toast)?.cancel();
      fades.set(
        toast,
        toast.animate([{ opacity: from }, { opacity: to }], {
          duration: dur(length),
          easing: ease("--ease-out"),
        })
      );
    };
    const enter = (toast: HTMLElement) => {
      fade(toast, 0, 1, "--dur-panel");
      toast.dataset.entering = "";
      const timer = setTimeout(() => {
        timers.delete(timer);
        delete toast.dataset.entering;
      }, dur("--dur-panel"));
      timers.add(timer);
    };
    /** A toast leaving from wherever its entrance had got to. */
    const leave = (toast: HTMLElement) => {
      const entering = fades.get(toast)?.playState === "running";
      fade(
        toast,
        entering ? getComputedStyle(toast).opacity : 1,
        0,
        "--dur-exit"
      );
    };
    // The first toast arrives inside the list sonner draws for it, so an
    // added node is searched, not only matched. A toast is marked
    // `data-removed` as it starts to leave, and unmarked if it is kept after
    // all.
    /** A toast's `data-removed` set (it leaves) or cleared (kept after all). */
    const flagged = (toast: HTMLElement, was: string | null) => {
      if (toast.dataset.removed === "true") {
        leave(toast);
      } else if (was === "true") {
        fade(toast, 0, 1, "--dur-panel");
      }
    };
    /** Every toast an added node brings, the node itself included. */
    const arrived = (node: Node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (node.dataset.sonnerToast !== undefined) {
        enter(node);
      }
      for (const toast of node.querySelectorAll<HTMLElement>(
        "[data-sonner-toast]"
      )) {
        enter(toast);
      }
    };
    const arrivals = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type !== "attributes") {
          change.addedNodes.forEach(arrived);
        } else if (change.target instanceof HTMLElement) {
          flagged(change.target, change.oldValue);
        }
      }
    });
    arrivals.observe(layer, {
      childList: true,
      subtree: true,
      attributeFilter: ["data-removed"],
      attributeOldValue: true,
    });
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
<div class="contents" bind:this={home}>
  <!-- A sheet over the viewport, above the app chrome (the highest is the
       shell's 100), that takes no taps itself; the toasts take their own
       (`pointer-events-auto` through sonner's `toastOptions.class`).
       Navigation stays above a toast. While the burger's sheet is open (its
       scrim and panel stand at 50), the layer goes under the scrim: a toast
       arriving then waits dimmed in the content area, and the sheet that
       covers it on a phone or a narrow tablet is never painted over. -->
  <div
    class="pointer-events-none fixed inset-0 z-1000 data-under-nav:z-49"
    bind:this={layer}
    data-slot="toast-layer"
    data-under-nav={navSheet.open || undefined}
  >
    <Sonner
      data-sonner-group
      class="group"
      style="--normal-bg: var(--surface-raised); --normal-text: var(--ink-strong); --normal-border: var(--border-control);"
      theme={theme.current}
      {...restProps}
      toastOptions={{
        ...restProps.toastOptions,
        class: cn("pointer-events-auto", restProps.toastOptions?.class),
      }}
    >
      {#snippet loadingIcon()}
        <Spinner class="size-icon-md" />
      {/snippet}
      {#snippet successIcon()}
        <IconSuccess class="size-icon-md" />
      {/snippet}
      {#snippet errorIcon()}
        <IconError class="size-icon-md" />
      {/snippet}
      {#snippet infoIcon()}
        <IconInfo class="size-icon-md" />
      {/snippet}
      {#snippet warningIcon()}
        <IconWarningTriangle class="size-icon-md" />
      {/snippet}
    </Sonner>
  </div>
</div>
