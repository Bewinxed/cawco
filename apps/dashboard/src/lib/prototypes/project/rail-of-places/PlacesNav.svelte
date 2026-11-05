<script lang="ts" module>
  import type { Component } from "svelte";
  import {
    IconBox,
    IconDecisions,
    IconDollar,
    IconNotices,
    IconRepeat,
    IconTaskList,
    IconTranscript,
  } from "#lib/icons.js";
  import type { PlaceKey } from "./model";

  /** Each place's glyph, bare Solar (DESIGN.md, The Solar Duotone Rule). */
  export const PLACE_GLYPHS: Record<PlaceKey, Component> = {
    home: IconNotices,
    tasks: IconTaskList,
    routines: IconRepeat,
    decisions: IconDecisions,
    outputs: IconBox,
    sessions: IconTranscript,
    spend: IconDollar,
  };
</script>

<script lang="ts">
  /**
   * The project's places, as the rail and the phone's places sheet both
   * hold them: the daily five, a hairline, the weekly two, and at the foot
   * Caw's row (his status word and his sentence; it opens his pane) over
   * Configure. Each row is a PlaceRow with its live fact.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { IconAgent, IconSettings } from "#lib/icons.js";
  import { DAILY, placeFacts, WEEKLY } from "./facts";
  import type { Project, Read } from "./model";
  import PlaceRow from "./PlaceRow.svelte";

  let {
    project,
    read,
    place,
    cawOpen = false,
    onplace,
    oncaw,
    onconfigure,
  }: {
    project: Project;
    read: Read;
    place: PlaceKey;
    cawOpen?: boolean;
    onplace: (place: PlaceKey) => void;
    oncaw: () => void;
    onconfigure: () => void;
  } = $props();

  const facts = $derived(placeFacts(project, read));
  const reading = $derived(read.status === "loading");
  const caw = $derived(project.caw);
</script>

<nav
  class="flex min-h-0 flex-1 flex-col gap-space-1"
  aria-label={w.placesLabel(project.name)}
>
  {#each [DAILY, WEEKLY] as keys, index (index)}
    {#if index > 0}
      <hr class="mx-space-3 my-space-2 border-border-hairline" />
    {/if}
    <ul class="flex flex-col gap-space-1">
      {#each keys as key (key)}
        <li>
          <PlaceRow
            name={w.places[key]}
            glyph={PLACE_GLYPHS[key]}
            fact={facts[key]}
            chosen={place === key}
            {reading}
            onchoose={() => onplace(key)}
          />
        </li>
      {/each}
    </ul>
  {/each}
  <div class="mt-auto flex flex-col gap-space-1 pt-space-5">
    <button
      type="button"
      class="press-tint focus-inset touch-hit flex w-full min-w-0 items-start gap-space-3 rounded-sm px-space-2 py-space-2 text-start not-aria-expanded:hover:bg-surface-hover aria-expanded:bg-surface-pressed"
      aria-expanded={cawOpen}
      aria-label="{w.openCaw}: {w.cawStatus[caw.status]}, {caw.sentence}"
      onclick={oncaw}
    >
      <span
        class="mark-cell relative grid h-c-row-mark w-c-row-lead flex-none place-items-center text-ink-strong"
      >
        <IconAgent class="size-icon-lg" aria-hidden="true" />
        {#if caw.status === "working"}
          <span
            class="breathe loops absolute end-0 top-0 size-(--status-dot-size) rounded-pill bg-status-live-glyph ring-(length:--status-dot-cut) ring-(--sidebar)"
            aria-hidden="true"
          ></span>
        {/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-space-1">
        <span class="mark-line flex items-center gap-space-2">
          <span class="type-label text-ink-row">{w.caw}</span>
          <span
            class="type-meta text-ink-muted data-[status=asking]:text-status-attn-ink data-[status=unreachable]:text-status-fail-ink data-[status=working]:text-status-live-ink"
            data-status={caw.status}>{w.cawStatus[caw.status]}</span
          >
        </span>
        <span class="line-clamp-2 type-meta text-ink-muted">{caw.sentence}</span
        >
      </span>
    </button>
    <button
      type="button"
      class="press-tint focus-inset touch-hit mark-line flex w-full items-center gap-space-3 rounded-sm px-space-2 py-space-2 text-start text-ink-row hover:bg-surface-hover"
      onclick={onconfigure}
    >
      <span
        class="grid h-c-row-mark w-c-row-lead flex-none place-items-center text-ink-muted"
        data-box
      >
        <IconSettings class="size-icon-md" aria-hidden="true" />
      </span>
      <span class="type-label">{w.configure}</span>
    </button>
  </div>
</nav>
