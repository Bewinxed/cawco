<!--
  The agent's page in the well: the dashboard's own routine form
  (RoutineForm), filled in, on a page of its own (the page's ground and
  inset). Its hub is a stand-in that answers as a project with no delegate
  types of its own and keeps the schedule's read-back pending, so the form
  draws the same every time.

  Each element a comment can stand on (data.ts ELEMENTS) has a box standing
  over it (Over) that holds its pins (`pin(name)`). In Comment mode the
  element under the pointer is `outlined`: 2px brand outline 2px out, its
  words in a name tag on the outline's top-left (comment-design §2), or on
  the first other corner with room where something drawn holds that one
  (place-tag.ts); the page's root is outlined dashed `--space-1` inside the
  well, tagged "Whole page" on the outline's corner, clear of the page's
  first line.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import RoutineForm from "$kit/cawco/routines/RoutineForm.svelte";
  import type { RoutineFormHub } from "$kit/cawco/routines/routines-api";
  import { ELEMENTS, type ElementName } from "../data";
  import Over from "./Over.svelte";
  import { placeTag } from "./place-tag";

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
      class="pointer-events-none absolute inset-space-1 z-10 border-2 border-dashed border-brand-solid"
    ></span>
    <span
      class="absolute start-(--space-row) top-(--space-row) z-10 rounded-xs bg-ink-solid px-space-1 py-0.5 type-caps text-on-ink"
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
        {#if outlined === name}
          <span
            class="absolute z-10 max-w-[32ch] truncate rounded-xs bg-ink-solid px-space-1 py-0.5 type-caps text-on-ink"
            data-tag
            {@attach placeTag}>{ELEMENTS[name].words}</span
          >
        {/if}
        {@render pin?.(name)}
      </Over>
    {/each}
  {/if}
</div>
