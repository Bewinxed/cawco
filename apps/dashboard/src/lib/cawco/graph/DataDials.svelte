<script lang="ts">
  /**
   * The data dials over real records (the owner's pick "Now" on data
   * sliders), shown only on the states they apply to: a count is a field
   * like the steps bar's, its name and "12 of 60" inside it and its fill
   * up to the count; a switch between two real values is the kit's
   * segmented control. Each writes the story's args the stage mounts with,
   * ranging only over the records the states file names.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import type { DataDial } from "./graph";

  let {
    dials,
    values,
    onchange,
  }: {
    dials: DataDial[];
    values: Record<string, number>;
    onchange: (id: string, value: number) => void;
  } = $props();
</script>

{#each dials as dial (dial.id)}
  {@const value = values[dial.id] ?? dial.value}
  {#if dial.kind === "count"}
    {@const p = (value - dial.min) / Math.max(1, dial.max - dial.min)}
    <Slider.Root
      type="single"
      class="touch-hit relative flex h-c-btn-h-sm w-c-graph-node-w flex-none items-center rounded-md border border-border-control bg-surface-raised select-none touch-none cursor-ew-resize max-phone:h-c-effort-track-h-phone coarse:h-c-effort-track-h-phone"
      max={dial.max}
      min={dial.min}
      onValueChange={(next) => onchange(dial.id, next)}
      step={1}
      thumbPositioning="exact"
      {value}
    >
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
      >
        <span
          class="absolute inset-y-0 start-0 w-(--fill) bg-surface-recess-deep"
          style:--fill={`${p * 100}%`}
        ></span>
      </span>
      <span
        aria-hidden="true"
        class="pointer-events-none relative flex w-full items-center justify-between gap-space-2 px-space-3"
      >
        <span class="type-label text-ink-strong">{dial.label}</span>
        <span class="type-meta mono-figure num text-ink-muted"
          >{graphWords.ofRecords(value, dial.max)}</span
        >
      </span>
      <Slider.Thumb
        aria-label={dial.label}
        aria-valuetext={graphWords.ofRecords(value, dial.max)}
        class="h-full w-px bg-ink-strong opacity-40 outline-none focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
        index={0}
      />
    </Slider.Root>
  {:else}
    <span class="flex flex-none items-center gap-space-2">
      <span class="type-label text-ink-muted">{dial.label}</span>
      <Tabs.Root
        aria-label={dial.label}
        class="flex-none"
        onValueChange={(next) => onchange(dial.id, Number(next))}
        value={String(value)}
      >
        <Tabs.List>
          {#each dial.options as option, index (option)}
            <Tabs.Trigger value={String(index)}>{option}</Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    </span>
  {/if}
{/each}
