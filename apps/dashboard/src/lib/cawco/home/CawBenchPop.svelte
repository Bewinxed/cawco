<script lang="ts">
  /**
   * A bench's Caw panel (dev only: /motion/caw-notices, /motion/tool-updates):
   * the real CawPanel on a fixture feed, hung from the top bar's own glass
   * (Shell's `[data-bar-group]`, his group on the desk and his own glass on
   * a phone) where NeedsCaw hangs it, so it stands where it stands in the
   * product. The glass draws its joined foot while it hangs. It opens as
   * GlassCard opens it after a press: focus on the first row, no ring.
   */
  import { cawHeadWords } from "@cawco/core/words/caw-head";
  import { MediaQuery } from "svelte/reactivity";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { DRAWER_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { barGlass, glassPlacement } from "../bar-glass.svelte";
  import CawPanel from "./CawPanel.svelte";
  import type { CawFeed } from "./caw-feed.svelte";

  let { feed, open = $bindable(true) }: { feed: CawFeed; open?: boolean } =
    $props();

  const drawer = new MediaQuery(DRAWER_QUERY);
  let glass = $state<HTMLElement | null>(null);
  $effect(() => {
    glass = document.querySelector<HTMLElement>("[data-bar-group]");
  });
  /** Placed by the viewport, as GlassCard places the product's card. */
  const placement = $derived(glassPlacement(glass, drawer.current));

  function focusFirst(event: Event) {
    event.preventDefault();
    const card = event.currentTarget;
    if (card instanceof HTMLElement) {
      card
        .querySelector<HTMLElement>('a[data-slot="cover"], button')
        ?.focus({ preventScroll: true, focusVisible: false });
    }
  }
</script>

{#if glass}
  <Popover.Root bind:open>
    <HangCard
      data-caw-pop
      align="end"
      anchor={glass}
      aria-label="Needs you"
      collisionPadding={placement.collisionPadding}
      customAnchor={glass}
      escapeKeydownBehavior="ignore"
      frame="caw"
      glass
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={focusFirst}
      side="bottom"
      sideOffset={placement.sideOffset}
      trapFocus={false}
      bind:joined={
        () => barGlass.joined,
        (joined) => {
          barGlass.joined = joined;
        }
      }
    >
      <CawPanel
        {feed}
        onchoose={() => undefined}
        quiet={cawHeadWords.caughtUp}
      />
    </HangCard>
  </Popover.Root>
{/if}
