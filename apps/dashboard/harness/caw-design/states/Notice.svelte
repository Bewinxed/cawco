<script lang="ts">
  /**
   * PROPOSED (notices, B1; pins: "FRONT AND CENTER with a caw", "centering
   * everything alignment is terrible practice", "why are you left-aligning
   * caw", "this notice white rectangle isn't the used pattern"): one recipe
   * for every can't-do state, the kit's Alert (DESIGN.md, Alert: a compact
   * tinted row, never a slab, 10px radius, 10×12px padding, a glyph spanning
   * the title and description, no border) with Caw as its glyph, standing
   * beside the words as an avatar does beside a message, so the title, the
   * line and the buttons keep one start edge.
   *
   * - Tinted by severity on the hue ramps' step 3, the quiet tint
   *   (`error-3` for a failure, `warning-3` for a wait on you): the kit's
   *   variants paint `status-*-bg`, the 24% mix toward step 9 a status chip
   *   wears, which reads as a slab at a row's size.
   * - Title (label) in ink-strong: what happened and why, one line. Line
   *   (body) in the pair's own ink (`status-fail-ink`, `status-attn-ink`,
   *   the kit Alert's): ink-muted measured 4.45:1 on `error-3` by day, short
   *   of 4.5. Both hold 4.5:1 on the tint (the page's check measures them).
   * - Caw at 48 in the lead cell, top-aligned to the title, spanning the
   *   title and the line. His pose is the row's status (needs-you: the way
   *   on is yours). 48 wants a size token (`c-notice-caw`) before it ships.
   * - Footer on the words' start edge: the way out as an `sm` button drawn
   *   in the row's own ink with a real edge (DESIGN.md, The Consequential
   *   Grant Rule's control on a status tint: the tint's ink and a real
   *   edge). On the tints the coral primary's fill measured 2.58:1 and
   *   1.91:1 by night, and the outline's edge 2.11 to 2.85:1, both short of
   *   3:1; the row's ink holds 7.8:1 or more. A second way as the `sm`
   *   ghost where there is one,
   *   and Show details ⌄ (the `sm` ghost) at the row's trailing edge, as the
   *   update notice's footer runs to the panel's trailing edge.
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
  class={[
    "notice grid-cols-[auto_minmax(0,1fr)] gap-x-(--space-3) gap-y-0.5 text-[var(--ink-strong)]",
    tint === "destructive" ? "bg-[var(--error-3)]" : "bg-[var(--warning-3)]",
  ]}
  data-design-notice={tint}
  role="status"
  variant={tint}
>
  <span class="caw col-start-1! row-span-4" data-caw-status="needs-you"
    ><Caw size={48} status="needs-you" /></span
  >
  <AlertTitle
    class="text-[var(--ink-strong)] text-label [overflow-wrap:anywhere]"
    data-design-notice-title>{title}</AlertTitle
  >
  <AlertDescription
    class={[
      "[overflow-wrap:anywhere]",
      tint === "destructive"
        ? "text-[var(--status-fail-ink)]"
        : "text-[var(--status-attn-ink)]",
    ]}
    data-design-notice-line>{line}</AlertDescription
  >
  <div class="foot" data-design-notice-foot>
    <Button
      class={[
        "bg-transparent",
        tint === "destructive"
          ? "border-[var(--status-fail-ink)] text-[var(--status-fail-ink)]"
          : "border-[var(--status-attn-ink)] text-[var(--status-attn-ink)]",
      ]}
      data-design-notice-act
      label={act}
      size="sm"
      variant="outline"
    />
    {#if second}
      <Button label={second} onclick={onsecond} size="sm" variant="ghost" />
    {/if}
    <span class="trail"><DetailsToggle bind:open={shown} /></span>
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
  /* Show details at the row's trailing edge, its words' ink there: the
     ghost's own inset hangs past the edge. */
  .trail {
    margin-inline: auto calc(var(--space-3) * -1 + 1px);
  }
</style>
