<script lang="ts">
  import { page } from "$app/state";
  /**
   * Working and Finished, as one switch over two lists: the sidebar's and
   * the phone home's, reading one remembered choice (work-tab). The switch is
   * the new-session dialog's harness rail laid across (motion/Rail): a thumb
   * under the chosen tab, one travelling label, arrow keys.
   *
   * Both lists stay mounted, side by side on one track in a clipped window.
   * Switching slides the track one pane over (--dur-morph, --ease-in-out,
   * with the thumb), so the old list leaves one side as the new one enters
   * from the other: they never share the space and neither is rebuilt. The
   * window's height tweens to the new list's (motion/morph), so what is
   * under it glides. The pane out of view is inert and hidden from the
   * accessibility tree once the slide ends; each keeps its own place.
   *
   * A tab with nothing in it shows nothing; with nothing in either, there is
   * no switch at all. The rows keep a held order (motion/held-order).
   */
  import Finished from "~icons/solar/check-circle-bold-duotone";
  import Working from "~icons/solar/refresh-circle-bold-duotone";
  import { type InstanceRow, isFailed, whiffle } from "../client.svelte";
  import { conversationHref } from "../links";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { morph } from "../motion/morph.svelte";
  import Rail from "../motion/Rail.svelte";
  import { reflow } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import HomeRow from "./HomeRow.svelte";
  import {
    byMachine,
    clock,
    home,
    instanceTitle,
    lastAt,
    projectOf,
    span,
  } from "./home.svelte";
  import { type WorkTab, workTab } from "./work-tab.svelte";

  let { stale }: { stale: boolean } = $props();

  const current = $derived(
    page.url.pathname.startsWith("/session") ? workspace.activeSessionId : null
  );

  const TABS = [
    { id: "working", label: "Working", icon: Working },
    { id: "finished", label: "Finished", icon: Finished },
  ] as const;
  type Tab = (typeof TABS)[number];
  const rowsOf = (tab: WorkTab): InstanceRow[] =>
    tab === "working" ? home.working : home.finished;

  /** Which pane is on screen: 0 Working, 1 Finished. */
  const at = $derived(workTab.current === "finished" ? 1 : 0);
  /**
   * The pane the reader can reach. It follows the choice at once, but the
   * one being left stays reachable until the slide ends, so focus inside it
   * is not yanked mid-slide.
   */
  let settled = $state(workTab.current);
  $effect(() => {
    const next = workTab.current;
    if (next === settled) {
      return;
    }
    const timer = setTimeout(
      () => {
        settled = next;
      },
      motionOk.current ? dur("--dur-morph") : 0
    );
    return () => clearTimeout(timer);
  });

  /** A working row's line: its project, then what it is doing now. */
  function workingLine(row: InstanceRow): string {
    const tool = whiffle.currentToolOf(row.id);
    const doing = tool ? `${tool.name} ${tool.glance}`.trim() : "";
    return [projectOf(row.machineId, row.cwd), doing]
      .filter(Boolean)
      .join(" · ");
  }
  /** A finished row's line: its project, and why, if it failed. */
  function finishedLine(row: InstanceRow): string {
    const why = isFailed(row)
      ? `failed${row.lastError ? `: ${row.lastError}` : ""}`
      : "";
    return [projectOf(row.machineId, row.cwd), why].filter(Boolean).join(" · ");
  }
  function age(row: InstanceRow, tab: WorkTab): string {
    if (tab === "working") {
      const since = whiffle.turnSince(row.id);
      return since ? span(clock.now - since) : "";
    }
    return span(clock.now - lastAt(row));
  }
</script>

{#snippet pane(tab: WorkTab)}
  {@const hidden = tab !== workTab.current && tab !== settled}
  <section
    aria-hidden={hidden || undefined}
    aria-label={tab === 'working' ? 'Working' : 'Finished'}
    class="pane"
    inert={hidden}
    class:away={tab !== workTab.current}
    {@attach reflow()}
  >
    {#each byMachine(rowsOf(tab)) as group, index (group.machineId)}
      {#if index > 0}
        <hr class="kit-seam" data-flip>
      {/if}
      <!-- Where these run, said once for the rows under it. -->
      <h3 class="machine" data-flip>
        <OsMark class="size-3.5" os={group.os} />
        <span>{group.name}</span>
      </h3>
      {#each group.rows as row (row.id)}
        <HomeRow
          active={current === row.id}
          done={tab === 'finished'}
          href={conversationHref(row.id, whiffle.instanceIndex)}
          instance={row}
          line={tab === 'working' ? workingLine(row) : finishedLine(row)}
          machineId={row.machineId}
          {stale}
          title={instanceTitle(row)}
          trail={age(row, tab)}
        />
      {/each}
    {/each}
  </section>
{/snippet}

{#if home.working.length + home.finished.length > 0}
  <section aria-label="Sessions" class="work" data-flip="box">
    <div class="head">
      <Rail
        axis="x"
        class="work-rail"
        itemClass="work-tab press-tint focus-inset touch-hit"
        items={[...TABS]}
        label="Sessions"
        labelled
        onpick={(id: string) => workTab.set(id as WorkTab)}
        value={workTab.current}
      >
        {#snippet item(tab: Tab)}
          {@const count = rowsOf(tab.id).length}
          <tab.icon aria-hidden="true" class="work-icon" />
          <span>{tab.label}</span>
          {#key count}
            <span class="num count" data-flip="pop" class:zero={count === 0}
              >{count}</span
            >
          {/key}
        {/snippet}
      </Rail>
    </div>
    <!-- The window: clipped, its height following the pane in view. -->
    <div class="window" {@attach morph()} {@attach holdWhileInside('home:')}>
      <div class="track" style:--at={at}>
        {@render pane('working')}
        {@render pane('finished')}
      </div>
    </div>
  </section>
{/if}

<style>
  .work {
    display: flex;
    flex-direction: column;
  }
  /* The switch hugs its tabs at the row's start; a neutral hairline under
     it marks the section. */
  .head {
    display: flex;
    padding: 0 var(--space-1) var(--space-2);
    margin-bottom: var(--space-1);
    border-bottom: 1px solid var(--border-hairline);
  }
  :global(.work-rail) {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-md);
    background: var(--surface-recess);
  }
  :global(.work-tab) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 var(--space-2);
    font: var(--type-label);
    white-space: nowrap;
  }
  :global(.work-tab .work-icon) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .count {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .count.zero {
    color: var(--ink-subtle);
  }
  .window {
    overflow: hidden;
  }
  /* Two panes, each the window's width. The track is only as tall as the
     chosen pane: the other one takes no height (its rows still draw, hanging
     below its top edge, clipped by the window), so the window's height
     changes the moment the choice does and morph() tweens it while the track
     slides. */
  .track {
    display: grid;
    grid-template-columns: 100% 100%;
    align-items: start;
    transform: translateX(calc(var(--at) * -100%));

    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-morph) var(--ease-in-out);
    }
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .pane.away {
    height: 0;
  }
  .machine {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: var(--space-2) 0 0;
    padding: 0 var(--space-3);
    min-height: 22px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .pane > .machine:first-child {
    margin-top: var(--space-1);
  }
</style>
