<!--
  One grouped list (P2 on a phone, the Table's T1 on desk and phone): a head
  per stage with its count, the open groups' items under their heads.

  - `folds="folded"` (T1 A, and P2 always): the quiet kinds fold. On a desk
    Ready, Working and Review stand open and Done and Dropped fold; on a
    phone the one group the glance leads with stands open. Closed heads pin
    (report 2b, 2c), so every head is on screen whatever the open group's
    length: heads before the open groups stand over the scroll, heads after
    them under it, over the docked bar.
  - `folds="open"` (T1 B): every group open, each head sticking while its
    rows pass under it: every row reachable, one long scroll.

  A head is a button that folds its group (▾ open, ▸ closed), content and
  not a bar, so it draws no ground: the rows part from a stuck or pinned head
  by the scroll edge effect (preview.css, `po-edge`), and each open group
  ends with room before the next head. `items` is "cards" (P2) or "rows"
  (T1).
-->
<script>
  import { board, cardKey, firstShown, STAGES } from "./data.js";
  import { IconChevronDown, IconChevronRight } from "./kit.js";
  import Mark from "./Mark.svelte";
  import StageHead from "./StageHead.svelte";
  import When from "./When.svelte";

  let { items, desk = false, state = "rest", ask = "C1", folds = "folded" } = $props();
  const columns = $derived(board(state));
  const opened = $derived.by(() => {
    if (folds === "open") {
      return new Set(STAGES.map((stage) => stage.key));
    }
    return desk ? new Set(["ready", "working", "review"]) : new Set([firstShown(state)]);
  });
  const first = $derived(STAGES.findIndex((stage) => opened.has(stage.key)));
  const last = $derived(STAGES.findLastIndex((stage) => opened.has(stage.key)));
  const before = $derived(STAGES.slice(0, first));
  const within = $derived(STAGES.slice(first, last + 1));
  const after = $derived(STAGES.slice(last + 1));
  const stale = $derived(state === "stale" ? "opacity-(--account-stale-opacity)" : "");
</script>

{#snippet head(stage, open, sticky)}
  {@const list = columns[stage.key]}
  <button
    data-group-head={stage.key}
    data-pinned={sticky ? undefined : ""}
    aria-expanded={open && list.length > 0}
    class={[
      "flex h-c-row-h w-full flex-none items-center gap-space-2 border-0 bg-transparent px-space-3 text-start select-none press-tint",
      sticky && "sticky top-0 z-3",
      stale,
    ]}
    type="button"
  >
    {#if open}
      <IconChevronDown aria-hidden="true" class="size-icon-sm flex-none text-ink-muted" />
    {:else}
      <IconChevronRight aria-hidden="true" class="size-icon-sm flex-none text-ink-muted" />
    {/if}
    <span class="min-w-0 flex-auto"><StageHead count={list.length} {stage} tag="span" /></span>
  </button>
{/snippet}

{#snippet group(stage)}
  {@const list = columns[stage.key]}
  {#if items === "cards"}
    <ol class="m-0 flex list-none flex-col gap-space-1 px-space-2 pt-space-1 pb-space-4">
      {#each list as item (item.task.id)}
        <li class={state === "stale" && !item.fault ? stale : ""} data-card={cardKey(item, ask)}></li>
      {/each}
    </ol>
  {:else}
    <ol class={["m-0 flex list-none flex-col p-0", list.length > 0 && "pb-space-4"]}>
      {#each list as item (item.task.id)}
        <li
          data-row={item.task.id}
          class={[
            "grid items-baseline gap-x-space-3 gap-y-space-1 border-b border-border-hairline px-space-3 py-space-2",
            desk
              ? "grid-cols-[var(--c-task-col-id-w)_minmax(0,1fr)_auto_var(--c-task-col-labels-w)_var(--c-task-col-time-w)]"
              : "grid-cols-[auto_minmax(0,1fr)]",
            state === "stale" && !item.fault && stale,
          ]}
        >
          <span class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle">{item.task.id}</span>
          <a
            data-record="title"
            data-of={item.task.id}
            class="type-label wrap-anywhere text-ink-row no-underline focus-inset"
            href="?task={item.task.id}">{item.task.title}</a
          >
          {#if desk}
            <span class="justify-self-end">{#if item.mark}<Mark mark={item.mark} />{/if}</span>
            <span class="type-meta wrap-anywhere text-ink-muted">{item.task.labels.join(" · ")}</span>
            <When at={item.task.createdAt} class="justify-self-end type-meta text-ink-muted" />
          {:else if item.mark}
            <span class="col-start-2"><Mark mark={item.mark} /></span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

<div data-list={items} data-folds={folds} class="flex h-full min-h-0 flex-col">
  {#each before as stage (stage.key)}{@render head(stage, false, false)}{/each}
  <div class="po-edge-host relative flex min-h-0 flex-auto flex-col" style="--po-edge-ground: var(--surface-recess)">
    <div data-list-scroll data-edge-scroller class="po-edge-scroller min-h-0 flex-auto overflow-y-auto overscroll-y-contain">
      {#each within as stage (stage.key)}
        {@const open = opened.has(stage.key)}
        <section aria-label="{stage.name}, {columns[stage.key].length} tasks">
          {@render head(stage, open, open)}
          {#if open}{@render group(stage)}{/if}
        </section>
      {/each}
    </div>
    <span aria-hidden="true" class="po-edge po-edge-top" data-edge="heads" style="--po-edge-h: var(--c-row-h)"></span>
    <span aria-hidden="true" class="po-edge po-edge-foot" data-edge="foot" style="--po-edge-h: 0px"></span>
  </div>
  {#each after as stage (stage.key)}{@render head(stage, false, false)}{/each}
</div>
