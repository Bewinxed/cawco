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
   * The surface's header is the preview's recipe: what it is, then its one
   * control, Close. With a preview beside it the header leads with the
   * switch between the two (SideSurface).
   */
  import type { Snippet } from "svelte";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import { IconClose } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { branch, nestFrom } from "../motion/branch.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { reflow } from "../motion/rows.svelte";
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
      {#key status}
        <svg aria-hidden="true" class="tick" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
        </svg>
      {/key}
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

<section aria-label="Plan" class="plan-pane">
  <header>
    {#if switcher}
      {@render switcher()}
    {:else}
      <span class="title">Plan</span>
    {/if}
    {#if progress.total > 0}
      <span class="count num">{progress.done}/{progress.total}</span>
    {/if}
    <span class="grow"></span>
    <button
      aria-label="Close"
      class="close touch-hit"
      onclick={onclose}
      title="Close"
      type="button"
    >
      <PendingContent icon={IconClose} pending={false} />
    </button>
  </header>
  <div class="body">
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
</section>

<style>
  /* The preview's surface (PreviewPane): a raised card with its header. */
  .plan-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: 0 var(--space-2) var(--space-2);
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-drawer);
  }
  header {
    --hit-gap-x: var(--space-1);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 44px;
    flex-shrink: 0;
    padding-inline-start: var(--space-1);
  }
  .title {
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  .count {
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  .grow {
    flex: 1;
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .close :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .close:hover {
      background: var(--surface-hover);
    }
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* In the phone's sheet, its end also clears the part of the sheet the
       middle snap leaves below the composer (SideSheet). */
    padding: var(--space-1) var(--space-2)
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
  /* Done: the house tick (Tick.svelte's stroke), drawn along its stroke. */
  .tick {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    fill: none;
    stroke: var(--status-done-glyph);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .tick path {
      animation: plan-tick var(--dur-toggle) var(--ease-out) both;
    }
  }
  @keyframes plan-tick {
    from {
      stroke-dashoffset: 1;
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
  .spec {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
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
