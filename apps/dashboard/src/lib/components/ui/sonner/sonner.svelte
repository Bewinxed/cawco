<script lang="ts">
  import { mode } from "mode-watcher";
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

  let { ...restProps }: SonnerProps = $props();
</script>

<!-- sonner paints its toasts from these three variables. They name the
     floating-surface tokens (`.kit-pop` in app.css): the shadcn
     `--color-popover*` names they used to point at are gone from the token
     set, and an unresolved `var()` left every toast transparent — the page
     under it showed through, and its text and buttons read as painted over
     the toast even though the toast was on top and taking the taps. -->
<Sonner
  class="toaster group"
  style="--normal-bg: var(--surface-raised); --normal-text: var(--ink-strong); --normal-border: var(--border-control);"
  theme={mode.current}
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

<style>
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
