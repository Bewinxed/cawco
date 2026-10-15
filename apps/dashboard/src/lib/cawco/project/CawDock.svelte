<script lang="ts">
  /**
   * Caw's dock beside a project's page: the side surface (SideSurface) with
   * the threads menu as its title (ThreadsMenu) and the thread drawn by the
   * pane a thread tab is (ThreadPane, docked), its composer at its foot and
   * Caw on it. It opens on the project's newest thread, or on the hero when
   * there is none; New thread opens an empty one on the hero, and its first
   * message makes the thread the dock then shows. Caw's settings are the
   * project's, under the head's `⋯`, not here.
   */
  import { untrack } from "svelte";
  import { threadsOf } from "#lib/cawco/client.svelte.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import ThreadPane from "#lib/cawco/ThreadPane.svelte";
  import { newThreadTabId, threadTabId } from "#lib/cawco/thread-tabs.js";
  import ThreadsMenu from "./ThreadsMenu.svelte";

  let {
    projectId,
    projectName,
    onclose,
    sheet = false,
  }: {
    projectId: string;
    projectName: string;
    onclose: () => void;
    /** Drawn in the phone's bottom sheet, not the desk's split. */
    sheet?: boolean;
  } = $props();

  const threads = $derived(threadsOf(projectId));
  /**
   * The thread on show: the newest when the dock opens; null, a new one.
   * `fresh`: New thread was chosen, so a newest arriving later does not
   * take its place.
   */
  let threadId = $state<string | null>(
    untrack(() => threadsOf(projectId)[0]?.id ?? null)
  );
  let fresh = $state(false);
  $effect(() => {
    const newest = threads[0]?.id;
    if (newest && threadId === null && !fresh) {
      threadId = newest;
    }
  });
  /**
   * A choice from the menu draws its thread afresh; the thread a first
   * message makes keeps the pane that sent it, so the words land in it.
   */
  let chosen = $state(0);

  function choose(next: string | null) {
    threadId = next;
    fresh = next === null;
    chosen += 1;
  }

  const viewId = $derived(
    threadId ? threadTabId(threadId) : newThreadTabId(projectId)
  );
</script>

{#snippet title()}
  <ThreadsMenu onchoose={choose} shown={threadId} {threads} />
{/snippet}

<div class={["caw-dock", { sheet }]} data-caw-dock>
  <SideSurface
    label="Caw, lead of {projectName}"
    {onclose}
    titleControl={title}
  >
    {#key chosen}
      <ThreadPane
        active
        docked={{
          onthread: (id) => {
            threadId = id;
            fresh = false;
          },
        }}
        {viewId}
        visible
      />
    {/key}
  </SideSurface>
</div>

<style>
  .caw-dock {
    display: flex;
    flex: 1 1 auto;
    min-inline-size: 0;
    block-size: 100%;
  }
  /* In the phone's sheet: the sheet's height, less its grab. */
  .caw-dock.sheet {
    block-size: 85dvh;
  }
  .caw-dock > :global(.side-card) {
    flex: 1 1 auto;
  }
  /* In the sheet the sheet is the surface: the card draws no frame of its
     own inside it (no second shadow, corner or ground). */
  .caw-dock.sheet > :global(.side-card) {
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
</style>
