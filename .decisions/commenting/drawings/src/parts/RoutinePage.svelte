<!--
  The agent's page in the well: the dashboard's own routine form
  (RoutineForm), filled in, on a page of its own (the page's ground and
  inset). Its hub is a stand-in that answers as a project with no delegate
  types of its own and keeps the schedule's read-back pending, so the form
  draws the same every time.

  Each element a comment can stand on (data.ts ELEMENTS) has a box standing
  over it (Over) that holds its pins (`pin(name)`). In Comment mode the
  element chosen is `outlined` (The One Target Rule): its box washes it and
  draws a 1px brand line on its border box (Over). Its name is said where
  it was chosen (the composer's target chip, the thread's head), so it
  takes no label: the hover's label leaves with the hover once a target is
  chosen. The page's root takes a 1px dashed brand line `--space-1` inside
  the well, with no wash, and keeps its label (raised, `border-control`,
  meta, `ink-strong`) on the line's foot corner, the page's empty corner:
  its head corner stands on the form's first label.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import RoutineForm from "$kit/cawco/routines/RoutineForm.svelte";
  import type { RoutineFormHub } from "$kit/cawco/routines/routines-api";
  import { ELEMENTS, type ElementName } from "../data";
  import Over from "./Over.svelte";

  let {
    outlined = null,
    pin,
  }: {
    outlined?: ElementName | "page" | null;
    pin?: Snippet<[string]>;
  } = $props();

  /** A hub that never answers the read-back, and offers the hub's pick alone. */
  const HUB: RoutineFormHub = {
    create: () => new Promise(() => undefined),
    preview: () => new Promise(() => undefined),
    types: () => Promise.resolve([]),
  };

  const DRAFT = {
    name: "Nightly dependency check",
    prompt: "Check every package for updates and open one pull request with the safe ones.",
    cron: "0 9 * * *",
    timeZone: "Europe/London",
    delegateType: null,
  };

  let root = $state<HTMLElement>();
  const names = Object.keys(ELEMENTS) as ElementName[];
</script>

<div class="relative h-full bg-surface-page p-space-6" bind:this={root}>
  {#if outlined === "page"}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-space-1 z-10 rounded-xs border-(length:--c-target-stroke) border-dashed border-brand-solid"
    ></span>
    <span
      class="absolute start-space-1 bottom-space-1 z-10 truncate whitespace-nowrap rounded-xs border border-border-control bg-surface-raised px-space-2 py-space-1 type-meta text-ink-strong shadow-tile"
      data-tag>Whole page</span
    >
  {/if}
  {@render pin?.("page")}
  <RoutineForm
    draft={DRAFT}
    focus={false}
    hub={HUB}
    oncancel={() => undefined}
    oncreated={() => undefined}
    projectId="drawings"
  />
  {#if root}
    {#each names as name (name)}
      <Over find={ELEMENTS[name].find} {name} outlined={outlined === name} {root}>
        {@render pin?.(name)}
      </Over>
    {/each}
  {/if}
</div>
