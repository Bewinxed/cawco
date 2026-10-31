<script lang="ts">
  /**
   * Option 2, the brief: the request is one document read top to bottom.
   * The situation first, then each question as a passage where it arises:
   * its words, the recommendation, its answers in a sideways row (a stack
   * on a phone) each a head over its live frame, then the note. A question
   * an answer unlocks unfolds inside the passage under that answer,
   * indented. A margin beside the page is the ledger (a strip across the
   * top on a phone): one mark per passage, a bar for what changed since he
   * sent, a press to go there. The page ends with what goes at Send.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import Answers from "../shared/Answers.svelte";
  import { DecisionState, type Seed } from "../shared/decision.svelte";
  import { keysOn } from "../shared/keys";
  import QuestionTop from "../shared/QuestionTop.svelte";
  import type { Question } from "../shared/request";
  import SendBar from "../shared/SendBar.svelte";
  import Situation from "../shared/Situation.svelte";

  let {
    seed = {},
    height,
  }: {
    seed?: Seed;
    /** The window's height; the page scrolls inside it. */
    height: number;
  } = $props();

  const dec = new DecisionState(untrack(() => seed));
  let page = $state<HTMLElement>();
  /** The passage the keys answer: the one nearest the top of the view. */
  let inView = $state<string | null>(null);

  /** The passages at the page's own level: a question no other answer unlocks. */
  const roots = $derived(dec.questions.filter((q) => !q.after));
  /** Every passage in reading order, each unlocked one under its parent. */
  const reading = $derived(
    roots.flatMap((q) => [
      q,
      ...dec.questions.filter((one) => one.after?.question === q.id),
    ])
  );

  function goTo(id: string) {
    const passage = page?.querySelector(`#passage-${id}`);
    if (passage) {
      bringIntoView(passage, { at: "third", behavior: "smooth" });
    }
  }

  function watch(node: HTMLElement) {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inView = entry.target.id.replace("passage-", "");
          }
        }
      },
      { root: node.closest("main"), rootMargin: "0px 0px -60% 0px" }
    );
    seen.observe(node);
    return { destroy: () => seen.disconnect() };
  }

  function keys(event: KeyboardEvent) {
    dec.keys(event, dec.questions.find((q) => q.id === inView) ?? null);
  }

  const MARK = {
    open: "border-ink-muted",
    picked: "border-brand-solid bg-brand-solid",
    settled: "border-ink-muted bg-ink-muted",
    remark: "border-ink-muted",
  } as const;
</script>

{#snippet mark(q: Question)}
  <span
    class={["size-space-3 flex-none rounded-pill border", MARK[dec.stateOf(q)]]}
    data-box
  ></span>
{/snippet}

{#snippet passage(q: Question, nested: boolean)}
  <section
    id="passage-{q.id}"
    class={[
      "flex scroll-mt-space-8 flex-col gap-space-4",
      nested &&
        "ms-space-6 border-border-hairline border-s ps-space-5 @max-phone:ms-0 @max-phone:border-s-0 @max-phone:ps-0",
    ]}
    aria-label={q.question}
    use:watch
  >
    <QuestionTop {dec} question={q} level={nested ? 3 : 2} />
    <Answers {dec} question={q} layout="row" />
    {#each dec.questions.filter((one) => one.after?.question === q.id) as child (child.id)}
      {@render passage(child, true)}
    {/each}
  </section>
{/snippet}

<div
  class="@container flex h-(--proto-h) w-full flex-col overflow-clip bg-surface-page text-ink-strong"
  style:--proto-h="{height}px"
  {@attach keysOn(keys)}
>
  <SendBar {dec} />

  <nav
    class="hidden flex-none items-center gap-space-2 overflow-x-auto px-space-4 pb-space-2 @max-phone:flex"
    aria-label="Questions"
  >
    {#each reading as q, i (q.id)}
      <button
        type="button"
        class={[
          "flex h-c-btn-h-sm flex-none items-center gap-space-1 rounded-sm px-space-2 mark-line hover:bg-surface-hover",
          inView === q.id ? "text-ink-strong" : "text-ink-muted",
          dec.since.includes(q.id) && "underline",
        ]}
        aria-label="Question {i + 1}, {dec.stateOf(q)}"
        onclick={() => goTo(q.id)}
      >
        {@render mark(q)}
        <span class="type-meta tabular-nums">{i + 1}</span>
      </button>
    {/each}
  </nav>

  <div class="flex min-h-0 flex-1">
    <nav
      class="flex w-c-row-h flex-none flex-col items-center gap-space-1 pt-space-6 @max-phone:hidden @wide:w-details @wide:items-stretch @wide:px-space-3"
      aria-label="Questions"
    >
      {#each reading as q, i (q.id)}
        <button
          type="button"
          class={[
            "flex min-h-c-btn-h-sm w-full items-center gap-space-2 rounded-sm border-s-2 px-space-2 text-start mark-line hover:bg-surface-hover @max-wide:justify-center",
            dec.since.includes(q.id)
              ? "border-ink-strong"
              : "border-transparent",
            inView === q.id
              ? "bg-surface-hover text-ink-strong"
              : "text-ink-muted",
            q.after && "@wide:ps-space-5",
          ]}
          aria-label="Question {i + 1}, {dec.stateOf(q)}"
          onclick={() => goTo(q.id)}
        >
          {@render mark(q)}
          <span
            class="hidden min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta @wide:block"
          >
            {q.question}
          </span>
        </button>
      {/each}
    </nav>

    <main class="min-h-0 flex-1 overflow-auto" bind:this={page}>
      <div
        class="flex flex-col gap-space-8 px-space-5 pt-space-5 pb-space-8 @max-phone:px-space-4"
      >
        {#if dec.sinceWords}
          <Button
            size="xs"
            variant="link"
            class="self-start"
            onclick={() => goTo(dec.since[0] ?? "")}
          >
            <span>{dec.sinceWords} Show me</span>
          </Button>
        {/if}
        <Situation {dec} />
        {#each roots as q (q.id)}
          {@render passage(q, false)}
        {/each}
        <p class="type-body text-ink-muted">{dec.signOff}</p>
      </div>
    </main>
  </div>
</div>
