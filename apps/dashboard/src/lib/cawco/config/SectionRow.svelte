<script lang="ts" module>
  /** What the row's last action came to: running, done, or why it failed. */
  export interface RowNote {
    text: string;
    tone: "busy" | "done" | "fail";
  }
</script>

<script lang="ts">
  /**
   * One row of a section list. The whole row opens the thing when it has an
   * editor, or runs `onpress` (a list's last row that adds to it); the switch, the rollout chip and the ⋯ menu sit above that link
   * so each stays its own target. What the row's last action came to, and a
   * fault, attach underneath as compact lines.
   *
   * The row is one of its list's `reflow()` marks (RowList): a row added,
   * removed or filtered away opens, closes and slides on the list's timing,
   * and so does a line arriving or leaving under it.
   */
  import type { Component, Snippet } from "svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconCheck, IconWarningTriangle } from "#lib/icons.js";
  import { land } from "#lib/platform/motion/share.svelte.js";
  import RowMenu, { type RowAction } from "./RowMenu.svelte";

  let {
    name,
    meta,
    href,
    onpress,
    icon: Icon,
    hue,
    tile,
    mono = false,
    code = false,
    whole = false,
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
    /** What a press on the whole row does, for a row with no editor (the list's add row). */
    onpress?: () => void;
    icon?: Component;
    hue?: string;
    /** Replaces the icon tile, for a harness logo or an OS mark. */
    tile?: Snippet;
    mono?: boolean;
    /** Its meta in the code face, muted (a folder's path, a repository's address). */
    code?: boolean;
    /** Its meta read whole, wrapping at any character, never cut short (a folder's path). */
    whole?: boolean;
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
  class="row-cells min-w-0 gap-y-space-1 rounded-sm data-flash:animate-row-flash"
  data-flash={flash || undefined}
  data-flip
  data-row-name={name}
>
  <div
    data-slot="row"
    class="group/row relative row-cells min-h-control-lg gap-y-space-1 rounded-sm py-space-2 transition-control data-two:min-h-14 has-link-active:bg-surface-hover light:has-link-active:bg-surface-pressed light:has-link-active:inks-strong"
    data-off={enabled === false || undefined}
    data-two={meta !== undefined || undefined}
  >
    <span
      data-slot="tile"
      class="col-start-2 inline-flex size-row-compact flex-none items-center justify-center rounded-sm bg-surface-raised text-ink-muted shadow-sm [&>*]:size-icon-md [&>*]:flex-none @max-xs/rows:row-span-2 @max-xs/rows:self-center"
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
      class="col-start-4 flex min-w-0 flex-col gap-space-1 @max-xs/rows:col-span-2"
    >
      <!-- The name and its badge: where both don't fit, the badge goes
           under the name, so the name never truncates to nothing. -->
      <span
        data-slot="name"
        class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-row type-label text-ink-strong transition-opacity duration-(--duration-panel) ease-out group-data-off/row:opacity-55 max-phone:col-start-2 max-phone:row-start-1"
        data-mono={mono || undefined}
      >
        {#if href}
          <a
            class="truncate text-inherit no-underline outline-off in-data-mono:type-code after:absolute after:inset-0 after:rounded-inherit focus-visible:after:outline-solid focus-visible:after:outline-2 focus-visible:after:outline-accent-ink focus-visible:after:-outline-offset-2"
            data-link
            data-share="title:{href}"
            {href}
            {@attach land(() => `title:${href}`, { uniform: true })}>{name}</a
          >
        {:else if onpress}
          <button
            class="truncate border-none bg-transparent p-0 text-start text-inherit outline-off after:absolute after:inset-0 after:rounded-inherit focus-visible:after:outline-solid focus-visible:after:outline-(length:--focus-ring-width) focus-visible:after:outline-focus-ring focus-visible:after:outline-offset-(--focus-ring-inset)"
            data-link
            onclick={onpress}
            type="button">{name}</button
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
          data-whole={whole || undefined}
          data-code={code || undefined}
          class="truncate type-meta text-ink-muted data-code:type-code data-whole:overflow-visible data-whole:whitespace-normal data-whole:wrap-anywhere transition-opacity duration-(--duration-panel) ease-out group-data-off/row:opacity-55 max-phone:col-start-2 max-phone:-col-end-1 max-phone:row-start-2"
          title={whole ? undefined : meta}>{meta}</span
        >
      {/if}
    </span>
    <!-- A 32px ⋯ and a 32px switch: on a coarse pointer the gap opens to 16px,
         so each touch area reaches 44px before meeting its neighbour's. The
         cluster holds the trailing subgrid rail; in a row too narrow to leave
         the name room beside it (`@max-xs/rows`) it drops onto row 2 at the
         body's start column. -->
    <span
      data-slot="controls"
      class="relative z-1 col-start-5 flex flex-none items-center justify-self-end ghost-rest-fill gap-space-2 hit-gap-x-space-2 coarse:gap-space-4 coarse:hit-gap-x-space-4 not-empty:ms-space-3 @max-xs/rows:col-start-4 @max-xs/rows:col-span-2 @max-xs/rows:row-start-2 @max-xs/rows:ms-0 @max-xs/rows:justify-self-start"
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
      class="col-start-4 col-span-2 max-phone:col-start-2 max-phone:col-span-4 flex min-w-0 flex-col gap-space-2 pb-space-2 empty:hidden"
    >
      {#if note}
        <p
          data-slot="note"
          class="mark-line flex items-start gap-space-2 type-meta wrap-anywhere text-ink-muted tone-fail:text-status-fail"
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
