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
   * before it, one row per thing that moves on the stage (motion
   * `tracksOf`), named as he sees it ("Form failure unfolds, 260 ms"), on a
   * timeline as Jitter and Rive draw theirs: the row's words in the first
   * column, its bar in the second, the ruler at the head of the second.
   *
   * One scale for all of it: the lane runs from the move's start to its
   * end (to the ruler's next 100 ms), and the ruler, every bar and the
   * playhead are placed on that one lane, each cell the same width with
   * the same inset, so a mark, a bar's end and the playhead at one time
   * stand on one line. The playhead is the ruler's handle (bits-ui's
   * Slider), a pill with its time; its hairline runs down the lane alone,
   * never across the words.
   *
   * Resting on a row, or focusing in it, rings the thing it names on the
   * stage (DesignGraph `lit`); nothing else on the stage changes. Each row's
   * bar drags its stretch (ClipBar); its editor (ClipEditor) opens beside
   * it. A tuned row says so, before and after. A state with no move says
   * so in one sentence.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { IconPause, IconPlay } from "#lib/icons.js";
  import ClipBar from "./ClipBar.svelte";
  import ClipEditor from "./ClipEditor.svelte";
  import { type Clip, lengthOf, retime, type Track, tracksOf } from "./motion";

  let {
    move,
    playhead,
    playing,
    still,
    coarse = false,
    onplay,
    onpause,
    onseek,
    onretime,
    onreset,
    onlight,
  }: {
    move: MoveState;
    /** The playhead, ms into the move. */
    playhead: number;
    playing: boolean;
    /** Reduced motion: Play draws the end state with a fade. */
    still: boolean;
    /** It stands in the phone's drawer, where a row's editor opens over the rows above it, never its own. */
    coarse?: boolean;
    onplay: (rate: number) => void;
    onpause: () => void;
    onseek: (t: number) => void;
    /** Clips he tuned, to put in the move. */
    onretime: (clips: Clip[]) => void;
    /** Clips put back as the engine ran them, by id. */
    onreset: (ids: string[]) => void;
    /** The thing a row names, rested on (null: none). */
    onlight: (thing: Element | null) => void;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  const tracks = $derived(tracksOf(clips));
  const length = $derived(Math.max(1, lengthOf(clips)));
  const STEP = 100;
  /** The lane's end: the move's end, to the ruler's next mark. */
  const scale = $derived(Math.max(STEP, Math.ceil(length / STEP) * STEP));
  const adHoc = $derived(clips.filter((clip) => clip.adHoc).length);
  /** The ruler's marks: every 100 ms. */
  const marks = $derived(
    Array.from({ length: Math.floor(scale / STEP) + 1 }, (_, at) => at * STEP)
  );
  /** A figure on every mark, every second past 400 ms, every fourth past 800. */
  const figureEvery = $derived(
    Math.max(1, 2 ** Math.ceil(Math.log2(scale / 400)))
  );
  /** A row as a person says it: one length when its stretches share one, else its whole stretch. */
  const nameOf = (track: Track) =>
    track.length === null
      ? words.clipSpan(track.name, track.how, track.begins, track.ends)
      : words.clipName(track.name, track.how, track.length);
  /** Before and after, when he tuned it. */
  const tunedOf = (track: Track) => {
    const [first] = track.clips;
    return first?.was
      ? words.tuned(words.ms(first.was.duration), words.ms(first.duration))
      : null;
  };
  const pct = (t: number) => `${(t / scale) * 100}%`;
  /**
   * The playhead as the ruler's handle holds it: on its 1 ms steps, since
   * bits-ui's Slider hands a snapped value back to `onValueChange`, and a
   * playing playhead a fraction off a step read as a scrub.
   */
  const handle = $derived(Math.round(Math.min(playhead, length)));
  /** Page Up and Page Down step the playhead a ruler's mark, as a slider's large step does (WAI-ARIA APG, Slider). */
  const pageKey = (event: KeyboardEvent) => {
    const by = { PageUp: STEP, PageDown: -STEP }[event.key];
    if (by !== undefined) {
      event.preventDefault();
      onseek(Math.max(0, Math.min(length, handle + by)));
    }
  };
  /** Rest and focus on a row light its thing; leaving lets it go. */
  const lights = (track: Track) => ({
    onpointerenter: () => onlight(track.thing),
    onpointerleave: () => onlight(null),
    onfocusin: () => onlight(track.thing),
    onfocusout: () => onlight(null),
  });
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
        <div class="flex items-center gap-space-1 coarse:gap-space-3">
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

      <!-- The timeline: one grid, every cell its own child placed on its
           row, so every lane cell is one column of one width; each lane
           insets its content by --space-5, half the playhead's pill, so the
           pill stands whole at 0 and at the end, and the ruler, the bars
           and the hairline share one box. -->
      <div
        data-slot="timeline"
        class="relative grid min-h-0 grid-cols-5 grid-rows-(--rows) gap-x-space-3 gap-y-space-2 overflow-y-auto"
        style:--rows="repeat({tracks.length + 1}, auto)"
      >
        <span
          class="col-span-2 col-start-1 row-start-1 self-start pt-space-1 text-end type-meta text-ink-muted"
          aria-hidden="true">{words.msUnit}</span
        >
        <div class="col-span-3 col-start-3 row-start-1 min-w-0 px-space-5">
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
              aria-valuetext={words.playhead(handle, Math.round(length))}
              class="pointer-hit touch-hit flex h-space-5 min-w-space-8 cursor-ew-resize items-center justify-center rounded-pill bg-ink-strong px-space-1 type-meta text-surface-raised shadow-xs num focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
              index={0}
              onkeydown={pageKey}
            >
              {handle}
            </Slider.Thumb>
          </Slider.Root>
          <div class="relative h-space-5" aria-hidden="true">
            {#each marks as mark, at (mark)}
              <span
                class={[
                  "absolute start-(--at) top-0 flex flex-col type-meta text-ink-muted num",
                  at === 0
                    ? "items-start"
                    : "-translate-x-1/2 items-center rtl:translate-x-1/2",
                ]}
                style:--at={pct(mark)}
              >
                <span class="h-space-1 w-px bg-border-control"></span>
                {#if at % figureEvery === 0}{mark}{/if}
              </span>
            {/each}
          </div>
        </div>

        {#each tracks as track, row (track.id)}
          {@const name = nameOf(track)}
          {@const tuned = tunedOf(track)}
          <!-- A row is one thing that moves, one comment target named by
               its first words, as a person says it. -->
          <div
            data-slot="clip"
            class="col-span-2 col-start-1 row-start-(--row) flex min-w-0 items-start gap-space-1"
            style:--row={row + 2}
            {...lights(track)}
          >
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="type-label text-ink-row wrap-anywhere num"
                >{name}</span
              >
              {#if tuned}
                <span class="type-meta text-selected-ink num wrap-anywhere"
                  >{tuned}</span
                >
              {/if}
            </div>
            <ClipEditor
              {coarse}
              {name}
              onreset={() => onreset(track.clips.map((clip) => clip.id))}
              {onretime}
              {track}
            />
          </div>
          <div
            class="col-span-3 col-start-3 row-start-(--row) min-w-0 self-center px-space-5"
            style:--row={row + 2}
            {...lights(track)}
          >
            <ClipBar
              {name}
              onretime={(from, to) => onretime(retime(track, from, to))}
              {scale}
              {track}
            />
          </div>
        {/each}

        <!-- The playhead's hairline, down the lane alone, under the ruler's
             handle to the last row. -->
        <div
          aria-hidden="true"
          class="pointer-events-none relative col-span-3 col-start-3 row-span-full row-start-1 px-space-5"
        >
          <div class="relative size-full">
            <span
              class="absolute top-c-btn-h-sm bottom-0 start-(--at) w-px -translate-x-1/2 bg-ink-strong rtl:translate-x-1/2"
              style:--at={pct(Math.min(playhead, length))}
            ></span>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
