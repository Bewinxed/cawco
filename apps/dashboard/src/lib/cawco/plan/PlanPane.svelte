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

  /** How far a plan has got: its steps, else its task's to-dos. */
  export function planProgress(plan: SessionPlan): {
    done: number;
    total: number;
  } {
    if (plan.steps.length > 0) {
      return {
        done: plan.steps.filter((step) => step.status === "completed").length,
        total: plan.steps.length,
      };
    }
    const todos = plan.todos ?? [];
    return {
      done: todos.filter((todo) => todo.done).length,
      total: todos.length,
    };
  }

  /** The plan has something to show: steps, a spec, or a task's to-dos. */
  export const planShows = (plan: SessionPlan | undefined): boolean =>
    !!plan &&
    (plan.steps.length > 0 || !!plan.spec || (plan.todos?.length ?? 0) > 0);

  import type { SessionPlan } from "@cawco/core";
</script>

<script lang="ts">
  /**
   * A session's plan, in the side surface (PRD §5.2, "Every session's plan,
   * in a panel"): its steps as a tree on the app's nesting lines, each ticked
   * as it completes (the tick draws along its stroke) or breathing while it
   * is under way; its spec, read-only, folded to its first lines; and on a
   * task attempt the task's to-dos the same way, with the way to the
   * project's canvas. Live: the client's copy follows the hub's snapshots and
   * deltas (plan.ts), and rows that arrive or move reflow in place.
   *
   * The card is the preview's own (SideSurface): one header, "Plan" and
   * how far it has got, or the switch and the count while a preview is
   * beside it; the rows in the same recess well, scrolling under an edge
   * fade, their left edge the header's.
   */
  import type { Snippet } from "svelte";
  import { IconTick } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { branch, nestFrom } from "../motion/branch.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { reflow } from "../motion/rows.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import MessageBody from "../transcript/MessageBody.svelte";

  let {
    instanceId,
    switcher,
    onclose,
  }: {
    /** The session whose plan this is (a thread's: its project's lead). */
    instanceId: string;
    /** The Plan | Preview switch, when there is a preview beside it. */
    switcher?: Snippet;
    onclose: () => void;
  } = $props();

  const plan = $derived(cawco.planOf(instanceId));
  const steps = $derived(
    treeOf(
      (plan?.steps ?? []).map((step) => ({
        id: step.id,
        depth: step.depth,
        status: step.status,
        text: step.content,
      }))
    )
  );
  const todos = $derived(
    treeOf(
      (plan?.todos ?? []).map((todo) => ({
        id: todo.id ?? todo.path,
        depth: todo.depth,
        status: todo.done ? ("completed" as const) : ("pending" as const),
        text: todo.text,
      }))
    )
  );
  const progress = $derived(plan ? planProgress(plan) : { done: 0, total: 0 });
  const projectId = $derived(
    cawco.instanceIndex.byId.get(instanceId)?.projectId ?? null
  );
  let specOpen = $state(false);
</script>

{#snippet mark(
  status: PlanNode["status"]
)}
  <span class="plan-mark" data-status={status}>
    {#if status === "completed"}
      <IconTick class="tick" />
    {:else}
      <span class="dot" class:live={status === "in_progress"}></span>
    {/if}
  </span>
{/snippet}

{#snippet tree(
  nodes: PlanNode[],
  nested: boolean
)}
  <ul
    class={nested ? "kit-nest rows nested" : "rows"}
    in:branch={{ glyph: ".plan-mark" }}
    {@attach reflow()}
    {@attach nested ? nestFrom(".plan-mark") : undefined}
  >
    {#each nodes as node (node.id)}
      <li data-flip data-status={node.status}>
        <span class="row">
          {@render mark(node.status)}
          <span class="text">{node.text}</span>
        </span>
        {#if node.children.length > 0}
          {@render tree(node.children, true)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<SideSurface
  class="plan-pane"
  label="Plan"
  {onclose}
  subtitle={progress.total > 0
    ? `${progress.done}/${progress.total} done`
    : undefined}
  {switcher}
  title={switcher ? undefined : "Plan"}
>
  <div class="body kit-edge-fade-block">
    {#if steps.length > 0}
      {@render tree(steps, false)}
    {/if}

    {#if plan?.spec}
      <section class="part">
        <h3 class="part-head">Spec</h3>
        {#if specOpen}
          <div class="spec" transition:unfold>
            <MessageBody source={plan.spec.markdown} />
          </div>
        {:else}
          <div class="spec lead">
            <MessageBody source={plan.spec.markdown} />
          </div>
        {/if}
        <button
          class="more touch-hit"
          onclick={() => {
            specOpen = !specOpen;
          }}
          type="button"
        >
          {specOpen ? "Fold the spec" : "Read the spec"}
        </button>
      </section>
    {/if}

    {#if todos.length > 0 && plan?.taskId}
      <section class="part">
        <h3 class="part-head">To-dos <span class="ref">{plan.taskId}</span></h3>
        {@render tree(todos, false)}
        {#if projectId}
          <a
            class="more"
            href="/project/{encodeURIComponent(
              projectId
            )}?view=canvas&task={encodeURIComponent(plan.taskId)}"
            >Open in canvas</a
          >
        {/if}
      </section>
    {/if}
  </div>
</SideSurface>

<style>
  /* The rows' inset in the well: the header's title stands on it too. */
  :global(.plan-pane) {
    --side-inset: var(--space-3);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* In the phone's sheet, its end also clears the part of the sheet the
       middle snap leaves below the composer (SideSheet). */
    padding: var(--space-3) var(--side-inset)
      calc(var(--space-4) + var(--sheet-hidden, 0px));
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
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
  /* To come: an open ring; under way: the live dot, breathing. */
  .dot {
    inline-size: 6px;
    block-size: 6px;
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
      opacity: 0.35;
    }
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part-head {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .ref {
    font: var(--type-code);
    color: var(--ink-subtle);
  }
  /* The spec, a card on the well: raised inside a hairline, as a card
     stands on the recess in both schemes. */
  .spec {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  /* Folded: its first lines, fading where it is cut. */
  .spec.lead {
    max-block-size: calc(var(--text-body) * 1.6 * 4 + var(--space-2) * 2);
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 60%, transparent);
  }
  .more {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--link-ink);
    text-decoration: none;
    cursor: pointer;
  }
  @media (hover: hover) {
    .more:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
</style>
