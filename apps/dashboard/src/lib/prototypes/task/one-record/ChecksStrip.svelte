<script lang="ts">
  /**
   * The checks as one strip (the option's side on the open question): the
   * task's acceptance criteria, the session's own check list and the merge
   * checks the project names, each line its state's glyph in the lead
   * column, its words on the text column, and under them where it comes
   * from and, for a criterion Jev judged, how sure he was. `tally` draws
   * the same checks as marks and counts, for an entry: outcomes drawn in
   * their status colours, never said in a paragraph.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { checkGlyph, TONE_INK } from "./glyphs";
  import type { Check } from "./model";

  let { checks, tally = false }: { checks: Check[]; tally?: boolean } =
    $props();

  const ORDER = { acceptance: 0, session: 1, merge: 2 } as const;
  const sorted = $derived(
    [...checks].sort((a, b) => ORDER[a.source] - ORDER[b.source])
  );
  const counts = $derived(
    (["passed", "notShown", "toCheck", "notRun"] as const)
      .map((state) => ({
        state,
        n: checks.filter((c) => c.state === state).length,
      }))
      .filter((c) => c.n > 0)
  );
</script>

{#if tally}
  <p
    class="m-0 mark-line flex flex-wrap items-center gap-x-space-4 gap-y-space-1 type-label"
  >
    <span class="text-ink-muted">{words.checks}</span>
    {#each counts as { state, n } (state)}
      {@const mark = checkGlyph(state)}
      <span
        data-box
        class={["flex items-center gap-space-1 mark-line", TONE_INK[mark.tone]]}
      >
        <mark.glyph data-box class="size-icon-sm" aria-hidden="true" />
        <span class="num text-ink-strong">{n}</span>
        <span class="type-meta text-ink-muted">{words.checkState[state]}</span>
      </span>
    {/each}
  </p>
{:else}
  <ul class="m-0 grid list-none gap-space-3 p-0" aria-label={words.checks}>
    {#each sorted as check, i (i)}
      {@const mark = checkGlyph(check.state)}
      <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
      <li class="grid grid-cols-(--lead-cols) gap-x-space-3">
        <span class={["mark-cell type-body", TONE_INK[mark.tone]]}>
          <mark.glyph
            class="size-icon-md"
            aria-label={words.checkState[check.state]}
          />
        </span>
        <span class="grid min-w-0 gap-space-1">
          <span class="type-body text-pretty wrap-anywhere text-ink-strong"
            >{check.text}</span
          >
          <span class="type-meta text-ink-muted">
            {words.checkSource[check.source]} · {words.checkState[
              check.state
            ]}{#if check.confidence !== null}
              · <span class="num">{words.confidence(check.confidence)}</span
              >{/if}
          </span>
        </span>
      </li>
    {/each}
  </ul>
{/if}
