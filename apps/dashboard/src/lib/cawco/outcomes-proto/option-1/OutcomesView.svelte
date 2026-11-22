<script lang="ts" module>
  import type { Ask } from "./outcomes";

  /** The hub's answer to a sent answer: it took it, or it refused it in its own sentence. */
  export type HubAnswer = { ok: true } | { ok: false; sentence: string };

  /** What he sends: his pick for a run's question. */
  export type SendAnswer = (ask: Ask, choice: string) => Promise<HubAnswer>;
</script>

<script lang="ts">
  /**
   * Outcomes, the project's view (option 1, "holds still"): the first view
   * says where to look by what each outcome needs, in three bands.
   *
   * - An outcome something under it waits on comes first, the one tile on
   *   the needs ground, its ask under the line it concerns.
   * - Outcomes with a line that is not true come next, as plain tiles,
   *   their true lines in quieter ink; then Caw's suggestion, a dashed
   *   offer.
   * - Outcomes where every line is true fold to one quiet line each,
   *   gathered at the foot with "Not under an outcome".
   *
   * Within a band, the order the outcomes were said in, so the view holds
   * still between looks: an outcome moves only when its answer does.
   *
   * The tiles' columns follow the view's own width (three from 1025, two
   * from 640, one under it); each tile goes, in order, into the column that
   * is shortest so far, ties to the left. The foot takes the same columns.
   *
   * The view never scrolls. When it is taller than its room, the Room rule
   * (shared part S11) folds it a step at a time until it fits: Caw's
   * suggestion to one line; then, in outcomes that wait on nothing, the
   * true lines to "2 others are true"; then the same in the outcome that
   * waits, the line its ask concerns kept. A line that is not true never
   * folds.
   *
   * A line opens from its answer word, as a card hanging from its row,
   * beside the tile on the side with more room, the view live around it;
   * one card at a time, gliding to the next line opened. Under 640 it is a
   * sheet from the foot. His pick in a card's ask stays when it closes.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { untrack } from "svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { own } from "#lib/components/ui/floating-presence.js";
  import { placementGlide } from "#lib/components/ui/glide-popover/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { track } from "#lib/platform/track.js";
  import type { AnswerState } from "./AskBlock.svelte";
  import LineCard from "./LineCard.svelte";
  import MetLine from "./MetLine.svelte";
  import OutcomeTile, { type Fold } from "./OutcomeTile.svelte";
  import {
    bandOf,
    type Line,
    type Outcome,
    type OutcomesRecord,
    unsettled,
  } from "./outcomes";
  import PlainTile from "./PlainTile.svelte";
  import SuggestionTile from "./SuggestionTile.svelte";
  import { outcomesWords } from "./words";

  let {
    record,
    live = true,
    lastRead = "14:02",
    openLine = $bindable(null),
    onanswer,
    onopen,
  }: {
    record: OutcomesRecord;
    /** The hub answers. Away, the bento keeps its last reading and says when it was read. */
    live?: boolean;
    lastRead?: string;
    /** The line whose card hangs open. */
    openLine?: string | null;
    onanswer: SendAnswer;
    /** A way further in that this view hands to the page (an outcome's plan, a routine, a run, a task). */
    onopen: (what: string, from: string | null) => void;
  } = $props();

  /** This view's own name: the card it hangs out of the page says whose it is (`data-for`). */
  const uid = $props.id();

  // --- room ---------------------------------------------------------------

  let root = $state<HTMLElement | null>(null);
  let box = $state<HTMLElement | null>(null);
  let bento = $state<HTMLElement | null>(null);
  /** The view's own width, and the bento's room under the line that says it is not live. */
  let view = $state({ width: 0 });
  let room = $state({ height: 0 });
  /** Three columns from 1025, two from 640, one under it. */
  const columnsAt = (width: number): number => {
    if (width >= 1025) {
      return 3;
    }
    return width >= 640 ? 2 : 1;
  };
  const columns = $derived(columnsAt(view.width));
  const narrow = $derived(view.width > 0 && view.width < 640);

  /** The house steps the layout reads, in px, read from the page once it is drawn. */
  let steps = $state({ s5: 18, s6: 21, s7: 25 });
  $effect(() => {
    steps = {
      s5: numberOf("--spacing-space-5"),
      s6: numberOf("--spacing-space-6"),
      s7: numberOf("--spacing-space-7"),
    };
  });

  /** The Room rule's step the view stands at: 0 spells everything out. */
  let step = $state(0);
  /** Tiles he spelled out again: their true lines, or the suggestion. */
  let unfolded = $state<string[]>([]);
  /** Met outcomes at the foot whose lines he spelled out in place. */
  let spelled = $state<string[]>([]);

  const said = $derived(
    record.outcomes
      .map(
        (outcome) =>
          `${outcome.id}:${outcome.asks.length}:${outcome.lines.map((line) => line.answer.kind).join(",")}`
      )
      .join("|")
      .concat(
        `|${record.suggestion?.sentence}|${unfolded.join(",")}|${spelled.join(",")}`
      )
  );
  const shape = $derived(`${view.width}x${room.height}|${said}`);
  // Whatever changes the room or the words starts again from everything
  // spelled out; the next effect folds a step a frame until it fits.
  $effect(() => {
    track(shape);
    untrack(() => {
      step = 0;
    });
  });
  $effect(() => {
    track(step, shape);
    const frame = requestAnimationFrame(() => {
      // The view against the room, its foot's air included; never the
      // room a phone's sheet adds under it.
      const foot = narrow ? 0 : steps.s5;
      if (
        box &&
        bento &&
        bento.offsetHeight + foot > box.clientHeight + 1 &&
        step < 3
      ) {
        step += 1;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  // --- bands --------------------------------------------------------------

  type Tile =
    | { id: string; kind: "outcome"; outcome: Outcome; fold: Fold }
    | { id: string; kind: "suggestion"; folded: boolean };

  const foldOf = (outcome: Outcome): Fold => {
    if (unfolded.includes(outcome.id)) {
      return "none";
    }
    const reach = bandOf(outcome) === "waits" ? 3 : 2;
    return step >= reach ? "holding" : "none";
  };

  const tileOf = (outcome: Outcome): Tile => ({
    id: outcome.id,
    kind: "outcome",
    outcome,
    fold: foldOf(outcome),
  });

  const tiles = $derived.by((): Tile[] => {
    const waits = record.outcomes.filter((each) => bandOf(each) === "waits");
    const open = record.outcomes.filter((each) => bandOf(each) === "unsettled");
    const list: Tile[] = [...waits, ...open].map(tileOf);
    if (record.suggestion) {
      list.push({
        id: "suggestion",
        kind: "suggestion",
        folded: step >= 1 && !unfolded.includes("suggestion"),
      });
    }
    return list;
  });
  const metOnes = $derived(
    record.outcomes.filter((each) => bandOf(each) === "met")
  );
  const hasFoot = $derived(metOnes.length > 0 || record.unplaced !== null);

  /**
   * A tile's height as its words make it, in px, read from its sentence,
   * its lines and its ask at the column's width.
   */
  function weightOf(tile: Tile, columnWidth: number): number {
    const PAD = 34;
    const GAP = 11;
    const rows = (text: string, width: number, perChar: number) =>
      Math.max(1, Math.ceil((text.length * perChar) / Math.max(width, 80)));
    const sentenceRoom = columnWidth - PAD - 32;
    const lineRoom = columnWidth - PAD - 120 - GAP;
    if (tile.kind === "outcome") {
      const { outcome, fold } = tile;
      const [waiting] = outcome.asks;
      const shown: Line[] =
        fold === "holding"
          ? outcome.lines.filter(
              (line) => unsettled(line.answer) || line.id === waiting?.line
            )
          : outcome.lines;
      const folded = outcome.lines.length - shown.length;
      const ask = waiting
        ? Math.min(
            3,
            rows(
              `${waiting.ask.from} asks: ${waiting.ask.ask}`,
              sentenceRoom,
              7.6
            )
          ) *
            22 +
          52
        : 0;
      return (
        PAD +
        rows(outcome.sentence, sentenceRoom, 8.6) * 24 +
        GAP +
        16 +
        shown.reduce(
          (sum, line) =>
            sum + Math.min(2, rows(line.sentence, lineRoom, 7.4)) * 20 + 8,
          0
        ) +
        ask +
        (folded > 0 ? 28 : 0)
      );
    }
    const lines = record.suggestion?.lines.length ?? 0;
    return tile.folded ? 44 : 84 + GAP + 16 + lines * 28 + 2 * (30 + GAP);
  }

  const placed = $derived.by(() => {
    const gap = steps.s5;
    // The view less its pane's inset (pane-inset), shared by its columns.
    const inset = narrow ? 2 * steps.s5 : steps.s7 + steps.s6;
    const columnWidth =
      (view.width - inset - gap * (columns - 1)) / Math.max(columns, 1);
    const heights = Array.from({ length: columns }, () => 0);
    const into: Tile[][] = Array.from({ length: columns }, () => []);
    for (const tile of tiles) {
      const shortest = heights.indexOf(Math.min(...heights));
      into[shortest]?.push(tile);
      heights[shortest] =
        (heights[shortest] ?? 0) + weightOf(tile, columnWidth) + gap;
    }
    return into;
  });

  // --- the card -----------------------------------------------------------

  /** Each ask's answer as it stands, and what he picked in it. */
  let answers = $state<Record<string, AnswerState>>({});
  let choices = $state<Record<string, string | null>>({});
  /** Asks the hub took, by the line they concerned: their card says what happened. */
  let settled = $state<Record<string, { ask: Ask; choice: string }>>({});

  const lineOf = (
    id: string | null
  ): { line: Line; outcome: Outcome } | null => {
    for (const outcome of record.outcomes) {
      const line = outcome.lines.find((each) => each.id === id);
      if (line) {
        return { line, outcome };
      }
    }
    return null;
  };
  const opened = $derived(lineOf(openLine));
  const openAsk = $derived.by((): Ask | null => {
    if (!opened) {
      return null;
    }
    const waiting = opened.outcome.asks.find((each) => each.line === openLine);
    return waiting?.ask ?? settled[opened.line.id]?.ask ?? null;
  });

  /** What the card hangs from: the opened line's row, found again whenever the bento is laid out anew. */
  let anchor = $state<HTMLElement | null>(null);
  /** The side of the row the card hangs on: the side with more room. */
  let side = $state<"left" | "right">("right");
  $effect(() => {
    track(openLine, placed);
    const found =
      openLine && root
        ? root.querySelector<HTMLElement>(`[data-line="${openLine}"]`)
        : null;
    anchor = found;
    if (found && narrow) {
      // Its sheet covers the foot: the line stands in the part above it.
      requestAnimationFrame(() => bringIntoView(found, { behavior: "smooth" }));
    }
    if (found && root) {
      const at = found.getBoundingClientRect();
      const whole = root.getBoundingClientRect();
      side =
        at.left + at.width / 2 < whole.left + whole.width / 2
          ? "right"
          : "left";
    }
  });

  const glides = placementGlide(() => true);

  function openAt(line: string) {
    openLine = line;
  }

  async function send(ask: Ask, line: string) {
    const choice = choices[ask.id];
    if (!choice) {
      return;
    }
    answers[ask.id] = { kind: "sending" };
    const reply = await onanswer(ask, choice);
    if (reply.ok) {
      settled[line] = { ask, choice };
      answers[ask.id] = { kind: "answered", choice };
      choices[ask.id] = null;
    } else {
      answers[ask.id] = { kind: "refused", sentence: reply.sentence };
    }
  }

  /** A press on a line's own open control or a Needs you control moves the card; it is no press outside it. */
  const opensAnother = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest("[data-line-open], [data-slot=needs]") !== null;
</script>

<div
  bind:this={root}
  data-slot="outcomes"
  data-testid="outcomes"
  data-view={uid}
  class="@container/view flex h-full min-h-0 min-w-0 flex-1 flex-col"
  {@attach frameSize(
    (node: HTMLElement) => ({ width: node.clientWidth }),
    (value) => {
      view = value;
    }
  )}
>
  {#if !live}
    <p
      data-slot="not-live"
      class="m-0 pb-space-3 type-label text-ink-muted {PANE_INSET}"
    >
      {outcomesWords.notLive(lastRead)}
    </p>
  {/if}
  <div
    bind:this={box}
    data-step={step}
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-space-5 @max-phone/view:pb-0 data-sheet:pb-c-line-sheet-h data-sheet:scroll-pb-c-line-sheet-h {PANE_INSET}"
    data-sheet={(narrow && opened !== null) || undefined}
    {@attach frameSize(
      (node: HTMLElement) => ({ height: node.clientHeight }),
      (value) => {
        room = value;
      }
    )}
  >
    <div
      bind:this={bento}
      class="flex flex-col gap-space-5 @max-phone/view:gap-space-2"
    >
      {#if tiles.length > 0}
        <div
          class="grid grid-cols-(--cols) items-start gap-space-5 @max-phone/view:gap-0"
          style:--cols="repeat({columns}, minmax(0, 1fr))"
        >
          {#each placed as column, index (index)}
            <div
              class="flex min-w-0 flex-col gap-space-5 @max-phone/view:gap-0"
            >
              {#each column as tile (tile.id)}
                {#if tile.kind === "outcome"}
                  <OutcomeTile
                    fold={tile.fold}
                    {live}
                    onanswer={(line) => {
                      if (line) {
                        openAt(line);
                      }
                    }}
                    onopenline={(line) => openAt(line)}
                    onopenoutcome={() => onopen("outcome", tile.outcome.id)}
                    onunfold={() => {
                      unfolded = [...unfolded, tile.outcome.id];
                    }}
                    {openLine}
                    outcome={tile.outcome}
                  />
                {:else if tile.kind === "suggestion" && record.suggestion}
                  <SuggestionTile
                    folded={tile.folded}
                    onchange={() => onopen("change-suggestion", null)}
                    ondismiss={() => onopen("dismiss-suggestion", null)}
                    onnext={() => onopen("next-suggestion", null)}
                    ontake={() => onopen("take-suggestion", null)}
                    onunfold={() => {
                      unfolded = [...unfolded, "suggestion"];
                    }}
                    suggestion={record.suggestion}
                  />
                {/if}
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      {#if hasFoot}
        <!-- The foot: what is fine, one quiet line each, in the tiles'
             columns, under a hairline when tiles stand above it. -->
        <div
          data-slot="foot"
          data-under={tiles.length > 0 || undefined}
          class="grid grid-cols-(--cols) items-start gap-x-space-5 gap-y-space-2 data-under:border-t data-under:border-border-hairline data-under:pt-space-4 @max-phone/view:gap-y-space-3 @max-phone/view:data-under:pt-space-3"
          style:--cols="repeat({columns}, minmax(0, 1fr))"
        >
          {#each metOnes as outcome (outcome.id)}
            <MetLine
              onopenline={(line) => openAt(line)}
              onopenoutcome={() => onopen("outcome", outcome.id)}
              ontoggle={() => {
                spelled = spelled.includes(outcome.id)
                  ? spelled.filter((id) => id !== outcome.id)
                  : [...spelled, outcome.id];
              }}
              {openLine}
              {outcome}
              spelled={spelled.includes(outcome.id)}
            />
          {/each}
          {#if record.unplaced}
            <PlainTile
              note={record.unplaced.holds}
              onopen={() => onopen("unplaced", null)}
            />
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#snippet card(sheet: boolean)}
  {#if opened}
    {@const ask = openAsk}
    <LineCard
      answer={ask ? (answers[ask.id] ?? { kind: "idle" }) : { kind: "idle" }}
      {ask}
      choice={ask ? (choices[ask.id] ?? null) : null}
      line={opened.line}
      {live}
      onchoose={(choice) => {
        if (ask) {
          choices[ask.id] = choice;
        }
      }}
      onclose={() => {
        openLine = null;
      }}
      onopen={(what) => onopen(what, opened.line.id)}
      onsend={() => {
        if (ask) {
          send(ask, opened.line.id);
        }
      }}
      {sheet}
    />
  {/if}
{/snippet}

{#if !narrow}
  <Popover.Root
    onOpenChange={(open) => {
      if (!open) {
        openLine = null;
      }
    }}
    open={opened !== null && anchor !== null}
  >
    <Popover.Content
      align="start"
      collisionPadding={steps.s5}
      customAnchor={anchor}
      height="available"
      onInteractOutside={(event) => {
        if (opensAnother(event.target)) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      overflow="scroll"
      pad="none"
      {side}
      sideOffset={steps.s5}
      style="--pop-w: min(var(--container-details), calc(100vw - 2 * var(--spacing-space-5)))"
      width="room"
    >
      {#snippet child({ props, wrapperProps })}
        <div {...wrapperProps} {@attach glides}>
          <div {...own(props)} data-for={uid}>
            <div class="p-space-5">{@render card(false)}</div>
          </div>
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Root>
{:else}
  <Drawer.Root
    modal={false}
    onOpenChange={(open) => {
      if (!open) {
        openLine = null;
      }
    }}
    open={opened !== null}
  >
    <!-- Over the views' bar, at most 70% of the screen, the line it opened
         scrolled into the part of the bento above it. -->
    <Drawer.Content
      height="cap"
      modal={false}
      pad="sheet-safe-bottom"
      style="--drawer-max-height: var(--spacing-c-line-sheet-h)"
      title={opened?.line.sentence ?? ""}
    >
      <div
        class="min-h-0 flex-auto overflow-y-auto overscroll-contain px-space-5 pb-space-5 {Drawer.scroller}"
        data-for={uid}
      >
        {@render card(true)}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
