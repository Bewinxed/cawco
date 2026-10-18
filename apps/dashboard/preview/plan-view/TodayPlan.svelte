<script lang="ts">
  /**
   * TODAY: the plan's body as the panel draws it now, for comparison, from
   * the same rows the proposal draws. It is PlanPane's own markup and styles,
   * fed from fixtures instead of the live client (PlanPane reads
   * `cawco.planOf`, which a static page has none of): the real PlanTree for
   * the session's steps, `[td-n]` written into their words, the whole spec
   * through the real MessageBody under a "Spec" head, then the task's to-dos
   * a second time under "To-dos" with the way to the canvas.
   */
  import { planWords } from "@cawco/core";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import PlanTree, { treeOf } from "#lib/cawco/plan/PlanTree.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    type PlanFixture,
    TODAY_SPEC,
    TODAY_TASK_ID,
    todaySteps,
    todayTodos,
  } from "./fixtures";

  let { plan, sheet = false }: { plan: PlanFixture; sheet?: boolean } =
    $props();

  const steps = $derived(treeOf(todaySteps(plan)));
  const todos = $derived(plan.task ? treeOf(todayTodos(plan)) : []);
</script>

<div data-slot="today-body" data-today class={["body", { sheet }]}>
  <h3 class="part-head">{planWords.steps}</h3>
  <PlanTree nodes={steps} />

  <h3 class="part-head">{planWords.spec}</h3>
  <MessageBody source={TODAY_SPEC} />

  {#if todos.length > 0}
    <h3 class="part-head">
      {planWords.todos} <span class="ref">{TODAY_TASK_ID}</span>
    </h3>
    <PlanTree nodes={todos} />
    <Button
      class="more"
      label={planWords.openInCanvas}
      size="sm"
      variant="link"
    />
  {/if}
</div>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-1) var(--space-4);
  }
  .body.sheet {
    padding-block: var(--space-3) 0;
  }
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
