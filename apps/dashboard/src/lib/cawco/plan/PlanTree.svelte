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
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
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
      <IconTick
        class="size-icon-md text-status-done-glyph motion-safe:animate-check-draw motion-safe:dash-unit"
      />
    {:else if status === "in_progress"}
      <LiveDot data-plan-pane-live data-slot="dot" />
    {:else}
      <span
        data-slot="dot"
        class="size-(--status-dot-size) rounded-pill inset-ring inset-ring-ink-subtle"
      ></span>
    {/if}
  </span>
{/snippet}

{#snippet tree(nodes: PlanNode[], nested: boolean)}
  <ul
    data-slot="rows"
    data-nest={nested || undefined}
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
      <li
        class="rounded-sm transition-[background-color] duration-(--dur-fade) ease-out data-linked:bg-selected-bg"
        data-flip
        data-plan-row={node.id}
        data-status={node.status}
      >
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
