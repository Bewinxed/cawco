<script lang="ts" module>
  import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";
  import type { StepKind } from "./release";

  /** One row of a workflow's tree: a run's root, a step as a work item, a step not started. */
  export interface TreeNode {
    id: string;
    title: string;
    /** A delegate's sprite on its hue, or the step kind's glyph on a bare tile. */
    mark: "session" | StepKind;
    status: MarkStatus;
    /** No work item yet: the step is only planned (grey). */
    planned?: boolean;
    /** The orchestrator added it beyond the plan. */
    unplanned?: boolean;
    /** The delegate card's kind box: its delegate type, or "Call". */
    tag?: string;
    /** The meta line under the title. */
    line?: string;
    /** The delegate card's phase pill, with its clock. */
    pill?: { tone: "live" | "attn" | "done" | "fail" | "idle"; words: string };
    /** At the title line's end, where no pill stands. */
    trail?: string;
    kids?: TreeNode[];
  }
</script>

<script lang="ts">
  /**
   * A workflow's tree as the home lists draw a session's (SessionTree):
   * each row on SessionRow's two lines, led by its mark (SessionMark for a
   * delegate, a bare TreeMark with the step kind's glyph otherwise), its
   * delegates hung under it on the .kit-nest lines (motion/branch
   * `nestFrom`). What a row adds under itself (a question, a Keep) is the
   * caller's `under`. Fixture for the Workflows option canvases.
   */
  import type { Snippet } from "svelte";
  import { nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TreeMark from "#lib/cawco/TreeMark.svelte";
  import {
    IconAgent,
    IconAsk,
    IconConnection,
    IconHourglass,
  } from "#lib/icons.js";

  let {
    root,
    compact = false,
    label,
    under,
  }: {
    root: TreeNode;
    /** A phone's row: the pill gives way to the clock alone. */
    compact?: boolean;
    label: string;
    /** What stands under a row, at its text column. */
    under?: Snippet<[TreeNode]>;
  } = $props();

  const GLYPH = {
    agent: IconAgent,
    call: IconConnection,
    wait: IconHourglass,
    ask: IconAsk,
  } as const;

  const count = (node: TreeNode): number =>
    (node.kids ?? []).reduce((sum, kid) => sum + 1 + count(kid), 0);
</script>

{#snippet row(node: TreeNode)}
  <div
    data-slot="item"
    class="group/wf-row relative flex items-center rounded-sm text-ink-strong data-planned:text-ink-muted"
    data-planned={node.planned || undefined}
  >
    <div
      data-rail-row
      class="flex min-h-space-8 min-w-0 flex-auto items-center gap-space-2 py-space-1 ps-space-3 pe-space-3 coarse:min-h-c-btn-h-lg"
      style:--mark-hit-max="calc((var(--c-btn-h-lg) - var(--c-row-mark)) / 2 + var(--tree-gap))"
      style:--mark-hit-gap="var(--space-2)"
    >
      {#if node.mark === "session" && !node.planned}
        <SessionMark
          count={count(node)}
          id={node.id}
          open={count(node) > 0}
          place="release-app:{node.id}"
          status={node.status}
        />
      {:else}
        {@const Glyph = GLYPH[node.mark === "session" ? "agent" : node.mark]}
        <TreeMark
          count={count(node)}
          open={count(node) > 0}
          status={node.status}
        >
          {#snippet face()}
            <Glyph aria-hidden="true" class="size-icon-sm" />
          {/snippet}
        </TreeMark>
      {/if}
      <span data-slot="words" class="mark-line flex min-w-0 flex-auto flex-col">
        <span
          class="mark-line flex min-h-space-5 min-w-0 items-center gap-space-2"
          data-box
        >
          <span
            data-slot="title"
            class="min-w-0 flex-initial overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row group-data-planned/wf-row:text-ink-muted"
            >{node.title}</span
          >
          {#if node.unplanned}
            <span
              data-slot="kind"
              class="mark-text flex-none rounded-xs border border-dashed border-border-control px-space-2 py-(--kind-py) text-size-meta leading-c-row-mark font-normal whitespace-nowrap text-ink-muted"
              data-box
              style:--kind-py="calc((1lh - 1ex) / 2)">unplanned</span
            >
          {:else if node.tag}
            <!-- The delegate card's kind box (Delegate.svelte). -->
            <span
              data-slot="kind"
              class="mark-text flex-none rounded-xs border border-border-hairline px-space-2 py-(--kind-py) text-size-meta leading-c-row-mark font-normal whitespace-nowrap text-ink-strong max-phone:hidden"
              data-box
              style:--kind-py="calc((1lh - 1ex) / 2)">{node.tag}</span
            >
          {/if}
        </span>
        {#if node.line}
          <span
            class="mark-text block min-h-space-5 min-w-0 content-center overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
            >{node.line}</span
          >
        {/if}
      </span>
      <span data-slot="end" class="mark-line flex flex-none flex-col items-end">
        {#if node.pill && !compact}
          <!-- The delegate card's phase pill and clock. -->
          <span
            class="mark-text num flex-none rounded-xs bg-status-idle-bg px-space-2 py-(--pill-py) text-size-meta font-normal whitespace-nowrap text-status-idle-ink tone-attn:bg-status-attn-bg tone-attn:text-status-attn-ink tone-done:bg-status-done-bg tone-done:text-status-done-ink tone-fail:bg-status-fail-bg tone-fail:text-status-fail-ink tone-live:bg-status-live-bg tone-live:text-status-live-ink"
            data-box
            data-tone={node.pill.tone}
            style:--pill-py="calc(var(--space-row) + (1lh - 1ex) / 2)"
            >{node.pill.words}</span
          >
        {:else if node.trail}
          <span
            class="num mark-text flex min-h-space-5 items-center whitespace-nowrap type-meta text-ink-muted"
            >{node.trail}</span
          >
        {/if}
      </span>
    </div>
  </div>
  {#if under}
    {@render under(node)}
  {/if}
{/snippet}

{#snippet tree(node: TreeNode)}
  <li data-tree-node class="relative">
    <div data-slot="tree-line" class="relative">
      {@render row(node)}
    </div>
    {#if node.kids && node.kids.length > 0}
      <ul
        data-slot="tree-branch"
        data-nest
        class="kit-nest m-0 flex list-none flex-col gap-(--tree-gap) pt-(--tree-gap) pe-0 pb-0 ps-(--nest-pad)"
        {@attach nestFrom("[data-tree-mark]")}
      >
        {#each node.kids as kid (kid.id)}
          {@render tree(kid)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<ul
  aria-label={label}
  class="m-0 flex list-none flex-col gap-(--tree-gap) p-0"
  data-slot="wf-tree"
>
  {@render tree(root)}
</ul>
