<script lang="ts">
  /**
   * One piece of stopped work in Needs you with several things waiting on
   * you in it (home `WorkItem`, hub needs-rows.ts): its task's row heads it,
   * its wait the time since its work stopped; the questions about it stand
   * under it, each its own row as NeedsCard draws it, newest first, on a
   * hairline dropped from the head's lead mark. A session's questions
   * about no task stand together with no head.
   */
  import type { WorkItem } from "./home-state.svelte";
  import NeedsCard from "./NeedsCard.svelte";

  let {
    item,
    stale,
    onchoose,
  }: {
    item: WorkItem;
    stale: boolean;
    /** A row was chosen: it opens, and the panel closes. */
    onchoose: () => void;
  } = $props();
</script>

<div data-slot="work" data-kind="work">
  {#if item.task}
    <NeedsCard item={item.task} {onchoose} {stale} />
  {/if}
  <ul
    data-slot="work-items"
    class={[
      "m-0 list-none p-0",
      item.task && "ms-space-7 border-s border-s-border-hairline",
    ]}
  >
    {#each item.items as one (one.key)}
      <li><NeedsCard item={one} {onchoose} {stale} /></li>
    {/each}
  </ul>
</div>
