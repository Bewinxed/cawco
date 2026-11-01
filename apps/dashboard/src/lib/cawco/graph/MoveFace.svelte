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
   * before it, as its clips. Its head names the move, flags once how many
   * clips stand outside the tokens, and holds Play and Play at a quarter
   * speed; under it the ruler, which is the playhead's scrubber, then one
   * line per clip (what moves and how, its length with its token, its
   * curve) with its ink bar under its name on the ruler's scale, and its
   * editor. A tuned clip says so on its row, before and after. A state
   * with no move says so in one sentence.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { IconPause, IconPlay } from "#lib/icons.js";
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
  const adHoc = $derived(clips.filter((clip) => clip.adHoc).length);
  /** The ruler's marks: every 100 ms, a figure at every one that has room. */
  const STEP = 100;
  const marks = $derived(
    Array.from({ length: Math.floor(length / STEP) + 1 }, (_, at) => at * STEP)
  );
  /** A figure on every mark, every second past 400 ms, every fourth past 800. */
  const figureEvery = $derived(
    Math.max(1, 2 ** Math.ceil(Math.log2(length / 400)))
  );
  const facts = (clip: Clip) =>
    [
      clip.token?.replace("--dur-", ""),
      clip.curve,
      clip.delay > 0 ? `${words.delay} ${words.ms(clip.delay)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const wasWords = (clip: Clip) =>
    clip.was
      ? words.tuned(words.ms(clip.was.duration), words.ms(clip.duration))
      : "";
  const pct = (t: number) => `${(t / length) * 100}%`;
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
        <span class="type-meta text-ink-muted num">
          {words.playhead(Math.round(playhead), Math.round(length))}
        </span>
        <!-- mark-line: two buttons side by side, each a box of its own -->
        <div class="flex items-center gap-space-1">
          <button
            type="button"
            data-box
            aria-label={playing ? words.replay : words.play}
            title={words.play}
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

      <!-- The ruler: the playhead's scrubber, its marks every 100 ms. -->
      <div class="relative flex flex-col gap-space-1">
        <input
          aria-label={words.scrub}
          aria-valuetext={words.playhead(
            Math.round(playhead),
            Math.round(length)
          )}
          class="touch-hit h-c-btn-h-sm w-full accent-ink-strong"
          max={length}
          min="0"
          step="1"
          type="range"
          value={playhead}
          oninput={(event) => onseek(Number(event.currentTarget.value))}
        />
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

      <div class="relative flex min-h-0 flex-col">
        <ol
          class="m-0 flex min-h-0 list-none flex-col gap-space-2 overflow-y-auto p-0"
        >
          {#each clips as clip (clip.id)}
            <li class="min-w-0">
              <!-- The row is the clip, one comment target named by its
                   legend as a person says it ("Form failure unfolds, 260
                   ms"); its facts, its editor and its bar are what it
                   holds. -->
              <fieldset
                data-slot="clip"
                class="m-0 flex min-w-0 flex-col gap-space-1 border-0 p-0"
              >
                <legend class="p-0 type-label text-ink-row wrap-anywhere">
                  <span class="num"
                    >{words.clipName(
                      clip.element,
                      clip.how,
                      clip.duration
                    )}</span
                  >
                </legend>
                <div class="flex min-w-0 items-start gap-space-2">
                  <p
                    class="m-0 min-w-0 flex-1 type-meta text-ink-muted num wrap-anywhere"
                  >
                    {facts(clip)}{#if clip.was}<span class="text-selected-ink">
                        · {wasWords(clip)}</span
                      >{/if}
                  </p>
                  <ClipEditor
                    {clip}
                    onreset={() => onreset(clip.id)}
                    ontune={(tuning) => ontune(clip.id, tuning)}
                  />
                </div>
                <div
                  class="relative h-space-2 rounded-pill bg-surface-fill"
                  aria-hidden="true"
                >
                  <span
                    class="absolute inset-y-0 start-(--at) w-(--long) rounded-pill bg-ink-muted"
                    style:--at={pct(clip.start + clip.delay)}
                    style:--long={pct(clip.duration)}
                  ></span>
                </div>
              </fieldset>
            </li>
          {/each}
        </ol>
        <!-- The playhead across every bar. -->
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 start-(--at) w-px bg-ink-strong"
          style:--at={pct(playhead)}
        ></span>
      </div>
    {/if}
  {/if}
</div>
