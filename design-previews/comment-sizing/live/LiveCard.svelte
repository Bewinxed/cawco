<!--
  The preview's live card (comment-card.vite.ts builds it into live-card/):
  the dashboard's own PinFloat in the preview's pin room, as the pane stands
  it beside its pill: the HangCard hung from the pin's foot, its slide, its
  bridge, where it stands and how it keeps still while the page scrolls are
  the product's, never a copy; so is the composer's (`bare`). What it holds
  is the thread as PinCard drew it, or the composer as CommentComposer drew
  it (parts.js), put in by preview.js (`view.fill`). preview.js tells it
  where the pill and what it is about stand (`view`), as the page's overlay
  tells the pane, and opens and shuts it (`open`).
-->
<script>
  import PinFloat from "../../../apps/dashboard/src/lib/cawco/preview/PinFloat.svelte";

  let { view } = $props();
  /** The thread's parts, put in once its holder stands. */
  const filled = (node) => {
    view.fill?.(node);
  };
</script>

{#if view.open}
  <PinFloat
    bare={view.bare}
    bind:float={view.float}
    box={view.box}
    label={view.bare ? "Comment" : `Comment ${view.number}`}
    mark={view.mark}
    pin={view.bare ? undefined : view.number}
    room={view.room}
    sheet={view.sheet}
    slot={view.bare ? "pin-composer" : "pin-card"}
    tail="bottom-start"
  >
    <div class="contents" data-slot="live-thread" {@attach filled}></div>
  </PinFloat>
{/if}
