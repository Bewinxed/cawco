<script lang="ts" module>
  /** One row of a plan's tree: a step or a to-do, its children under it. */
  export interface PlanNode {
    children: PlanNode[];
    id: string;
    status: "pending" | "in_progress" | "completed";
    text: string;
  }

  /**
   * Rows written flat with a nesting depth (a plan's steps, a task file's
   * to-dos), as the tree they are: each row hangs under the nearest row
   * before it that stands one level up.
   */
  export function treeOf(
    rows: {
      id: string;
      depth: number;
      status: PlanNode["status"];
      text: string;
    }[]
  ): PlanNode[] {
    const roots: PlanNode[] = [];
    const open: { depth: number; node: PlanNode }[] = [];
    for (const row of rows) {
      const node: PlanNode = {
        id: row.id,
        status: row.status,
        text: row.text,
        children: [],
      };
      while (open.length > 0 && (open.at(-1)?.depth ?? 0) >= row.depth) {
        open.pop();
      }
      const parent = open.at(-1);
      (parent ? parent.node.children : roots).push(node);
      open.push({ depth: row.depth, node });
    }
    return roots;
  }

  /** A plan's steps, as their tree. */
  export const stepsTree = (plan: SessionPlan | undefined): PlanNode[] =>
    treeOf(
      (plan?.steps ?? []).map((step) => ({
        id: step.id,
        depth: step.depth,
        status: step.status,
        text: step.content,
      }))
    );

  /** A task attempt's to-dos, as their tree: ticked is completed. */
  export const todosTree = (plan: SessionPlan | undefined): PlanNode[] =>
    treeOf(
      (plan?.todos ?? []).map((todo) => ({
        id: todo.id ?? todo.path,
        depth: todo.depth,
        status: todo.done ? ("completed" as const) : ("pending" as const),
        text: todo.text,
      }))
    );

  import type { SessionPlan } from "@cawco/core";
</script>

<script lang="ts">
  /**
   * A plan's rows as a tree on the app's nesting lines, each ticked as it
   * completes (the tick draws along its stroke) or breathing while it is
   * under way; rows that arrive or move reflow in place. The plan's panel
   * (PlanPane) and the board's peek draw a plan with it.
   */
  import { IconTick } from "#lib/icons.js";
  import { branch, nestFrom } from "../motion/branch.svelte";
  import { reflow } from "../motion/rows.svelte";

  let { nodes }: { nodes: PlanNode[] } = $props();
</script>

{#snippet mark(status: PlanNode["status"])}
  <span class="plan-mark" data-status={status}>
    {#if status === "completed"}
      <IconTick class="tick" />
    {:else}
      <span
        data-plan-pane-live={status === "in_progress" || undefined}
        data-slot="dot"
        class="dot"
        class:live={status === "in_progress"}
      ></span>
    {/if}
  </span>
{/snippet}

{#snippet tree(nodes: PlanNode[], nested: boolean)}
  <ul
    class={nested ? "kit-nest rows nested" : "rows"}
    in:branch={{ glyph: ".plan-mark" }}
    {@attach reflow()}
    {@attach nested ? nestFrom(".plan-mark") : undefined}
  >
    {#each nodes as node (node.id)}
      <li data-flip data-status={node.status}>
        <span data-slot="row" class="row">
          {@render mark(node.status)}
          <span data-slot="text" class="text">{node.text}</span>
        </span>
        {#if node.children.length > 0}
          {@render tree(node.children, true)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{@render tree(nodes, false)}

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* A sub-step hangs off its parent's mark on the app's nesting line. */
  .rows.nested {
    padding-block-start: var(--space-1);
    padding-inline-start: var(--nest-pad, var(--space-5));
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  li[data-status="completed"] > .row .text {
    color: var(--ink-muted);
  }
  li[data-status="in_progress"] > .row .text {
    font-weight: var(--weight-strong);
  }
  .plan-mark {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--icon-md);
    block-size: 1lh;
  }
  /* Done: the house tick (Tick.svelte, its 1.5 stroke), drawn along its
     stroke as it lands. */
  .plan-mark :global(.tick) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-done-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .plan-mark :global(.tick path) {
      stroke-dasharray: 20;
      animation: plan-tick var(--dur-toggle) var(--ease-out) both;
    }
  }
  @keyframes plan-tick {
    from {
      stroke-dashoffset: 20;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  /* To come: an open ring; under way: the live dot, the house's size and
     ink (TreeMark's), at full strength: it breathes in scale, never fading
     below its contrast. */
  .dot {
    inline-size: var(--status-dot-size);
    block-size: var(--status-dot-size);
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--ink-subtle);
  }
  .dot.live {
    box-shadow: none;
    background: var(--status-live-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .dot.live {
      animation: plan-breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes plan-breath {
    50% {
      scale: 0.7;
    }
  }
</style>
