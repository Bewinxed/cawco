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
  import MessageBody from "../MessageBody.svelte";
  import { branch, nestFrom } from "../motion/branch.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { sideExpand } from "../side/expand";
  import SideSurface from "../side/SideSurface.svelte";

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

  /** The split's expansion, beside a conversation on a desk (SideSplit). */
  const expand = sideExpand();
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

<!-- The parts, flat on the surface: a heading, then what it names. -->
{#snippet body()}
  <!-- literal: 72ch -->
  <div
    data-sheet={sheet || undefined}
    data-plan-pane-expanded={!!expand?.expanded || undefined}
    data-slot="body"
    class={[
      "kit-edge-fade-block flex-auto min-h-0 overflow-y-auto overscroll-contain touch-pan-y pbs-space-1 pbe-space-4 flex flex-col gap-space-2 data-sheet:pbs-space-3 data-sheet:pbe-0 data-sheet:mask-(--sheet-fade) data-plan-pane-expanded:w-full data-plan-pane-expanded:max-w-(--measure) data-plan-pane-expanded:mx-auto",
      sheet && "kit-sheet-scroll",
    ]}
    style:--measure="72ch"
    style:--more-px="0"
    style:--sheet-fade={sheet
      ? "linear-gradient(to bottom, var(--mask-opaque) calc(100% - var(--fade-end)), transparent)"
      : undefined}
  >
    {#if steps.length > 0}
      {#if stepsHeaded}
        <h3
          class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
        >
          Steps
        </h3>
      {/if}
      {@render tree(steps, false)}
    {/if}

    {#if plan?.spec}
      <h3
        class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
      >
        Spec
      </h3>
      <MessageBody source={plan.spec.markdown} />
    {/if}

    {#if showsTodos && plan?.taskId}
      {#if !onlyTodos}
        <h3
          class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
        >
          To-dos <span class="type-code text-ink-subtle">{plan.taskId}</span>
        </h3>
      {/if}
      {@render tree(todos, false)}
      {#if projectId}
        <Button
          data-more
          class="self-start px-(--more-px)"
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
        <span class="type-code text-ink-subtle">{plan.taskId}</span>
      {/if}
    </Drawer.Title>
  </Drawer.Header>
  {@render body()}
{:else}
  <SideSurface
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
