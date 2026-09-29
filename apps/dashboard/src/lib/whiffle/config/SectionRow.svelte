<script lang="ts" module>
  import { depart } from "$lib/whiffle/motion/share.svelte";

  /** What the row's last action came to: running, done, or why it failed. */
  export interface RowNote {
    text: string;
    tone: "busy" | "done" | "fail";
  }

  /**
   * A row about to become another: its icon and title take off for the row
   * `href` names, which lands them when it mounts (a starter template turning
   * into the hook it wrote). Called before the list changes.
   */
  export function departInto(name: string, href: string): void {
    const row = document.querySelector<HTMLElement>(
      `[data-row-name="${CSS.escape(name)}"]`
    );
    for (const [part, key] of [
      [".tile", `icon:${href}`],
      [".label", `title:${href}`],
    ]) {
      const piece = row?.querySelector<HTMLElement>(part);
      if (piece) {
        piece.dataset.share = key;
        depart(piece);
      }
    }
  }
</script>

<script lang="ts">
  /**
   * One row of a section list. The whole row opens the thing when it has an
   * editor; the switch, the rollout chip and the ⋯ menu sit above that link
   * so each stays its own target. What the row's last action came to, and a
   * fault, attach underneath as compact lines.
   *
   * The row is one of its list's `reflow()` marks (RowList): a row added,
   * removed or filtered away opens, closes and slides on the list's timing,
   * and so does a line arriving or leaving under it.
   */
  import type { Component, Snippet } from "svelte";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Switch } from "$lib/components/ui/switch";
  import { IconCheck, IconWarningTriangle } from "$lib/icons";
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
    note,
    share,
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
    note?: RowNote;
    /**
     * For a row with no editor: the key its icon and title land from (a
     * plugin flying in from the marketplace listing it was installed from).
     */
    share?: string;
    flash?: boolean;
  } = $props();
</script>

<li class={["item", flash && "flash"]} data-flip data-row-name={name}>
  <div class="row" class:off={enabled === false} class:two={meta !== undefined}>
    <span
      class="tile"
      data-share={href ? `icon:${href}` : undefined}
      style={hue ? `color:${hue}` : undefined}
      {@attach land(() => {
        const key = href ?? share;
        return key ? `icon:${key}` : undefined;
      })}
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
          <span
            class="label"
            {@attach land(() => (share ? `title:${share}` : undefined), {
              uniform: true,
            })}
            >{name}</span
          >
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
        <!-- It shows what the row's `enabled` says: a switch whose save
             fails goes back to its old side when the page puts it back. -->
        <Switch
          aria-label="{enabled ? 'Turn off' : 'Turn on'} {name}"
          disabled={toggling}
          bind:checked={() => enabled === true, (next) => ontoggle?.(next)}
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
  {#if below || note}
    <div class="below">
      {#if note}
        <p
          class="note"
          data-flip
          data-tone={note.tone}
          role={note.tone === 'fail' ? 'alert' : 'status'}
        >
          {#if note.tone === 'busy'}
            <Spinner aria-hidden="true" />
          {:else if note.tone === 'fail'}
            <IconWarningTriangle />
          {:else}
            <IconCheck />
          {/if}
          <span>{note.text}</span>
        </p>
      {/if}
      {@render below?.()}
    </div>
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
    transition: var(--transition-control);
  }
  /* The whole row is the link's hit area, so the whole row takes the press:
     the tint .press-tint gives (app.css), keyed on the link rather than the
     row, because the row's own switch and buttons are pressed inside it too. */
  .row:has(.link:active) {
    background-color: var(--surface-fill);
  }
  .row.two {
    min-height: 56px;
  }
  .row:has(.link) {
    cursor: pointer;
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
    width: 16px;
    height: 16px;
    flex: none;
  }
  .text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    transition: opacity var(--dur-panel) var(--ease-out);
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
  .link,
  .label {
    overflow: hidden;
    color: inherit;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    outline: none;
  }
  /* The whole row is the link's hit area; the controls sit above it, and
     the focus ring is drawn round that area rather than round the words. */
  .link::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .link:focus-visible::after {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
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
  .note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;

    & :global(svg) {
      width: 12px;
      height: 12px;
      flex: none;
      margin-block-start: 2px;
    }
    &[data-tone="fail"] {
      color: var(--status-fail-ink);
    }
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
