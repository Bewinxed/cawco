<script lang="ts">
  /**
   * PROPOSED (notices, B1; pins: "FRONT AND CENTER with a caw", "centering
   * everything alignment is terrible practice", "why are you left-aligning
   * caw", "this notice white rectangle isn't the used pattern"): one recipe
   * for every can't-do state, the kit's Alert (DESIGN.md, Alert: a compact
   * tinted row, never a slab, 10px radius, 10×12px padding, a glyph spanning
   * the title and description, no border) with Caw as its glyph.
   *
   * - Tinted by severity: `destructive` (the fail pair) for a failure,
   *   `warning` (the needs-you pair) for a wait on you. Its words take the
   *   pair's ink, as the kit's Alert paints them.
   * - Caw at 48 in the lead cell, top-aligned to the title, standing beside
   *   the title and the line: a mark in a row's mark column, never a hero
   *   over the words. His pose is the row's status (needs-you: the way on
   *   is yours). 48 wants a size token (`c-notice-caw`) before it ships.
   * - Title (label): what happened. Line (body): why, and what is safe.
   * - Footer on the words' start edge: the way out as the kit primary
   *   (`sm`), a second way as an outline `sm` where there is one, then Show
   *   details ⌄ (the `sm` ghost, as the update notice's Show changes).
   * - Show details unfolds in the row (Fold, Details).
   * - Nothing centred, no raised surface, no shadow, no edge.
   */
  import Caw from "#lib/cawco/home/Caw.svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Details from "./Details.svelte";
  import DetailsToggle from "./DetailsToggle.svelte";
  import Fold from "./Fold.svelte";

  let {
    tint,
    title,
    line,
    act,
    second = null,
    onsecond,
    raw = null,
    rows = [],
  }: {
    tint: "destructive" | "warning";
    title: string;
    line: string;
    /** The way out: the kit primary. */
    act: string;
    /** A second way, as an outline button. */
    second?: string | null;
    onsecond?: () => void;
    /** The hub's own words, verbatim, behind Show details. */
    raw?: string | null;
    /** Or what the reason is about, one row each: a name then its state. */
    rows?: { name: string; said: string }[];
  } = $props();

  let shown = $state(false);
</script>

<Alert
  class="grid-cols-[auto_minmax(0,1fr)] gap-x-(--space-3) gap-y-0.5"
  data-design-notice={tint}
  role="status"
  variant={tint}
>
  <span class="caw col-start-1! row-span-4" data-caw-status="needs-you"
    ><Caw size={48} status="needs-you" /></span
  >
  <AlertTitle class="text-label [overflow-wrap:anywhere]">{title}</AlertTitle>
  <AlertDescription class="[overflow-wrap:anywhere]">{line}</AlertDescription>
  <div class="foot" data-design-notice-foot>
    <Button label={act} size="sm" />
    {#if second}
      <Button label={second} onclick={onsecond} size="sm" variant="outline" />
    {/if}
    <DetailsToggle bind:open={shown} />
  </div>
  <div class="min-w-0">
    <Fold open={shown}><Details {raw} {rows} /></Fold>
  </div>
</Alert>

<style>
  .caw {
    display: block;
    align-self: start;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-block-start: var(--space-2);
  }
</style>
