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
   * the advisor's map, timeline.md §4) on the house's controls, dressed as
   * round 29 dressed it (the owner's pin 26): one row per thing that moves
   * on the stage (motion `tracksOf`), its words in the first column, its
   * bar in the second, the ruler at the head of the second. Under a
   * timeline narrower than `--container-timeline` each row's bar stands
   * under its words.
   *
   * A row is its kind's dot, what moves and how ("Form failure unfolds"),
   * a press that opens its editor under it (the owner's pick); under that
   * its timing as small chips: the length's figure with the design
   * system's name for it when it is one, the curve drawn with its name,
   * the delay when it has one, and what changes when that is one plain
   * number. A value he changed takes the changed look on its own chip
   * (coral, a dashed edge), its tooltip saying what it was; pressing the
   * chip puts that one value back (motion `restore`), sent to the agent as
   * an edit is. The head holds Original | Edited, the count of edits and
   * Reset once there are any.
   *
   * One scale for all of it: the lane runs from the move's start to its
   * end (to the ruler's next mark), and the ruler, every bar and the
   * playhead are placed on that one lane, each cell the same width with
   * the same inset, so a mark, a bar's end and the playhead at one time
   * stand on one line. The ruler's marks stand every 100 ms, or every
   * step of 1, 2 and 5 past it that keeps them `--space-2` apart, so a move
   * of minutes draws as few marks as one of a second; its mono figures thin
   * to the lane's width, grouped as the page's language groups them. The
   * ruler is the playhead's slider (bits-ui's Slider): a press anywhere on
   * it scrubs, its handle a dot on its foot, one hairline down the lane
   * from there; the time stands beside Play. A scrub during play pauses it
   * and plays on from where it is let go (DialKit's rule).
   *
   * A spring's figure is `~`, its true end where it settles. A row whose
   * thing moves more than once opens into one row per animation, each
   * retimed alone (DialKit's composite bar). Under Edited the original
   * bars stand as outlines.
   *
   * Resting on a row, or focusing in it, rings the thing it names on the
   * stage (DesignGraph `lit`); nothing else on the stage changes.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { badgeVariants } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconChevronDown, IconPause, IconPlay } from "#lib/icons.js";
  import { browser } from "$app/env";
  import ClipBar from "./ClipBar.svelte";
  import ClipEditor from "./ClipEditor.svelte";
  import { figureOf, inkWidth } from "./figures";
  import {
    type Clip,
    curveGlyph,
    deltaOf,
    editsOf,
    lengthOf,
    restore,
    retime,
    type Timing,
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
    onretry,
    lang,
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
    /** A move whose play threw, played again from its from state. */
    onretry: () => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
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
  /**
   * How far the lane reaches: the move's end, or, once he changed it, the
   * later of its end and the end as the engine ran it, so the original's
   * outlines under Edited stand inside the lane when he shortened it.
   */
  const reach = $derived(
    changed ? Math.max(length, lengthOf(clips.map(untune))) : length
  );
  /** A bar's drag step, ms (ClipBar's). */
  const STEP = 10;
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
  /** The lane's end: its reach, to the ruler's next mark. */
  const scale = $derived(Math.max(step, Math.ceil(reach / step) * step));
  const adHoc = $derived(shown.filter((clip) => clip.adHoc).length);
  /** The ruler's marks, a step apart. */
  const marks = $derived(
    Array.from({ length: Math.floor(scale / step) + 1 }, (_, at) => at * step)
  );
  /**
   * A figure's room on the ruler: the widest figure (the lane's end) as it
   * draws in the ruler's type, half as much again (the last figure stands
   * back from its mark by its whole width, not half), and `--space-3`
   * past it; `--space-8`, four figures' room, until the ruler is drawn. A
   * room of `--space-8` alone ran "1,200,000" into the figures beside it.
   */
  const FIGURE_GAP = browser ? numberOf("--space-3") : 0;
  const FOUR_FIGURES = browser ? numberOf("--space-8") : 0;
  const figureRoom = $derived(
    ruler
      ? 1.5 * inkWidth(figureOf(scale, lang), ruler) + FIGURE_GAP
      : FOUR_FIGURES
  );
  /** A figure on every mark that stands a figure's room past the last: every mark, every second, every fourth… */
  const figureEvery = $derived.by(() => {
    const apart = lane > 0 ? (lane * step) / scale : 0;
    const room = figureRoom;
    return apart <= 0
      ? 1
      : Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, room / apart))));
  });
  /**
   * The stretch a bar's drag holds, by its row: the row's words follow the
   * drag, as Jitter's Duration follows its bar's end handle.
   */
  let holding = $state<{ from: number; id: string; to: number } | null>(null);
  /** `n` as a figure in the page's language. */
  const figure = (n: number) => figureOf(n, lang);
  /** A row as a person says it: what moves and how; its timing is in its chips. */
  const nameOf = (track: Track) => words.clipName(track.name, track.how);

  /** A chip of a row's timing: its mono words, what a reader hears, and once he changed it, the press that puts it back. */
  interface Chip {
    /** The design system's name for it, as a badge: "pop". */
    badge: string | null;
    /** A curve's glyph, before its name. */
    glyph: string | null;
    key: Timing | "delta";
    /** He changed it: the press's name, saying what it goes back to. */
    reset: string | null;
    /** Its tooltip and a reader's name for it; null: its words say it. */
    said: string | null;
    /** Mono: "260 ms", "~412 ms", "+80 ms", "height 0 → 120 px". */
    text: string;
  }
  const bare = { badge: null, glyph: null, reset: null, said: null };
  /** A curve's name: its token's, a spring's, or its own. */
  const curveWord = (clip: Clip) =>
    clip.spring ? words.shapes.spring : clip.curve || words.ownCurve;
  /** The clip as the engine ran it, when he changed the row. */
  const wasOf = (track: Track) =>
    track.clips.find((clip) => clip.was)?.was ?? null;
  /** The length's chip: its figure, and the design system's name for it when it is one; a spring's is where it settles. */
  const lengthChip = (track: Track, edited: boolean): Chip => {
    const [first] = track.clips;
    const held = holding?.id === track.id ? holding : null;
    const ms = Math.round(
      held ? held.to - held.from : (track.length ?? track.ends - track.begins)
    );
    const was = edited ? wasOf(track) : null;
    const reset = was
      ? words.resetLength(figure(Math.round(was.duration)))
      : null;
    if (track.sprung) {
      return {
        ...bare,
        key: "length",
        text: words.springFigure(figure(ms)),
        said: words.springSettles(figure(ms)),
        reset,
      };
    }
    const token =
      // A row of several stretches names a token only when its one length is its clips'.
      !held && first?.token && track.length === first.duration
        ? first.token.replace("--dur-", "")
        : null;
    return {
      ...bare,
      key: "length",
      text: words.ms(figure(ms)),
      badge: token,
      said: token ? null : words.freeOf,
      reset,
    };
  };
  /** The curve's chip: drawn, with its name. */
  const curveChip = (first: Clip, was: Clip | null): Chip => ({
    ...bare,
    key: "curve",
    text: curveWord(first),
    glyph: curveGlyph(first.easing),
    said: words.curveOf(curveWord(first)),
    reset: was
      ? words.resetCurve(was.framed ? words.ownCurve : curveWord(was))
      : null,
  });
  /** When the row begins, ms: a drag's start once it has moved a step, else its own (a held end leaves it where it is). */
  const beginsOf = (track: Track) => {
    const held = holding?.id === track.id ? holding : null;
    return held && Math.abs(held.from - track.begins) >= STEP
      ? held.from
      : track.begins;
  };
  /** The delay's chip, after the moment the move set it off. */
  const startChip = (track: Track, edited: boolean): Chip => {
    const delay = Math.round(beginsOf(track) - track.setOff);
    const wasDelay = Math.round(
      Math.min(
        ...track.clips.map((clip) => untune(clip).start + untune(clip).delay)
      ) - track.setOff
    );
    return {
      ...bare,
      key: "start",
      text: words.startsAt(figure(delay)),
      said: words.startsAfter(figure(delay)),
      reset: edited ? words.resetDelay(figure(wasDelay)) : null,
    };
  };
  /** What the clip changes, when it is one plain number. */
  const deltaChip = (clip: Clip): Chip | null => {
    const delta = deltaOf(clip);
    if (!delta) {
      return null;
    }
    const [from, to] = [figure(delta.from), figure(delta.to)];
    return {
      ...bare,
      key: "delta",
      text: words.property(delta.property, from, to, delta.unit),
      said: words.propertyOf(delta.property, from, to, delta.unit),
    };
  };
  /** The row's chips, as round 29 lays them: length, curve, delay, then what changes. */
  const chipsOf = (track: Track): Chip[] => {
    const [first] = track.clips;
    if (!first) {
      return [];
    }
    const edits = editsOf(track);
    return [
      lengthChip(track, edits.has("length")),
      // A curve drawn into its frames has no name of its own, until he picks one.
      !first.framed || edits.has("curve")
        ? curveChip(first, edits.has("curve") ? wasOf(track) : null)
        : null,
      // An edited delay keeps its chip at +0 ms, so its reset stays.
      Math.round(beginsOf(track) - track.setOff) > 0 || edits.has("start")
        ? startChip(track, edits.has("start"))
        : null,
      track.clips.length === 1 ? deltaChip(first) : null,
    ].filter((chip): chip is Chip => chip !== null);
  };
  /** The values he changed, over every row: the head's count. */
  const editCount = $derived(
    tracksOf(clips).reduce((n, track) => n + editsOf(track).size, 0)
  );
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
  /** Each line's grid row, under the ruler's; an open editor stands in its line. */
  const placed = $derived(lines.map((line, at) => ({ ...line, row: at + 2 })));
  /** Each kind's dot, before the row's words: the colour of its bar. */
  const DOT: Record<Track["kind"], string> = {
    size: "bg-c-clip-size",
    move: "bg-c-clip-move",
    fade: "bg-c-clip-fade",
    tint: "bg-c-clip-tint",
    effect: "bg-c-clip-effect",
    other: "bg-c-clip-other",
  };
  const toggle =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong";
</script>

<div data-slot="move" class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-3">
  {#if move.kind === "none"}
    <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
      {words.noMove(move.state)}
    </p>
  {:else}
    <!-- The head: the move, then once he changed it Original | Edited, the
         count and Reset, then Play, ¼× and the time, at its trailing end. -->
    <header
      class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
    >
      <h3 class="m-0 min-w-0 flex-1 type-label text-ink-strong">
        <span class="block truncate">{words.move(move.from, move.to)}</span>
      </h3>
      {#if move.kind === "ready" && changed}
        <div class="flex min-w-0 items-center gap-space-2">
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
          <span
            class={badgeVariants({ kind: "meta", figures: "tabular" })}
            data-slot="edits">{words.edits(editCount, figure(editCount))}</span
          >
          <button
            type="button"
            aria-label={words.resetAll}
            class="pointer-hit touch-hit h-c-btn-h-sm rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
            onclick={() =>
              onreset(clips.filter((clip) => clip.was).map((clip) => clip.id))}
            title={words.resetAll}
          >
            {words.reset}
          </button>
        </div>
      {/if}
      {#if move.kind === "ready"}
        <div class="flex items-center gap-space-2">
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
          {#if clips.length > 0}
            <span
              class="type-code whitespace-nowrap text-ink-muted num"
              data-slot="time"
              >{words.playhead(
                figure(handle),
                figure(Math.round(length))
              )}</span
            >
          {/if}
        </div>
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
      {#if adHoc > 0}
        <p class="m-0 type-meta text-status-attn-ink">{words.adHoc(adHoc)}</p>
      {/if}

      <!-- The timeline: one grid; the ruler, then a line per row, each a
           subgrid of the timeline's columns, so every lane cell is one
           column of one width. Each lane insets its content by --space-2,
           half the playhead's dot and more, so the dot stands whole at 0
           and at the end, and the ruler, the bars and the hairline share
           one box. Narrower than --container-timeline a line's bar stands
           under its words, across the timeline. -->
      <div class="@container min-h-0 min-w-0 overflow-y-auto">
        <div
          data-slot="timeline"
          class="relative grid min-w-0 grid-cols-1 grid-rows-(--rows) gap-y-space-3 @timeline:grid-cols-5 @timeline:gap-x-space-3"
          style:--rows="repeat({lines.length + 1}, auto)"
        >
          <div
            class="sticky top-0 z-1 col-span-full row-start-1 min-w-0 bg-surface-raised px-space-2 @timeline:col-span-3 @timeline:col-start-3"
          >
            <Slider.Root
              class="relative block h-space-6 w-full cursor-ew-resize touch-none select-none"
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
                <!-- The first figure stands from its mark and the last back
                     to it, so neither leaves the lane; the rest centre on
                     theirs. Each mark's tick stands on the ruler's foot. -->
                {#each marks as mark, at (mark)}
                  <span
                    class="absolute start-(--at) bottom-0 h-space-1 w-px bg-border-control"
                    style:--at={pct(mark)}
                  ></span>
                  {#if at % figureEvery === 0}
                    <span
                      class={[
                        "absolute start-(--at) top-0 text-ink-muted",
                        at > 0 &&
                          at === marks.length - 1 &&
                          "-translate-x-full rtl:translate-x-full",
                        at > 0 &&
                          at < marks.length - 1 &&
                          "-translate-x-1/2 rtl:translate-x-1/2",
                      ]}
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
                class="pointer-hit touch-hit bottom-0 block size-space-2 cursor-ew-resize rounded-pill bg-ink-strong focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
                index={0}
                onkeydown={pageKey}
              />
            </Slider.Root>
          </div>

          {#each placed as line (line.key)}
            {@const track = line.track}
            {@const name = nameOf(track)}
            {@const chips = chipsOf(track)}
            {@const many = !line.part && track.clips.length > 1}
            {@const open = editing === line.key && !original}
            <!-- A row is one thing that moves, one comment target named by
                 its first words, as a person says it. -->
            <div
              data-slot="clip"
              class="col-span-full row-start-(--row) grid min-w-0 grid-cols-subgrid gap-y-space-2"
              style:--row={line.row}
              {...lights(track)}
            >
              <div
                class={[
                  "col-span-full flex min-w-0 items-start gap-space-1 @timeline:col-span-2",
                  line.part && "ps-space-4",
                ]}
              >
                <div class="flex min-w-0 flex-1 flex-col gap-space-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    class={[
                      "pointer-hit touch-hit -ms-space-1 flex min-h-c-pill-h min-w-0 items-center gap-space-2 self-start rounded-sm px-space-1 text-start type-label transition-control can-hover:hover:bg-surface-hover disabled:cursor-default",
                      open && "bg-surface-hover",
                    ]}
                    disabled={original}
                    onclick={() => {
                      editing = editing === line.key ? null : line.key;
                    }}
                  >
                    <span
                      aria-hidden="true"
                      class={[
                        "size-space-2 flex-none rounded-pill",
                        DOT[track.kind],
                      ]}
                    ></span>
                    <span class="min-w-0 text-ink-strong wrap-anywhere"
                      >{name}</span
                    >
                  </button>
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-space-1"
                    data-slot="chips"
                  >
                    {#each chips as chip (chip.key)}
                      {#snippet face()}
                        {#if chip.glyph}
                          <svg
                            aria-hidden="true"
                            class="size-icon-sm flex-none"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                          >
                            <path d={chip.glyph} />
                          </svg>
                        {/if}
                        <span class="whitespace-nowrap">{chip.text}</span>
                      {/snippet}
                      {#if chip.reset}
                        <!-- Changed: its own chip marked; a press puts it back. -->
                        <button
                          type="button"
                          aria-label={chip.reset}
                          class="pointer-hit touch-hit inline-flex h-c-badge-h min-w-0 items-center gap-space-1 rounded-xs border border-dashed border-selected-ink bg-selected-bg px-space-1 type-code leading-none text-selected-ink transition-control num can-hover:hover:bg-surface-hover"
                          data-edited
                          onclick={() =>
                            onretime(restore(track, chip.key as Timing))}
                          title={chip.reset}
                        >
                          {@render face()}
                        </button>
                      {:else}
                        {#if chip.said}
                          <span
                            aria-label={chip.said}
                            class="inline-flex h-c-badge-h min-w-0 items-center gap-space-1 px-space-1 type-code leading-none text-ink-muted num"
                            role="img"
                            title={chip.key === "curve" ? undefined : chip.said}
                          >
                            {@render face()}
                          </span>
                        {:else}
                          <span
                            class="inline-flex h-c-badge-h min-w-0 items-center gap-space-1 px-space-1 type-code leading-none text-ink-muted num"
                          >
                            {@render face()}
                          </span>
                        {/if}
                      {/if}
                      {#if chip.badge}
                        <span
                          aria-label={words.durationOf(chip.badge)}
                          class={[
                            badgeVariants({ kind: "meta" }),
                            "h-c-badge-h type-code leading-none",
                          ]}
                          role="img"
                          title={words.durationOf(chip.badge)}
                          >{chip.badge}</span
                        >
                      {/if}
                    {/each}
                  </div>
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
              </div>
              <div
                class="col-span-full min-w-0 self-start px-space-2 @timeline:col-span-3 @timeline:col-start-3"
              >
                <div class="relative">
                  <ClipBar
                    disabled={original}
                    {lang}
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
                  <!-- The playhead down this lane, while the bars stand
                       under their words: no one line runs down a column. -->
                  <span
                    aria-hidden="true"
                    class="pointer-events-none absolute -inset-y-space-1 start-(--at) w-px -translate-x-1/2 bg-ink-strong @timeline:hidden rtl:translate-x-1/2"
                    style:--at={pct(Math.min(playhead, length))}
                  ></span>
                </div>
              </div>
              {#if open}
                <div class="col-span-full min-w-0" in:unfold out:unfold>
                  <ClipEditor
                    {name}
                    onreset={() => onreset(track.clips.map((clip) => clip.id))}
                    {onretime}
                    {track}
                  />
                </div>
              {/if}
            </div>
          {/each}

          <!-- The playhead's hairline, down the lane alone, from the
               ruler's foot to the last row, while bars stand beside their
               words. -->
          <div
            aria-hidden="true"
            class="pointer-events-none relative col-span-3 col-start-3 row-span-full row-start-1 hidden px-space-2 @timeline:block"
          >
            <div class="relative size-full">
              <span
                class="absolute top-space-6 bottom-0 start-(--at) w-px -translate-x-1/2 bg-ink-strong rtl:translate-x-1/2"
                style:--at={pct(Math.min(playhead, length))}
              ></span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
