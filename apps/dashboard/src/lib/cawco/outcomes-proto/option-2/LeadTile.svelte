<script lang="ts">
  /**
   * The lead tile (option 2): one outcome open whole, beside the others.
   * Its head is the outcome's sentence, said once, as its title, with More
   * (Tell Caw what to change in this outcome) and Close, which returns it
   * to its place in an even bento. `split` (the view 640 and wider): "Done
   * when:" on the left, each line with its answer and the reason under an
   * unsettled one; on the right, for the selected line, This line or The
   * agents' plan. `stack` (under 640): the ask block first, then the lines
   * with their reasons; a line's open control opens it as a page.
   */
  import AgentsPlan from "./AgentsPlan.svelte";
  import AskBlock, { type AnswerState } from "./AskBlock.svelte";
  import FaceSwitch, { type LeadFace } from "./FaceSwitch.svelte";
  import LeadHead from "./LeadHead.svelte";
  import LeadLine from "./LeadLine.svelte";
  import LineDetail from "./LineDetail.svelte";
  import type { Outcome, OutcomeLine } from "./outcomes";

  let {
    outcome,
    selected,
    face,
    form,
    tight = false,
    answers,
    offline,
    onselect,
    onface,
    onclose,
    onsend,
    onopen,
    onopenline,
  }: {
    outcome: Outcome;
    /** The selected line's id. */
    selected: string;
    face: LeadFace;
    form: "split" | "stack";
    /** The split lead is short of room (the view under 1025). */
    tight?: boolean;
    /** Each line's answer to its ask, by line id. */
    answers: Record<string, AnswerState>;
    offline: string | null;
    onselect: (line: string) => void;
    onface: (face: LeadFace) => void;
    onclose: () => void;
    onsend: (line: string, choice: string) => void;
    onopen: (what: string) => void;
    /** Under 640 a line opens as its own page. */
    onopenline: (line: string) => void;
  } = $props();

  const answerOf = (line: string): AnswerState =>
    answers[line] ?? { kind: "open" };
  const waiting = (line: OutcomeLine) =>
    line.ask !== null && answerOf(line.id).kind !== "answered";
  const chosen = $derived(
    outcome.lines.find((line) => line.id === selected) ?? outcome.lines[0]
  );
  /** The line an ask concerns, for the stacked lead's head: shown until its answer is said. */
  const asking = $derived(
    outcome.lines.find((line) => line.ask !== null) ?? null
  );
</script>

{#snippet lines(stacked: boolean)}
  <section aria-label="Done when" class="flex min-w-0 flex-col gap-space-1">
    <h3 class="type-label text-ink-muted">Done when:</h3>
    <ul class="-mx-space-2 flex min-w-0 flex-col">
      {#each outcome.lines as line (line.id)}
        <LeadLine
          brief={stacked}
          {line}
          onopen={() => (stacked ? onopenline(line.id) : onselect(line.id))}
          selected={!stacked && line.id === chosen?.id}
          waiting={waiting(line)}
        />
      {/each}
    </ul>
  </section>
{/snippet}

<article
  aria-label={outcome.sentence}
  class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile max-phone:gap-space-3 max-phone:p-space-3"
  data-slot="lead"
>
  <LeadHead
    more={[
      {
        label: "Tell Caw what to change in this outcome",
        run: () => onopen(`change:${outcome.id}`),
      },
    ]}
    {onclose}
    title={outcome.sentence}
  />

  {#if form === "split"}
    <div class="grid min-h-0 grid-cols-2 gap-space-6 max-desk:gap-space-5">
      {@render lines(false)}
      <section
        aria-label="For the selected line"
        class="flex min-h-0 min-w-0 flex-col gap-space-4"
      >
        <FaceSwitch {face} {onface} />
        {#if face === "plan"}
          <AgentsPlan {onopen} {outcome} />
        {:else if chosen}
          <LineDetail
            answer={answerOf(chosen.id)}
            line={chosen}
            {offline}
            {tight}
            {onopen}
            onsend={(choice) => onsend(chosen.id, choice)}
          />
        {/if}
      </section>
    </div>
  {:else}
    {#if asking?.ask}
      <AskBlock
        about={null}
        answer={answerOf(asking.id)}
        ask={asking.ask}
        evidence={false}
        {offline}
        onreadrun={() => onopen(`run:${asking.id}`)}
        onsend={(choice) => onsend(asking.id, choice)}
      />
    {/if}
    {@render lines(true)}
  {/if}
</article>
