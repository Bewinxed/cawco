<script lang="ts" module>
  /** Where the move into the kept state stands. */
  export type MoveState =
    | { kind: "none"; state: string }
    | { kind: "reading"; from: string; to: string }
    | { kind: "failed"; from: string; to: string; why: string }
    | { kind: "ready"; from: string; to: string; clips: Clip[] };

  /** The animation as the engine ran it, or as he changed it. */
  export type Timings = "original" | "edited";
</script>

<script lang="ts">
  /**
   * The animation into the kept state (spec, The move), as an improved port
   * of interface-craft's DialKit timeline (the owner's October decision;
   * the advisor's map, timeline.md §4) on the house's controls: one row per
   * thing that moves on the stage (motion `tracksOf`), named as he sees it
   * ("Form failure unfolds, 260 ms"), the row's words in the first column,
   * its bar in the second, the ruler at the head of the second.
   *
   * One scale for all of it: the lane runs from the move's start to its
   * end (to the ruler's next 100 ms), and the ruler, every bar and the
   * playhead are placed on that one lane, each cell the same width with
   * the same inset, so a mark, a bar's end and the playhead at one time
   * stand on one line. The ruler's figures thin to the lane's width. The
   * playhead is the ruler's handle (bits-ui's Slider), a pill with its
   * time; its hairline runs down the lane alone. A scrub during play pauses
   * it and plays on from where it is let go (DialKit's rule).
   *
   * Each row carries its duration chip: the figure and the design system's
   * name when its length is on the ladder, dashed when it is off it; a
   * spring's figure is `~`, its true end where it settles. A row whose
   * thing moves more than once opens into one row per animation, each
   * retimed alone (DialKit's composite bar). A row's controls open in the
   * row, under its bar (the owner's pick). Once he has changed one, the
   * head's Original | Edited switch plays the animation as read or as
   * changed; under Edited the original bars stand as outlines.
   *
   * Resting on a row, or focusing in it, rings the thing it names on the
   * stage (DesignGraph `lit`); nothing else on the stage changes.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChevronDown,
    IconPause,
    IconPlay,
    IconTuning,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import ClipBar from "./ClipBar.svelte";
  import ClipEditor from "./ClipEditor.svelte";
  import {
    type Clip,
    lengthOf,
    retime,
    type Track,
    tracksOf,
    untune,
  } from "./motion";

  let {
    move,
    playhead,
    playing,
    still,
    timings,
    ontimings,
    onplay,
    onpause,
    onseek,
    onseekend,
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
    /** Which timing the rows show and the move plays. */
    timings: Timings;
    ontimings: (next: Timings) => void;
    onplay: (rate: number) => void;
    onpause: () => void;
    onseek: (t: number) => void;
    /** The scrub let go: a move paused by it plays on. */
    onseekend: () => void;
    /** Clips he tuned, to put in the move. */
    onretime: (clips: Clip[]) => void;
    /** Clips put back as the engine ran them, by id. */
    onreset: (ids: string[]) => void;
    /** The thing a row names, rested on (null: none). */
    onlight: (thing: Element | null) => void;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  const changed = $derived(clips.some((clip) => clip.was));
  const original = $derived(timings === "original" && changed);
  const shown = $derived(original ? clips.map(untune) : clips);
  const tracks = $derived(tracksOf(shown));
  /** Each thing's stretches as the engine ran them, by the thing: the outlines under Edited. */
  const read = $derived(
    new Map(
      tracksOf(clips.map(untune)).map((track) => [
        track.thing ?? track.id,
        track.spans,
      ])
    )
  );
  const length = $derived(Math.max(1, lengthOf(shown)));
  const STEP = 100;
  /** The lane's end: the move's end, to the ruler's next mark. */
  const scale = $derived(Math.max(STEP, Math.ceil(length / STEP) * STEP));
  const adHoc = $derived(shown.filter((clip) => clip.adHoc).length);
  /** The ruler's marks: every 100 ms. */
  const marks = $derived(
    Array.from({ length: Math.floor(scale / STEP) + 1 }, (_, at) => at * STEP)
  );
  /** The lane's width, px: the ruler's figures thin to it. */
  let lane = $state(0);
  /** A figure on every mark that stands a figure's room past the last: every mark, every second, every fourth… */
  const figureEvery = $derived.by(() => {
    const apart = lane > 0 ? (lane * STEP) / scale : 0;
    const room = browser ? numberOf("--space-8") : 0;
    return apart <= 0
      ? 1
      : Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, room / apart))));
  });
  /**
   * The stretch a bar's drag holds, by its row: the row's words follow the
   * drag, as Jitter's Duration follows its bar's end handle.
   */
  let holding = $state<{ from: number; id: string; to: number } | null>(null);
  /** A row as a person says it: one length when its stretches share one, else its whole stretch; while its bar is held, the held one. */
  const nameOf = (track: Track) => {
    const held = holding?.id === track.id ? holding : null;
    if (held) {
      return track.spans.length === 1
        ? words.clipName(track.name, track.how, held.to - held.from)
        : words.clipSpan(track.name, track.how, held.from, held.to);
    }
    return track.length === null
      ? words.clipSpan(track.name, track.how, track.begins, track.ends)
      : words.clipName(track.name, track.how, track.length);
  };
  /** Before and after, when he changed it. */
  const tunedOf = (track: Track) => {
    const [first] = track.clips;
    return first?.was
      ? words.tuned(words.ms(first.was.duration), words.ms(first.duration))
      : null;
  };
  /** The row's duration chip: its figure, and the design system's name when it is one; a spring's figure is where it settles. */
  const chipOf = (track: Track) => {
    const [first] = track.clips;
    const held = holding?.id === track.id ? holding : null;
    const ms = Math.round(
      held ? held.to - held.from : (track.length ?? track.ends - track.begins)
    );
    if (track.sprung) {
      return {
        text: words.springFigure(ms),
        said: words.springSettles(ms),
        free: false,
      };
    }
    const token =
      !held && track.length !== null && first?.token
        ? first.token.replace("--dur-", "")
        : null;
    return token
      ? {
          text: words.durationChip(ms, token),
          said: words.durationOf(ms, token),
          free: false,
        }
      : { text: words.ms(ms), said: words.freeOf(ms), free: true };
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

  /** The rows opened into one row per animation, by row. */
  let opened = $state<Record<string, boolean>>({});
  /** The line whose controls stand open under its bar. */
  let editing = $state<string | null>(null);
  /** The timeline's lines, in order: each row, and under an opened one a row per animation. */
  const lines = $derived(
    tracks.flatMap((track) => {
      const own = { key: track.id, track, part: false };
      if (!(opened[track.id] && track.clips.length > 1)) {
        return [own];
      }
      return [
        own,
        ...track.clips.flatMap((clip) =>
          tracksOf([clip]).map((part) => ({
            key: `${track.id}/${clip.id}`,
            track: part,
            part: true,
          }))
        ),
      ];
    })
  );
  /** Each line's grid row; an open editor takes the row under its line. */
  const placed = $derived.by(() => {
    let row = 2;
    return lines.map((line) => {
      const at = row;
      row += editing === line.key ? 2 : 1;
      return { ...line, row: at };
    });
  });
  const rows = $derived(
    1 + lines.length + (lines.some((line) => line.key === editing) ? 1 : 0)
  );
  const toggle =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong";
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
      {#if move.kind === "ready" && changed}
        <Tabs
          onValueChange={(next) =>
            ontimings(next === "original" ? "original" : "edited")}
          size="compact"
          value={timings}
        >
          <TabsList aria-label={words.timings}>
            <TabItem label={words.original} value="original" />
            <TabItem label={words.edited} value="edited" />
          </TabsList>
        </Tabs>
      {/if}
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

      <!-- The timeline: one grid, every cell its own child placed on its
           row, so every lane cell is one column of one width; each lane
           insets its content by --space-5, half the playhead's pill, so the
           pill stands whole at 0 and at the end, and the ruler, the bars
           and the hairline share one box. A row's controls take a row of
           their own under it, across both columns. -->
      <div
        data-slot="timeline"
        class="relative grid min-h-0 grid-cols-5 grid-rows-(--rows) gap-x-space-3 gap-y-space-2 overflow-y-auto"
        style:--rows="repeat({rows}, auto)"
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
            onValueCommit={onseekend}
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
          <div
            class="relative h-space-5"
            aria-hidden="true"
            {@attach frameSize((node: HTMLElement) => {
              lane = node.clientWidth;
            })}
          >
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

        {#each placed as line (line.key)}
          {@const track = line.track}
          {@const name = nameOf(track)}
          {@const tuned = tunedOf(track)}
          {@const chip = chipOf(track)}
          {@const many = !line.part && track.clips.length > 1}
          <!-- A row is one thing that moves, one comment target named by
               its first words, as a person says it. -->
          <div
            data-slot="clip"
            class={[
              "col-span-2 col-start-1 row-start-(--row) flex min-w-0 items-start gap-space-1",
              line.part && "ps-space-4",
            ]}
            style:--row={line.row}
            {...lights(track)}
          >
            <div class="flex min-w-0 flex-1 flex-col gap-space-row">
              <span class="type-label text-ink-row wrap-anywhere num"
                >{name}</span
              >
              <span
                aria-label={chip.said}
                class={[
                  "self-start rounded-xs border px-space-1 type-meta text-ink-muted num",
                  chip.free
                    ? "border-dashed border-ink-muted"
                    : "border-border-control",
                ]}
                role="img"
                title={chip.said}>{chip.text}</span
              >
              {#if tuned && !original}
                <span class="type-meta text-selected-ink num wrap-anywhere"
                  >{tuned}</span
                >
              {/if}
            </div>
            {#if many}
              {@const said = opened[track.id]
                ? words.hideClips(track.clips.length)
                : words.showClips(track.clips.length)}
              <button
                type="button"
                aria-expanded={opened[track.id] ?? false}
                aria-label={said}
                class={toggle}
                onclick={() => {
                  opened = { ...opened, [track.id]: !opened[track.id] };
                }}
                title={said}
              >
                <IconChevronDown
                  aria-hidden="true"
                  class={[
                    "size-icon-md transition-transform duration-(--dur-control) ease-out",
                    opened[track.id] && "rotate-180",
                  ]}
                />
              </button>
            {/if}
            <button
              type="button"
              aria-expanded={editing === line.key}
              aria-label={words.edit(name)}
              class={[
                toggle,
                editing === line.key && "bg-selected-bg text-selected-ink",
              ]}
              disabled={original}
              onclick={() => {
                editing = editing === line.key ? null : line.key;
              }}
              title={words.edit(name)}
            >
              <IconTuning aria-hidden="true" class="size-icon-md" />
            </button>
          </div>
          <div
            class="col-span-3 col-start-3 row-start-(--row) min-w-0 self-center px-space-5"
            style:--row={line.row}
            {...lights(track)}
          >
            <ClipBar
              disabled={original}
              {name}
              onhold={(span) => {
                holding = span ? { id: track.id, ...span } : null;
              }}
              onretime={(from, to) => onretime(retime(track, from, to))}
              original={!original && track.clips.some((clip) => clip.was)
                ? (read.get(track.thing ?? track.id) ?? null)
                : null}
              {scale}
              {track}
            />
          </div>
          {#if editing === line.key && !original}
            <div
              class="col-span-5 col-start-1 row-start-(--row) min-w-0"
              style:--row={line.row + 1}
              in:unfold
              out:unfold
            >
              <ClipEditor
                {name}
                onreset={() => onreset(track.clips.map((clip) => clip.id))}
                {onretime}
                {track}
              />
            </div>
          {/if}
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
