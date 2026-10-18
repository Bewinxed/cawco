<script lang="ts">
  /**
   * A phone at 390 × 844: the session as it stands (the live capture by
   * day, its surface at night), Files in the phone's glass beside Caw (the
   * bar's group there, Jump and the machines being in the sidebar), and
   * Files as the kit's bottom drawer (`#lib/components/ui/drawer`, vaul):
   * its grabber, its two snaps (a lower one it opens on, and the recipe's
   * full height), vaul's own drag, which follows the finger, settles on a
   * snap and dismisses past the lower one; its scrim and Close as every
   * sheet's. At the lower snap what the sheet holds is cut to what shows,
   * so both regions keep their heads in sight.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import BarGlass from "./BarGlass.svelte";
  import FilesList from "./FilesList.svelte";
  import {
    type Fill,
    filesOf,
    type Pull,
    READ_ERROR,
    shotPhone,
  } from "./fixtures";

  let {
    pull,
    fill = "typical",
    query = "",
  }: { pull: Pull; fill?: Fill; query?: string } = $props();

  const files = $derived(filesOf(fill));
  const count = $derived(files.artifacts.length + files.attachments.length);
  /**
   * vaul's snaps, as shares of the screen's height: the lower, where it
   * opens (both heads and a row of each region in sight), then full.
   * vaul-svelte opens a sheet at its first snap whatever is bound
   * (huntabyte/vaul-svelte#129, 1.0.0-next.7 the latest), so the snap it
   * opens on is first.
   */
  const SNAPS = [0.75, 1];
  let snap = $state<number | string | null>(SNAPS[0]);
  let open = $state(false);
  $effect.pre(() => {
    open = pull === "open";
  });
</script>

<div class="phone" style:--shot="url({shotPhone})">
  <!-- The phone's glass where the capture's stands, Caw's tab at the
       screen's trailing edge, on the shelf over the capture's. -->
  <div class="bar-end">
    <BarGlass
      {count}
      mark
      onfiles={() => {
        open = true;
      }}
      {open}
      phone
    />
  </div>
</div>
<Drawer.Root
  bind:open
  bind:activeSnapPoint={snap}
  shouldScaleBackground={false}
  snapPoints={SNAPS}
>
  <Drawer.Content class="files-drawer" data-files-sheet>
    <Drawer.Header>
      <Drawer.Title>Files</Drawer.Title>
    </Drawer.Header>
    <div
      class="files-drawer-body"
      style:--snap={typeof snap === "number" ? snap : 1}
    >
      <FilesList
        artifacts={files.artifacts}
        attachments={files.attachments}
        details={fill === "faileddetails"}
        failed={fill === "failed" || fill === "faileddetails"
          ? READ_ERROR
          : null}
        loading={fill === "loading"}
        {query}
      />
    </div>
  </Drawer.Content>
</Drawer.Root>

<style>
  :global(html[data-frame="phone"]),
  :global(html[data-frame="phone"] body) {
    margin: 0;
    overflow: hidden;
    background: var(--tab-sheet);
  }
  .phone {
    position: relative;
    inline-size: 100vw;
    block-size: 100dvh;
    background: var(--tab-sheet) var(--shot) no-repeat 0 0;
  }
  :global(html.dark) .phone {
    background-image: none;
  }
  /* Shell's phone row: the glass tops with the tabs, the bar's height less
     a tab row's from the screen's top, flush with its trailing edge; the
     shelf behind it by day covers the capture's own glass. */
  .bar-end {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: flex;
    align-items: flex-start;
    block-size: var(--c-top-bar-h);
    padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
    padding-inline-start: var(--space-3);
    box-sizing: border-box;
    background: var(--surface-shelf);
  }
  :global(html.dark) .bar-end {
    background: none;
  }
  /* The recipe's height, up to 85vh, from the first frame: vaul's snaps are
     shares of the screen's height, so the sheet holds one height at every
     snap. */
  :global([data-slot="drawer-content"].files-drawer) {
    block-size: min(
      var(--drawer-max-height, 85vh),
      var(--visible-height, 100dvh)
    );
  }
  /* At the lower snap the sheet stands that share of the screen lower:
     what it holds ends where the screen does. */
  .files-drawer-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    padding-block-end: calc((1 - var(--snap)) * 100dvh);
  }
</style>
