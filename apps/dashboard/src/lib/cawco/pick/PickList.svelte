<script lang="ts">
  /**
   * A picker's list of PickRows, in either of the two places a pick is
   * made: a popover's listbox (the session card's chips), or, given `menu`,
   * a context menu's radio group (a session's row and tab menus), where
   * each row is a radio item of the menu's own (bits-ui), so the menu's
   * arrow keys and type-ahead walk the rows as they walk its other items.
   * The list has one tooltip (glide.ts, as a bar's glass has one), which
   * every row's tip is tethered to, so moving from row to row the open
   * tooltip slides over and says the next row's words (glide-tip). In a
   * popover, the hover ghost gliding between the rows is the popover's own
   * (NsPopover `rows`, components/ui/highlight).
   */
  import type { Snippet } from "svelte";
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";
  import { providePickHost } from "./pick-host";

  let {
    label,
    menu,
    children,
  }: {
    label: string;
    /**
     * The list is a context menu's radio group, `value` the row checked. A
     * pick is each row's own `onpick` (PickRow), which the group only
     * follows: its check moves to the row picked, unless the row holds it.
     */
    menu?: { value: string };
    children: Snippet;
  } = $props();

  const glide = provideGlide();
  providePickHost(() => (menu ? "menu" : "list"));
  /**
   * Shared column tracks for every PickRow in the list: leading inset, lead
   * icon, gutter, body, optional force action, trailing check/dot, trailing
   * inset. Owned by the list once (`rows-grid`) and inherited via `row-cells`.
   */
  const ROW_COLS =
    "var(--spacing-space-3) var(--spacing-icon-md) var(--spacing-space-3) minmax(0, 1fr) auto var(--spacing-icon-md) var(--spacing-space-3)";
</script>

{#if menu}
  <ContextMenu.RadioGroup aria-label={label} value={menu.value}>
    <div
      data-slot="list"
      class="rows-grid gap-y-space-1"
      style:--row-col-gap="0px"
      style:--row-cols={ROW_COLS}
    >
      {@render children()}
    </div>
  </ContextMenu.RadioGroup>
{:else}
  <div
    data-slot="list"
    aria-label={label}
    class="rows-grid gap-y-space-1"
    role="listbox"
    style:--row-col-gap="0px"
    style:--row-cols={ROW_COLS}
  >
    {@render children()}
  </div>
{/if}
<GlideTip tether={glide} />
