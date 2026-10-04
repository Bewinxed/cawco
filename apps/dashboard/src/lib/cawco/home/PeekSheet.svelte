<script lang="ts">
  /**
   * The one peek sheet. On a touch screen or a narrow window it rises from
   * the bottom, as a tab's details do; with a fine pointer it comes in from
   * the right, beside the home it was opened from. Open in the pane dives.
   */
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { afterNavigate } from "$app/navigation";
  import PeekPane from "../PeekPane.svelte";
  import { closePeek, peek } from "./peek.svelte";

  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );

  // A peek belongs to the place it was opened from. Leaving that place puts
  // it away, whichever control did the leaving: its own Open, a rail row, the
  // browser's back.
  afterNavigate(({ from, to }) => {
    if (from && to && from.url.pathname !== to.url.pathname) {
      closePeek();
    }
  });
</script>

<Drawer.Root
  direction={touch.current ? "bottom" : "right"}
  onOpenChange={(open) => {
    peek.open = open;
  }}
  open={peek.open}
>
  <Drawer.Content class="peek-sheet">
    <Drawer.Title class="sr-only">Peek</Drawer.Title>
    <Drawer.Description class="sr-only"
      >The tail of one session. Open dives into it; closing keeps your
      place.</Drawer.Description
    >
    {#if peek.target}
      <PeekPane onclose={closePeek} target={peek.target} />
    {/if}
  </Drawer.Content>
</Drawer.Root>

<style>
  /* The peek holds its size from the first frame: it opens on "Reading…" and
     the tail arrives into a sheet already its height, instead of the sheet
     growing under the reader as the transcript lands. */
  :global(.peek-sheet[data-vaul-drawer-direction="bottom"]) {
    height: 80dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
