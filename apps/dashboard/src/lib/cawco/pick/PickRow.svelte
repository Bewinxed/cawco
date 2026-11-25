<script lang="ts">
  /**
   * One row of a session's account or model picker (in a PickList), the
   * same structure whatever it holds: a lead slot (the account's dot, the
   * model's maker), a name line and one second line, each one line that
   * ends in an ellipsis inside the row, and one trailing slot. Its height is
   * the two lines', whichever details it has; a row with no second line
   * (empty `detail`) is its name alone. Its whole name and second
   * line are its tooltip, the list's one tooltip gliding to it (focus opens
   * it too). The hover ghost is the popover's (NsPopover `rows`
   * `[data-pick-row]`), so the row draws none of its own.
   *
   * With `meter` (an account's room) the second line leads with the room
   * as the house ring, its words saying the figure.
   *
   * The trailing slot holds the check on the one the session shows, or the
   * live dot while the row's limit is checked again. A row at its limit
   * stays a pick: its name goes muted and its second line says the limit in
   * the status ink. Once the limit holds, the force (Move anyway, Pick
   * anyway) stands before the trailing slot in the grant look (DESIGN.md: a
   * choice wider than what was asked is never made more inviting). A row
   * that can't be picked at all is disabled, its second line saying why.
   *
   * In a context menu's PickList (pick-host.ts) the option is a radio item
   * of the menu's own and the force a menu item, so the menu's keys reach
   * both. A pick goes as the menu's (the menu closes, the group takes the
   * value), except a pick `onpick` holds (a row at its limit, being checked
   * again): the menu stays open on the row, its live dot, then its force.
   */
  import { ContextMenu, mergeProps } from "bits-ui";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { glideHere } from "#lib/components/ui/tooltip/glide.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconCheck } from "#lib/icons.js";
  import type { MeterState } from "../usage";
  import UsageRing from "../usage/UsageRing.svelte";
  import { pickHost } from "./pick-host";

  let {
    lead,
    name,
    value,
    detail,
    full,
    limited = false,
    checking = false,
    picked,
    disabled = false,
    mono = false,
    force,
    meter = null,
    onpick,
  }: {
    /** The lead slot's mark: the account's dot, the model's maker. */
    lead: Snippet;
    name: string;
    /** What a menu's radio group takes for it (pick-host.ts `menu`); its name where none is given. */
    value?: string;
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
    /** A budget's share as a meter (DESIGN.md: a fact with a shape is drawn): the ring leading the second line, which says its figure. */
    meter?: { share: number; state: MeterState } | null;
    onpick: () => void;
  } = $props();

  const glide = glideHere();
  const hostNow = pickHost();
  const inMenu = $derived(hostNow() === "menu");
  /** A pick in a menu: `onpick` runs, and a row at its limit holds the menu open on it. */
  const select = (event: Event): void => {
    onpick();
    if (limited) {
      event.preventDefault();
    }
  };
  const OPTION =
    "group row-cells row-start-1 rounded-sm border-none bg-transparent px-0 py-space-2 text-start text-tx select-none press-tint transition-control aria-disabled:cursor-not-allowed";
</script>

{#snippet inside()}
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
      class="min-w-0 truncate text-tx type-label group-aria-disabled:opacity-50 group-data-limited:text-tx-2"
      ><bdi>{name}</bdi></span
    >
    {#if detail && meter}
      <!-- The room as the account chip draws it (AccountSwitch): the ring
           and its figure one unit, the ring a word space from the words. -->
      <span
        data-slot="detail"
        class="flex min-w-0 items-center gap-word mark-line text-tx-2 tabular-nums type-meta group-data-limited:text-orange"
      >
        <span class="flex-none" data-box
          ><UsageRing share={meter.share} state={meter.state} /></span
        >
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{detail}</span
        >
      </span>
    {:else if detail}
      <span
        data-slot="detail"
        class="min-w-0 truncate text-tx-2 tabular-nums type-meta group-data-limited:text-orange data-mono:font-(family-name:--font-mono)"
        data-mono={mono || undefined}>{detail}</span
      >
    {/if}
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
        class="size-icon-md text-accent opacity-0 group-aria-checked:opacity-100 group-aria-selected:opacity-100 motion-safe:transition-[opacity] motion-safe:duration-(--duration-fast) motion-safe:ease-out"
      />
    {/if}
  </span>
{/snippet}

<!-- Spans its PickList's shared columns via `row-cells` (`grid-cols-subgrid`),
     so every row's lead, body, force button, and trailing check stay locked to
     the same vertical rails across the list. -->
<div data-slot="pick-row" class="row-cells">
  <Tip {glide} label={full} side="right" title={name}>
    {#snippet children(tip)}
      {#if inMenu}
        <ContextMenu.RadioItem
          {disabled}
          onSelect={select}
          value={value ?? name}
        >
          {#snippet child({ props })}
            <div
              {...mergeProps(tip, props)}
              data-slot="option"
              aria-busy={checking || undefined}
              class={OPTION}
              data-limited={limited || undefined}
              data-menu-item
            >
              {@render inside()}
            </div>
          {/snippet}
        </ContextMenu.RadioItem>
      {:else}
        <button
          {...tip}
          data-slot="option"
          aria-busy={checking || undefined}
          aria-disabled={disabled || undefined}
          aria-selected={picked}
          class={OPTION}
          data-limited={limited || undefined}
          data-pick-row
          {disabled}
          onclick={onpick}
          role="option"
          type="button"
        >
          {@render inside()}
        </button>
      {/if}
    {/snippet}
  </Tip>
  {#if force && inMenu}
    <ContextMenu.Item onSelect={force.onforce}>
      {#snippet child({ props })}
        <Button
          {...props}
          class="relative col-start-5 row-start-1 me-space-2"
          size="xs"
          variant="grant">{force.action}</Button
        >
      {/snippet}
    </ContextMenu.Item>
  {:else if force}
    <Button
      class="relative col-start-5 row-start-1 me-space-2"
      onclick={force.onforce}
      size="xs"
      variant="grant">{force.action}</Button
    >
  {/if}
</div>
