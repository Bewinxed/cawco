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
  import { untrack } from "svelte";
  import type { HistorySource } from "../client.svelte";
  import SessionPane from "../SessionPane.svelte";
  import Lightbox from "../transcript/Lightbox.svelte";
  import { dock, slots } from "./dock.svelte";
  import { contextOf, workspace } from "./workspace.svelte";

  let {
    docked,
    entryId = "",
    entryTail = null,
    entryHistory = null,
  }: {
    /** The phone's deck is showing, and draws the one composer. */
    docked: boolean;
    /** Which conversation this page's server data belongs to, if any. */
    entryId?: string;
    entryTail?: unknown;
    entryHistory?: Promise<HistorySource | null> | null;
  } = $props();

  let hosted = $state<string[]>([]);

  $effect.pre(() => {
    const asked = [...slots.keys()];
    const open = new Set(workspace.openIds);
    untrack(() => {
      const keep = hosted.filter((id) => open.has(id));
      for (const id of asked) {
        if (open.has(id) && !keep.includes(id)) {
          keep.push(id);
        }
      }
      if (
        keep.length !== hosted.length ||
        keep.some((id, i) => id !== hosted[i])
      ) {
        hosted = keep;
      }
    });
  });
</script>

<div class="pen">
  {#each hosted as id (id)}
    {@const ctx = contextOf(id)}
    {@const leaf = workspace.leafOf(id)}
    {@const isActive = leaf?.active === id}
    <div class="hosted" use:dock={id}>
      <SessionPane
        browsing={ctx?.machine ?? null}
        browsingCwd={ctx?.cwd ?? ''}
        browsingHarness={ctx?.harness ?? 'claude'}
        {docked}
        focused={isActive && leaf?.id === workspace.focusedLeafId}
        serverHistory={id === entryId ? entryHistory : null}
        serverTail={id === entryId ? entryTail : null}
        viewId={id}
        visible={slots.get(id)?.shown ?? false}
      />
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
