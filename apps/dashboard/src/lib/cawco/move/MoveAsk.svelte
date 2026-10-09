<script lang="ts">
  /**
   * What "Move it" does, as the person reads it before saying it (the
   * owner's pick D, "Plain + details"): its lines, then the git terms behind
   * a Details fold. New session's step 2 and the pane's approval card both
   * draw it, from the hub's words (core `MoveAsk`).
   */
  import type { MoveAsk } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight } from "#lib/icons.js";

  let { ask }: { ask: MoveAsk } = $props();
  let open = $state(false);
</script>

<div class="move-ask">
  {#each ask.lines as line, i (i)}
    <p class="line">{line}</p>
  {/each}
  <Collapsible.Root bind:open>
    <Collapsible.Trigger class="move-details-trigger press-tint">
      Details
      <span aria-hidden="true" class="chev" class:open
        ><IconChevronRight /></span
      >
    </Collapsible.Trigger>
    <Collapsible.Content reveal>
      <pre class="details">{ask.details.join("\n")}</pre>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  .move-ask {
    display: grid;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .line {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .line + .line {
    color: var(--ink-muted);
  }
  :global(.move-details-trigger) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    justify-self: start;
    min-block-size: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: var(--type-label);
    color: var(--ink-muted);
    cursor: pointer;
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.move-details-trigger:hover) {
      color: var(--ink-strong);
    }
  }
  .chev {
    display: inline-grid;

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    &.open {
      transform: rotate(90deg);
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  .details {
    margin: var(--space-1) 0 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    font: var(--type-code);
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
