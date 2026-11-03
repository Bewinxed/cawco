<script lang="ts">
  /**
   * A row's bar on the move's one scale (MoveFace: the ruler, every bar and
   * the playhead share it), and its timing's handles (bits-ui's Slider, two
   * thumbs): the start handle is when the thing begins to move, the end
   * handle when it comes to rest. Round 29's bar: a plain rounded bar in
   * its kind's wash with its kind's edge (the `c-clip-*` tokens), the lane
   * bare round it; a thing that moves twice shows both stretches. Its two
   * handles are thin marks inside its ends, shown while the pointer rests
   * on the lane, a handle has the focus, or a drag holds it; under a
   * finger each still takes a 44px area. The moment the move set it off
   * stands as a tick on the lane: no handle passes it. While he has tuned
   * it, its timing as the engine ran it stands as a dashed outline under
   * the bar.
   *
   * A drag snaps the row's length to the duration ladder (motion
   * `snapLength`), as the owner decided ("Snap, and ⌥ frees it"); with ⌥
   * held it moves on 10 ms steps, off the ladder. A drag on the bar's body
   * moves the whole stretch and keeps its length (DialKit's clip move).
   * Letting go moves and stretches the row's clips together (motion
   * `retime`), and the move plays once on the stage. The arrow keys move a
   * handle by 10 ms.
   *
   * Under a finger each handle's 44px area stops at the midpoint between
   * the two (DESIGN.md, The 44 Touch Rule: `--hit-gap-x`), so a finger on
   * the start never takes the end.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { figureOf } from "./figures";
  import { type ClipKind, snapLength, type Track } from "./motion";

  let {
    track,
    name,
    scale,
    original = null,
    disabled = false,
    onretime,
    onhold,
    lang,
  }: {
    track: Track;
    /** The row as a person says it, for each handle's name. */
    name: string;
    /** The scale's end, ms: the ruler's. */
    scale: number;
    /** Its stretches as the engine ran them, while he has tuned it: drawn as an outline. */
    original?: Track["spans"] | null;
    /** Shown as the engine ran it (Original): nothing to drag. */
    disabled?: boolean;
    /** The row's new stretch, ms into the move. */
    onretime: (from: number, to: number) => void;
    /** The stretch a drag holds, as it moves (null: let go), so the row's words follow it. */
    onhold: (span: { from: number; to: number } | null) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const STEP = 10;
  const onStep = (ms: number) => Math.round(ms / STEP) * STEP;
  /** The earliest step it may begin on: never before the moment the move set it off. */
  const floor = $derived(Math.ceil(track.setOff / STEP) * STEP);
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
   * inside the lane.
   */
  const rest = $derived(within([onStep(track.begins), onStep(track.ends)]));
  let held = $state<number[] | null>(null);
  const value = $derived(held ?? rest);
  const pct = (t: number) => `${(t / scale) * 100}%`;
  /** ⌥ is down: a drag moves on the 10 ms steps, off the ladder. */
  let free = $state(false);

  /**
   * A handle's drag as the ladder takes it: the handle that moved sets the
   * row's length to the ladder's nearest, the other stays; with ⌥, as held.
   */
  const snapped = (next: number[]): number[] => {
    const [from = floor, to = floor] = next;
    if (free) {
      return within(next);
    }
    const [wasFrom = floor] = value;
    const length = snapLength(to - from);
    return from === wasFrom
      ? within([from, from + length])
      : within([Math.max(floor, to - length), to]);
  };
  const hold = (next: number[]) => {
    held = next;
    const [from = floor, to = floor] = next;
    onhold({ from, to });
  };
  const commit = (next: number[]) => {
    const [from = floor, to = floor] = next;
    held = null;
    onhold(null);
    if (from === rest[0] && to === rest[1]) {
      return;
    }
    // An end left where it rests keeps its own time, the drag's length
    // kept: the rest stands on the slider's steps, and a start 4 ms off a
    // step moved onto it when only the end was dragged.
    let shift = 0;
    if (from === rest[0]) {
      shift = track.begins - from;
    } else if (to === rest[1]) {
      shift = track.ends - to;
    }
    onretime(from + shift, to + shift);
  };

  /** The bar's width, px: how far apart the two handles stand on screen, and what a body drag's pixels are in ms. */
  let wide = $state(0);
  /** The handle's drawn width, px (`w-space-1`): each stands that far inside its end. */
  const HANDLE = 4;
  const apart = $derived(
    Math.max(
      0,
      (((value[1] ?? 0) - (value[0] ?? 0)) / scale) * wide - 2 * HANDLE
    )
  );

  /** A drag on the bar's body: where it was taken, and the stretch it moves. */
  let moving: { at: number; from: number; to: number } | null = null;
  const takeBody = (event: PointerEvent) => {
    if (disabled || wide === 0) {
      return;
    }
    // The slider's own press would jump the nearer handle here.
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const [from = floor, to = floor] = value;
    moving = { at: event.clientX, from, to };
  };
  const moveBody = (event: PointerEvent) => {
    if (!moving) {
      return;
    }
    const length = moving.to - moving.from;
    const by = onStep(((event.clientX - moving.at) / wide) * scale);
    const from = Math.max(floor, Math.min(scale - length, moving.from + by));
    hold([from, from + length]);
  };
  const letBody = () => {
    if (moving) {
      moving = null;
      commit(held ?? rest);
    }
  };

  /** Each kind's bar: its wash and its edge, as whole classes. */
  const BAR: Record<ClipKind, string> = {
    size: "bg-c-clip-size-wash border-c-clip-size",
    move: "bg-c-clip-move-wash border-c-clip-move",
    fade: "bg-c-clip-fade-wash border-c-clip-fade",
    tint: "bg-c-clip-tint-wash border-c-clip-tint",
    effect: "bg-c-clip-effect-wash border-c-clip-effect",
    other: "bg-c-clip-other-wash border-c-clip-other",
  };
  /** Each kind's handle mark. */
  const MARK: Record<ClipKind, string> = {
    size: "bg-c-clip-size",
    move: "bg-c-clip-move",
    fade: "bg-c-clip-fade",
    tint: "bg-c-clip-tint",
    effect: "bg-c-clip-effect",
    other: "bg-c-clip-other",
  };
</script>

<Slider.Root
  class="group/bar relative flex h-c-pill-h w-full touch-none items-center select-none"
  {disabled}
  max={scale}
  min={0}
  onpointerdown={(event: PointerEvent) => {
    free = event.altKey;
  }}
  onpointermove={(event: PointerEvent) => {
    free = event.altKey;
  }}
  onValueChange={(next: number[]) => hold(snapped(next))}
  onValueCommit={(next: number[]) => commit(snapped(next))}
  step={STEP}
  thumbPositioning="exact"
  type="multiple"
  {value}
>
  {#snippet children({ thumbItems })}
    <span
      class="relative h-full w-full grow"
      {@attach frameSize((node: HTMLElement) => {
        wide = node.clientWidth;
      })}
    >
      {#if original}
        <!-- Its timing as the engine ran it, under the tuned bar. -->
        {#each original as span, at (at)}
          <span
            aria-hidden="true"
            class="absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border border-dashed border-ink-muted"
            style:--from={pct(span.from)}
            style:--wide={pct(span.to - span.from)}
          ></span>
        {/each}
      {/if}
      {#if held || track.spans.length === 1}
        <Slider.Range
          class={[
            "absolute inset-y-0 rounded-xs border",
            disabled ? "cursor-default" : "cursor-grab",
            BAR[track.kind],
          ]}
          onpointercancel={letBody}
          onpointerdown={takeBody}
          onpointermove={moveBody}
          onpointerup={letBody}
          title={disabled ? undefined : words.moveClip(name)}
        />
      {:else}
        <!-- Its stretches of motion, each where it runs. -->
        {#each track.spans as span, at (at)}
          <span
            class={[
              "absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border",
              BAR[track.kind],
            ]}
            style:--from={pct(span.from)}
            style:--wide={pct(span.to - span.from)}
          ></span>
        {/each}
      {/if}
    </span>
    <!-- The moment the move set it off: no handle passes it. -->
    <span
      aria-label={words.triggeredAt(figureOf(Math.round(track.setOff), lang))}
      class="absolute inset-y-space-1 start-(--at) w-px bg-border-control"
      role="img"
      style:--at={pct(track.setOff)}
      title={words.triggeredAt(figureOf(Math.round(track.setOff), lang))}
    ></span>
    {#each thumbItems as { index } (index)}
      <!-- A thin mark inside the bar's end, shown on rest, focus and drag. -->
      <Slider.Thumb
        aria-label={index === 0 ? words.clipStarts(name) : words.clipEnds(name)}
        aria-valuetext={words.ms(figureOf(value[index] ?? 0, lang))}
        class={[
          "pointer-hit touch-hit block h-space-3 w-space-1 cursor-ew-resize rounded-pill transition-opacity duration-(--dur-control) ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2",
          held
            ? "opacity-100"
            : "opacity-0 focus-visible:opacity-100 can-hover:group-hover/bar:opacity-100",
          // Inside its end: the slider places the thumb by its own `translate`.
          index === 0 ? "ms-space-1" : "-ms-space-1",
          disabled && "hidden",
          MARK[track.kind],
        ]}
        style="--hit-gap-x: {apart}px"
        {index}
      />
    {/each}
  {/snippet}
</Slider.Root>
