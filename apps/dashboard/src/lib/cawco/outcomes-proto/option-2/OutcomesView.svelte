<script lang="ts" module>
  /** Which outcome leads: an outcome's id, the work under no outcome, or none. */
  export type Lead = string | null;
  export const UNPLACED = "unplaced";
  export const SUGGESTION = "suggestion";
</script>

<script lang="ts">
  /**
   * Outcomes, option 2: the bento has a lead tile, and whatever needs him
   * is already open in it. The view's own width sets its layout (a
   * container measure, since Caw's conversation takes room beside it),
   * never the window's:
   *
   * - Wide (1025 and up): three columns. A lead spans the first two for the
   *   full height; the other outcomes stand in the third, in said order, as
   *   compact tiles.
   * - Middle (640 to 1024): the lead across both columns on top, its two
   *   inner columns side by side; compact tiles under it in two columns.
   * - Narrow (under 640): the lead first in one column, the ask before its
   *   lines; the other outcomes follow as one-line tiles. A line opens as a
   *   page over the view.
   *
   * With no lead the bento is even: every line spelled out, tiles as tall
   * as their words, each placed in order into the shortest column.
   *
   * The bento never scrolls while a Room rule step makes it fit (S11):
   * measured, not guessed. Each pass starts at the least step (3 while a
   * lead is open, 0 without) and folds one step more while the content is
   * taller than the view: the suggestion and the unplaced work to one line,
   * a met outcome's lines to "All 3 hold", lines that hold to "and 2 that
   * hold", met outcomes into one tile, and last, beside a lead, every tile
   * to one line. A tile that waits on him and an unsettled line never fold
   * while it has a line of its own. Past the last step the view scrolls.
   */
  import { tick, untrack } from "svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import type { AnswerState } from "./AskBlock.svelte";
  import type { LeadFace } from "./FaceSwitch.svelte";
  import LeadTile from "./LeadTile.svelte";
  import LinePage from "./LinePage.svelte";
  import OpenControl from "./OpenControl.svelte";
  import OutcomeTile from "./OutcomeTile.svelte";
  import {
    met,
    type Outcome,
    type RunQuestion,
    type SuggestedOutcome,
    type UnplacedRow,
    unsettled,
  } from "./outcomes";
  import SuggestionTile from "./SuggestionTile.svelte";
  import UnplacedTile from "./UnplacedTile.svelte";

  let {
    outcomes,
    suggestion,
    unplaced,
    lead,
    selected,
    face,
    linePage,
    answers,
    offline,
    onlead,
    onselect,
    onface,
    onsend,
    onopen,
    onopenline,
    ontake,
    ondismiss,
    onnext,
  }: {
    /** The project's outcomes, in the order they were said. */
    outcomes: Outcome[];
    /** Caw's one suggestion on show; null when none waits or it was settled. */
    suggestion: SuggestedOutcome | null;
    unplaced: UnplacedRow[];
    lead: Lead;
    /** The lead's selected line. */
    selected: string | null;
    face: LeadFace;
    /** Under 640, the line opened as its page. */
    linePage: string | null;
    /** Each line's answer to its ask, by line id. */
    answers: Record<string, AnswerState>;
    /** The line said above the bento while the hub is not answering, and why every act waits; null while live. */
    offline: { lastRead: string; why: string } | null;
    onlead: (lead: Lead) => void;
    onselect: (line: string) => void;
    onface: (face: LeadFace) => void;
    onsend: (line: string, choice: string) => void;
    onopen: (what: string) => void;
    onopenline: (line: string | null) => void;
    ontake: () => void;
    ondismiss: () => void;
    onnext: () => void;
  } = $props();

  // --- the view's own width ------------------------------------------------

  let root = $state<HTMLElement | null>(null);
  /**
   * Which form the view's own width asks for, read off two probes whose
   * `order` the house's container breakpoints set (one turns 1 from
   * --container-phone, the other from --container-wide; their sum is the
   * form), so the breakpoints stay the tokens'.
   */
  const FORMS = ["narrow", "middle", "wide"] as const;
  let box = $state({ height: 0, form: 0 });
  const sized = frameSize(
    (node: HTMLElement) => {
      let at = 0;
      for (const probe of node.querySelectorAll("[data-form-probe]")) {
        at += Number(getComputedStyle(probe).order);
      }
      return { height: node.clientHeight, form: at };
    },
    (read) => {
      box = read;
    }
  );
  const form = $derived(FORMS[box.form] ?? "narrow");

  // --- what waits, and what leads -----------------------------------------

  const answerOf = (line: string): AnswerState =>
    answers[line] ?? { kind: "open" };
  /** The oldest unanswered ask under an outcome. */
  const askOf = (outcome: Outcome): RunQuestion | null =>
    outcome.lines.find(
      (line) => line.ask !== null && answerOf(line.id).kind !== "answered"
    )?.ask ?? null;
  const leading = $derived(
    outcomes.find((outcome) => outcome.id === lead) ?? null
  );
  const others = $derived(outcomes.filter((outcome) => outcome.id !== lead));
  const page = $derived.by(() => {
    if (form !== "narrow" || !leading || linePage === null) {
      return null;
    }
    const line = leading.lines.find((one) => one.id === linePage);
    return line ? { outcome: leading, line } : null;
  });
  const offlineWhy = $derived(offline?.why ?? null);

  // --- the Room rule --------------------------------------------------------

  /**
   * The last step: past the option's four, every tile beside a lead reads
   * as one line, as under 640, before the view would scroll. The owner's
   * rule is that nothing sits below the fold; the option let the frame
   * scroll past step 4, and this step keeps it whole instead.
   */
  const LAST_STEP = 5;
  let fold = $state(0);
  const floor = $derived(lead === null ? 0 : 3);
  let fitting = false;
  async function fit(): Promise<void> {
    if (!root || fitting) {
      return;
    }
    fitting = true;
    let step = untrack(() => floor);
    fold = step;
    await tick();
    while (root.scrollHeight > root.clientHeight + 1 && step < LAST_STEP) {
      step += 1;
      fold = step;
      await tick();
    }
    fitting = false;
  }
  /** Everything that changes the bento's height: each change measures it again. */
  const content = $derived(
    JSON.stringify({
      lead,
      linePage,
      face,
      selected,
      suggestion: suggestion?.id ?? null,
      offline,
      outcomes: outcomes.map((outcome) => outcome.id),
      answers,
      form,
      height: box.height,
    })
  );
  $effect(() => {
    if (content) {
      untrack(() => fit());
    }
  });

  /** From step 4, met outcomes gather into one tile (S11); with a lead, those beside it. */
  const gathered = $derived(
    fold >= 4 && fold < LAST_STEP && form !== "narrow"
      ? others.filter((outcome) => met(outcome) && !askOf(outcome))
      : []
  );
  const standing = $derived(
    others.filter((outcome) => !gathered.includes(outcome))
  );

  // --- the even bento's columns ------------------------------------------

  type Piece =
    | { kind: "outcome"; outcome: Outcome }
    | { kind: "met" }
    | { kind: "suggestion" }
    | { kind: "unplaced" };

  /** How tall a piece reads, in lines: what places it into the shortest column. */
  const weigh = (piece: Piece): number => {
    switch (piece.kind) {
      case "outcome": {
        if (tileForm === "line") {
          return 1.5;
        }
        const { outcome } = piece;
        const ask = askOf(outcome) ? 3 : 0;
        const lines =
          fold >= 3
            ? outcome.lines.filter((line) => unsettled(line.answer)).length + 1
            : outcome.lines.length + 1;
        return 3 + ask + lines;
      }
      case "met":
        return 2 + gathered.length;
      case "suggestion":
        if (suggestionForm === "line") {
          return 1.5;
        }
        return suggestionForm === "full" ? 7 : 4;
      case "unplaced":
        return 1.5;
      default:
        return piece satisfies never;
    }
  };

  const pieces = $derived<Piece[]>([
    ...standing.map((outcome) => ({ kind: "outcome" as const, outcome })),
    ...(gathered.length > 0 ? [{ kind: "met" as const }] : []),
    ...(suggestion && lead !== SUGGESTION
      ? [{ kind: "suggestion" as const }]
      : []),
    ...(unplaced.length > 0 && lead !== UNPLACED
      ? [{ kind: "unplaced" as const }]
      : []),
  ]);

  /** The pieces dealt into `count` columns, each into the shortest so far, ties to the left. */
  const dealt = (count: number): Piece[][] => {
    const columns: Piece[][] = Array.from({ length: count }, () => []);
    const heights = Array.from({ length: count }, () => 0);
    for (const piece of pieces) {
      const at = heights.indexOf(Math.min(...heights));
      columns[at]?.push(piece);
      heights[at] = (heights[at] ?? 0) + weigh(piece);
    }
    return columns;
  };
  const columns = $derived.by(() => {
    if (form === "narrow") {
      return [pieces];
    }
    if (lead !== null) {
      return form === "wide" ? [pieces] : dealt(2);
    }
    return dealt(form === "wide" ? 3 : 2);
  });
  const suggestionForm = $derived.by(() => {
    if (lead === null && fold < 1) {
      return "full" as const;
    }
    return form === "narrow" ||
      fold >= LAST_STEP ||
      (form === "middle" && lead !== null)
      ? ("line" as const)
      : ("folded" as const);
  });
  const tileForm = $derived.by(() => {
    if (lead === null) {
      return "full" as const;
    }
    return form === "narrow" || fold >= LAST_STEP
      ? ("line" as const)
      : ("compact" as const);
  });
</script>

{#snippet suggestionTile(
  shown: SuggestedOutcome,
  as: "full" | "lead" | "folded" | "line"
)}
  <SuggestionTile
    form={as}
    offline={offlineWhy}
    onchange={() => onopen("suggestion:change")}
    onclose={() => onlead(null)}
    {ondismiss}
    onlead={() => onlead(SUGGESTION)}
    {onnext}
    {ontake}
    suggestion={shown}
  />
{/snippet}

{#snippet piece(one: Piece)}
  {#if one.kind === "outcome"}
    <OutcomeTile
      ask={askOf(one.outcome)}
      {fold}
      form={tileForm}
      onlead={() => onlead(one.outcome.id)}
      outcome={one.outcome}
    />
  {:else if one.kind === "met"}
    <article
      aria-label="Met, still watched"
      class="flex min-w-0 flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 shadow-tile max-phone:p-space-3"
    >
      <h2 class="type-label text-ink-muted">Met, still watched</h2>
      <ul class="flex min-w-0 flex-col gap-space-1">
        {#each gathered as outcome (outcome.id)}
          <li class="mark-line flex min-w-0 items-center gap-space-2">
            <span
              class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
              >{outcome.sentence}</span
            >
            <span data-box
              ><OpenControl
                label="Open {outcome.sentence}"
                onopen={() => onlead(outcome.id)}
              /></span
            >
          </li>
        {/each}
      </ul>
    </article>
  {:else if one.kind === "suggestion" && suggestion}
    {@render suggestionTile(suggestion, suggestionForm)}
  {:else if one.kind === "unplaced"}
    <UnplacedTile
      form="tile"
      onclose={() => onlead(null)}
      onlead={() => onlead(UNPLACED)}
      {onopen}
      rows={unplaced}
    />
  {/if}
{/snippet}

{#snippet stack(list: Piece[])}
  <div
    class={[
      "flex min-w-0 flex-col",
      tileForm === "line" ? "gap-space-2" : "gap-space-3",
    ]}
  >
    {#each list as one (one.kind === "outcome" ? one.outcome.id : one.kind)}
      {@render piece(one)}
    {/each}
  </div>
{/snippet}

<div
  bind:this={root}
  {@attach sized}
  class="@container flex h-full min-h-0 min-w-0 flex-col gap-space-3 overflow-y-auto"
  data-form={form}
  data-fold={fold}
  data-slot="outcomes"
>
  <span aria-hidden="true" class="hidden order-0 @phone:order-1" data-form-probe
  ></span>
  <span aria-hidden="true" class="hidden order-0 @wide:order-1" data-form-probe
  ></span>
  {#if offline}
    <p
      class="flex flex-none items-center gap-space-2 type-meta text-ink-muted"
      role="status"
    >
      {offline.lastRead}
      {offline.why}
    </p>
  {/if}

  {#if page}
    <LinePage
      answer={answerOf(page.line.id)}
      {face}
      line={page.line}
      offline={offlineWhy}
      onback={() => onopenline(null)}
      {onface}
      {onopen}
      onsend={(choice) => onsend(page.line.id, choice)}
      outcome={page.outcome}
    />
  {:else if lead === null}
    <div
      class={[
        "grid min-w-0 items-start gap-space-4",
        form === "wide" && "grid-cols-3",
        form === "middle" && "grid-cols-2",
      ]}
    >
      {#each columns as list, at (at)}
        {@render stack(list)}
      {/each}
    </div>
  {:else}
    <div
      class={[
        "grid min-w-0 gap-space-4",
        form === "wide" && "min-h-0 flex-1 grid-cols-3 grid-rows-1",
        form === "middle" && "grid-cols-2 items-start",
        form === "narrow" && "gap-space-3",
      ]}
    >
      <div
        class={[
          "flex min-w-0 flex-col",
          form !== "narrow" && "col-span-2",
          form === "wide" && "row-span-full min-h-0",
        ]}
      >
        {#if lead === SUGGESTION && suggestion}
          {@render suggestionTile(suggestion, "lead")}
        {:else if lead === UNPLACED}
          <UnplacedTile
            form="lead"
            onclose={() => onlead(null)}
            onlead={() => onlead(UNPLACED)}
            {onopen}
            rows={unplaced}
          />
        {:else if leading}
          <LeadTile
            {answers}
            {face}
            form={form === "narrow" ? "stack" : "split"}
            offline={offlineWhy}
            onclose={() => onlead(null)}
            {onface}
            {onopen}
            {onopenline}
            {onselect}
            {onsend}
            outcome={leading}
            selected={selected ?? ""}
            tight={form === "middle"}
          />
        {/if}
      </div>
      {#each columns as list, at (at)}
        {@render stack(list)}
      {/each}
    </div>
  {/if}
</div>
