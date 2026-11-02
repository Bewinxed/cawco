<script lang="ts">
  /**
   * A row's bar on the move's one scale (MoveFace: the ruler, every bar and
   * the playhead share it), and its timing's handles (bits-ui's Slider, two
   * thumbs): the start handle is when the thing begins to move (never
   * before the moment the move set it off), the end handle when it comes to
   * rest. Its stretches of motion are drawn on the bar; a thing that moves
   * twice shows both. A drag draws the bar where it is held; letting go
   * moves and stretches the row's clips together (motion `retime`), and the
   * move plays on the stage at once. The arrow keys move a handle by 10 ms.
   *
   * Under a finger each handle's 44px area stops at the midpoint between
   * the two (DESIGN.md, The 44 Touch Rule: `--hit-gap-x`), so a finger on
   * the start never takes the end.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import type { Track } from "./motion";

  let {
    track,
    name,
    scale,
    onretime,
    onhold,
  }: {
    track: Track;
    /** The row as a person says it, for each handle's name. */
    name: string;
    /** The scale's end, ms: the ruler's. */
    scale: number;
    /** The row's new stretch, ms into the move. */
    onretime: (from: number, to: number) => void;
    /** The stretch a drag holds, as it moves (null: let go), so the row's words follow it. */
    onhold: (span: { from: number; to: number } | null) => void;
  } = $props();

  const STEP = 10;
  const onStep = (ms: number) => Math.round(ms / STEP) * STEP;
  /** The earliest step it may begin on: never before the moment the move set it off. */
  const floor = $derived(
    Math.ceil(Math.min(...track.clips.map((clip) => clip.start)) / STEP) * STEP
  );
  /**
   * Every value the handles take, at rest or held: on the steps, from the
   * floor, never shorter than one step, and inside the lane (0 to `scale`,
   * the ruler's end, which is the slider's max). The start gives way first
   * at the lane's end, so the end never passes the max.
   */
  const within = ([from = floor, to = floor]: number[]): number[] => {
    const begins = Math.min(scale - STEP, Math.max(floor, from));
    return [begins, Math.min(scale, Math.max(begins + STEP, to))];
  };
  /**
   * The handles at rest, on the slider's steps (bits-ui's Slider snaps a
   * value off its steps and hands the snap back to `onValueChange`, which
   * held off-step values looped on: `effect_update_depth_exceeded`), and
   * inside the lane: a row beginning within half a step of the lane's end
   * rounded its start onto the max and set its end a step past it.
   */
  const rest = $derived(within([onStep(track.begins), onStep(track.ends)]));
  let held = $state<number[] | null>(null);
  const value = $derived(held ?? rest);
  const pct = (t: number) => `${(t / scale) * 100}%`;

  /** The bar's width, px: how far apart the two handles stand on screen. */
  let wide = $state(0);
  /** The handle's drawn width, px (`w-space-1`). */
  const HANDLE = 4;
  const apart = $derived(
    Math.max(0, (((value[1] ?? 0) - (value[0] ?? 0)) / scale) * wide - HANDLE)
  );
</script>

<Slider.Root
  class="relative flex h-c-btn-h-sm w-full touch-none items-center select-none"
  max={scale}
  min={0}
  onValueChange={(next: number[]) => {
    held = within(next);
    const [from = floor, to = floor] = held;
    onhold({ from, to });
  }}
  onValueCommit={(next: number[]) => {
    const [from = floor, to = floor] = within(next);
    held = null;
    onhold(null);
    if (from !== rest[0] || to !== rest[1]) {
      onretime(from, to);
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
      {@attach frameSize((node: HTMLElement) => {
        wide = node.clientWidth;
      })}
    >
      {#if held || track.spans.length === 1}
        <Slider.Range class="absolute h-full rounded-pill bg-ink-muted" />
      {:else}
        <!-- Its stretches of motion, each where it runs. -->
        {#each track.spans as span, at (at)}
          <span
            class="absolute inset-y-0 start-(--from) w-(--wide) rounded-pill bg-ink-muted"
            style:--from={pct(span.from)}
            style:--wide={pct(span.to - span.from)}
          ></span>
        {/each}
      {/if}
    </span>
    {#each thumbItems as { index } (index)}
      <Slider.Thumb
        aria-label={index === 0 ? words.clipStarts(name) : words.clipEnds(name)}
        aria-valuetext={words.ms(value[index] ?? 0)}
        class="pointer-hit touch-hit block h-space-4 w-space-1 cursor-ew-resize rounded-pill bg-ink-strong transition-control focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 can-hover:hover:scale-y-125"
        style="--hit-gap-x: {apart}px"
        {index}
      />
    {/each}
  {/snippet}
</Slider.Root>
