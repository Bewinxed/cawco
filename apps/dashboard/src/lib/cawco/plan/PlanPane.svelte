<script lang="ts" module>
  import type { SessionPlan } from "@cawco/core/plan";
  import { planWords } from "@cawco/core/words/plan";
  import { hubJson, refusedOrUnreached } from "#lib/platform/hub-read.js";
  import { stepsTree, todosTree } from "../plan";
  import { boardStore } from "../stores/board.svelte";

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
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { hubRequest } from "@cawco/core/hub-request";
  import { commonWords } from "@cawco/core/words/common";
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
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconClose } from "#lib/icons.js";
  import { dur, motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { scrollMotion } from "#lib/platform/motion/keyed.svelte.js";
  import { popOut } from "#lib/platform/motion/pop.svelte.js";

  import MessageBody from "../MessageBody.svelte";
  import { planAsked, takePlan } from "../reference-things.svelte";
  import { plansStore } from "../stores/plans.svelte";
  import {
    holdComposerLayer,
    roomOver,
    shutOnEscape,
  } from "../transcript/composer-layer.svelte";
  import PlanTree from "./PlanTree.svelte";

  let {
    instanceId,
    onclose,
  }: {
    /** The session whose plan this is. */
    instanceId: string;
    onclose: () => void;
  } = $props();

  const plan = $derived(plansStore.planOf(instanceId));
  const steps = $derived(stepsTree(plan));
  const todos = $derived(todosTree(plan));
  const todosOnly = $derived(onlyTodos(plan));
  const cardTitle = $derived(planTitle(plan));
  const projectId = $derived(
    boardStore.instanceIndex.byId.get(instanceId)?.projectId ?? null
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
    hubJson(hubRequest("POST /api/instances/:id/plan/seen", { path: { id } }), {
      failure: refusedOrUnreached,
    }).catch((error: unknown) => {
      console.warn("[cawco] marking the away notes seen failed:", error);
    });
  });

  /** The room it may rise into: from the ring's row up to the top of the composer's dock. */
  const room = roomOver("--plan-room");

  /** Shuts it, and the focus goes back to its ring. */
  function shut(): void {
    const ring = section?.parentElement?.querySelector<HTMLElement>(
      '[data-slot="plan-ring"]'
    );
    onclose();
    ring?.focus();
  }

  // It holds the composer's layer while it is open: the tray's shelf opening over the same row takes it, and the plan shuts.
  holdComposerLayer(
    () => instanceId,
    "plan",
    () => onclose()
  );

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
      behavior: scrollMotion(motionOk.current),
    });
    row.setAttribute("data-linked", "");
    setTimeout(
      () => row.removeAttribute("data-linked"),
      dur("--duration-fade") * 4
    );
  });
  // Esc shuts it: from inside, the focus back on its ring; from the tray row or the composer under it, the focus staying where it was.
  shutOnEscape(() => section, { inside: shut, under: () => onclose() });
</script>

<!-- It comes in by the kit's `@starting-style` (opacity, rise and scale on
     one transition, --duration-pop on the drawer curve, from the ring's corner)
     and leaves by `popOut` back down into the row (--duration-exit), global: the
     pane's `{#if}` that shuts it is outside this component, a snippet
     render between. -->
<section
  data-slot="plan"
  aria-labelledby={titleId}
  class={floatingSurface({
    class:
      "absolute start-0 end-0 bottom-(--plan-foot) z-1 flex flex-col max-h-(--plan-room) p-0 overflow-clip origin-bottom-right rtl:origin-bottom-left pointer-events-auto timeline-scope-transcript-head",
  })}
  data-side="top"
  data-state="open"
  style:--plan-foot="calc(100% + var(--spacing-space-2))"
  bind:this={section}
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <!-- One row with no ground (DESIGN.md, The Title Bars Follow Liquid Glass
       Rule): the card's name, then Close, a bare symbol in its glass group.
       A task attempt's id is a fact in the body, never in the bar. It
       floats over the parts, which run to the card's top beneath it and
       blur and fade under it as they scroll (HeadFade), clearing it at
       rest by the body's top padding. -->
  <HeadFade band="var(--spacing-c-top-bar-h)" tint="bg-surface-raised" />
  <header
    data-slot="plan-head"
    class="absolute inset-x-0 top-0 z-2 flex h-c-top-bar-h items-center gap-space-2 pe-space-2 ps-space-4"
  >
    <h2
      class="flex-auto min-w-0 m-0 truncate text-size-label font-medium text-ink-strong"
      id={titleId}
    >
      {cardTitle}
    </h2>
    <BarGlass form="group">
      <BarItem icon={IconClose} label={commonWords.close} onclick={shut} />
    </BarGlass>
  </header>
  <!-- The parts, flat on the surface: a heading, then what it names. -->
  <div
    data-slot="body"
    bind:this={body}
    class="kit-edge-fade-block flex-auto min-h-0 overflow-y-auto overscroll-contain touch-pan-y scroll-timeline-transcript-head pbs-(--body-top) pbe-space-4 px-space-4 flex flex-col gap-space-2"
    style:--body-top="calc(var(--spacing-c-top-bar-h) + var(--spacing-space-3))"
    style:--more-px="0"
  >
    {#if todosOnly && plan?.taskId}
      <p
        data-slot="plan-task"
        class="m-0 min-w-0 truncate type-code text-ink-subtle"
      >
        {plan.taskId}
      </p>
    {/if}
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
