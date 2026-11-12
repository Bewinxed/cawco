<script lang="ts">
  /**
   * What a heavy question reaches, named (AskHere's `items`): each thing as
   * the rail draws a row, its lead mark, its title and its status word at
   * the end, nested under what it hangs from (`parentId`), as delegates hang
   * under their lead: one flat tree on the house's nesting lines
   * (tree-lines.ts). A long list scrolls inside the question rather than
   * pushing its buttons out of reach.
   */
  import type { AskItem } from "./ask-here.svelte";
  import { echoBeat } from "./motion/echo.svelte";
  import OsMark from "./OsMark.svelte";
  import SessionMark from "./SessionMark.svelte";
  import TreeLine from "./TreeLine.svelte";
  import { flatTree, lineAttrs } from "./tree-lines";

  let { items, label }: { items: AskItem[]; label: string } = $props();

  const known = $derived(new Set(items.map((item) => item.id)));
  /** An item whose parent is not listed stands at the top. */
  const under = (parentId: string | null) =>
    items.filter((item) =>
      parentId === null
        ? !(item.parentId && known.has(item.parentId))
        : item.parentId === parentId
    );
  const rows = $derived(
    flatTree(
      under(null),
      (item) => under(item.id),
      (item) => item.id
    )
  );
</script>

{#snippet row(item: AskItem, kids: number)}
  <div
    data-slot="row"
    class="mark-line flex min-h-(--row-compact-h) items-center gap-(--row-compact-gap) py-0 pe-(--row-compact-pad-end) ps-(--row-compact-gap) text-ink-strong"
  >
    {#if item.lead.kind === "session"}
      <SessionMark
        caw={item.lead.caw ?? null}
        count={kids}
        id={item.id}
        place={item.lead.place}
        status={item.lead.status ?? "idle"}
      />
    {:else if item.lead.kind === "machine"}
      <span
        data-slot="lead"
        class="inline-grid size-(--lead-size) flex-none place-items-center text-ink-muted"
        data-box
        style:--lead-size="var(--mark-size, var(--spacing-space-5))"
        ><OsMark class="size-icon-md" os={item.lead.os} /></span
      >
    {:else}
      <span
        data-slot="lead"
        class="inline-grid size-(--lead-size) flex-none place-items-center text-ink-muted"
        data-box
        style:--lead-size="var(--mark-size, var(--spacing-space-5))"
        ><item.lead.icon aria-hidden="true" class="size-icon-md" /></span
      >
    {/if}
    <span
      data-slot="title"
      class="min-w-0 flex-auto overflow-clip type-label text-ellipsis whitespace-nowrap"
      >{item.title}</span
    >
    {#if item.status}
      <span class="flex-none type-meta whitespace-nowrap text-ink-muted"
        >{item.status}</span
      >
    {/if}
  </div>
{/snippet}

<!-- One flat tree, every row keyed, each drawing its share of the lines. -->
<ul
  data-slot="reach"
  aria-label={label}
  class="kit-tree flex flex-col -mx-space-2 my-0 max-h-(--reach-max) justify-self-stretch overflow-y-auto overflow-x-clip overscroll-contain px-space-2 py-space-1"
  data-roots="touch"
  style:--reach-max="calc(var(--row-compact-h) * 8)"
  {@attach echoBeat()}
>
  {#each rows as { key, line, node } (key)}
    <li
      class="kit-tree-row"
      {...lineAttrs(line)}
      data-item={key}
      style:--line-depth={line.depth}
    >
      <TreeLine {line} />
      {@render row(node, under(node.id).length)}
    </li>
  {/each}
</ul>
