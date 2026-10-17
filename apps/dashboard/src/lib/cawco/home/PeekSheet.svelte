<script lang="ts">
  /**
   * The one peek sheet, in the wide layout only (peek.svelte.ts): a phone
   * opens a session, it does not peek. On an iPad's touch screen it rises
   * from the bottom, as a tab's details do; with a fine pointer it comes in
   * from the right, beside the home it was opened from. Open in the pane
   * dives.
   */
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { afterNavigate } from "$app/navigation";
  import PeekPane from "../PeekPane.svelte";
  import { closePeek, peek, peekable } from "./peek.svelte";

  const touch = new MediaQuery("(hover: none), (pointer: coarse)");

  // The window narrowed into the phone's layout, where there is no peek.
  $effect(() => {
    if (!peekable()) {
      closePeek();
    }
  });

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
  <!-- The peek holds its size from the first frame: it opens on "Reading…" and
       the tail arrives into a sheet already its height, instead of the sheet
       growing under the reader as the transcript lands. -->
  <!-- literal: 80dvh -->
  <Drawer.Content
    data-peek-sheet
    class="vaul-drawer-direction-bottom:h-(--sheet-h) vaul-drawer-direction-bottom:pb-(--safe-bottom)"
    style="--sheet-h: 80dvh"
  >
    <Drawer.Title class="sr-only">Peek</Drawer.Title>
    <Drawer.Description class="sr-only"
      >The tail of one session. Open dives into it; closing keeps your place.</Drawer.Description
    >
    {#if peek.target}
      <PeekPane onclose={closePeek} target={peek.target} />
    {/if}
  </Drawer.Content>
</Drawer.Root>
