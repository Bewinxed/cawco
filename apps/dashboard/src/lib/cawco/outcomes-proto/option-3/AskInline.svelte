<script lang="ts">
  /**
   * A run's question, answered where he reads it (the owner: "why should i
   * 'answer the question' instead of the question showing directly
   * inline"): who asks and since when, the ask in the asker's own words,
   * and its two answers as peers of one size and fill (DESIGN.md, Approve
   * and Deny are peers). A press sends the answer; it is no answer until
   * the hub takes it, so the pressed one holds its pending state, and a
   * refusal stands under the answers in the hub's sentence with both
   * answers back. A taken answer is drawn by its caller: the question goes,
   * and where it stood the outcome says what his answer set going. On the
   * first view the ask leads its tile at the title size, and the run's
   * evidence is one press away, through the tile's open control, which
   * opens the outcome at this line; in the opened outcome the ask is the
   * line's: who asked stands in the line's own words above it, and its
   * evidence under it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import type { AnswerState, RunQuestion } from "./outcomes";
  import { words } from "./words";

  let {
    ask,
    answer,
    offline,
    onanswer,
    lead = false,
  }: {
    ask: RunQuestion;
    answer: AnswerState;
    /** Why no answer can go now; null while the hub answers. */
    offline: string | null;
    onanswer: (choice: string) => void;
    /** It leads an outcome's tile on the first view: the ask at the title size, its evidence one open away through the tile's open control. */
    lead?: boolean;
  } = $props();

  const sending = $derived(answer.kind === "sending" ? answer.choice : null);
</script>

{#if answer.kind !== "answered"}
  <div class="flex min-w-0 flex-col gap-space-3" data-slot="ask">
    <div class="flex min-w-0 flex-col gap-space-1">
      {#if lead}
        <p class="type-label text-status-attn-ink">
          {words.asked(ask.who, ask.since)}
        </p>
      {/if}
      <p
        class={[
          "text-ink-strong",
          lead ? "type-title text-pretty" : "type-body",
        ]}
      >
        {ask.quote}
      </p>
    </div>

    {#if !lead}
      <ul class="flex min-w-0 flex-col gap-space-1">
        {#each ask.evidence as one (one.at)}
          <li class="flex min-w-0 gap-space-3 type-meta">
            <span class="flex-none text-ink-muted tabular-nums">{one.at}</span>
            <span class="min-w-0 text-ink-row">{one.saw}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex min-w-0 flex-wrap items-center gap-space-2">
      {#each ask.choices as choice (choice)}
        <Button
          disabled={offline !== null ||
            (sending !== null && sending !== choice)}
          label={choice}
          onclick={() => onanswer(choice)}
          pending={sending === choice}
          pendingLabel={words.sending}
          size={lead ? "default" : "sm"}
          title={offline ?? undefined}
          variant="outline"
        />
      {/each}
    </div>

    {#if offline ?? (answer.kind === "refused" ? answer.why : null)}
      <p
        aria-live="assertive"
        class={[
          "type-meta",
          offline ? "text-ink-muted" : "text-status-fail-ink",
        ]}
      >
        {offline ?? (answer.kind === "refused" ? answer.why : "")}
      </p>
    {/if}
  </div>
{/if}
