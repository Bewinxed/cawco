<script lang="ts">
  /**
   * Where the Standing card stands: on a desk, a card hung from the head's
   * place mark (the kit's popover, anchored on the mark), over the board;
   * on a phone or a touch screen, the bottom sheet, up to 85% of the
   * screen. A press outside, Escape or the mark again puts it away; a flow's
   * face takes the card's whole face in the same surface, the details
   * crossing out as the face crosses in and the card tweening to its size.
   *
   * `stage`: a box that stands for the screen (a canvas frame's shell): the
   * card is placed inside it and kept within it, and the sheet rises from
   * its foot, drawn in place there.
   */
  import type { Snippet } from "svelte";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { crossIn, crossOut } from "#lib/platform/motion/curves.svelte.js";

  let {
    stage = null,
    anchor,
    open,
    form,
    face,
    title,
    onclose,
    children,
  }: {
    /** A box standing for the screen; null: the screen itself. */
    stage?: HTMLElement | null;
    /** The head's place mark it hangs from. */
    anchor: HTMLElement | null;
    open: boolean;
    form: "card" | "sheet";
    /** Which face it holds: a change crosses from one to the next. */
    face: string;
    /** Its name: the sheet's head on a phone, the card's for a screen reader. */
    title: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  /** The box the sheet rises in, over the stage's foot. */
  let layer = $state<HTMLElement | null>(null);
</script>

{#snippet faces()}
  <div class="relative min-w-0">
    {#key face}
      <div class="min-w-0" in:crossIn out:crossOut>{@render children()}</div>
    {/key}
  </div>
{/snippet}

{#snippet sheet(container: HTMLElement | null)}
  <Drawer.Root
    {container}
    onOpenChange={(next) => {
      if (!next) {
        onclose();
      }
    }}
    {open}
    shouldScaleBackground={false}
  >
    <Drawer.Content
      contained={container !== null}
      portalProps={{ disabled: container !== null }}
      {title}
      ><div class={["min-h-0 overflow-y-auto", Drawer.scroller]}>
        {@render faces()}
      </div></Drawer.Content
    >
  </Drawer.Root>
{/snippet}

{#if form === "sheet" && stage}
  <!-- Drawn in place over the stage's foot, up to 85% of its height. -->
  <div class="absolute inset-x-0 bottom-0 z-10 h-17/20" bind:this={layer}>
    {#if layer}{@render sheet(layer)}{/if}
  </div>
{:else if form === "sheet"}
  {@render sheet(null)}
{:else if anchor}
  <Popover.Root
    onOpenChange={(next) => {
      if (!next) {
        onclose();
      }
    }}
    {open}
  >
    <Popover.Content
      align="start"
      aria-label={title}
      collisionBoundary={stage ?? undefined}
      customAnchor={anchor}
      height="available"
      onInteractOutside={(event) => {
        if (event.target instanceof Node && anchor.contains(event.target)) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      overflow="scroll"
      pad="none"
      portalProps={stage ? { to: stage } : undefined}
      side="bottom"
      sideOffset={4}
      style="--pop-w: min(calc(var(--spacing) * 180), calc(100cqi - 2 * var(--spacing-space-5)))"
      width="room"
    >
      {@render faces()}
    </Popover.Content>
  </Popover.Root>
{/if}
