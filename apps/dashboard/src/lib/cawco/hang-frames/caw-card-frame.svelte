<script lang="ts">
  /**
   * Caw's card hung open from the top bar's glass, in a `shell` container
   * frame of the width asked for (bar-glass-frame), drawn in place as the
   * Shell draws it: the card (`glass`, `frame="caw"`) holds `children`, and
   * `page` stands under the bar behind it. Caw's head opens and folds the
   * card when `oncaw` is given. Its form is the frame's shell, never the
   * page's: the desk's card at a desk's width, the phone's at a phone's,
   * its trailing side square on the screen's edge.
   */
  import type { Snippet } from "svelte";
  import { glassPlacement } from "#lib/cawco/bar-glass.svelte.js";
  import BarGlassFrame from "#lib/components/ui/bar-glass/bar-glass-frame.svelte";
  import HangCard from "#lib/components/ui/hang-card/hang-card.svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";

  let {
    width,
    height,
    open = true,
    oncaw,
    page,
    children,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    /** The frame's least height, px: room for the card under the bar. */
    height: number;
    /** The card stands open. */
    open?: boolean;
    /** Caw's head pressed: the card opens or folds. */
    oncaw?: () => void;
    /** What stands under the bar, behind the card. */
    page?: Snippet;
    /** What the card holds. */
    children: Snippet;
  } = $props();

  let shell = $state<HTMLElement | null>(null);
  let joined = $state(false);
  const glass = $derived(
    shell?.querySelector<HTMLElement>("[data-bar-group]") ?? null
  );
  /** A phone is the shell under the desk line, as the card's own rules read it. */
  const placement = $derived(glassPlacement(glass, width < 900));
</script>

<BarGlassFrame
  caw={oncaw ? { expanded: open, onclick: oncaw } : undefined}
  {height}
  {joined}
  {width}
  bind:shell
>
  {@render page?.()}
  {#if glass && open}
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
        {@render children()}
      </HangCard>
    </Popover.Root>
  {/if}
</BarGlassFrame>
