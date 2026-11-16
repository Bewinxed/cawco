<script lang="ts">
  /**
   * One row of a session's account or model picker (in a PickList), the
   * same structure whatever it holds: a lead slot (the account's dot, the
   * model's maker), a name line and one second line, each one line that
   * ends in an ellipsis inside the row, and one trailing slot. Its height is
   * the two lines', whichever details it has. Its whole name and second
   * line are its tooltip, the list's one tooltip gliding to it (focus opens
   * it too). The hover ghost is the popover's (NsPopover `rows`
   * `[data-pick-row]`), so the row draws none of its own.
   *
   * The trailing slot holds the check on the one the session shows, or the
   * live dot while the row's limit is checked again. A row at its limit
   * stays a pick: its name goes muted and its second line says the limit in
   * the status ink. Once the limit holds, the force (Move anyway, Pick
   * anyway) stands before the trailing slot in the grant look (DESIGN.md: a
   * choice wider than what was asked is never made more inviting). A row
   * that can't be picked at all is disabled, its second line saying why.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { glideHere } from "#lib/components/ui/tooltip/glide.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconCheck } from "#lib/icons.js";

  let {
    lead,
    name,
    detail,
    full,
    limited = false,
    checking = false,
    picked,
    disabled = false,
    mono = false,
    force,
    onpick,
  }: {
    /** The lead slot's mark: the account's dot, the model's maker. */
    lead: Snippet;
    name: string;
    /** The second line. */
    detail: string;
    /** The tooltip's words under the name: the whole of what the row shortens. */
    full: string;
    /** At its limit: the name muted, the second line in the status ink. */
    limited?: boolean;
    /** Its limit is being checked again: the live dot in the trailing slot. */
    checking?: boolean;
    /** The one the session shows: the check. */
    picked: boolean;
    disabled?: boolean;
    /** The second line is an id, set in the mono face. */
    mono?: boolean;
    /** The force past a limit that held. */
    force?: { action: string; onforce: () => void };
    onpick: () => void;
  } = $props();

  const glide = glideHere();
  /**
   * The row's columns: its inset, the lead slot, the gap to the text, the
   * text, the force's room, the trailing slot, its inset. The insets are
   * tracks rather than the option's padding: on a subgrid, padding sits
   * inside the edge tracks and pushed the lead and the check off them.
   */
  const ROW_COLS =
    "var(--spacing-space-3) var(--spacing-icon-md) var(--spacing-space-3) minmax(0, 1fr) auto var(--spacing-icon-md) var(--spacing-space-3)";
</script>

<!-- One grid for the row. The option spans it on a subgrid, so the force
     standing over its fifth column moves no other column off the edges
     every row keeps. -->
<div
  data-slot="pick-row"
  class="grid grid-cols-(--row-cols) items-center"
  style:--row-cols={ROW_COLS}
>
  <Tip {glide} label={full} side="right" title={name}>
    {#snippet children(tip)}
      <button
        {...tip}
        data-slot="option"
        aria-busy={checking || undefined}
        aria-disabled={disabled || undefined}
        aria-selected={picked}
        class="group col-span-full row-start-1 grid grid-cols-subgrid items-center rounded-sm border-none bg-transparent px-0 py-space-2 text-start text-ink-strong select-none press-tint transition-control aria-disabled:cursor-not-allowed"
        data-limited={limited || undefined}
        data-pick-row
        {disabled}
        onclick={onpick}
        role="option"
        type="button"
      >
        <span
          data-slot="lead"
          aria-hidden="true"
          class="col-start-2 grid size-icon-md place-items-center group-aria-disabled:opacity-50"
          >{@render lead()}</span
        >
        <span
          data-slot="text"
          class="col-start-4 grid min-w-0 grid-cols-1 pe-space-2"
        >
          <span
            data-slot="name"
            class="min-w-0 truncate type-label text-ink-strong group-aria-disabled:opacity-50 group-data-limited:text-ink-muted"
            ><bdi>{name}</bdi></span
          >
          <span
            data-slot="detail"
            class="min-w-0 truncate type-meta text-ink-muted tabular-nums group-data-limited:text-status-attn-ink data-mono:font-(family-name:--font-mono)"
            data-mono={mono || undefined}>{detail}</span
          >
        </span>
        <span
          data-slot="trail"
          class="col-start-6 grid size-icon-md place-items-center"
          data-box
        >
          {#if checking}
            <LiveDot size="row" />
          {:else}
            <IconCheck
              aria-hidden="true"
              class="size-icon-md text-selected-icon opacity-0 group-aria-selected:opacity-100 motion-safe:transition-[opacity] motion-safe:duration-(--duration-control) motion-safe:ease-out"
            />
          {/if}
        </span>
      </button>
    {/snippet}
  </Tip>
  {#if force}
    <Button
      class="relative col-start-5 row-start-1 me-space-2"
      onclick={force.onforce}
      size="xs"
      variant="grant">{force.action}</Button
    >
  {/if}
</div>
