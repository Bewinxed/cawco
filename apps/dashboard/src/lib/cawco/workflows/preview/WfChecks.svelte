<script lang="ts" module>
  /** A check as its ledger lists it. */
  export interface CheckRow {
    sentence: string;
    /** What it is scored on, where not the whole run: a step, a node, a kept run. */
    scope?: string;
    held: number;
    judged: number;
    /** The last five runs, newest first. */
    recent: ("done" | "failed" | "neutral")[];
  }
</script>

<script lang="ts">
  /**
   * The Workflows view's Checks: the sentences a judge scores every run's
   * reports against, each with how often it held and its last five runs as
   * the routines page's status glyphs (RunStatus's vocabulary), newest
   * first. Each glyph says its run in words to a reader.
   */
  import { IconError, IconMinusCircle, IconSuccess } from "#lib/icons.js";

  let { rows }: { rows: CheckRow[] } = $props();

  const GLYPH = {
    done: IconSuccess,
    failed: IconError,
    neutral: IconMinusCircle,
  } as const;
  const WORD = { done: "held", failed: "missed", neutral: "not judged" };
  const RUN_NS = [12, 11, 10, 9, 8];
</script>

<ul class="m-0 flex list-none flex-col p-0" aria-label="Checks">
  {#each rows as row, i (row.sentence)}
    <li
      class="flex min-h-c-ledger-row-h min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1 px-space-3 py-space-2 data-ruled:border-t data-ruled:border-border-hairline"
      data-ruled={i > 0 || undefined}
    >
      <span class="flex min-w-0 flex-auto basis-c-ledger-title-min flex-col">
        <span class="type-label text-pretty text-ink-row">{row.sentence}</span>
        {#if row.scope}
          <span class="type-meta text-ink-muted">{row.scope}</span>
        {/if}
      </span>
      <span class="num flex-none type-meta text-ink-muted"
        >{row.held} of {row.judged}</span
      >
      <span
        class="flex flex-none items-center gap-space-1"
        aria-label="The last five runs"
        role="img"
      >
        {#each row.recent as state, at (RUN_NS[at])}
          {@const Glyph = GLYPH[state]}
          <Glyph
            aria-hidden="true"
            class="size-icon-sm data-done:text-status-done-glyph data-failed:text-status-fail-glyph data-neutral:text-ink-subtle"
            data-done={state === "done" || undefined}
            data-failed={state === "failed" || undefined}
            data-neutral={state === "neutral" || undefined}
          />
          <span class="sr-only">Run {RUN_NS[at]} {WORD[state]}.</span>
        {/each}
      </span>
    </li>
  {/each}
</ul>
