<script lang="ts">
  /**
   * One row of a section list. The whole row opens the thing when it has an
   * editor; the switch, the rollout chip and the ⋯ menu sit above that link
   * so each stays its own target. A fault attaches underneath as one compact
   * line.
   */
  import type { Component, Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { Switch } from "$lib/components/ui/switch";
  import { land } from "$lib/whiffle/motion/share.svelte";
  import RowMenu, { type RowAction } from "./RowMenu.svelte";

  let {
    name,
    meta,
    href,
    icon: Icon,
    hue,
    tile,
    mono = false,
    badge,
    rollout,
    enabled,
    ontoggle,
    toggling = false,
    actions = [],
    trailing,
    below,
    flash = false,
  }: {
    name: string;
    meta?: string;
    /** The editor. Without one the row is not a link. */
    href?: string;
    icon?: Component;
    hue?: string;
    /** Replaces the icon tile, for a harness logo or an OS mark. */
    tile?: Snippet;
    mono?: boolean;
    badge?: Snippet;
    rollout?: Snippet;
    /** Present only for rows that can be switched off. */
    enabled?: boolean;
    ontoggle?: (next: boolean) => void;
    toggling?: boolean;
    actions?: RowAction[];
    /** A control of the row's own, such as a template's Add. */
    trailing?: Snippet;
    /** Faults and anything the row opens in place. */
    below?: Snippet;
    flash?: boolean;
  } = $props();

  /**
   * A row added or removed grows or folds its own height as it fades, so
   * the rows around it slide to their new places instead of jumping. Only a
   * row the operator just made grows in; the list's first paint does not.
   */
  function collapse(node: HTMLElement, { duration }: { duration: number }) {
    const height = node.offsetHeight;
    return {
      duration,
      easing: cubicOut,
      css: (t: number) =>
        `opacity: ${t}; height: ${t * height}px; overflow: hidden;`,
    };
  }
</script>

<li
  class={["item", flash && "flash"]}
  in:collapse={{ duration: flash ? 240 : 0 }}
  out:collapse={{ duration: 200 }}
>
  <div class="row" class:off={enabled === false} class:two={meta !== undefined}>
    <span
      class="tile"
      data-share={href ? `icon:${href}` : undefined}
      style={hue ? `color:${hue}` : undefined}
      {@attach land(() => (href ? `icon:${href}` : undefined))}
    >
      {#if tile}
        {@render tile()}
      {:else if Icon}
        <Icon />
      {/if}
    </span>
    <span class="text">
      <span class={["name", mono && "mono"]}>
        {#if href}
          <a
            class="link"
            data-share="title:{href}"
            {href}
            {@attach land(() => `title:${href}`, { uniform: true })}
            >{name}</a
          >
        {:else}
          {name}
        {/if}
        {#if badge}
          {@render badge()}
        {/if}
      </span>
      {#if meta !== undefined}
        <span class="meta" title={meta}>{meta}</span>
      {/if}
    </span>
    <span class="controls">
      {#if rollout}
        {@render rollout()}
      {/if}
      {#if enabled !== undefined && ontoggle}
        <Switch
          aria-label="{enabled ? 'Turn off' : 'Turn on'} {name}"
          checked={enabled}
          disabled={toggling}
          onCheckedChange={ontoggle}
        />
      {/if}
      {#if trailing}
        {@render trailing()}
      {/if}
      {#if actions.length > 0}
        <RowMenu {actions} label={name} />
      {/if}
    </span>
  </div>
  {#if below}
    <div class="below">{@render below()}</div>
  {/if}
</li>

<style>
  .item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    border-radius: var(--radius-sm);
  }
  .item.flash {
    animation: row-flash 600ms var(--ease-out) both;
  }
  @keyframes row-flash {
    from {
      opacity: 0.35;
    }
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    transition:
      var(--transition-control),
      transform 160ms var(--ease-out);
  }
  /* The whole row is the link's hit area, so the whole row takes the press. */
  .row:has(.link:active) {
    transform: scale(var(--press-scale));
  }
  .row.two {
    min-height: 56px;
  }
  .row:has(.link) {
    cursor: pointer;
  }
  .row:has(.link:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-muted);
  }
  .tile :global(svg) {
    width: 15px;
    height: 15px;
    flex: none;
  }
  .text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    transition: opacity 300ms ease-out;
  }
  .off .text {
    opacity: 0.55;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .name.mono {
    font-family: var(--font-mono);
  }
  .link {
    overflow: hidden;
    color: inherit;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    outline: none;
  }
  /* The whole row is the link's hit area; the controls sit above it. */
  .link::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .meta {
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A 30px ⋯ and a 32px switch: on a coarse pointer the gap opens to 14px,
     so each touch area reaches 44px before meeting its neighbour's. */
  .controls {
    --hit-gap-x: 8px;
    position: relative;
    z-index: 1;
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;

    @media (pointer: coarse) {
      --hit-gap-x: 14px;
      gap: 14px;
    }
  }
  .below:empty {
    display: none;
  }
  .below {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 8px 6px 44px;
    min-width: 0;
  }
  @media (max-width: 640px) {
    .row {
      flex-wrap: wrap;
    }
    .text {
      flex-basis: calc(100% - 36px);
    }
    .controls {
      margin-left: 36px;
    }
    .below {
      padding-left: 8px;
    }
  }
</style>
