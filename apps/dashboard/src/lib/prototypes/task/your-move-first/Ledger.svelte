<script lang="ts">
  import type { TaskHistoryKind } from "@cawco/core/task-history";
  /**
   * The task's changes as a ledger, newest first: each row reads down fixed
   * columns, the clock time in tabular figures, a glyph for its kind (moved,
   * commented, changed) whose word is its accessible name, then who and
   * what, and the reason under it. Only the words wrap, from one x. A row
   * that arrives (the person's own move, written back) unfolds into place.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { IconChat, IconPen, IconTransfer } from "#lib/icons.js";
  import type { HistoryRead } from "./fixtures/types";
  import { when } from "./when";

  /** The kinds a row draws a glyph of; every other change draws Changed's. */
  type Glyph = Extract<TaskHistoryKind, "moved" | "commented" | "changed">;

  let {
    rows,
    now,
  }: {
    /** Newest first. */
    rows: HistoryRead[];
    now: number;
  } = $props();

  function kindOf(row: HistoryRead): Glyph {
    if (row.stage) {
      return "moved";
    }
    return row.what.startsWith("comment") ? "commented" : "changed";
  }

  /** A move's words: where it was made, or from → to. */
  function moveOf(stage: NonNullable<HistoryRead["stage"]>): string {
    return stage.from === null
      ? words.history.madeIn(stage.to)
      : words.history.from(stage.from, stage.to);
  }
</script>

<ol class="m-0 flex list-none flex-col gap-space-3 p-0" data-slot="ledger">
  {#each rows as row (`${row.at}${row.what}`)}
    {@const kind = kindOf(row)}
    <li class="mark-line flex items-start gap-space-3" in:unfold>
      <time
        class="num w-c-ledger-time flex-none type-meta text-ink-muted"
        datetime={new Date(row.at).toISOString()}>{when(row.at, now)}</time
      >
      <span class="mark-cell">
        {#if kind === "moved"}
          <IconTransfer
            aria-label={words.history.kind[kind]}
            class="size-icon-md text-ink-muted"
          />
        {:else if kind === "commented"}
          <IconChat
            aria-label={words.history.kind[kind]}
            class="size-icon-md text-ink-muted"
          />
        {:else}
          <IconPen
            aria-label={words.history.kind[kind]}
            class="size-icon-md text-ink-muted"
          />
        {/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-space-row" data-box>
        <span class="type-body text-ink-strong wrap-anywhere text-pretty"
          ><span class="type-label text-ink-row">{row.actor}</span>
          {row.stage ? moveOf(row.stage) : row.what}</span
        >
        {#if row.reason}
          <span class="type-meta text-ink-muted text-pretty">{row.reason}</span>
        {/if}
      </span>
    </li>
  {/each}
</ol>
