<script lang="ts">
  /**
   * The one peek sheet, in the wide layout only (peek.svelte.ts): a phone
   * opens a session, it does not peek. On an iPad's touch screen it rises
   * from the bottom, as a tab's details do; with a fine pointer it comes in
   * from the right, `c-peek-sheet-w` wide, beside the home it was opened
   * from, the page giving it that room (`peekBeside`). Open in the pane
   * dives.
   */
  import { peekWords } from "@cawco/core/words/peek";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { afterNavigate } from "$app/navigation";
  import PeekPane from "../PeekPane.svelte";
  import { closePeek, peek, peekable, peekRises } from "./peek.svelte";

  let {
    rises,
    stepsOpen = $bindable(false),
  }: {
    /** It rises from the bottom (a touch screen's) rather than coming in from the right. */
    rises?: boolean;
    /** The plan's steps stand open in its foot tray. */
    stepsOpen?: boolean;
  } = $props();

  /** A touch screen's, unless the page says. */
  const rising = $derived(rises ?? peekRises());

  // The window narrowed into the phone's layout, where there is no peek.
  $effect(() => {
    if (!peekable()) {
      closePeek();
    }
  });

  // A peek belongs to the place it was opened from. Leaving that place puts
  // it away, whichever control did the leaving: its own Open, a rail row, the
  // browser's back. The page's first load comes from no place (`from`
  // holds no url).
  afterNavigate(({ from, to }) => {
    if (from?.url && to?.url && from.url.pathname !== to.url.pathname) {
      closePeek();
    }
  });
</script>

<!-- With a fine pointer the peek stands beside the home and holds nothing
     (DESIGN.md, The Open Page Rule): no scrim, no focus trap, and a press on
     the page lands there while the peek waits (vaul lets a press outside a
     sheet that is not modal through); Close, Esc or leaving the place put it
     away. An iPad's touch screen keeps the drawer's recipe. Its open is the
     peek's own, bound both ways: handed down one way with onOpenChange, a
     sheet put away by a drag down kept its drawer's own copy of the close,
     and setting the peek open again drew nothing, so no Peek opened it. -->

<Drawer.Root
  direction={rising ? "bottom" : "right"}
  modal={rising}
  bind:open={
    () => peek.open,
    (open) => {
      peek.open = open;
    }
  }
>
  <!-- The peek holds its size from the first frame: it opens on "Reading…" and
       the tail arrives into a sheet already its height, instead of the sheet
       growing under the reader as the transcript lands. Its pane's bar is
       the sheet's one bar, Close included (`ownHead`); the name here is
       read out. -->
  <Drawer.Content
    data-peek-sheet
    height="cap"
    modal={rising}
    pad="sheet-safe-bottom"
    style="--drawer-max-height: var(--c-peek-sheet-h)"
    ownHead
    title={peekWords.title}
    trapFocus={rising}
    width="peek"
  >
    <Drawer.Description visible={false}
      >{peekWords.description}</Drawer.Description
    >
    {#if peek.target}
      <PeekPane bind:stepsOpen onclose={closePeek} target={peek.target} />
    {/if}
  </Drawer.Content>
</Drawer.Root>
