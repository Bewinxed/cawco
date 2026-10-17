<script lang="ts">
  /**
   * A phone at 390 × 844: the session as it stands (the live capture by
   * day, its surface at night), and Files as the kit's drawer from the
   * right edge (`#lib/components/ui/drawer`, vaul-svelte's `direction`
   * "right"): vaul's own drag follows the finger, settles open or goes back,
   * and dismisses past its threshold; its scrim and Close as every sheet's.
   * vaul opens a drawer from its trigger or `open`, never from an edge
   * swipe, so the session card's Files chip is what opens it.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import FilesList from "./FilesList.svelte";
  import { type Fill, filesOf, type Pull, READ_ERROR, shotPhone } from "./fixtures";

  let {
    pull,
    fill = "typical",
    query = "",
  }: { pull: Pull; fill?: Fill; query?: string } = $props();

  const files = $derived(filesOf(fill));
  let open = $state(false);
  $effect.pre(() => {
    open = pull === "open";
  });
</script>

<div class="phone" style:--shot="url({shotPhone})"></div>
<Drawer.Root bind:open direction="right" shouldScaleBackground={false}>
  <Drawer.Content class="files-drawer" data-files-sheet>
    <Drawer.Header>
      <Drawer.Title>Files</Drawer.Title>
    </Drawer.Header>
    <div class="files-drawer-body">
      <FilesList
        artifacts={files.artifacts}
        attachments={files.attachments}
        details={fill === "faileddetails"}
        failed={fill === "failed" || fill === "faileddetails" ? READ_ERROR : null}
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
    inline-size: 100vw;
    block-size: 100dvh;
    background: var(--tab-sheet) var(--shot) no-repeat 0 0;
  }
  :global(html.dark) .phone {
    background-image: none;
  }
  /* The drawer from the right is the screen's height; what it holds stands
     in its surface and scrolls inside its regions. */
  :global([data-slot="drawer-content"].files-drawer) {
    block-size: 100dvh;
  }
  .files-drawer-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
</style>
