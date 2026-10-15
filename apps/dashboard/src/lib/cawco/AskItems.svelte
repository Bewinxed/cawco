<script lang="ts">
  /**
   * What a heavy question reaches, named (AskHere's `items`): each thing as
   * the rail draws a row, its lead mark, its title and its status word at
   * the end, nested under what it hangs from (`parentId`), as delegates hang
   * under their lead. A long list scrolls inside the question rather than
   * pushing its buttons out of reach.
   */
  import type { AskItem } from "./ask-here.svelte";
  import { nestFrom } from "./motion/branch.svelte";
  import { echoBeat } from "./motion/echo.svelte";
  import OsMark from "./OsMark.svelte";
  import SessionMark from "./SessionMark.svelte";

  let { items, label }: { items: AskItem[]; label: string } = $props();

  const known = $derived(new Set(items.map((item) => item.id)));
  /** An item whose parent is not listed stands at the top. */
  const under = (parentId: string | null) =>
    items.filter((item) =>
      parentId === null
        ? !(item.parentId && known.has(item.parentId))
        : item.parentId === parentId
    );
</script>

{#snippet branch(parentId: string | null)}
  {#each under(parentId) as item (item.id)}
    {@const kids = under(item.id)}
    <li data-item={item.id}>
      <div class="row">
        {#if item.lead.kind === "session"}
          <SessionMark
            caw={item.lead.caw ?? null}
            count={kids.length}
            id={item.id}
            place={item.lead.place}
            status={item.lead.status ?? "idle"}
          />
        {:else if item.lead.kind === "machine"}
          <span class="lead"><OsMark class="size-4" os={item.lead.os} /></span>
        {:else}
          <span class="lead"><item.lead.icon aria-hidden="true" /></span>
        {/if}
        <span class="title">{item.title}</span>
        {#if item.status}
          <span class="status">{item.status}</span>
        {/if}
      </div>
      {#if kids.length > 0}
        <ul class="kit-nest" {@attach nestFrom(".tree-mark")}>
          {@render branch(item.id)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<ul aria-label={label} class="reach" {@attach echoBeat()}>
  {@render branch(null)}
</ul>

<style>
  /* The rail's compact row: mark, title, status word, nested as it nests. */
  .reach,
  .reach :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .reach {
    /* As wide as the question, whatever its parent's alignment. */
    justify-self: stretch;
    /* The status dot and the echo stand out of the tile: room for them. */
    margin: 0 calc(-1 * var(--space-2));
    padding: var(--space-1) var(--space-2);
    max-block-size: calc(var(--row-compact-h) * 8);
    overflow-x: clip;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .reach :global(li) {
    position: relative;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--row-compact-gap);
    min-block-size: var(--row-compact-h);
    padding: 0 var(--row-compact-pad-end) 0 var(--row-compact-gap);
    color: var(--ink-strong);
  }
  .lead {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: var(--mark-size, 18px);
    block-size: var(--mark-size, 18px);
    color: var(--ink-muted);
    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
    }
  }
  .title {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    flex: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
</style>
