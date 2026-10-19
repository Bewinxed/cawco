<script lang="ts">
  /**
   * WHAT NEEDS YOU, FIRST (proposal, One list and Lanes): a short head
   * above the plan naming each delegate that waits on the person or has
   * failed, so the first rows answer "does anything need me?" whatever the
   * plan's order puts lower down. Each row points at the delegate's own row
   * (scrolls it in and lights it). Crew first's stack leads with these
   * already, so it draws none.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import type { Delegate } from "./fixtures";
  import { pointAt, useView } from "./view.svelte";

  let { delegates }: { delegates: Delegate[] } = $props();

  const view = useView();
  const uid = $props.id();
  const needs = $derived(
    delegates.filter((one) => one.status === "attn" || one.status === "fail")
  );
  const said = (one: Delegate): string =>
    one.status === "attn"
      ? `${one.name} is waiting on you`
      : `${one.name} failed: ${one.wait?.words ?? "its report says why"}`;
</script>

{#if needs.length > 0}
  <section aria-labelledby="needs-{uid}" class="needs" data-slot="needs-you">
    <h3 class="head mark-line" id="needs-{uid}">
      <span>Needs you</span>
      <span class="num count" data-num>{needs.length}</span>
    </h3>
    <ul class="rows">
      {#each needs as one (one.id)}
        <li>
          <button
            class="row mark-line press-tint"
            data-kind={one.status}
            data-needs={one.id}
            onclick={(event) => pointAt(view, event.currentTarget, one.id)}
            type="button"
          >
            <span class="pv-lead" data-box
              ><SessionMark
                id={one.id}
                place={one.place}
                status={one.status}
              /></span
            >
            <span class="words">{said(one)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .needs {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-end: var(--space-2);
    padding-block-end: var(--space-2);
    border-block-end: 1px solid var(--border-hairline);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .count {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .row {
    display: grid;
    grid-template-columns: var(--pv-tile, 18px) minmax(0, 1fr);
    align-items: start;
    column-gap: var(--space-2);
    inline-size: 100%;
    min-block-size: 28px;
    padding: 5px 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
    &[data-kind="attn"] .words {
      color: var(--status-attn-ink);
    }
    &[data-kind="fail"] .words {
      color: var(--status-fail-ink);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--surface-hover);
    }
  }
  .pv-lead {
    display: grid;
    place-items: center;
    block-size: max(1lh, var(--pv-tile, 18px));
  }
  :global([data-coarse]) .row {
    min-block-size: 44px;
    padding-block: 11px;
  }
</style>
