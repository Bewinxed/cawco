<script lang="ts">
  /**
   * The open taste calls' switches (options.svelte.ts), drawn only on a
   * page opened with `?graph-options`: one floating card at the pane's
   * leading foot, each call a row with its two sides, the recommended one
   * first and chosen until flipped. Folded to its button, it stands out of
   * the way of what it changes. Not product chrome: it goes once he picks.
   */
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import { tick } from "svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconChevronDown, IconTuning } from "#lib/icons.js";
  import GlassGroup from "./GlassGroup.svelte";
  import { GRAPH_CALLS, type GraphCall, graphOptions } from "./options.svelte";
  import { RING, SYMBOL } from "./symbol";

  let { bottom = 0 }: { bottom?: number } = $props();

  let open = $state(true);
  let toggle = $state<HTMLButtonElement>();
  const calls = Object.entries(GRAPH_CALLS) as [
    GraphCall,
    (typeof GRAPH_CALLS)[GraphCall],
  ][];
  async function setOpen(next: boolean): Promise<void> {
    open = next;
    await tick();
    toggle?.focus({ preventScroll: true });
  }
</script>

<div
  class="pointer-events-none absolute start-space-3 end-space-3 top-space-3 bottom-(--bottom) z-7 flex flex-col items-start justify-end"
  data-graph-options
  style:--bottom={`calc(${bottom}px + var(--space-3))`}
>
  {#if open}
    <section
      aria-label={words.options}
      class="pointer-events-auto flex min-h-0 w-c-graph-panel-w max-w-full flex-col overflow-hidden rounded-panel border border-border-control bg-surface-raised shadow-overlay-hung"
    >
      <header
        class="mark-line flex flex-none items-center gap-space-2 border-b border-border-hairline py-space-1 ps-space-3 pe-space-1"
      >
        <h2 class="m-0 flex-1 type-label text-ink-strong">
          {words.options}
          <span class="type-meta font-normal text-ink-muted"
            >· {words.recommendedFirst}</span
          >
        </h2>
        <button
          aria-label={words.foldOptions}
          class={SYMBOL}
          data-box
          onclick={() => setOpen(false)}
          title={words.foldOptions}
          type="button"><IconChevronDown /></button
        >
      </header>
      <ol
        class="m-0 grid min-h-0 list-none gap-space-3 overflow-y-auto overscroll-contain p-space-3"
      >
        {#each calls as [call, one] (call)}
          <li class="grid min-w-0 gap-space-1">
            <span class="type-meta text-ink-row">{one.title}</span>
            <Tabs
              onValueChange={(side) => graphOptions.set(call, side as never)}
              size="compact"
              value={graphOptions.sides[call]}
            >
              <TabsList aria-label={one.title} scrollable>
                {#each one.sides as [side, label] (side)}
                  <TabItem {label} value={side} />
                {/each}
              </TabsList>
            </Tabs>
          </li>
        {/each}
      </ol>
    </section>
  {:else}
    <GlassGroup class="pointer-events-auto">
      <button
        bind:this={toggle}
        aria-expanded={open}
        aria-label={words.options}
        class="{SYMBOL} {RING}"
        data-options-toggle
        onclick={() => setOpen(true)}
        title={words.options}
        type="button"><IconTuning /></button
      >
    </GlassGroup>
  {/if}
</div>
