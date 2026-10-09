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
   * A session's plan, beside the conversation (PRD §5.2, "Every session's
   * plan, in a panel"): its steps as a tree on the app's nesting lines, each
   * ticked as it completes (the tick draws along its stroke) or breathing
   * while it is under way; its spec, read-only, whole, as running text; and
   * on a task attempt the task's to-dos the same way, with the way to the
   * project's canvas. Live: the client's copy follows the hub's snapshots and
   * deltas (plan.ts), and rows that arrive or move reflow in place.
   *
   * One surface: the parts stand on it under text headings, in one column
   * that scrolls. On a desk the surface is the side card (SideSurface, with
   * no well); on a phone, the bottom sheet SideSplit opens it in (`sheet`),
   * under the sheet's own title.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { IconTick } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { branch, nestFrom } from "../motion/branch.svelte";
  import { reflow } from "../motion/rows.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import MessageBody from "../transcript/MessageBody.svelte";

  let {
    instanceId,
    switcher,
    sheet = false,
    onclose,
  }: {
    /** The session whose plan this is (a thread's: its project's lead). */
    instanceId: string;
    /** The Plan | Preview switch, when there is a preview beside it. */
    switcher?: Snippet;
    /** Drawn inside a phone's bottom sheet (a kit Drawer.Content). */
    sheet?: boolean;
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
  /**
   * A task's to-dos and nothing else (an attempt that has written no steps
   * or spec): the card is titled by them, not "Plan" over a "To-dos" head.
   */
  const onlyTodos = $derived(
    steps.length === 0 && !plan?.spec && todos.length > 0
  );
  const cardTitle = $derived(onlyTodos ? "To-dos" : "Plan");
  const projectId = $derived(
    cawco.instanceIndex.byId.get(instanceId)?.projectId ?? null
  );
  const showsTodos = $derived(todos.length > 0 && !!plan?.taskId);
  /** The steps are named once another part stands beside them. */
  const stepsHeaded = $derived(!!plan?.spec || showsTodos);
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

<!-- The parts, flat on the surface: a heading, then what it names. -->
{#snippet body()}
  <div
    class={["body kit-edge-fade-block", { sheet, "kit-sheet-scroll": sheet }]}
  >
    {#if steps.length > 0}
      {#if stepsHeaded}
        <h3 class="part-head">Steps</h3>
      {/if}
      {@render tree(steps, false)}
    {/if}

    {#if plan?.spec}
      <h3 class="part-head">Spec</h3>
      <MessageBody source={plan.spec.markdown} />
    {/if}

    {#if showsTodos && plan?.taskId}
      {#if !onlyTodos}
        <h3 class="part-head">To-dos <span class="ref">{plan.taskId}</span></h3>
      {/if}
      {@render tree(todos, false)}
      {#if projectId}
        <Button
          class="more"
          href="/project/{encodeURIComponent(
            projectId
          )}?view=canvas&task={encodeURIComponent(plan.taskId)}"
          label="Open in canvas"
          size="sm"
          variant="link"
        />
      {/if}
    {/if}
  </div>
{/snippet}

<!-- How far it has got is the ring's to say, on the composer: said once. -->
{#if sheet}
  <Drawer.Header>
    <Drawer.Title>
      {cardTitle}
      {#if onlyTodos && plan?.taskId}
        <span class="ref">{plan.taskId}</span>
      {/if}
    </Drawer.Title>
  </Drawer.Header>
  {@render body()}
{:else}
  <SideSurface
    class="plan-pane"
    label="Plan"
    {onclose}
    recessed={false}
    subtitle={onlyTodos ? (plan?.taskId ?? undefined) : undefined}
    {switcher}
    title={switcher ? undefined : cardTitle}
  >
    {@render body()}
  </SideSurface>
{/if}

<style>
  /* One column on the surface, its left edge the header's; it scrolls, and
     a long spec is read whole in it. */
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    padding-block: var(--space-1) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* In the sheet the column starts under the header's seam, so only its
     foot fades: a line scrolled up under the title is cut on the seam. */
  .body.sheet {
    padding-block: var(--space-3) 0;
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - var(--fade-end)),
      transparent
    );
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
  /* A part's heading is text on the surface, as strong as anything the part
     holds: body at 500 in the strong ink, which is where the spec's own
     headings stop (MessageBody sets every markdown heading at body 500). A
     part after the first starts on a seam, more space above its heading
     than below, so the spec's headings read as inside it. */
  .part-head {
    margin: 0;
    font: var(--type-body);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .part-head:not(:first-child) {
    margin-block-start: var(--space-3);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--border-hairline);
  }
  .ref {
    font: var(--type-code);
    color: var(--ink-subtle);
  }
  .body :global(.more) {
    align-self: flex-start;
    padding-inline: 0;
  }
</style>
