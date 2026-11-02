<script lang="ts" module>
  /** Where the move into the kept state stands. */
  export type MoveState =
    | { kind: "none"; state: string }
    | { kind: "reading"; from: string; to: string }
    | { kind: "failed"; from: string; to: string; why: string }
    | { kind: "ready"; from: string; to: string; clips: Clip[] };
</script>

<script lang="ts">
  /**
   * The move (spec, The move): the move into the kept state from the state
   * before it, as its clips, on a timeline of two columns (Jitter's and
   * Rive's): each clip's name and facts in the first, its bar on the move's
   * scale in the second, the ruler over the bars. Its head names the move
   * and holds Play and Play at a quarter speed. The playhead is the ruler's
   * handle (bits-ui's Slider, one thumb), and its line runs down the bars'
   * column alone, so it never stands on a clip's words. Each bar is the
   * clip's timing and drags (ClipBar); its editor holds the rest. A tuned
   * clip says so on its row, before and after. A state with no move says
   * so in one sentence.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { IconPause, IconPlay } from "#lib/icons.js";
  import ClipBar from "./ClipBar.svelte";
  import ClipEditor from "./ClipEditor.svelte";
  import { type Clip, lengthOf, type Tuning } from "./motion";

  let {
    move,
    playhead,
    playing,
    still,
    onplay,
    onpause,
    onseek,
    ontune,
    onreset,
  }: {
    move: MoveState;
    /** The playhead, ms into the move. */
    playhead: number;
    playing: boolean;
    /** Reduced motion: Play draws the end state with a fade. */
    still: boolean;
    onplay: (rate: number) => void;
    onpause: () => void;
    onseek: (t: number) => void;
    ontune: (clip: string, tuning: Tuning) => void;
    onreset: (clip: string) => void;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  const length = $derived(Math.max(1, lengthOf(clips)));
  /** The move as the engine ran it, before any tuning. */
  const ran = $derived(
    lengthOf(clips.map((clip) => (clip.was ? { ...clip, ...clip.was } : clip)))
  );
  const STEP = 100;
  /** The scale: half again the move's longest length, to the next 100 ms, so a bar has room to grow. */
  const scale = $derived(
    Math.max(STEP, Math.ceil((Math.max(length, ran) * 1.5) / STEP) * STEP)
  );
  const adHoc = $derived(clips.filter((clip) => clip.adHoc).length);
  /** The ruler's marks: every 100 ms. */
  const marks = $derived(
    Array.from({ length: Math.floor(scale / STEP) + 1 }, (_, at) => at * STEP)
  );
  /** A figure on every mark, every second past 400 ms, every fourth past 800. */
  const figureEvery = $derived(
    Math.max(1, 2 ** Math.ceil(Math.log2(scale / 400)))
  );
  const facts = (clip: Clip) =>
    [
      clip.token?.replace("--dur-", ""),
      clip.framed ? null : clip.curve,
      clip.delay > 0 ? `${words.delay} ${words.ms(clip.delay)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const wasWords = (clip: Clip) =>
    clip.was
      ? words.tuned(words.ms(clip.was.duration), words.ms(clip.duration))
      : "";
  const nameOf = (clip: Clip) =>
    words.clipName(clip.element, clip.how, clip.duration);
  const pct = (t: number) => `${(t / scale) * 100}%`;
  /**
   * The playhead as the ruler's handle holds it: on the handle's 1 ms
   * steps. bits-ui's Slider snaps a value off its steps and hands the snap
   * to `onValueChange` (its root's `watch`), so a playing playhead, a
   * fraction of a millisecond off a step every frame, read as a scrub and
   * stopped the move after one frame.
   */
  const handle = $derived(Math.round(Math.min(playhead, length)));
  /**
   * Page Up and Page Down step the playhead a ruler's mark (100 ms), as a
   * slider's large step does (WAI-ARIA APG, Slider: "Page Up: increments
   * the value by an amount larger than the step"); bits-ui's Slider keys
   * the arrows, Home and End alone.
   */
  const pageKey = (event: KeyboardEvent) => {
    const by = { PageUp: STEP, PageDown: -STEP }[event.key];
    if (by !== undefined) {
      event.preventDefault();
      onseek(Math.max(0, Math.min(length, handle + by)));
    }
  };
</script>

<div data-slot="move" class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-3">
  {#if move.kind === "none"}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.noMove(move.state)}
    </p>
  {:else}
    <header
      class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
    >
      <h3 class="m-0 min-w-0 flex-1 type-label text-ink-strong">
        <span class="block truncate">{words.move(move.from, move.to)}</span>
      </h3>
      {#if move.kind === "ready"}
        <!-- mark-line: two buttons side by side, each a box of its own -->
        <div class="flex items-center gap-space-1">
          <button
            type="button"
            data-box
            aria-label={playing ? words.pause : words.play}
            title={playing ? words.pause : words.play}
            class="pointer-hit touch-hit grid size-c-btn-h-sm place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover"
            onclick={() => (playing ? onpause() : onplay(1))}
          >
            {#if playing}
              <IconPause aria-hidden="true" class="size-icon-md" />
            {:else}
              <IconPlay aria-hidden="true" class="size-icon-md" />
            {/if}
          </button>
          <button
            type="button"
            data-box
            aria-label={words.playQuarter}
            title={words.playQuarter}
            class="pointer-hit touch-hit h-c-btn-h-sm rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover num"
            disabled={still}
            onclick={() => onplay(0.25)}
          >
            ¼×
          </button>
        </div>
      {/if}
    </header>

    {#if move.kind === "reading"}
      <p class="m-0 type-meta text-ink-muted" role="status">{words.reading}</p>
    {:else if move.kind === "failed"}
      <p class="m-0 type-body text-status-fail-ink wrap-anywhere" role="alert">
        {words.moveFailed(move.why)}
      </p>
    {:else if clips.length === 0}
      <p class="m-0 type-body text-ink-muted text-pretty">
        {words.nothingAnimated(move.from, move.to)}
      </p>
    {:else}
      {#if adHoc > 0}
        <p class="m-0 type-meta text-status-attn-ink">{words.adHoc(adHoc)}</p>
      {/if}
      {#if still}
        <p class="m-0 type-meta text-ink-muted">{words.playStill}</p>
      {/if}

      <!-- The timeline: names and facts in the first column, the ruler
           and the bars in the second, the playhead's line down the second
           alone. Each row is placed on its own grid line, since the line
           spans them all. -->
      <div
        data-slot="timeline"
        class="grid min-h-0 grid-cols-5 grid-rows-(--rows) gap-x-space-3 gap-y-space-2 overflow-y-auto"
        style:--rows="repeat({clips.length + 1}, auto)"
      >
        <div
          class="col-span-5 col-start-1 row-start-1 grid grid-cols-subgrid items-start"
        >
          <span class="col-span-2 pt-space-1 type-meta text-ink-muted num">
            {words.playhead(Math.round(playhead), Math.round(length))}
          </span>
          <div class="col-span-3 min-w-0 px-space-2">
            <Slider.Root
              class="relative flex h-c-btn-h-sm w-full touch-none items-center select-none"
              max={scale}
              min={0}
              onValueChange={(next: number) => onseek(Math.min(next, length))}
              step={1}
              thumbPositioning="exact"
              type="single"
              value={handle}
            >
              <span class="h-px w-full bg-border-control"></span>
              <Slider.Thumb
                aria-label={words.scrub}
                aria-valuetext={words.playhead(
                  Math.round(playhead),
                  Math.round(length)
                )}
                class="pointer-hit touch-hit block size-space-3 cursor-ew-resize rounded-pill bg-ink-strong shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
                index={0}
                onkeydown={pageKey}
              />
            </Slider.Root>
            <div class="relative h-space-5" aria-hidden="true">
              {#each marks as mark, at (mark)}
                <span
                  class="absolute start-(--at) top-0 flex -translate-x-1/2 flex-col items-center type-meta text-ink-muted num"
                  style:--at={pct(mark)}
                >
                  <span class="h-space-1 w-px bg-border-control"></span>
                  {#if at % figureEvery === 0}{mark}{/if}
                </span>
              {/each}
            </div>
          </div>
        </div>

        {#each clips as clip, row (clip.id)}
          <!-- The row is the clip, one comment target named by its first
               words, as a person says it ("Form failure unfolds, 260 ms").
               A box, never a fieldset: a fieldset is its own formatting
               context, so its `subgrid` fell back to columns of its own and
               its bar left the ruler's scale. -->
          <div
            data-slot="clip"
            class="col-span-5 col-start-1 row-start-(--row) grid min-w-0 grid-cols-subgrid items-center"
            style:--row={row + 2}
          >
            <div class="col-span-2 flex min-w-0 items-start gap-space-1">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="type-label text-ink-row wrap-anywhere num"
                  >{nameOf(clip)}</span
                >
                <span class="type-meta text-ink-muted num wrap-anywhere"
                  >{facts(clip)}{#if clip.was}<span class="text-selected-ink">
                      · {wasWords(clip)}</span
                    >{/if}</span
                >
              </div>
              <ClipEditor
                {clip}
                onreset={() => onreset(clip.id)}
                ontune={(tuning) => ontune(clip.id, tuning)}
              />
            </div>
            <div class="col-span-3 min-w-0 px-space-2">
              <ClipBar
                {clip}
                name={nameOf(clip)}
                ontune={(tuning) => ontune(clip.id, tuning)}
                {scale}
              />
            </div>
          </div>
        {/each}

        <!-- The playhead's line, down the bars' column alone. -->
        <div
          aria-hidden="true"
          class="pointer-events-none relative col-span-3 col-start-3 row-span-full row-start-1"
        >
          <div class="absolute inset-y-0 inset-x-space-2">
            <span
              class="absolute inset-y-0 start-(--at) w-px bg-ink-strong"
              style:--at={pct(Math.min(playhead, length))}
            ></span>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
