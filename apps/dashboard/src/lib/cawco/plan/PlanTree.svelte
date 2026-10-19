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
  <span
    class="flex-none grid place-items-center w-icon-md h-lh"
    data-slot="plan-mark"
    data-status={status}
  >
    {#if status === "completed"}
      <IconTick class="size-icon-md text-status-done-glyph" />
    {:else}
      <!-- literal: 50% -->
      <span
        data-plan-pane-live={status === "in_progress" || undefined}
        data-slot="dot"
        class="size-(--status-dot-size) rounded-(--dot-r) shadow-(--dot-ring) data-plan-pane-live:shadow-none data-plan-pane-live:bg-status-live-glyph"
        style:--dot-r="50%"
        style:--dot-ring="inset 0 0 0 1px var(--ink-subtle)"
      ></span>
    {/if}
  </span>
{/snippet}

{#snippet tree(nodes: PlanNode[], nested: boolean)}
  <ul
    data-slot="rows"
    class={nested
      ? "kit-nest flex flex-col gap-space-1 m-0 list-none pbs-space-1 pbe-0 ps-(--rows-pad-start) pe-0"
      : "flex flex-col gap-space-1 m-0 p-0 list-none"}
    style:--rows-pad-start={nested
      ? "var(--nest-pad, var(--space-5))"
      : undefined}
    in:branch={{ glyph: '[data-slot="plan-mark"]' }}
    {@attach reflow()}
    {@attach nested ? nestFrom('[data-slot="plan-mark"]') : undefined}
  >
    {#each nodes as node (node.id)}
      <li data-flip data-status={node.status}>
        <span
          data-slot="row"
          class="flex items-start gap-space-2 min-w-0 type-label text-ink-strong"
        >
          {@render mark(node.status)}
          <span
            data-slot="text"
            class={[
              "min-w-0 wrap-anywhere",
              node.status === "completed" && "text-ink-muted",
              node.status === "in_progress" && "font-medium",
            ]}>{node.text}</span
          >
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
  /* residual: keyframes */
  /* Done: the house tick (Tick.svelte, its 1.5 stroke), drawn along its
     stroke as it lands. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="plan-mark"][data-status="completed"] :global(path) {
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
  /* Under way: the live dot breathes in scale, never fading below its
     contrast. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="dot"][data-plan-pane-live] {
      animation: plan-breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes plan-breath {
    50% {
      scale: 0.7;
    }
  }
</style>
