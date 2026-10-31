<script lang="ts">
  /**
   * Option 1, the stage: one question fills the surface, its answers stand
   * side by side as columns at one size, each a head he presses to pick
   * over a live frame he can operate. A strip under the bar is the ledger:
   * one mark per question with its state, the brief at its start and the
   * record at its end once sent. ← and → move through the deck, 1 to 5
   * pick, Command or Control with Enter sends. On a phone one answer stands
   * in view at a time, chosen from a row under the question.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowRight } from "#lib/icons.js";
  import Answers from "../shared/Answers.svelte";
  import { DecisionState, REMARKS, type Seed } from "../shared/decision.svelte";
  import { keysOn } from "../shared/keys";
  import QuestionTop from "../shared/QuestionTop.svelte";
  import type { Question } from "../shared/request";
  import SendBar from "../shared/SendBar.svelte";
  import Situation from "../shared/Situation.svelte";

  let {
    seed = {},
    height,
    start = 0,
  }: {
    seed?: Seed;
    /** The window's height; the surface scrolls inside it. */
    height: number;
    /** The card it opens on: 0 the brief, 1 the first question. */
    start?: number;
  } = $props();

  const dec = new DecisionState(untrack(() => seed));
  let at = $state(untrack(() => start));
  let briefOpen = $state(false);

  /** The deck: the brief, each open question, the record once sent. */
  const cards = $derived([
    "brief",
    ...dec.questions.map((q) => q.id),
    ...(dec.sentAt ? ["record"] : []),
  ]);
  const card = $derived(cards[Math.min(at, cards.length - 1)]);
  const question = $derived(dec.questions.find((q) => q.id === card) ?? null);
  function go(to: number) {
    at = Math.max(0, Math.min(cards.length - 1, to));
    briefOpen = false;
  }

  function keys(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const arrow = event.key === "ArrowRight" || event.key === "ArrowLeft";
    if (
      arrow &&
      !event.defaultPrevented &&
      !target?.closest("textarea, input, [data-slot='toggle-group']")
    ) {
      event.preventDefault();
      go(at + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }
    dec.keys(event, question);
  }

  /** A strip mark's name for the screen reader: its number and its state. */
  function markName(q: Question): string {
    const n = dec.questions.indexOf(q) + 1;
    const s = dec.stateOf(q);
    if (s === "settled") {
      return `Question ${n}, settled by ${q.settled?.by}`;
    }
    if (s === "remark") {
      return `Question ${n}, ${REMARKS.find((r) => r.id === dec.remarks[q.id])?.word}`;
    }
    return `Question ${n}, ${s}`;
  }

  /** Who an answer in the record is: the settler, his, or none yet. */
  function whose(by: string | null, chosen: boolean): string {
    if (by) {
      return `Settled by ${by}`;
    }
    return chosen ? "Yours" : "Still open";
  }

  /** The mark's dot by its question's state: hollow open, coral picked, filled settled. */
  const DOT = {
    open: "border-ink-muted",
    picked: "border-brand-solid bg-brand-solid",
    settled: "border-ink-muted bg-ink-muted",
    remark: "border-ink-muted",
  } as const;
</script>

<div
  class="@container flex h-(--proto-h) w-full flex-col overflow-clip bg-surface-page text-ink-strong"
  style:--proto-h="{height}px"
  {@attach keysOn(keys)}
>
  <SendBar {dec}>
    {#snippet title()}
      <button
        type="button"
        class="flex min-w-0 rounded-sm px-space-2 py-space-1 hover:bg-surface-hover"
        aria-expanded={briefOpen}
        onclick={() => {
          briefOpen = !briefOpen;
        }}
      >
        <span
          class="type-label overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
        >
          {dec.request.title}
        </span>
      </button>
    {/snippet}
  </SendBar>

  <nav
    class="flex flex-none gap-space-1 overflow-x-auto px-space-4 pb-space-2"
    aria-label="Questions"
  >
    {#each cards as id, i (id)}
      {@const q = dec.questions.find((one) => one.id === id)}
      {@const current = i === at}
      <button
        type="button"
        class={[
          "flex h-c-btn-h-sm max-w-details items-center gap-space-2 rounded-pill border bg-surface-raised px-space-3 mark-line hover:bg-surface-hover",
          current
            ? "min-w-0 flex-initial border-border-control-strong text-ink-strong"
            : "flex-none border-border-control text-ink-muted",
          q && dec.stateOf(q) === "remark" && "line-through",
        ]}
        aria-current={current ? "step" : undefined}
        aria-label={q ? markName(q) : undefined}
        onclick={() => go(i)}
      >
        {#if q}
          <span
            class={[
              "relative size-space-3 flex-none rounded-pill border",
              DOT[dec.stateOf(q)],
            ]}
            data-box
          >
            {#if dec.since.includes(q.id)}
              <span
                class="absolute -end-space-1 -top-space-1 size-space-2 rounded-pill bg-ink-strong"
              ></span>
            {/if}
          </span>
          <span class="type-label tabular-nums"
            >{dec.questions.indexOf(q) + 1}</span
          >
          {#if current}
            <span
              class="type-label min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >
              {q.question}
            </span>
          {:else if dec.stateOf(q) === "settled"}
            <span class="type-meta">{q.settled?.by}</span>
          {/if}
        {:else}
          <span class="type-label">{id === "brief" ? "Brief" : "Record"}</span>
        {/if}
      </button>
    {/each}
  </nav>

  {#if dec.sinceWords}
    <Button
      size="xs"
      variant="link"
      class="mx-space-4 mb-space-2 self-start"
      onclick={() => go(cards.indexOf(dec.since[0] ?? "brief"))}
    >
      <span>{dec.sinceWords} Show me</span>
    </Button>
  {/if}

  <main class="relative min-h-0 flex-1 overflow-auto">
    {#if briefOpen && card !== "brief"}
      <div
        class="mx-space-4 mt-space-2 mb-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile"
      >
        <Situation {dec} />
      </div>
    {/if}
    {#if card === "brief"}
      <div
        class="flex max-w-task-frame flex-col gap-space-5 px-space-5 py-space-6"
      >
        <Situation {dec} />
        <Button class="self-end" onclick={() => go(1)}>
          <span>Start with question 1</span>
          <IconArrowRight data-icon="inline-end" />
        </Button>
      </div>
    {:else if card === "record"}
      <div
        class="flex max-w-task-frame flex-col gap-space-5 px-space-5 py-space-6"
      >
        <div class="flex flex-col gap-space-1">
          <h2 class="type-title text-ink-strong">
            What went to {dec.request.asker.name}
          </h2>
          <p class="type-meta text-ink-muted">Sent at {dec.sentAt}</p>
        </div>
        <ul class="flex flex-col gap-space-4">
          {#each dec.questions as q (q.id)}
            {@const chosen = q.answers.find((a) => a.id === dec.standing(q))}
            {@const by = dec.settledBy(q)}
            <li class="flex flex-col gap-space-1">
              <span class="type-label text-ink-strong">{q.question}</span>
              <span class="type-body text-ink-strong">
                {chosen ? chosen.name : "No pick"}
              </span>
              <span class="type-meta text-ink-muted">
                {whose(by, !!chosen)}
              </span>
              {#if dec.notes[q.id]?.trim()}
                <span class="type-body text-ink-muted"
                  >Your note: {dec.notes[q.id]}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
        <Button variant="outline" class="self-start">
          <span>Make tasks from this</span>
        </Button>
      </div>
    {:else if question}
      {@const q = question}
      <section
        class="flex flex-col gap-space-4 px-space-5 pt-space-4 pb-space-7 @max-phone:px-0"
        aria-label={q.question}
      >
        <div class="@max-phone:px-space-4">
          <QuestionTop {dec} question={q} />
        </div>
        <Answers {dec} question={q} layout="columns" />
      </section>
    {/if}
  </main>
</div>
