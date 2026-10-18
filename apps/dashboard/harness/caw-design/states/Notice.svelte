<script lang="ts">
  /**
   * PROPOSED (notices, B1 and B3; pins: "FRONT AND CENTER with a caw",
   * "centering everything alignment is terrible practice", "why are you
   * left-aligning caw", "this notice white rectangle isn't the used
   * pattern"): one recipe for every can't-do state, the kit's Alert
   * (DESIGN.md, Alert: a compact tinted row, never a slab, 10px radius,
   * 10×12px padding, a glyph with the title and description, no border)
   * with Caw as its mark.
   *
   * - `caw` `beside` (B1): Caw at 48 in the lead cell, top-aligned to the
   *   title, as an avatar stands beside a message; the words start the
   *   house gap (--space-3) after his box.
   * - `caw` `above` (B3): Caw at 48 centred over the row as its mark, and
   *   the title, the line and the buttons on one start edge under him.
   * - Caw is his still (CawFace), held inside his 48px box: the animated
   *   Caw's canvas is the artboard's whole size and his acting reaches past
   *   the box, which pushed the words in and the row tall. His pose is the
   *   row's status (needs-you: the way on is yours). His size is the
   *   `c-notice-caw` token (48px).
   * - Tinted by severity on the hue ramps' step 3, the quiet tint
   *   (`error-3` for a failure, `warning-3` for a wait on you): the kit's
   *   variants paint `status-*-bg`, the 24% mix toward step 9 a status chip
   *   wears, which reads as a slab at a row's size.
   * - Title (label) in ink-strong: what happened and why, one line. Line
   *   (body) in the pair's own ink (`status-fail-ink`, `status-attn-ink`,
   *   the kit Alert's): ink-muted measured 4.45:1 on `error-3` by day, short
   *   of 4.5.
   * - Footer on the words' start edge: the way out as an `sm` button in the
   *   row's own ink with a real edge (DESIGN.md, The Consequential Grant
   *   Rule's control on a status tint), where the coral primary's fill
   *   measured 2.58:1 and 1.91:1 on the night tints; a second way as the
   *   `sm` ghost; then Show details ⌄ (the `sm` ghost), all on one edge.
   * - Show details unfolds in the row (Fold, Details).
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Details from "./Details.svelte";
  import DetailsToggle from "./DetailsToggle.svelte";
  import Fold from "./Fold.svelte";
  import { noticeCaw } from "./size";

  let {
    tint,
    title,
    line,
    act,
    caw = "beside",
    second = null,
    onsecond,
    raw = null,
    rows = [],
  }: {
    tint: "destructive" | "warning";
    title: string;
    line: string;
    /** The way out. */
    act: string;
    /** Caw beside the words (B1) or centred above them (B3). */
    caw?: "beside" | "above";
    /** A second way, as a ghost. */
    second?: string | null;
    onsecond?: () => void;
    /** The hub's own words, verbatim, behind Show details. */
    raw?: string | null;
    /** Or what the reason is about, one row each: a name then its state. */
    rows?: { name: string; said: string }[];
  } = $props();

  let shown = $state(false);
  const size = noticeCaw();
  const above = $derived(caw === "above");
</script>

<Alert
  class={[
    "gap-y-0.5 text-[var(--ink-strong)]",
    above
      ? "grid-cols-[minmax(0,1fr)]"
      : "grid-cols-[auto_minmax(0,1fr)] gap-x-(--space-3)",
    tint === "destructive" ? "bg-[var(--error-3)]" : "bg-[var(--warning-3)]",
  ]}
  data-design-notice={tint}
  data-design-notice-caw={caw}
  role="status"
  variant={tint}
>
  <span
    class={["caw", above ? "above" : "col-start-1! row-span-4"]}
    data-caw-status="needs-you"><CawFace {size} status="needs-you" /></span
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
    <DetailsToggle bind:open={shown} />
  </div>
  <div class="min-w-0">
    <Fold open={shown}><Details {raw} {rows} /></Fold>
  </div>
</Alert>

<style>
  .caw {
    display: flex;
    align-self: start;
  }
  /* B3: his mark centred over the row, the words' start edge under him. */
  .caw.above {
    justify-self: center;
    margin-block-end: var(--space-2);
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
