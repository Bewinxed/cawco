<script lang="ts">
  /**
   * The session list's folder tabs, on fixture data: three tabs with their
   * counts over the sheet the chosen one opens into. The place's variant is
   * the row's density, its state the root's `travel` (null at rest; under a
   * swipe, part-way from Working toward Finished, on the Swipe timeline's
   * clip). The lean and its hover lift are dials.
   */
  import { createDialKit, createDialTimeline } from "dialkit/svelte";
  import { untrack } from "svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import type { Place } from "../preview.svelte";

  let { place }: { place: Place } = $props();

  const TABS = [
    { id: "working", label: "Working", count: 3 },
    { id: "needs-you", label: "Needs you", count: 1 },
    { id: "finished", label: "Finished", count: 12 },
  ];
  const ROWS = [
    { project: "site", title: "Fix tray chip overflow", at: "08:55" },
    { project: "launch-q4", title: "Draft the pricing page copy", at: "08:41" },
    {
      project: "site",
      title: "Move the footer links into one row",
      at: "08:12",
    },
  ];

  const tabs = createDialKit("Tabs", {
    lean: [18, 0, 40],
    lift: [0.6, 0, 1],
  });
  // TODO(production): clip.current is the scrubbable authoring preview of a
  // swipe; the shipped swipe is the hand's own `travel`, frame by frame.
  const swipe = createDialTimeline(
    "Swipe",
    {
      cross: {
        at: 0,
        duration: 0.6,
        from: { fraction: 0 },
        to: { fraction: 1 },
        transition: { type: "easing", duration: 0.6, ease: [0.4, 0, 0.2, 1] },
      },
    },
    { autoplay: false }
  );

  let chosen = $state("working");
  const swiping = $derived(place.state === "swipe");
  // A swipe is shown held part-way, until the timeline is scrubbed or played.
  // Untracked: seeking moves the transport the timeline's values are read from.
  $effect(() => {
    if (swiping) {
      untrack(() => swipe.seek(0.24));
    }
  });
  const travel = $derived(
    swiping
      ? { fraction: swipe.cross.current.fraction, toward: "finished" }
      : null
  );
</script>

<div class="row" data-density={place.variant}>
  <Tabs
    onValueChange={(id: string) => {
      chosen = id;
    }}
    size={place.variant === "compact" ? "compact" : "default"}
    {travel}
    value={chosen}
    values={TABS.map((tab) => tab.id)}
    variant="folder"
  >
    <TabsList
      aria-label="Sessions"
      style="--lean: {tabs.lean}deg; --lean-lift: {tabs.lift}"
    >
      {#each TABS as tab (tab.id)}
        <TabItem label={tab.label} value={tab.id}>
          {#snippet trail()}
            <span class="count">{tab.count}</span>
          {/snippet}
        </TabItem>
      {/each}
    </TabsList>
  </Tabs>
  <ul class="sheet">
    {#each ROWS as row (row.title)}
      <li>
        <span class="project">{row.project}</span>
        <span class="title">{row.title}</span>
        <time>{row.at}</time>
      </li>
    {/each}
  </ul>
</div>

<style>
  .row {
    display: flex;
    flex-direction: column;
  }
  /* Airy: the default size with the label's room widened (TabItem's own
     host hooks, --px-start and --px-end). */
  .row[data-density="airy"] {
    --px-start: 18px;
    --px-end: 18px;
  }
  .count {
    margin-inline-start: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: var(--space-2) 0;
    list-style: none;
    background: var(--surface-raised);
    border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md);
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: baseline;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-body);
    color: var(--ink-strong);
  }
  .project,
  time {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
