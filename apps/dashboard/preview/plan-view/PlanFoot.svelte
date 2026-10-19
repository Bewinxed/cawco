<script lang="ts">
  /**
   * The plan's foot, the same in every variation: add a to-do, the way to
   * the whole graph on the project canvas, and the spec folded after the
   * steps on the same accordion as a step.
   */
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight, IconPlus } from "#lib/icons.js";
  import Fold from "./Fold.svelte";
  import type { PlanFixture } from "./fixtures";
  import { useView } from "./view.svelte";

  let { plan }: { plan: PlanFixture } = $props();

  const view = useView();
  const open = $derived(view.opened.has("spec"));
  const uid = $props.id();
</script>

<div class="foot">
  <button class="add pressable touch-hit" type="button">
    <IconPlus aria-hidden="true" />
    <span>Add a to-do</span>
  </button>
  <Button class="canvas" label="Open in canvas" size="sm" variant="link" />
</div>
<section class="spec">
  <button
    aria-controls="spec-{uid}"
    aria-expanded={open}
    class="spec-head"
    onclick={() => view.toggle("spec")}
    type="button"
  >
    <span class="spec-name">Spec</span>
    <span class="spec-at">· written {plan.spec.ago}</span>
    <span aria-hidden="true" class="chev" data-open={open || undefined}
      ><IconChevronRight /></span
    >
  </button>
  <Fold id="spec-{uid}" {open}>
    <div class="spec-body" data-slot="spec-body">
      <MessageBody source={plan.spec.markdown} />
    </div>
  </Fold>
</section>

<style>
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-block-start: var(--space-1);

    & :global(.canvas) {
      padding-inline: 0;
    }
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    font: var(--type-label);
    font-weight: var(--weight-body);
    cursor: pointer;
    transition: color var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: 18px;
      block-size: var(--icon-md);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .add:hover {
      color: var(--ink-strong);
    }
  }
  .spec {
    margin-block-start: var(--space-3);
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--border-hairline);
  }
  .spec-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
  .spec-at {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .chev {
    display: grid;
    place-items: center;
    margin-inline-start: auto;
    color: var(--ink-subtle);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: rotate var(--dur-control) var(--ease-out);
    }
    &[data-open] {
      rotate: 90deg;
    }
  }
  .spec-body {
    padding-block: var(--space-1) var(--space-3);

    & :global(li::marker) {
      color: var(--ink-muted);
    }
  }
  :global([data-coarse]) :is(.add, .spec-head) {
    min-block-size: 44px;
  }
</style>
