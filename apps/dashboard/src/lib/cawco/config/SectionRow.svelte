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
  class="flex min-w-0 flex-col gap-space-1 rounded-sm data-flash:animate-row-flash"
  data-flash={flash || undefined}
  data-flip
  data-row-name={name}
>
  <div
    data-slot="row"
    class="group/row relative flex min-h-c-row-h items-center gap-space-3 rounded-sm px-space-2 py-space-2 transition-control data-two:min-h-c-row-h-two has-link-active:bg-surface-fill light:has-link-active:bg-surface-fill-strong light:has-link-active:inks-strong max-phone:grid max-phone:grid-cols-(--row-cols) max-phone:grid-rows-(--row-rows) max-phone:gap-x-space-3 max-phone:gap-y-space-row"
    data-off={enabled === false || undefined}
    data-two={meta !== undefined || undefined}
    style:--row-cols="var(--c-mark) minmax(0, 1fr) auto"
    style:--row-rows={meta === undefined ? "auto" : "auto auto"}
  >
    <span
      data-slot="tile"
      class="inline-flex size-c-mark flex-none items-center justify-center rounded-sm bg-surface-raised text-ink-muted shadow-tile *:size-icon-md *:flex-none max-phone:row-span-full max-phone:self-center"
      data-share={href ? `icon:${href}` : undefined}
      style:color={hue}
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
    <span
      data-slot="text"
      class="flex min-w-0 flex-auto flex-col gap-space-row max-phone:contents"
    >
      <span
        data-slot="name"
        class="flex min-w-0 items-center gap-space-2 type-label text-ink-strong transition-opacity duration-(--dur-panel) ease-out group-data-off/row:opacity-55 max-phone:col-start-2 max-phone:row-start-1"
        data-mono={mono || undefined}
      >
        {#if href}
          <a
            class="truncate text-inherit no-underline outline-off in-data-mono:type-code after:absolute after:inset-0 after:rounded-inherit focus-visible:after:outline-solid focus-visible:after:outline-(length:--focus-ring-width) focus-visible:after:outline-focus-ring focus-visible:after:outline-offset-(--focus-ring-inset)"
            data-link
            data-share="title:{href}"
            {href}
            {@attach land(() => `title:${href}`, { uniform: true })}>{name}</a
          >
        {:else}
          <span
            data-slot="section-row-label"
            class="truncate text-inherit no-underline outline-off in-data-mono:type-code"
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
          class="truncate type-meta text-ink-muted transition-opacity duration-(--dur-panel) ease-out group-data-off/row:opacity-55 max-phone:col-start-2 max-phone:-col-end-1 max-phone:row-start-2"
          title={meta}>{meta}</span
        >
      {/if}
    </span>
    <!-- A 30px ⋯ and a 32px switch: on a coarse pointer the gap opens to 14px,
         so each touch area reaches 44px before meeting its neighbour's. The
         cluster holds the row's trailing edge at every width: on a phone the
         name gives way beside it and the meta line runs on under both. -->
    <span
      data-slot="controls"
      class="relative z-1 flex flex-none items-center ghost-rest-fill gap-space-2 hit-gap-x-(--space-2) coarse:gap-space-4 coarse:hit-gap-x-(--space-4) max-phone:col-start-3 max-phone:row-start-1"
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
    <div
      class="flex min-w-0 flex-col gap-space-2 pt-0 pe-space-2 pb-space-2 ps-(--below-ps) empty:hidden max-phone:ps-space-2"
      style:--below-ps="calc(var(--space-2) + var(--c-mark) + var(--space-3))"
    >
      {#if note}
        <p
          data-slot="note"
          class="mark-line flex items-start gap-space-2 type-meta wrap-anywhere text-ink-muted tone-fail:text-status-fail-ink"
          data-flip
          data-tone={note.tone}
          role={note.tone === "fail" ? "alert" : "status"}
        >
          <span class="mark-cell">
            {#if note.tone === "busy"}
              <Spinner aria-hidden="true" box="small" class="flex-none" />
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
