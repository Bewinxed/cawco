<script lang="ts" module>
  import { depart } from "#lib/cawco/motion/share.svelte.js";

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
      ['[data-slot="tile"]', `icon:${href}`],
      ['[data-slot="section-row-label"]', `title:${href}`],
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
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconCheck, IconWarningTriangle } from "#lib/icons.js";
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

<li
  data-slot="item"
  class="flex min-w-0 flex-col gap-space-1 rounded-sm"
  data-flash={flash || undefined}
  data-flip
  data-row-name={name}
>
  <!-- literal: 44px, 56px, 10px, 8px, 6px -->
  <div
    data-slot="row"
    class="group/row relative flex min-h-(--row-h) items-center gap-(--row-gap) rounded-sm px-(--row-px) py-(--row-py) transition-control data-two:min-h-(--row-h-two) has-data-link:cursor-pointer has-link-active:bg-surface-fill light:has-link-active:bg-surface-fill-strong light:has-link-active:inks-strong max-phone:flex-wrap"
    data-off={enabled === false || undefined}
    data-two={meta !== undefined || undefined}
    style:--row-gap="10px"
    style:--row-h="44px"
    style:--row-h-two="56px"
    style:--row-px="8px"
    style:--row-py="6px"
  >
    <!-- literal: 26px -->
    <span
      data-slot="tile"
      class="inline-flex size-(--tile) flex-none items-center justify-center rounded-sm bg-surface-raised text-(color:--tile-ink) shadow-tile"
      data-share={href ? `icon:${href}` : undefined}
      style:--tile="26px"
      style:--tile-ink={hue ?? "var(--ink-muted)"}
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
    <!-- literal: 1px, calc(100% - 36px) -->
    <span
      data-slot="text"
      class="flex min-w-0 flex-auto flex-col gap-(--text-gap) transition-opacity dur-panel ease-out group-data-off/row:opacity-55 max-phone:basis-(--text-basis)"
      style:--text-basis="calc(100% - 36px)"
      style:--text-gap="1px"
    >
      <!-- literal: 8px -->
      <span
        data-slot="name"
        class="flex min-w-0 items-center gap-(--name-gap) type-label text-ink-strong data-mono:font-(family-name:--font-mono)"
        data-mono={mono || undefined}
        style:--name-gap="8px"
      >
        {#if href}
          <a
            class="truncate text-inherit no-underline outline-none"
            data-link
            data-share="title:{href}"
            {href}
            {@attach land(() => `title:${href}`, { uniform: true })}>{name}</a
          >
        {:else}
          <span
            data-slot="section-row-label"
            class="truncate text-inherit no-underline outline-none"
            {@attach land(() => (share ? `title:${share}` : undefined), {
              uniform: true,
            })}>{name}</span
          >
        {/if}
        {#if badge}
          {@render badge()}
        {/if}
      </span>
      {#if meta !== undefined}
        <span
          data-slot="meta"
          class="truncate type-meta text-ink-muted"
          title={meta}>{meta}</span
        >
      {/if}
    </span>
    <!-- A 30px ⋯ and a 32px switch: on a coarse pointer the gap opens to 14px,
         so each touch area reaches 44px before meeting its neighbour's. -->
    <!-- literal: 8px, 14px, 36px -->
    <span
      data-slot="controls"
      class="relative z-1 flex flex-none items-center gap-(--hit-gap-x) coarse:hit-gap-coarse-(--hit-gap-wide) max-phone:ml-(--controls-ml)"
      style:--controls-ml="36px"
      style:--hit-gap-wide="14px"
      style:--hit-gap-x="var(--hit-gap-coarse, 8px)"
    >
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
    <!-- literal: 6px, 8px, 44px -->
    <div
      class="flex min-w-0 flex-col gap-(--below-gap) pt-0 pr-(--below-px) pb-(--below-gap) pl-(--below-pl) empty:hidden max-phone:pl-(--below-px)"
      style:--below-gap="6px"
      style:--below-pl="44px"
      style:--below-px="8px"
    >
      {#if note}
        <!-- literal: 6px -->
        <p
          data-slot="note"
          class="mark-line flex items-start gap-(--below-gap) type-meta wrap-anywhere text-ink-muted tone-fail:text-status-fail-ink"
          data-flip
          data-tone={note.tone}
          role={note.tone === "fail" ? "alert" : "status"}
          style:--below-gap="6px"
        >
          <span class="mark-cell">
            {#if note.tone === "busy"}
              <Spinner aria-hidden="true" class="size-icon-sm flex-none" />
            {:else if note.tone === "fail"}
              <IconWarningTriangle class="size-icon-sm flex-none" />
            {:else}
              <IconCheck class="size-icon-sm flex-none" />
            {/if}
          </span>
          <span>{note.text}</span>
        </p>
      {/if}
      {@render below?.()}
    </div>
  {/if}
</li>

<style>
  /* residual: keyframes */
  [data-flash] {
    animation: row-flash calc(var(--dur-fade) * 3) var(--ease-out) both;
  }
  @keyframes row-flash {
    from {
      opacity: 0.35;
    }
  }
  /* residual: foreign-dom */
  /* The icon tile holds a snippet's or a component's svg, which takes no class. */
  [data-slot="tile"] :global(svg) {
    width: var(--icon-md);
    height: var(--icon-md);
    flex: none;
  }
  /* A control that rests clear in the row stands on the row's ghost, by day
     the hover step itself: its own hover is the step past it. The kit's
     ghost button (RowMenu's trigger), whose ink is already the strong one. */
  @media (hover: hover) {
    [data-slot="controls"] :global([data-ghost]:hover:not(:disabled)) {
      background: light-dark(var(--surface-fill-strong), var(--surface-hover));
    }
  }
  /* residual: pseudo */
  /* The whole row is the link's hit area; the controls sit above it, and
     the focus ring is drawn round that area rather than round the words. */
  [data-link]::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  [data-link]:focus-visible::after {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
</style>
