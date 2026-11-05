<script lang="ts">
  /**
   * What to check, at the result's foot: the session's own list, the task's
   * acceptance criteria and the project's merge checks, as one strip. Its
   * head draws the tally as marks; each line reads down one glyph column,
   * its words wrapping from one edge, and a criterion Jev judged not shown
   * met carries its score at the trailing edge.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import Inline from "./Inline.svelte";
  import { CHECK } from "./marks";
  import type { CheckLine, ResultView } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let { checks }: { checks: ResultView["checks"] } = $props();
  const uid = $props.id();

  const groups = $derived(
    [
      { name: words.checksSession, lines: checks.session },
      { name: words.checksAcceptance, lines: checks.acceptance },
      { name: words.checksMerge, lines: checks.merge },
    ].filter((group) => group.lines.length > 0)
  );

  const all = $derived(groups.flatMap((group) => group.lines));
  const count = (state: CheckLine["state"]) =>
    all.filter((line) => line.state === state).length;
  const tally = $derived(
    (["passed", "notShown", "toCheck"] as const)
      .map((state) => ({ state, count: count(state) }))
      .filter((one) => one.count > 0)
  );
</script>

<section
  aria-labelledby="{uid}-checks"
  class="flex flex-col gap-space-4 border-t border-border-hairline pt-space-5"
>
  <div class="flex flex-wrap items-baseline justify-between gap-space-3">
    <h2 class="type-label text-ink-strong" id="{uid}-checks">{words.checks}</h2>
    <p class="flex flex-wrap items-center gap-space-4">
      {#each tally as one (one.state)}
        <span class="mark-line inline-flex items-center gap-space-1">
          <StatusMark mark={CHECK[one.state]} size="sm" wordShown={false} />
          <span class="num type-meta text-ink-muted tabular-nums"
            >{one.count} {CHECK[one.state].word.toLowerCase()}</span
          >
        </span>
      {/each}
    </p>
  </div>
  {#each groups as group (group.name)}
    <div class="flex flex-col gap-space-2">
      <h3 class="type-meta text-ink-muted">{group.name}</h3>
      <ul class="flex flex-col gap-space-2">
        {#each group.lines as line, place (place)}
          <li
            class="mark-line grid grid-cols-(--check-cols) items-start gap-x-space-3"
            style:--check-cols={"var(--c-row-lead) minmax(0, 1fr) auto"}
          >
            <span data-box class="flex justify-center pt-px">
              <StatusMark mark={CHECK[line.state]} wordShown={false} />
            </span>
            <span data-box class="type-body text-pretty text-ink-strong"
              ><Inline text={line.text} /></span
            >
            {#if line.score}
              <span class="num type-meta text-ink-muted tabular-nums"
                >{line.score}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</section>
