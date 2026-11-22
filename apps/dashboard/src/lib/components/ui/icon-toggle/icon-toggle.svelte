<script lang="ts">
  /**
   * Two-state icon switch on a ghost icon button with a tooltip: the icons
   * cross-swap in place (`.icon-swap`). Replaces the three per-feature
   * switchers (theme, sound, Caw loop) with one kit control.
   */
  import type { Component } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    active,
    label,
    ariaLabel,
    pressed,
    onclick,
    on: OnIcon,
    off: OffIcon,
  }: {
    /** Which glyph is shown: `on` when true, `off` when false. */
    active: boolean;
    /** Tooltip copy describing the current state or action. */
    label: string;
    /** Accessible name when it differs from the tooltip. */
    ariaLabel?: string;
    /** Sets `aria-pressed` when the control is a boolean toggle. */
    pressed?: boolean;
    onclick: () => void;
    /** Glyph shown when `active` is true. */
    on: Component<{ class?: string }>;
    /** Glyph shown when `active` is false. */
    off: Component<{ class?: string }>;
  } = $props();
</script>

<Tip {label}>
  {#snippet children(tip)}
    <Button
      {...tip}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      {onclick}
      size="icon-sm"
      variant="ghost"
    >
      <span class="icon-swap size-icon-md">
        <span data-active={active}><OnIcon class="size-icon-md" /></span>
        <span data-active={!active}><OffIcon class="size-icon-md" /></span>
      </span>
    </Button>
  {/snippet}
</Tip>
