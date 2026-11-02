<script lang="ts">
  /**
   * A clip's bar on the move's scale, and its timing's handles (bits-ui's
   * Slider, two thumbs): the start handle is when it begins (its delay,
   * never before the moment the move set it off), the end handle when it
   * ends (its length). A drag draws the bar where it is held; letting go
   * tunes the clip, which plays on the stage at once (DesignGraph
   * `retime`). The arrow keys move a handle by 10 ms.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import type { Clip, Tuning } from "./motion";

  let {
    clip,
    name,
    scale,
    ontune,
  }: {
    clip: Clip;
    /** The clip as a person says it, for each handle's name. */
    name: string;
    /** The scale's end, ms: the ruler's. */
    scale: number;
    ontune: (tuning: Tuning) => void;
  } = $props();

  const STEP = 10;
  const start = $derived(clip.start + clip.delay);
  /** The handles while a drag holds them. */
  let held = $state<number[] | null>(null);
  const value = $derived(held ?? [start, start + clip.duration]);
  /** Never before the moment the move set it off; never shorter than one step. */
  const within = ([from = start, to = start]: number[]): number[] => {
    const begins = Math.max(clip.start, Math.min(from, scale - STEP));
    return [begins, Math.max(begins + STEP, Math.min(to, scale))];
  };
</script>

<Slider.Root
  class="relative flex h-c-btn-h-sm w-full touch-none items-center select-none"
  max={scale}
  min={0}
  onValueChange={(next: number[]) => {
    held = within(next);
  }}
  onValueCommit={(next: number[]) => {
    const [from = start, to = start] = within(next);
    held = null;
    if (from !== start || to - from !== clip.duration) {
      ontune({
        delay: from - clip.start,
        duration: to - from,
        easing: clip.easing,
        spring: null,
      });
    }
  }}
  step={STEP}
  thumbPositioning="exact"
  type="multiple"
  {value}
>
  {#snippet children({ thumbItems })}
    <span
      class="relative h-space-2 w-full grow overflow-clip rounded-pill bg-surface-fill"
    >
      <Slider.Range class="absolute h-full rounded-pill bg-ink-muted" />
    </span>
    {#each thumbItems as { index } (index)}
      <Slider.Thumb
        aria-label={index === 0 ? words.clipStarts(name) : words.clipEnds(name)}
        aria-valuetext={words.ms(value[index] ?? 0)}
        class="pointer-hit touch-hit block h-space-4 w-space-1 cursor-ew-resize rounded-pill bg-ink-strong transition-control focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 can-hover:hover:scale-y-125"
        {index}
      />
    {/each}
  {/snippet}
</Slider.Root>
