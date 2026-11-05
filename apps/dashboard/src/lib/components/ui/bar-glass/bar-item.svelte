<script lang="ts">
  /**
   * One item of a bar's glass group (BarGlass): a bare symbol with no border
   * or fill of its own until hovered or pressed, named for the screen reader
   * and in its tooltip (DESIGN.md, The Title Bars Follow Liquid Glass Rule:
   * "Its items are bare symbols … each named for the screen reader and in its
   * tooltip"). Its recipe is the group's (app.css, `[data-bar-item]`); it
   * stands inside a BarGlass. A link with `href`, else a button; `props` are
   * a primitive's trigger props (a menu's, a sheet's Close), merged in.
   */
  import { mergeProps } from "bits-ui";
  import type { Component } from "svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    label,
    icon: Icon,
    href,
    onclick,
    keys,
    props = {},
    ref = $bindable(null),
    ...rest
  }: {
    /** Its name, for the screen reader and in its tooltip. */
    label: string;
    /** Its symbol. */
    icon: Component<Record<string, unknown>>;
    /** Where it goes, as a link. */
    href?: string;
    onclick?: (event: MouseEvent) => void;
    /** Its shortcut, as the tooltip draws it. */
    keys?: string;
    /** A primitive's trigger props, merged in. */
    props?: Record<string, unknown>;
    ref?: HTMLElement | null;
    [attribute: `data-${string}`]: unknown;
    [aria: `aria-${string}`]: unknown;
    onpointerenter?: (event: PointerEvent) => void;
    onpointerleave?: (event: PointerEvent) => void;
  } = $props();
</script>

<Tip {keys} {label}>
  {#snippet children(tip)}
    {#if href}
      <a
        aria-label={label}
        data-bar-item
        data-box
        {...mergeProps(tip, props, rest)}
        class="select-none touch-hit press-tint"
        {href}
        bind:this={ref}
      >
        <Icon data-slot="bar-symbol" />
      </a>
    {:else}
      <button
        data-bar-item
        data-box
        {...mergeProps(tip, props, rest, { onclick })}
        aria-label={label}
        class="select-none touch-hit press-tint"
        type="button"
        bind:this={ref}
      >
        <Icon data-slot="bar-symbol" aria-hidden="true" />
      </button>
    {/if}
  {/snippet}
</Tip>
