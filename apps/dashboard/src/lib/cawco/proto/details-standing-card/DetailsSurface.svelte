<script lang="ts">
  /**
   * Where the Standing card stands: on a desk, a card hung from the head's
   * place mark (the kit's popover, anchored on the mark), over the board;
   * on a phone or a touch screen, the bottom sheet, up to 85% of the
   * screen. A press outside, Escape or the mark again puts it away; a flow's
   * face takes the card's whole face in the same surface, the details
   * crossing out as the face crosses in and the card tweening to its size.
   */
  import type { Snippet } from "svelte";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { crossIn, crossOut } from "#lib/platform/motion/curves.svelte.js";

  let {
    anchor,
    open,
    form,
    face,
    title,
    onclose,
    children,
  }: {
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
</script>

{#snippet faces()}
  <div class="relative min-w-0">
    {#key face}
      <div class="min-w-0" in:crossIn out:crossOut>{@render children()}</div>
    {/key}
  </div>
{/snippet}

{#if form === "sheet"}
  <Drawer.Root
    onOpenChange={(next) => {
      if (!next) {
        onclose();
      }
    }}
    {open}
  >
    <Drawer.Content {title}>{@render faces()}</Drawer.Content>
  </Drawer.Root>
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
      side="bottom"
      sideOffset={4}
      style="--pop-w: min(calc(var(--spacing) * 180), calc(100vw - 2 * var(--spacing-space-5)))"
      width="room"
    >
      {@render faces()}
    </Popover.Content>
  </Popover.Root>
{/if}
