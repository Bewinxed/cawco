<script lang="ts">
  /**
   * Where the project details card stands: on a desk, hung from the head's
   * place mark as one shape with it (the kit's HangCard), the page live
   * beside it; on a phone, the kit's bottom sheet titled with the card's or
   * the step's name, at full height while a step stands, when the step's
   * own bar (Back, its name, Close) is the sheet's one bar. It closes by Done,
   * Escape or a second press on the mark; a press elsewhere on the page
   * leaves it standing, since the page beside it stays live.
   */
  import { Popover } from "bits-ui";
  import type { Snippet } from "svelte";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import HangCard from "#lib/components/ui/hang-card/hang-card.svelte";
  import { hangLayer } from "#lib/components/ui/hang-card/hang-layer.js";

  let {
    open = $bindable(false),
    anchor,
    phone,
    title,
    full = false,
    children,
  }: {
    open?: boolean;
    /** The head's place mark it hangs from. */
    anchor: HTMLElement | null;
    phone: boolean;
    /** The sheet's name: the card's, or the step's. */
    title: string;
    /** A step stands: the sheet takes its full height. */
    full?: boolean;
    children: Snippet;
  } = $props();

  /** The layer the card stands in: the screen it is placed on (hang-layer). */
  const layer = hangLayer();

  /** The card keeps the collision margin clear of the screen's foot, as the kit's floating layers do. */
  const MARGIN = 12;
  /**
   * The room under the mark down to the screen's foot, less its margin: the
   * card's height at most, its body scrolling under its top line past it.
   * Read from the layer (the window in the app, a frame's screen on the
   * canvas), as the session card is placed (PaneTabs).
   */
  let room = $state<number | null>(null);
  $effect(() => {
    const at = anchor;
    if (!(open && at) || phone) {
      return;
    }
    const measure = () => {
      room = Math.max(
        0,
        layer.room().bottom - at.getBoundingClientRect().bottom - MARGIN
      );
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  });
</script>

{#if phone}
  <Drawer.Root bind:open>
    <Drawer.Content
      height={full ? "cap" : undefined}
      ownHead={full}
      portalProps={{ to: layer.to }}
      {title}
    >
      {@render children()}
    </Drawer.Content>
  </Drawer.Root>
{:else if anchor}
  <Popover.Root bind:open>
    <Popover.Portal to={layer.to}>
      <HangCard
        align="start"
        {anchor}
        as={Popover.Content}
        collisionPadding={MARGIN}
        customAnchor={anchor}
        frame="settings"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={0}
        strategy="fixed"
        trapFocus={false}
      >
        <div
          class="contents"
          style:--details-room={room === null ? undefined : `${room}px`}
        >
          {@render children()}
        </div>
      </HangCard>
    </Popover.Portal>
  </Popover.Root>
{/if}
