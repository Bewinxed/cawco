<script lang="ts" module>
  import { type SessionPlan, todoProgress } from "@cawco/core/plan";
  import { planWords } from "@cawco/core/words/plan";
  import { stepsTree, todosTree } from "./PlanTree.svelte";
  /** How far a plan has got: its steps, else its task's agreed to-dos. */
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
    return todoProgress(plan.todos ?? []);
  }

  /** The plan has something to show: steps, a spec, or a task's agreed to-dos. */
  export const planShows = (plan: SessionPlan | undefined): boolean =>
    !!plan &&
    (plan.steps.length > 0 || !!plan.spec || todosTree(plan).length > 0);

  /**
   * A task's to-dos and nothing else (an attempt that has written no steps
   * or spec): the card is titled by them, not "Plan" over a "To-dos" head.
   */
  const onlyTodos = (plan: SessionPlan | undefined): boolean =>
    stepsTree(plan).length === 0 && !plan?.spec && todosTree(plan).length > 0;

  /** The plan's card title. */
  const planTitle = (plan: SessionPlan | undefined): string =>
    onlyTodos(plan) ? planWords.todos : planWords.plan;
</script>

<script lang="ts">
  /**
   * A session's plan (PRD §5.2, "Every session's plan, in a panel"): its
   * steps as a tree (PlanTree); its spec, read-only, whole, as running
   * text; and on a task attempt the task's to-dos the same way, with the
   * way to the project's canvas. Live: the client's copy follows the hub's
   * snapshots and deltas (plan.ts).
   *
   * It comes out of the composer, so it is a layer of the composer: the
   * kit's floating surface (`floatingSurface`, the `/` menu's and the
   * delegate tray's shelf's family) rising out of the tray row its ring
   * stands on, across the composer's width, over the transcript's foot, at
   * every width. Nothing it does moves the transcript, the composer or the
   * row (owner: "WHY WOULD ANYTHING THAT COMES OUT OF THE COMPOSER EVEN
   * MOVE THE TRANSCRIPT"). It stands in the ring's slot (Composer
   * `progress-slot`), whose box spans the tray row, so `start-0 end-0` is
   * the composer's width. It holds nothing (DESIGN.md, The Open Page Rule):
   * the conversation under it stays live, and it goes by its Close, Esc or
   * its ring.
   *
   * One column under its title that scrolls, as tall as what it holds up
   * to the room over the row (to the top of the composer's dock).
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { bringIntoView } from "#lib/cawco/bring-into-view.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconClose } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { popOut } from "../motion/pop.svelte";
  import { send } from "../project-tasks";
  import { planAsked, takePlan } from "../reference-things.svelte";
  import { composerLayer } from "../transcript/composer-layer.svelte";
  import PlanTree from "./PlanTree.svelte";

  let {
    instanceId,
    onclose,
  }: {
    /** The session whose plan this is. */
    instanceId: string;
    onclose: () => void;
  } = $props();

  const plan = $derived(cawco.planOf(instanceId));
  const steps = $derived(stepsTree(plan));
  const todos = $derived(todosTree(plan));
  const todosOnly = $derived(onlyTodos(plan));
  const cardTitle = $derived(planTitle(plan));
  const projectId = $derived(
    cawco.instanceIndex.byId.get(instanceId)?.projectId ?? null
  );
  const showsTodos = $derived(todos.length > 0 && !!plan?.taskId);
  /** The steps are named once another part stands beside them. */
  const stepsHeaded = $derived(!!plan?.spec || showsTodos);
  const titleId = $props.id();

  /*
   * Opened, its away notes are seen (hub plans.ts `seeAway`): the hub drops
   * `awayUnseen` and every client's ring loses its mark. Once per opening:
   * notes written while it stands open are not taken as read.
   */
  $effect(() => {
    const id = instanceId;
    if (!untrack(() => plan?.awayUnseen)) {
      return;
    }
    send(`/api/instances/${encodeURIComponent(id)}/plan/seen`, {
      method: "POST",
    }).catch((error: unknown) => {
      console.warn("[cawco] marking the away notes seen failed:", error);
    });
  });

  /**
   * The room it may rise into: from the ring's row up to the top of the
   * composer's dock, a step short of it, read once as it opens.
   */
  const room: Attachment<HTMLElement> = (node) => {
    const row = node.offsetParent;
    const dock = node.closest('[data-slot="dock"]');
    if (row && dock) {
      const over =
        row.getBoundingClientRect().top - dock.getBoundingClientRect().top;
      node.style.setProperty("--plan-room", `${Math.max(0, over - 16)}px`);
    }
  };

  /** Shuts it, and the focus goes back to its ring. */
  function shut(): void {
    const ring = section?.parentElement?.querySelector<HTMLElement>(
      '[data-slot="plan-ring"]'
    );
    onclose();
    ring?.focus();
  }

  /**
   * It holds the composer's layer while it is open: the tray's shelf
   * opening over the same row takes it, and the plan shuts.
   */
  const layerOwner = Symbol("plan");
  $effect.pre(() => {
    untrack(() => composerLayer.take(layerOwner));
  });
  $effect(() => {
    if (!composerLayer.holds(layerOwner)) {
      untrack(onclose);
    }
  });
  $effect(() => () => composerLayer.drop(layerOwner));

  let section = $state<HTMLElement>();
  let body = $state<HTMLElement>();
  /*
   * A plan's or a step's chip asked for this plan (reference-things.svelte.ts
   * `askPlan`; the pane opened it): the step is brought into view in its
   * column and marked for a moment, once it is drawn; then the ask is taken.
   */
  $effect(() => {
    const asked = planAsked(instanceId);
    const drawn = steps.length;
    if (!(asked && body)) {
      return;
    }
    const { step } = asked;
    if (!step) {
      takePlan(instanceId);
      return;
    }
    const row = drawn
      ? body.querySelector<HTMLElement>(`[data-plan-row="${CSS.escape(step)}"]`)
      : null;
    if (!row) {
      return;
    }
    takePlan(instanceId);
    bringIntoView(row, {
      behavior: motionOk.current ? "smooth" : "auto",
    });
    row.setAttribute("data-linked", "");
    setTimeout(() => row.removeAttribute("data-linked"), dur("--dur-fade") * 4);
  });
  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      shut();
    }
  }
  /** Esc with the focus nowhere in particular (a pointer opened it) shuts it too. */
  function onwindowkey(event: KeyboardEvent): void {
    const at = document.activeElement;
    if (
      event.key === "Escape" &&
      !event.defaultPrevented &&
      (!at || at === document.body)
    ) {
      event.preventDefault();
      shut();
    }
  }
</script>

<svelte:window onkeydown={onwindowkey} />

<!-- It comes in by the kit's `@starting-style` (opacity, rise and scale on
     one transition, --dur-pop on the drawer curve, from the ring's corner)
     and leaves by `popOut` back down into the row (--dur-exit), global: the
     pane's `{#if}` that shuts it is outside this component, a snippet
     render between. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions: Escape inside the plan shuts it, heard as it passes up from the control that has the focus -->
<section
  data-slot="plan"
  aria-labelledby={titleId}
  class={floatingSurface({
    class:
      "absolute start-0 end-0 bottom-(--plan-foot) z-1 flex flex-col max-h-(--plan-room) p-0 overflow-clip origin-bottom-right rtl:origin-bottom-left pointer-events-auto",
  })}
  data-side="top"
  data-state="open"
  {onkeydown}
  style:--plan-foot="calc(100% + var(--space-2))"
  bind:this={section}
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <header
    data-slot="plan-head"
    class="flex items-center gap-space-2 py-space-2 pe-space-2 ps-space-4 border-b border-b-border-hairline"
  >
    <h2
      class="flex-auto min-w-0 m-0 flex items-baseline gap-space-2 text-size-label font-medium text-ink-strong"
      id={titleId}
    >
      <span class="flex-none">{cardTitle}</span>
      {#if todosOnly && plan?.taskId}
        <span
          class="min-w-0 type-code text-ink-subtle overflow-clip text-ellipsis whitespace-nowrap"
          >{plan.taskId}</span
        >
      {/if}
    </h2>
    <Button
      aria-label="Close"
      class="touch-hit"
      onclick={shut}
      size="icon-sm"
      variant="ghost"><IconClose /></Button
    >
  </header>
  <!-- The parts, flat on the surface: a heading, then what it names. -->
  <div
    data-slot="body"
    bind:this={body}
    class="kit-edge-fade-block flex-auto min-h-0 overflow-y-auto overscroll-contain touch-pan-y pbs-space-3 pbe-space-4 px-space-4 flex flex-col gap-space-2"
    style:--more-px="0"
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
      {#if !todosOnly}
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
</section>
