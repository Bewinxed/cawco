<script lang="ts" module>
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

  import { planWords, type SessionPlan } from "@cawco/core";
</script>

<script lang="ts">
  /**
   * A session's plan, beside the conversation (PRD §5.2, "Every session's
   * plan, in a panel"): its steps as a tree (PlanTree); its spec, read-only,
   * whole, as running text; and on a task attempt the task's to-dos the same
   * way, with the way to the project's canvas. Live: the client's copy
   * follows the hub's snapshots and deltas (plan.ts).
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
  import { cawco } from "../client.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { sideExpand } from "../side/expand";
  import SideSurface from "../side/SideSurface.svelte";
  import PlanTree, { stepsTree, todosTree } from "./PlanTree.svelte";

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
  const steps = $derived(stepsTree(plan));
  const todos = $derived(todosTree(plan));
  /**
   * A task's to-dos and nothing else (an attempt that has written no steps
   * or spec): the card is titled by them, not "Plan" over a "To-dos" head.
   */
  const onlyTodos = $derived(
    steps.length === 0 && !plan?.spec && todos.length > 0
  );
  const cardTitle = $derived(onlyTodos ? planWords.todos : planWords.plan);
  const projectId = $derived(
    cawco.instanceIndex.byId.get(instanceId)?.projectId ?? null
  );
  const showsTodos = $derived(todos.length > 0 && !!plan?.taskId);
  /** The steps are named once another part stands beside them. */
  const stepsHeaded = $derived(!!plan?.spec || showsTodos);
</script>

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
          class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
        >
          {planWords.steps}
        </h3>
      {/if}
      <PlanTree nodes={steps} />
    {/if}

    {#if plan?.spec}
      <h3
        class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
      >
        {planWords.spec}
      </h3>
      <MessageBody source={plan.spec.markdown} />
    {/if}

    {#if showsTodos && plan?.taskId}
      {#if !onlyTodos}
        <h3
          class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
        >
          {planWords.todos}
          <span class="type-code text-ink-subtle">{plan.taskId}</span>
        </h3>
      {/if}
      <PlanTree nodes={todos} />
      {#if projectId}
        <Button
          data-more
          class="self-start"
          pad="more"
          href="/project/{encodeURIComponent(
            projectId
          )}?view=canvas&task={encodeURIComponent(plan.taskId)}"
          label={planWords.openInCanvas}
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
    label={planWords.plan}
    {onclose}
    recessed={false}
    subtitle={onlyTodos ? (plan?.taskId ?? undefined) : undefined}
    {switcher}
    title={switcher ? undefined : cardTitle}
  >
    {@render body()}
  </SideSurface>
{/if}
