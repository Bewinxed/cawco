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
   * The animation into the kept state (spec, The move): a timeline a person
   * reads at a glance and works with his hands, laid out as the motion
   * tools lay one out (Motion Studio, Jitter; the run record of 4 November
   * names what came from each).
   *
   * One row per thing that moves on the stage (motion `tracksOf`), every
   * row one line of one height, a hairline (`border-hairline`) between
   * them, read down three fixed columns: what moves and how ("Form failure"
   * in the row's ink, "unfolds" muted), cut to its column with the whole in
   * its tooltip; its length, a tabular figure ending on one edge; its bar,
   * in its kind's hue (the `c-clip-*` tokens), on the lane. The words are a
   * press that opens the row's editor under it (the owner's pick), its
   * words then in selected ink. A length he changed is marked on itself
   * (coral, a dashed edge); pressing it puts that value back (motion
   * `restore`), as the editor's own changed values do (the owner's pin 26).
   *
   * One scale for all of it: the lane runs from the move's start (the
   * moment it first set anything off) to the ruler's next mark past its
   * end; the time past the end is shaded. The ruler, every bar, the
   * gridlines and the playhead are placed by one rule, `t / scale` of the
   * lane's width, each lane its own box with one inset, and each mark's
   * tick, its figure and the playhead's line are centred on their time.
   * The gridlines, the shade and the playhead are drawn in each row's lane,
   * so they run down the rows and stop at an opened editor. The ruler is
   * the playhead's slider (bits-ui's Slider): a press on it scrubs, its
   * handle the playhead's own line through the ruler. The ruler's marks
   * stand every 100 ms, or every step of 1, 2 and 5 past it that keeps
   * them `--space-2` apart, so a move of minutes draws as few marks as one
   * of a second; its figures thin to the lane's width.
   *
   * The head holds the move's name and, once he changed anything, Reset
   * (every value back, Motion Studio's discard). Play and the time stand
   * at the ruler's leading corner, where the motion tools put them. A
   * timing off the design system's tokens is the agent's note, carried in
   * the `tuned` record (motion `TunedRecord.offTokens`), not a line here.
   *
   * A spring's figure is `~`, its true end where it settles. A row whose
   * thing moves more than once opens into one row per animation, each
   * retimed alone. Resting on a row, or focusing in it, rings the thing it
   * names on the stage (DesignGraph `lit`); nothing else on the stage
   * changes.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown, IconPause, IconPlay } from "#lib/icons.js";
  import { browser } from "$app/env";
  import ClipBar from "./ClipBar.svelte";
  import ClipEditor from "./ClipEditor.svelte";
  import { figureOf, inkWidth } from "./figures";
  import {
    type Clip,
    editsOf,
    lengthOf,
    restore,
    retime,
    type Track,
    tracksOf,
    untune,
  } from "./motion";

  let {
    move,
    playhead,
    playing,
    onplay,
    onpause,
    onseek,
    onseekend,
    onretime,
    onreset,
    onlight,
    onretry,
    lang,
  }: {
    move: MoveState;
    /** The playhead, ms into the move. */
    playhead: number;
    playing: boolean;
    onplay: () => void;
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
    /** A move whose play threw, played again from its from state. */
    onretry: () => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  const changed = $derived(clips.some((clip) => clip.was));
  const tracks = $derived(tracksOf(clips));
  /** Each thing's stretches as the engine ran them, by the thing: the outlines under a tuned bar. */
  const read = $derived(
    new Map(
      tracksOf(clips.map(untune)).map((track) => [
        track.thing ?? track.id,
        track.spans,
      ])
    )
  );
  const length = $derived(Math.max(1, lengthOf(clips)));
  /**
   * How far the lane reaches: the move's end, or, once he changed it, the
   * later of its end and the end as the engine ran it, so the original's
   * outlines stand inside the lane when he shortened it.
   */
  const reach = $derived(
    changed ? Math.max(length, lengthOf(clips.map(untune))) : length
  );
  /** The ruler's finest mark, ms. */
  const FINEST = 100;
  /** The marks a ruler draws before its lane is measured, at most. */
  const MARKS_UNMEASURED = 50;
  /** The lane's width, px: the ruler's marks and figures thin to it. */
  let lane = $state(0);
  /** The ruler's lane, in its figures' type. */
  let ruler = $state<HTMLElement | null>(null);
  /**
   * The ruler's step: 100 ms, else the least of 200, 500, 1000, 2000,
   * 5000… whose marks stand `--space-2` apart on the lane. A mark every
   * 100 ms drew 18,000 of them for a move of 30 minutes.
   */
  const step = $derived.by(() => {
    const apart = browser ? numberOf("--space-2") : 1;
    const most = Math.max(
      1,
      lane > 0 ? Math.floor(lane / apart) : MARKS_UNMEASURED
    );
    const ladder = [1, 2, 5].map((one) => one * FINEST);
    let at = 0;
    let found = FINEST;
    // Up the ladder until the marks fit; a length no figure holds (never
    // read: an endless animation is its state's own, never a clip) stops
    // at the finest.
    while (Number.isFinite(reach) && Math.ceil(reach / found) > most) {
      at += 1;
      found = (ladder[at % 3] as number) * 10 ** Math.floor(at / 3);
    }
    return found;
  });
  /** The lane's end: the ruler's next mark past the move's reach, so no bar runs past it. */
  const scale = $derived(Math.max(step, Math.ceil(reach / step) * step));
  /** The ruler's marks, a step apart. */
  const marks = $derived(
    Array.from({ length: Math.floor(scale / step) + 1 }, (_, at) => at * step)
  );
  /** The lane's inset, px (`px-space-2`): a figure centred on an end mark may reach into it, no further. */
  const INSET = browser ? numberOf("--space-2") : 0;
  /** `--space-3`: the least room between two figures. */
  const FIGURE_GAP = browser ? numberOf("--space-3") : 0;
  const FOUR_FIGURES = browser ? numberOf("--space-8") : 0;
  /** The widest figure as it draws in the ruler's type: the lane's end. */
  const widest = $derived(
    ruler ? inkWidth(figureOf(scale, lang), ruler) : FOUR_FIGURES
  );
  /** A figure on every mark, every second, every fourth… so each centred figure stands `--space-3` clear of the next. */
  const figureEvery = $derived.by(() => {
    const apart = lane > 0 ? (lane * step) / scale : 0;
    return apart <= 0
      ? 1
      : Math.max(
          1,
          2 ** Math.ceil(Math.log2(Math.max(1, (widest + FIGURE_GAP) / apart)))
        );
  });
  /** The marks that carry a figure: thinned, and the lane's end only when its figure, centred, stays inside the inset. */
  const figured = $derived(
    new Set(
      marks.filter(
        (mark, at) =>
          at % figureEvery === 0 &&
          (at < marks.length - 1 ||
            !ruler ||
            inkWidth(figure(mark), ruler) / 2 <= INSET)
      )
    )
  );
  /**
   * The stretch a bar's drag holds, by its row: the row's words follow the
   * drag, as Jitter's Duration follows its bar's end handle.
   */
  let holding = $state<{ from: number; id: string; to: number } | null>(null);
  /** `n` as a figure in the page's language. */
  const figure = (n: number) => figureOf(n, lang);

  /** A row as a person says it: what moves and how; its timing is in its chips. */
  const nameOf = (track: Track) => words.clipName(track.name, track.how);

  /** A row's length as its column shows it: its figure (a spring's where it settles), and once he changed it, the press that puts it back. */
  const lengthShown = (track: Track) => {
    const held = holding?.id === track.id ? holding : null;
    // A row whose animations share one length says that length, as its
    // editor's Duration does; else its whole span.
    const shared = new Set(track.clips.map((clip) => clip.duration));
    const one = track.sprung || shared.size !== 1 ? null : [...shared][0];
    const span = track.ends - track.begins;
    // A drag on an end stretches every animation by its share (motion `retime`).
    const stretch = held ? (held.to - held.from) / Math.max(1, span) : 1;
    const ms = Math.round((one ?? span) * stretch);
    const was = editsOf(track).has("length")
      ? (track.clips.find((clip) => clip.was)?.was ?? null)
      : null;
    return {
      text: track.sprung
        ? words.springFigure(figure(ms))
        : words.ms(figure(ms)),
      said: track.sprung ? words.springSettles(figure(ms)) : null,
      reset: was ? words.resetLength(figure(Math.round(was.duration))) : null,
    };
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
    const by = { PageUp: step, PageDown: -step }[event.key];
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
  const toggle =
    "pointer-hit touch-hit grid size-c-btn-h-xs flex-none place-items-center rounded-sm text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong";
</script>

{#snippet transport()}
  <!-- Play and the time, at the ruler's leading corner (Motion Studio,
       DevTools, Jitter). -->
  <div
    class="mark-line flex min-w-0 items-center gap-space-2"
    data-slot="transport"
  >
    <button
      type="button"
      data-box
      aria-label={playing ? words.pause : words.play}
      title={playing ? words.pause : words.play}
      class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover"
      onclick={() => (playing ? onpause() : onplay())}
    >
      {#if playing}
        <IconPause aria-hidden="true" class="size-icon-md" />
      {:else}
        <IconPlay aria-hidden="true" class="size-icon-md" />
      {/if}
    </button>
    <span class="type-code text-ink-muted num" data-slot="time"
      >{words.playhead(figure(handle), figure(Math.round(length)))}</span
    >
  </div>
{/snippet}

{#snippet back()}
  <!-- The time past the move's end, shaded, and a gridline down from each
       figured mark (DevTools): drawn in each lane, so they run down the
       rows and stop where an opened editor stands. -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 start-(--at) end-0 bg-surface-recess"
    data-slot="past-end"
    style:--at={pct(length)}
  ></span>
  {#each marks as mark (mark)}
    {#if figured.has(mark) && mark > 0}
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 start-(--at) w-px -translate-x-1/2 bg-border-hairline rtl:translate-x-1/2"
        style:--at={pct(mark)}
      ></span>
    {/if}
  {/each}
{/snippet}

{#snippet playheadLine()}
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 start-(--at) z-1 w-px -translate-x-1/2 bg-ink-strong rtl:translate-x-1/2"
    data-slot="playhead"
    style:--at={pct(Math.min(playhead, length))}
  ></span>
{/snippet}

<div data-slot="move" class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-3">
  {#if move.kind === "none"}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.noMove(move.state)}
    </p>
  {:else}
    <!-- The head: the move, and Reset once he changed anything. -->
    <header class="flex min-h-c-btn-h-sm min-w-0 items-center gap-space-3">
      <h3 class="m-0 min-w-0 flex-1 type-label text-ink-strong">
        <span class="block truncate">{words.move(move.from, move.to)}</span>
      </h3>
      {#if move.kind === "ready" && changed}
        <button
          type="button"
          aria-label={words.resetAll}
          class="pointer-hit touch-hit h-c-btn-h-sm flex-none rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
          data-slot="reset-all"
          onclick={() =>
            onreset(clips.filter((clip) => clip.was).map((clip) => clip.id))}
          title={words.resetAll}
        >
          {words.reset}
        </button>
      {/if}
    </header>

    {#if move.kind === "reading"}
      <p class="m-0 type-meta text-ink-muted" role="status">{words.reading}</p>
    {:else if move.kind === "failed"}
      <!-- Why it didn't play, and the way back: Try again plays it once
           more from its from state, as it played on arrival. -->
      <div class="flex min-w-0 flex-col items-start gap-space-3" role="alert">
        <p class="m-0 type-body text-status-fail-ink wrap-anywhere">
          {words.moveFailed(move.why)}
        </p>
        <Button onclick={onretry} size="sm" variant="outline"
          >{words.tryAgain}</Button
        >
      </div>
    {:else if clips.length === 0}
      <p class="m-0 type-body text-ink-muted text-pretty">
        {words.nothingAnimated(move.from, move.to)}
      </p>
    {:else}
      <!-- The timeline: one grid of three columns (what moves, its length,
           its lane), the ruler's row then a row per thing, each a subgrid
           of the timeline's columns, so every lane is one column of one
           width with one inset. -->
      <!-- Under a finger the last end's 44px reaches past the lane's inset:
           the scroller keeps room for it, so it never scrolls sideways. -->
      <div class="min-h-0 min-w-0 overflow-y-auto coarse:pe-space-4">
        <div
          data-slot="timeline"
          class="grid min-w-0 grid-cols-(--cols) gap-x-space-3"
          style:--cols="fit-content(40%) auto minmax(0, 1fr)"
        >
          <div
            class="sticky top-0 z-2 col-span-full grid min-h-c-btn-h grid-cols-subgrid bg-surface-raised"
          >
            <div class="col-span-2 flex min-w-0 items-center">
              {@render transport()}
            </div>
            <div
              class="relative col-start-3 flex min-w-0 items-end px-space-2"
              data-slot="ruler"
            >
              <Slider.Root
                class="relative block h-space-7 w-full cursor-ew-resize touch-none select-none"
                max={scale}
                min={0}
                onValueChange={(next: number) => onseek(Math.min(next, length))}
                onValueCommit={onseekend}
                step={1}
                thumbPositioning="exact"
                type="single"
                value={handle}
              >
                <div
                  bind:this={ruler}
                  class="absolute inset-0 type-code leading-none num"
                  aria-hidden="true"
                  {@attach frameSize((node: HTMLElement) => {
                    lane = node.clientWidth;
                  })}
                >
                  <!-- Each mark's tick and its figure centred on its time. -->
                  {#each marks as mark (mark)}
                    <span
                      class="absolute start-(--at) bottom-0 h-space-1 w-px -translate-x-1/2 bg-border-control rtl:translate-x-1/2"
                      data-mark={mark}
                      style:--at={pct(mark)}
                    ></span>
                    {#if figured.has(mark)}
                      <span
                        class="absolute start-(--at) top-0 -translate-x-1/2 text-ink-muted rtl:translate-x-1/2"
                        style:--at={pct(mark)}>{figure(mark)}</span
                      >
                    {/if}
                  {/each}
                </div>
                <Slider.Thumb
                  aria-label={words.scrub}
                  aria-valuetext={words.playhead(
                    figure(handle),
                    figure(Math.round(length))
                  )}
                  class="pointer-hit touch-hit bottom-0 block h-space-2 w-space-1 cursor-ew-resize rounded-pill bg-ink-strong focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
                  data-slot="playhead-head"
                  title={words.scrub}
                  index={0}
                  onkeydown={pageKey}
                />
              </Slider.Root>
            </div>
          </div>

          {#each lines as line (line.key)}
            {@const track = line.track}
            {@const name = nameOf(track)}
            {@const long = lengthShown(track)}
            {@const many = !line.part && track.clips.length > 1}
            {@const open = editing === line.key}
            <!-- A row is one thing that moves, one comment target named by
                 its first words, as a person says it. -->
            <div
              data-slot="clip"
              class="col-span-full grid min-w-0 grid-cols-subgrid border-t border-border-hairline"
              {...lights(track)}
            >
              <div
                class={[
                  "flex min-h-c-btn-h min-w-0 items-center gap-space-1",
                  line.part && "ps-space-4",
                ]}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  class="pointer-hit touch-hit -ms-space-1 flex h-c-btn-h-sm min-w-0 flex-1 items-center rounded-sm px-space-1 text-start type-label transition-control can-hover:hover:bg-surface-hover"
                  onclick={() => {
                    editing = editing === line.key ? null : line.key;
                  }}
                  title={name}
                >
                  <span class="min-w-0 truncate"
                    ><span class={open ? "text-selected-ink" : "text-ink-row"}
                      >{track.name}</span
                    >
                    <span class={open ? "text-selected-ink" : "text-ink-muted"}
                      >{track.how}</span
                    ></span
                  >
                </button>
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
              </div>
              <!-- Its length, a tabular figure on the column's end edge;
                   changed, its own press puts it back. -->
              <div
                class="flex min-w-0 items-center justify-end"
                data-slot="length"
              >
                {#if long.reset}
                  <button
                    type="button"
                    aria-label={long.reset}
                    class="pointer-hit touch-hit inline-flex h-c-badge-h items-center rounded-xs border border-dashed border-selected-ink bg-selected-bg px-space-1 type-code leading-none whitespace-nowrap text-selected-ink transition-control num can-hover:hover:bg-surface-hover"
                    data-edited
                    onclick={() => onretime(restore(track, "length"))}
                    title={long.reset}
                  >
                    {long.text}
                  </button>
                {:else}
                  <span
                    class="border border-transparent px-space-1 type-code leading-none whitespace-nowrap text-ink-muted num"
                    title={long.said ?? undefined}>{long.text}</span
                  >
                {/if}
              </div>
              <div
                class="relative flex min-w-0 items-center px-space-2"
                data-slot="lane"
              >
                <div class="relative flex size-full min-w-0 items-center">
                  {@render back()}
                  <ClipBar
                    {lang}
                    {name}
                    onhold={(span) => {
                      holding = span ? { id: track.id, ...span } : null;
                    }}
                    onretime={(from, to) => onretime(retime(track, from, to))}
                    original={track.clips.some((clip) => clip.was)
                      ? (read.get(track.thing ?? track.id) ?? null)
                      : null}
                    {scale}
                    {track}
                  />
                  {@render playheadLine()}
                </div>
              </div>
              {#if open}
                <div
                  class="col-span-full min-w-0 pb-space-3"
                  in:unfold
                  out:unfold
                >
                  <ClipEditor {lang} {name} {onretime} {track} />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
