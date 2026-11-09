<script lang="ts" module>
  import {
    type PlanStepStatus,
    type SessionPlan,
    todoGroups,
  } from "@cawco/core/plan";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  /** One row of a plan's tree: a step or a to-do, its children under it. */
  export interface PlanNode {
    children: PlanNode[];
    id: string;
    status: PlanStepStatus;
    text: string;
  }

  /**
   * Rows written flat with a nesting depth (a plan's steps, a task file's
   * to-dos), as the tree they are: each row hangs under the nearest row
   * before it that stands one level up.
   */
  function treeOf(
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

  /**
   * A task attempt's agreed to-dos, as their tree: ticked is completed. The
   * offered ones are left out until agreed, as the plan's ring leaves them.
   */
  export const todosTree = (plan: SessionPlan | undefined): PlanNode[] =>
    treeOf(
      todoGroups(plan?.todos ?? []).agreed.map((todo) => ({
        id: todo.id ?? todo.path,
        depth: todo.depth,
        status: todo.done ? ("completed" as const) : ("pending" as const),
        text: todo.text,
      }))
    );
</script>

<script lang="ts">
  /**
   * A plan's rows as a tree on the app's nesting lines, each ticked as it
   * completes (the tick draws along its stroke) or breathing while it is
   * under way; rows that arrive or move reflow in place. The plan's panel
   * (PlanPane) and the board's peek draw a plan with it.
   */
  import type { Attachment } from "svelte/attachments";
  import { IconTick } from "#lib/icons.js";
  import { branch } from "../../platform/motion/branch.svelte";
  import { reflow } from "../../platform/motion/rows.svelte";
  import TreeLine from "../TreeLine.svelte";
  import { flatTree, lineAttrs } from "../tree-lines";

  let { nodes }: { nodes: PlanNode[] } = $props();

  /** The plan as one flat tree on the nesting lines (tree-lines.ts). */
  const rows = $derived(
    flatTree(
      nodes,
      (node) => node.children,
      (node) => node.id
    )
  );
  const MARK = '[data-slot="plan-mark"]';

  /**
   * The band a linked step lights (`data-linked`, set and taken off by
   * PlanPane): the step's row and every row under it, as its `li` once held
   * them all. Each row of the band is lit (`data-band`), marked where it
   * stands in it (`data-band-at`: first, inside, last, or one alone, kept
   * as the band fades out so its shape holds) and told the step's inset
   * edge, the band's start (--band-start). Heard on the attribute
   * alone; the step's inset is its own style, read once as it lights.
   */
  const linkedBand: Attachment<HTMLUListElement> = (list) => {
    const light = () => {
      for (const row of list.querySelectorAll<HTMLElement>("[data-band]")) {
        row.removeAttribute("data-band");
      }
      for (const step of list.querySelectorAll<HTMLElement>(
        ":scope > [data-linked]"
      )) {
        const depth = Number(step.dataset.lineDepth ?? 0);
        const band = [step];
        for (
          let next = step.nextElementSibling;
          next instanceof HTMLElement &&
          Number(next.dataset.lineDepth ?? 0) > depth;
          next = next.nextElementSibling
        ) {
          band.push(next);
        }
        const start = getComputedStyle(step).paddingInlineStart;
        const last = band.length - 1;
        band.forEach((row, at) => {
          let place = "inside";
          if (last === 0) {
            place = "one";
          } else if (at === 0) {
            place = "first";
          } else if (at === last) {
            place = "last";
          }
          row.style.setProperty("--band-start", start);
          row.dataset.band = "";
          row.dataset.bandAt = place;
        });
      }
    };
    const heard = new MutationObserver(light);
    heard.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-linked"],
    });
    return () => heard.disconnect();
  };
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

<!-- One flat tree, every step keyed: a step's rows open from its mark as
     every tree's do (motion/branch), and rows that arrive or move reflow. A
     step brought to from elsewhere (`data-linked`, PlanPane) lights as one
     band with every row under it (`linkedBand`): each row's fill stands from
     the step's own inset edge (--band-start) and reaches up over the gap
     above it, rounded only at the band's ends, fading in and out. Its
     lines meet each step's mark: an icon wide and a label line tall, at the
     row's start and top (design.css `kit-tree-plan`). -->
<ul
  data-slot="rows"
  class="kit-tree kit-tree-plan flex flex-col"
  style:--line-gap="var(--spacing-space-1)"
  {@attach reflow()}
  {@attach linkedBand}
>
  {#each rows as { key, line, node } (key)}
    <li
      class="kit-tree-row before:pointer-events-none before:absolute before:inset-y-0 before:start-(--band-start) before:end-0 before:bg-selected-bg before:opacity-0 before:transition-opacity before:duration-(--duration-fade) before:ease-out data-band:before:opacity-100 data-[band-at=inside]:before:-top-(--line-gap) data-[band-at=last]:before:-top-(--line-gap) data-[band-at=first]:before:rounded-t-sm data-[band-at=last]:before:rounded-b-sm data-[band-at=one]:before:rounded-sm"
      {...lineAttrs(line)}
      data-flip
      data-plan-row={node.id}
      data-status={node.status}
      style:--line-depth={line.depth}
      in:branch={{ glyph: MARK }}
    >
      <TreeLine {line} />
      <span
        data-slot="row"
        class="relative flex items-start gap-space-2 min-w-0 type-label text-ink-strong"
      >
        {@render mark(node.status)}
        <span
          data-slot="text"
          class={[
            "min-w-0 wrap-anywhere",
            node.status === "completed" && "text-ink-muted",
          ]}>{node.text}</span
        >
      </span>
    </li>
  {/each}
</ul>
