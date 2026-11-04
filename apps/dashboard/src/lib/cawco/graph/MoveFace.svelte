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
   * The animation into the kept state (spec, The move), drawn from what the
   * person comes to do with it (the task model's T3, T9, T18; the run
   * record of 4 November names each step and the one control that serves
   * it), as the motion tools lay a timeline out (Motion Studio, Jitter).
   *
   * - **The title** is the move ("Filled in → Hub didn't answer"), a menu
   *   of every move the states file names under it, as the bar's own
   *   component title is: a press on one plays it from its from state.
   * - **The transport**, one group at the ruler's leading corner: Play,
   *   Repeat (a toggle: the move goes round again each time it ends), and
   *   the time held over the move's length.
   * - **The ruler** is the playhead's slider (bits-ui Slider): a press or a
   *   drag on it scrubs, during a play too, and the move stays held where
   *   it is let go (T3); let go within half a mark of either end, it lands
   *   on that end's state. Its handle is a flag on the ruler.
   * - **One row per thing that moves**, every row one line, a hairline
   *   between rows, read down three fixed columns: what moves and how
   *   ("Form failure unfolds", cut with the whole in its tooltip); its own
   *   length (the animations' durations as written, never a measured
   *   span); its lane. A thing that moves more than once has a disclosure
   *   triangle at its leading edge (an outline's, as Motion Studio's tracks
   *   open into their properties), opening one row per animation named by
   *   the property it animates ("opacity", "--swap-away").
   * - **A press on a row, or on its bar**, selects it: the house Selected
   *   wash (coral is the selected row's alone), its bar ringed, its three
   *   settings opened under it (ClipSettings, his pick: a clip is adjusted
   *   in place). A bar's body drags its delay and its ends its length
   *   (ClipBar).
   * - **Two whole versions** once he changed anything (the owner's pick):
   *   a switch in the head, "As written | Yours", Yours counting the
   *   animations he changed; each plays as itself, As written read-only.
   *   Reset all beside it. A changed row's length carries the restore glyph
   *   (every value of that row back), as a changed setting does.
   *
   * One scale for all of it: the lane runs from the move's start (the
   * moment it first set anything off) to the ruler's next mark a quarter
   * past its end, so a bar can always be dragged past the end it has: a
   * lane that ended on the move's last mark held every edit under it. The
   * ruler, every bar, the gridlines and the playhead are placed by one
   * rule, `t / scale` of the lane's width. The ruler's marks stand every
   * 100 ms, or every step of 1, 2 and 5 past it that keeps them
   * `--space-2` apart; its figures thin to the lane's width.
   *
   * Where the face is narrower than `--container-timeline` (the phone's
   * drawer, a room at its least), each row's name stands over a lane the
   * face's full width (T18): a lane of 100px left 9 ms a pixel.
   *
   * Resting on a row, or focusing in it, rings the thing it names on the
   * stage (DesignGraph `lit`); nothing else on the stage changes.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconChevronRight,
    IconPause,
    IconPlay,
    IconRepeat,
    IconReset,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import ClipBar from "./ClipBar.svelte";
  import ClipSettings from "./ClipSettings.svelte";
  import { figureOf, inkWidth } from "./figures";
  import {
    type Clip,
    type ClipKind,
    editsOf,
    inRunOrder,
    lengthOf,
    ownLengths,
    type Run,
    retimeRun,
    type Track,
    tracksOf,
    untune,
  } from "./motion";

  let {
    move,
    playhead,
    playing,
    repeat,
    version,
    onplay,
    onpause,
    onrepeat,
    onseek,
    onseekend,
    onretime,
    onreset,
    onversion,
    onlight,
    choices,
    chosen,
    onchoose,
    onfocusthing,
    peek = false,
    onretry,
    lang,
    selected = $bindable(null),
    opened = $bindable({}),
  }: {
    move: MoveState;
    /** The playhead, ms into the move. */
    playhead: number;
    playing: boolean;
    /** Play goes round again each time the move ends. */
    repeat: boolean;
    /** The timing on the face and in Play: his, or the agent's as written. */
    version: "yours" | "written";
    onplay: () => void;
    onpause: () => void;
    onrepeat: (on: boolean) => void;
    /** A scrub: the move held at `t` ms. */
    onseek: (t: number) => void;
    /** The scrub let go at `t` ms (0 or the move's end when let go near either). */
    onseekend: (t: number) => void;
    /** Clips he tuned, to put in the move; a key's nudge plays nothing. */
    onretime: (clips: Clip[], replay?: boolean) => void;
    /** Clips put back as the engine ran them, by id. */
    onreset: (ids: string[]) => void;
    /** One version or the other: it plays. */
    onversion: (version: "yours" | "written") => void;
    /** The thing a row names, rested on (null: none). */
    onlight: (thing: Element | null) => void;
    /** Every move the states file names, by its states' ids. */
    choices: { from: string; key: string; name: string; to: string }[];
    /** The move on the face, `from->to`; null with none. */
    chosen: string | null;
    /** A move picked from the title's menu: played from its from state. */
    onchoose: (from: string, to: string) => void;
    /** A row took the focus (a key, or a press on it): the thing it names, to bring into view on the stage. */
    onfocusthing: (thing: Element | null) => void;
    /** The phone drawer at its head stop: Play, its time and the move's name, one line. */
    peek?: boolean;
    /** A move whose play threw, played again from its from state. */
    onretry: () => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
    /** The line whose settings stand open under it, by its key (a row's first clip's id; an animation's `row/clip`). */
    selected?: string | null;
    /** The rows opened into one row per animation, by row. */
    opened?: Record<string, boolean>;
  } = $props();

  const clips = $derived(move.kind === "ready" ? move.clips : []);
  /** The clips he changed. */
  const changedCount = $derived(clips.filter((clip) => clip.was).length);
  const written = $derived(version === "written" && changedCount > 0);
  /** The clips the face draws: his, or the agent's as written. */
  const shown = $derived(written ? clips.map(untune) : clips);
  const tracks = $derived(tracksOf(shown));
  const length = $derived(Math.max(1, lengthOf(shown)));

  /** The ruler's finest mark, ms. */
  const FINEST = 100;
  /** The marks a ruler draws before its lane is measured, at most. */
  const MARKS_UNMEASURED = 50;
  /** How far past the move's end the lane reaches: a quarter more, so a bar is never held under the end it has. */
  const HEADROOM = 1.25;
  /** The lane's width, px: the ruler's marks and figures thin to it. */
  let lane = $state(0);
  /** The ruler's lane, in its figures' type. */
  let ruler = $state<HTMLElement | null>(null);
  /**
   * The stretch a bar's drag holds, by its row: the row's length follows
   * the drag, as Jitter's Duration follows its bar's end handle.
   */
  let holding = $state<{
    from: number;
    id: string;
    run: string;
    to: number;
  } | null>(null);
  /** How far the lane must reach: the move's end, the end as the engine ran it, and a held drag's. */
  const reach = $derived(
    Math.max(length, lengthOf(clips.map(untune)), holding?.to ?? 0) * HEADROOM
  );
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
    while (Number.isFinite(reach) && Math.ceil(reach / found) > most) {
      at += 1;
      found = (ladder[at % 3] as number) * 10 ** Math.floor(at / 3);
    }
    return found;
  });
  /** The lane's end: the ruler's next mark past its reach. */
  const scale = $derived(Math.max(step, Math.ceil(reach / step) * step));
  const marks = $derived(
    Array.from({ length: Math.floor(scale / step) + 1 }, (_, at) => at * step)
  );
  /** The lane's inset, px (`px-space-2`): a figure centred on an end mark may reach into it, no further. */
  const INSET = browser ? numberOf("--space-2") : 0;
  /** `--space-3`: the least room between two figures. */
  const FIGURE_GAP = browser ? numberOf("--space-3") : 0;
  const FOUR_FIGURES = browser ? numberOf("--space-8") : 0;
  const figure = (n: number) => figureOf(n, lang);
  const widest = $derived(
    ruler ? inkWidth(figure(scale), ruler) : FOUR_FIGURES
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
  const pct = (t: number) => `${(t / scale) * 100}%`;
  /** The playhead as the ruler's handle holds it, on its 1 ms steps. */
  const handle = $derived(Math.round(Math.min(playhead, length)));
  /** Page Up and Page Down step the playhead a ruler's mark (WAI-ARIA APG, Slider). */
  const pageKey = (event: KeyboardEvent) => {
    const by = { PageUp: step, PageDown: -step }[event.key];
    if (by !== undefined) {
      event.preventDefault();
      onseek(Math.max(0, Math.min(length, handle + by)));
    }
  };
  /** A scrub let go within half a mark of either end lands on that end's state (T3: letting go lands on the nearest whole state). */
  const letGo = (t: number) => {
    const near = step / 2;
    let landed = t;
    if (t <= near) {
      landed = 0;
    } else if (length - t <= near) {
      landed = length;
    }
    if (landed !== t) {
      onseek(landed);
    }
    onseekend(landed);
  };

  /** A row as a person says it: what moves and how. */
  const nameOf = (track: Track) => words.clipName(track.name, track.how);
  /** A row's own length: its animations' durations as written; a spring's where it settles; a drag's as it holds. */
  const lengthShown = (track: Track) => {
    const held = holding?.id === track.id ? holding : null;
    const [low, high] = ownLengths(track.clips);
    if (held && track.runs.length === 1 && low === high) {
      const span = track.ends - track.begins;
      return words.ms(
        figure(Math.round((low * (held.to - held.from)) / Math.max(1, span)))
      );
    }
    if (low !== high) {
      return words.lengthRange(figure(low), figure(high));
    }
    return track.sprung
      ? words.springFigure(figure(low))
      : words.ms(figure(low));
  };

  /** Rest and focus on a row light its thing; leaving lets it go. */
  const lights = (track: Track) => ({
    onpointerenter: () => onlight(track.thing),
    onpointerleave: () => onlight(null),
    onfocusin: () => {
      onlight(track.thing);
      onfocusthing(track.thing);
    },
    onfocusout: () => onlight(null),
  });

  interface Line {
    key: string;
    /** A row per animation under its row. */
    part: boolean;
    /** Its run, when its thing runs more than once. */
    run: number | null;
    track: Track;
  }
  /** The timeline's lines, in order: each row, and under an opened one a row per animation in the order the engine ran them, so retiming one never moves it. */
  const lines = $derived(
    tracks.flatMap((track): Line[] => {
      const own: Line = { key: track.id, track, part: false, run: null };
      if (!(opened[track.id] && track.clips.length > 1)) {
        return [own];
      }
      const runAt = (clip: Clip) =>
        track.runs.length > 1
          ? track.runs.findIndex((one) => one.clips.includes(clip)) + 1
          : null;
      return [
        own,
        ...inRunOrder(track.clips).flatMap((clip) =>
          tracksOf([clip]).map((part) => ({
            key: `${track.id}/${clip.id}`,
            track: part,
            part: true,
            run: runAt(clip),
          }))
        ),
      ];
    })
  );
  /** The selected line, while it still stands. */
  const picked = $derived(
    written ? null : (lines.find((line) => line.key === selected) ?? null)
  );
  /** Every bar's edges but `run`'s own: where a dragged edge settles. */
  const edgesBesides = (run: Run) =>
    tracks.flatMap((track) =>
      track.runs
        .filter((one) => one.id !== run.id)
        .flatMap((one) => [one.from, one.to])
    );
  /** A line's name for a reader: a row's words, an animation's property and run. */
  const lineName = (line: Line) =>
    line.part
      ? words.clipName(line.track.name, line.track.clips[0]?.property ?? "")
      : nameOf(line.track);

  /** Each kind's bar in As written: its wash and its edge. */
  const BAR: Record<ClipKind, string> = {
    size: "bg-c-clip-size-wash border-c-clip-size",
    move: "bg-c-clip-move-wash border-c-clip-move",
    fade: "bg-c-clip-fade-wash border-c-clip-fade",
    tint: "bg-c-clip-tint-wash border-c-clip-tint",
    effect: "bg-c-clip-effect-wash border-c-clip-effect",
    other: "bg-c-clip-other-wash border-c-clip-other",
  };
  /** The drawer's head line while the move has no rows to play. */
  const peekLine = $derived.by(() => {
    if (move.kind === "none") {
      return words.noMove(move.state);
    }
    return move.kind === "reading"
      ? words.reading
      : words.move(move.from, move.to);
  });
  const bare =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover";
</script>

{#snippet title()}
  <!-- The move on the face, the menu of every move under it: the bar's
       title pattern ("Routine form" with its chevron). -->
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={move.kind === "none"
            ? words.chooseMove
            : `${words.moves}: ${words.move(move.from, move.to)}`}
          class="mark-line pointer-hit touch-hit -ms-space-2 inline-flex h-c-btn-h-sm max-w-full min-w-0 items-center gap-space-1 rounded-md px-space-2 type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover"
          data-slot="move-title"
          type="button"
        >
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{move.kind === "none"
              ? words.chooseMove
              : words.move(move.from, move.to)}</span
          >
          <IconChevronDown
            aria-hidden="true"
            class="size-icon-sm flex-none text-ink-muted"
            data-box
          />
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" width="wide">
      <DropdownMenu.RadioGroup
        bind:value={
          () => chosen ?? "",
          (next: string) => {
            const one = choices.find((each) => each.key === next);
            if (one) {
              onchoose(one.from, one.to);
            }
          }
        }
      >
        {#each choices as one (one.key)}
          <DropdownMenu.RadioItem value={one.key}>
            <!-- A long move wraps whole rather than cut: two moves out of one state differ only at their ends. -->
            <span class="min-w-0 flex-1 text-pretty">{one.name}</span>
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

{#snippet transport()}
  <!-- Play, Repeat and the time, one group at the ruler's leading corner
       (Motion Studio, Jitter). -->
  <div
    class="mark-line flex min-w-0 items-center gap-space-1"
    data-slot="transport"
  >
    <Tip label={playing ? words.pause : words.play}>
      {#snippet children(tip)}
        <button
          {...tip}
          type="button"
          data-box
          aria-label={playing ? words.pause : words.play}
          class={bare}
          onclick={() => (playing ? onpause() : onplay())}
        >
          {#if playing}
            <IconPause aria-hidden="true" class="size-icon-md" />
          {:else}
            <IconPlay aria-hidden="true" class="size-icon-md" />
          {/if}
        </button>
      {/snippet}
    </Tip>
    <Tip label={words.repeat}>
      {#snippet children(tip)}
        <Toggle
          {...tip}
          aria-label={words.repeat}
          data-box
          onPressedChange={onrepeat}
          pressed={repeat}
          size="sm"
        >
          <IconRepeat aria-hidden="true" class="size-icon-md" />
        </Toggle>
      {/snippet}
    </Tip>
    <span
      class="ms-space-1 type-code whitespace-nowrap text-ink-muted num"
      data-slot="time"
      >{words.playhead(figure(handle), figure(Math.round(length)))}</span
    >
  </div>
{/snippet}

{#snippet back()}
  <!-- The time past the move's end, shaded, and a gridline down from each
       figured mark: drawn in each lane, so they run down the rows and stop
       where a row's settings stand. -->
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

{#snippet writtenLane(track: Track)}
  <!-- As written: the agent's timing, drawn and played, never moved. -->
  <div class="relative h-c-badge-h w-full" data-slot="bar-lane">
    {#each track.runs as run (run.id)}
      <span
        class={[
          "absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border",
          BAR[track.kind],
        ]}
        data-slot="bar"
        style:--from={pct(run.from)}
        style:--wide={pct(run.to - run.from)}
      ></span>
    {/each}
  </div>
{/snippet}

<div
  data-slot="move"
  class="@container/move flex min-h-0 min-w-0 flex-1 flex-col gap-space-3"
>
  {#if peek}
    <!-- The drawer at its head stop: Play, the time and the move on one
         line over the stage, so the move plays in sight of the stage. -->
    {#if move.kind === "ready" && clips.length > 0}
      <div class="flex min-h-c-btn-h min-w-0 items-center gap-space-3">
        {@render transport()}
        <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
          >{words.move(move.from, move.to)}</span
        >
      </div>
    {:else}
      <p class="m-0 min-w-0 truncate type-label text-ink-muted">
        {peekLine}
      </p>
    {/if}
  {:else}
    <!-- The head: the move as the face's title, and once he changed any
         timing, the two versions and Reset all. -->
    <header
      class="flex min-h-c-btn-h-sm min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2"
    >
      <div class="flex min-w-0 flex-1 basis-c-graph-node-w items-center">
        {@render title()}
      </div>
      {#if move.kind === "ready" && changedCount > 0}
        <div class="flex flex-none items-center gap-space-2">
          <ToggleGroup.Root
            aria-label={words.versions}
            onValueChange={(next: string) => {
              if (next === "yours" || next === "written") {
                onversion(next);
              }
            }}
            type="single"
            value={version}
          >
            <ToggleGroup.Item value="written">{words.written}</ToggleGroup.Item>
            <ToggleGroup.Item
              aria-label="{words.yours}, {words.changedCount(
                figure(changedCount)
              )}"
              value="yours"
            >
              <span>{words.yours}</span>
              <span
                class="type-meta text-ink-muted num"
                data-slot="changed-count">{figure(changedCount)}</span
              >
            </ToggleGroup.Item>
          </ToggleGroup.Root>
          <Button
            aria-label={words.resetAllSaid}
            data-slot="reset-all"
            onclick={() =>
              onreset(clips.filter((clip) => clip.was).map((clip) => clip.id))}
            size="sm"
            variant="ghost"
          >
            {words.resetAll}
          </Button>
        </div>
      {/if}
    </header>

    {#if move.kind === "none"}
      <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
        {words.noMove(move.state)}
      </p>
    {:else if move.kind === "reading"}
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
      <!-- The timeline: one grid of three fixed columns (what moves, its
           length, its lane), the ruler's row then a row per thing, each a
           subgrid of the timeline's columns. Narrower than a timeline's
           least, the lane takes a line of its own under its row's words. -->
      <!-- Under a finger the scroller keeps its scrollbar's room, so the
           lengths at the trailing edge never stand under it. -->
      <div class="min-h-0 min-w-0 overflow-y-auto coarse:pe-space-4">
        <div
          data-slot="timeline"
          class="grid min-w-0 grid-cols-(--cols) gap-x-space-3 @max-timeline/move:grid-cols-(--narrow)"
          style:--cols="fit-content(40%) auto minmax(0, 1fr)"
          style:--narrow="minmax(0, 1fr) auto"
        >
          <div
            class="sticky top-0 z-2 col-span-full grid min-h-c-btn-h grid-cols-subgrid bg-surface-raised"
          >
            <div class="col-span-2 flex min-w-0 items-center">
              {@render transport()}
            </div>
            <div
              class="relative col-start-3 flex min-w-0 items-end px-space-2 @max-timeline/move:col-span-full @max-timeline/move:col-start-1"
              data-slot="ruler"
            >
              <Slider.Root
                class="relative block h-space-7 w-full cursor-ew-resize touch-none select-none coarse:h-c-btn-h-lg"
                max={scale}
                min={0}
                onValueChange={(next: number) => onseek(Math.min(next, length))}
                onValueCommit={(next: number) => letGo(Math.min(next, length))}
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
                  {#each marks as mark (mark)}
                    <span
                      class="absolute start-(--at) bottom-0 h-space-1 w-px -translate-x-1/2 bg-border-control rtl:translate-x-1/2"
                      data-mark={mark}
                      style:--at={pct(mark)}
                    ></span>
                    {#if figured.has(mark)}
                      <span
                        class="absolute start-(--at) top-0 -translate-x-1/2 text-ink-muted rtl:translate-x-1/2 coarse:top-space-2"
                        style:--at={pct(mark)}>{figure(mark)}</span
                      >
                    {/if}
                  {/each}
                </div>
                <!-- The playhead's flag: a pill standing on the ruler's
                     foot, its line running down the rows; under a finger
                     its area stays inside the ruler, never over a bar. -->
                <Slider.Thumb
                  aria-label={words.scrub}
                  aria-valuetext={words.playhead(
                    figure(handle),
                    figure(Math.round(length))
                  )}
                  class="pointer-hit bottom-0 block h-space-4 w-space-2 cursor-ew-resize rounded-pill bg-ink-strong shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2 coarse:w-space-3"
                  data-slot="playhead-head"
                  index={0}
                  onkeydown={pageKey}
                />
              </Slider.Root>
            </div>
          </div>

          {#each lines as line (line.key)}
            {@const track = line.track}
            {@const name = lineName(line)}
            {@const many = !line.part && track.clips.length > 1}
            {@const chosen = picked?.key === line.key}
            {@const edited = !written && editsOf(track).size > 0}
            <!-- A row: one thing that moves, or under it one animation; one
                 comment target named by its words, as a person says it. -->
            <div
              data-slot="clip"
              data-selected={chosen || undefined}
              class={[
                "col-span-full grid min-w-0 grid-cols-subgrid border-t border-border-hairline",
              ]}
              {...lights(track)}
            >
              <div
                class={[
                  "flex min-h-c-btn-h min-w-0 items-center",
                  line.part && "ps-c-btn-h-xs",
                ]}
              >
                <!-- The disclosure slot: a triangle where the thing moves
                     more than once, else its width kept, so every name
                     starts on one edge. -->
                <span class="grid w-c-btn-h-xs flex-none place-items-center">
                  {#if many}
                    {@const said = opened[track.id]
                      ? words.hideClips(track.clips.length)
                      : words.showClips(track.clips.length)}
                    <Tip label={said}>
                      {#snippet children(tip)}
                        <button
                          {...tip}
                          type="button"
                          aria-expanded={opened[track.id] ?? false}
                          aria-label={said}
                          class="pointer-hit touch-hit grid size-c-btn-h-xs place-items-center rounded-sm text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
                          onclick={() => {
                            opened = {
                              ...opened,
                              [track.id]: !opened[track.id],
                            };
                          }}
                        >
                          <IconChevronRight
                            aria-hidden="true"
                            class={[
                              "size-icon-sm transition-transform duration-(--dur-control) ease-out rtl:-scale-x-100",
                              opened[track.id] && "rotate-90 rtl:-rotate-90",
                            ]}
                          />
                        </button>
                      {/snippet}
                    </Tip>
                  {/if}
                </span>
                <!-- The row's words: a press selects it, its settings
                     opening under it. -->
                <button
                  type="button"
                  aria-expanded={written ? undefined : chosen}
                  aria-label={name}
                  class="pointer-hit touch-hit flex h-c-btn-h-sm min-w-0 flex-1 items-center rounded-sm px-space-1 text-start type-label transition-control aria-expanded:bg-selected-bg disabled:cursor-default can-hover:enabled:not-aria-expanded:hover:bg-surface-hover"
                  disabled={written}
                  onclick={() => {
                    selected = chosen ? null : line.key;
                  }}
                  title={name}
                >
                  <span class="min-w-0 truncate">
                    {#if line.part}
                      <span
                        class={[
                          "type-code",
                          chosen ? "text-selected-ink" : "text-ink-row",
                        ]}>{track.clips[0]?.property}</span
                      >
                      {#if line.run !== null}
                        <span class="text-ink-muted"
                          >{words.runAt(line.run)}</span
                        >
                      {/if}
                    {:else}
                      <span
                        class={chosen ? "text-selected-ink" : "text-ink-row"}
                        >{track.name}</span
                      >
                      <span
                        class={chosen ? "text-selected-ink" : "text-ink-muted"}
                        >{track.how}</span
                      >
                    {/if}
                  </span>
                </button>
              </div>
              <!-- Its own length, a tabular figure on the column's end
                   edge; changed, in strong ink with the restore glyph
                   before it (every value of the row back). -->
              <div
                class="flex min-w-0 items-center justify-end gap-space-1"
                data-slot="length"
              >
                {#if edited}
                  {@const said = words.resetRow(name)}
                  <Tip label={said}>
                    {#snippet children(tip)}
                      <Button
                        {...tip}
                        aria-label={said}
                        data-edited
                        icon={IconReset}
                        onclick={() =>
                          onreset(
                            track.clips
                              .filter((clip) => clip.was)
                              .map((clip) => clip.id)
                          )}
                        press="pressable"
                        size="icon-xs"
                        variant="ghost"
                      />
                    {/snippet}
                  </Tip>
                {/if}
                <span
                  class={[
                    "type-code leading-none whitespace-nowrap num",
                    edited ? "text-ink-strong" : "text-ink-muted",
                  ]}>{lengthShown(track)}</span
                >
              </div>
              <div
                class="relative flex min-w-0 items-center px-space-2 @max-timeline/move:col-span-full @max-timeline/move:min-h-c-btn-h"
                data-slot="lane"
              >
                <div class="relative flex size-full min-w-0 items-center">
                  {@render back()}
                  {#if written}
                    {@render writtenLane(track)}
                  {:else}
                    <ClipBar
                      edges={edgesBesides}
                      {lang}
                      {name}
                      onhold={(run, span) => {
                        holding = span
                          ? { id: track.id, run: run.id, ...span }
                          : null;
                      }}
                      onretime={(run, from, to, replay) =>
                        onretime(retimeRun(run, from, to), replay)}
                      onselect={() => {
                        selected = line.key;
                      }}
                      {scale}
                      selected={chosen}
                      {track}
                    />
                  {/if}
                  {@render playheadLine()}
                </div>
              </div>
              {#if chosen}
                <div
                  class="col-span-full min-w-0 ps-c-btn-h-xs pb-space-3"
                  in:unfold
                  out:unfold
                >
                  <ClipSettings
                    {lang}
                    {name}
                    onretime={(next) => onretime(next)}
                    {track}
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
