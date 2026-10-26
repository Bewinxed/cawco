<script lang="ts">
  /**
   * HangCard in a frame of its own (its states file's): Caw's card (`glass`,
   * `frame="caw"`) hung open from the bar's glass in a `shell` container of
   * the width asked for (bar-glass-frame), drawn in place as the Shell draws
   * it, with stand-in rows where Caw's panel's stand, so no store is read.
   * Its form is the frame's shell, never the page's: the desk's card at
   * 1440, the phone's at 390, its trailing side square on the screen's edge.
   */
  import { glassPlacement } from "#lib/cawco/bar-glass.svelte.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import BarGlassFrame from "../bar-glass/bar-glass-frame.svelte";
  import HangCard from "./hang-card.svelte";

  let {
    width,
    height,
    rows,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    /** The frame's least height, px: room for the card under the bar. */
    height: number;
    /** The card's rows, each a line of words. */
    rows: string[];
  } = $props();

  let shell = $state<HTMLElement | null>(null);
  let joined = $state(false);
  const glass = $derived(
    shell?.querySelector<HTMLElement>("[data-bar-group]") ?? null
  );
  /** A phone is the shell under the desk line, as the card's own rules read it. */
  const placement = $derived(glassPlacement(glass, width < 900));
</script>

<BarGlassFrame {height} {joined} {width} bind:shell>
  {#if glass}
    <Popover.Root open>
      <HangCard
        align="end"
        anchor={glass}
        collisionPadding={placement.collisionPadding}
        customAnchor={glass}
        forceMount
        frame="caw"
        glass
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={placement.sideOffset}
        strategy="fixed"
        trapFocus={false}
        bind:joined
      >
        {#each rows as row (row)}
          <p class="px-space-2 py-space-2 text-label text-ink-strong">{row}</p>
        {/each}
      </HangCard>
    </Popover.Root>
  {/if}
</BarGlassFrame>
