<script lang="ts">
  /**
   * The one place conversations are mounted. A pane is created the first
   * time a group asks for it — a slot appears — and kept until the
   * conversation is closed everywhere, whatever happens to the groups in
   * between. Where it is drawn is the slot's business; see `dock.svelte.ts`.
   *
   * The pen the panes are born in is the surface's full box, hidden rather
   * than collapsed, so a transcript that measures before its first dock
   * measures a real viewport and not a zero one.
   */
  import { onMount, untrack } from "svelte";
  import WorkflowRunView from "#lib/components/features/workflows/WorkflowRunView.svelte";
  import type { ServerTail } from "../client.svelte";
  import SessionPane from "../SessionPane.svelte";
  import ThreadPane from "../ThreadPane.svelte";
  import { isThreadTab } from "../thread-tabs";
  import Lightbox from "../transcript/Lightbox.svelte";
  import { runIdOf } from "../workflow-runs";
  import { dock, shownPanes, slots } from "./dock.svelte";
  import { contextOf, workspace } from "./workspace.svelte";

  let {
    entryId = "",
    entryTail = null,
  }: {
    /** Which conversation this page's server data belongs to, if any. */
    entryId?: string;
    entryTail?: ServerTail | null;
  } = $props();

  let hosted = $state<string[]>([]);
  /** Whether the page has painted: what is asked for before then is built with it. */
  let entered = false;
  onMount(() => {
    const frame = requestAnimationFrame(() => {
      entered = true;
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * A pane asked for after the page is up is built once the frame that
   * answered the ask has painted. Building one is a whole transcript — rows,
   * virtualiser, a first layout, ~100ms on a long one — and done in the
   * change that opened or chose its tab, the tab itself was not drawn until
   * it finished. The tab answers in its own frame now and the conversation
   * follows it. An ask withdrawn before then (a tab passed over in a burst
   * of switching, or closed) builds nothing. The panes of the first render
   * are built with it, so a reload paints its conversation at once.
   */
  $effect.pre(() => {
    const asked = [...slots.keys()];
    const open = new Set(workspace.openIds);
    const arriving = untrack(() => {
      const keep = hosted.filter((id) => open.has(id));
      if (
        keep.length !== hosted.length ||
        keep.some((id, i) => id !== hosted[i])
      ) {
        hosted = keep;
      }
      return asked.filter((id) => open.has(id) && !keep.includes(id));
    });
    if (arriving.length === 0) {
      return;
    }
    if (!entered) {
      untrack(() => {
        hosted = [...hosted, ...arriving];
      });
      return;
    }
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      // A frame's callbacks run before it paints; a task queued from them
      // runs after.
      task = setTimeout(() => {
        hosted = [...hosted, ...arriving.filter((id) => !hosted.includes(id))];
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });
</script>

<div class="pen">
  {#each hosted as id (id)}
    {@const ctx = contextOf(id)}
    {@const leaf = workspace.leafOf(id)}
    {@const isActive = leaf?.active === id}
    {@const runId = runIdOf(id)}
    <div class="hosted" use:dock={id}>
      {#if runId}
        <!-- A workflow run's tab: the run, as its own view. -->
        <WorkflowRunView {runId} />
      {:else if isThreadTab(id)}
        <!-- A thread with a project's Caw (ThreadPane). -->
        <ThreadPane
          focused={isActive && leaf?.id === workspace.focusedLeafId}
          viewId={id}
          visible={shownPanes.get(id) ?? false}
        />
      {:else}
        <SessionPane
          browsing={ctx?.machine ?? null}
          browsingCwd={ctx?.cwd ?? ""}
          browsingHarness={ctx?.harness ?? "claude"}
          focused={isActive && leaf?.id === workspace.focusedLeafId}
          serverTail={id === entryId ? entryTail : null}
          viewId={id}
          visible={shownPanes.get(id) ?? false}
        />
      {/if}
    </div>
  {/each}
</div>

<Lightbox />

<style>
  .pen {
    position: absolute;
    inset: 0;
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
  }

  /* The wrapper is a flex item of whichever slot it lands in, and the slot
     is the pane's whole box. */
  .hosted {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
</style>
