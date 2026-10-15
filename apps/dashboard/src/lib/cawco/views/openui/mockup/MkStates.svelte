<svelte:options css="injected" />

<script lang="ts">
  /**
   * States: one part in each of its states, the switch over it choosing
   * which one shows. The switch is the one live control a mockup has: it
   * changes what is drawn here, and reaches nothing else.
   */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    labels: unknown[];
    children: unknown[];
    active?: number;
  }> = $props();
  const labels = $derived(Array.isArray(props.labels) ? props.labels : []);
  const states = $derived(Array.isArray(props.children) ? props.children : []);
  let picked = $state<number | null>(null);
  const shown = $derived(
    Math.min(
      Math.max(0, picked ?? props.active ?? 0),
      Math.max(0, states.length - 1)
    )
  );
</script>

<div class="states" data-mk="States" data-shown={shown}>
  <fieldset class="switch">
    <legend class="legend">Which state is shown</legend>
    {#each labels as label, index (index)}
      <button
        class="option"
        aria-pressed={index === shown}
        onclick={() => {
          picked = index;
        }}
        type="button">{textOf(label)}</button
      >
    {/each}
  </fieldset>
  {#key shown}
    <div class="state" data-state={textOf(labels[shown])}>
      {@render renderNode(states[shown])}
    </div>
  {/key}
</div>

<style>
  .states {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 3);
    min-inline-size: 0;
  }
  .switch {
    display: inline-flex;
    align-self: flex-start;
    gap: calc(var(--mk-space) * 0.5);
    min-inline-size: 0;
    margin: 0;
    padding: calc(var(--mk-space) * 0.5);
    border: 1px dashed var(--mk-line);
    border-radius: var(--mk-radius-small);
  }
  .option {
    padding: calc(var(--mk-space) * 1) calc(var(--mk-space) * 3);
    border: 0;
    border-radius: calc(var(--mk-radius-small) - 2px);
    background: transparent;
    color: var(--mk-muted);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.8125);
    font-weight: 600;
    cursor: pointer;
  }
  /* Said to a screen reader, not shown: the dashboard's utilities do not
     reach a shadow root, so this is its own. */
  .legend {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .option[aria-pressed="true"] {
    background: var(--mk-sunken);
    color: var(--mk-ink);
  }
  .option:focus-visible {
    outline: 2px solid var(--mk-accent);
    outline-offset: 1px;
  }
  .state {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
</style>
