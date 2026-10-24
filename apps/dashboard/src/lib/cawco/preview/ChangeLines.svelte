<script lang="ts" module>
  /** One line of what an update changed: what it is, its words before and now, a move, its revision, how often. */
  export interface ChangeLine {
    after: string;
    /** Where pressing the line goes on the page, for a line that steps there (the rail's unasked row). */
    anchor?: string;
    before?: string;
    element: string;
    moved?: { after: string; before: string };
    revision?: number;
    times?: number;
  }
</script>

<script lang="ts">
  /**
   * What changed for one comment (the owner's pick, B: change lines in each
   * thread), as an activity log says it: one line per element,
   * `↻ <element> <before> → <after>` with its revision, under the agent's
   * reply in the thread (its card, the phone's foot sheet) and under the
   * comment's row in the rail's To check. A thing put in has no before; a
   * move says what it came after, then and now. A comment whose element
   * changed with no answer says so first and offers Ask again, which
   * delivers the comment to the session again. A line that `step`s is a
   * press that brings its spot out on the page.
   */
  import { commentWords } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";

  let {
    lines,
    unanswered = false,
    asking = false,
    onask,
    step,
    inset = "card",
  }: {
    /** One per element and revision, oldest first. */
    lines: ChangeLine[];
    /** Its element changed and the agent never answered it. */
    unanswered?: boolean;
    /** Ask again is on its way. */
    asking?: boolean;
    /** Ask again pressed; none, no Ask again. */
    onask?: () => void;
    /** Each line a press that brings its spot out. */
    step?: (anchor: string) => void;
    /** In a thread card, or under a rail row, on its words' column. */
    inset?: "card" | "rail";
  } = $props();
</script>

{#snippet said(line: ChangeLine)}
  <span class="min-w-0 flex-1 text-pretty wrap-anywhere" data-box>
    <span class="font-medium text-ink-strong">{line.element}</span>
    {#if line.moved}
      <span class="text-ink-muted"
        >{commentWords.moved(line.moved.before, line.moved.after)} ·</span
      >
    {/if}
    {#if line.before === undefined}
      <span class="text-ink-muted">{commentWords.added}</span>
    {:else if line.before !== line.after}
      <span class="sr-only">from</span>
      <span
        class="text-ink-muted line-through decoration-ink-subtle"
        data-slot="change-before">{line.before}</span
      >
      <span aria-hidden="true" class="text-ink-muted">→</span>
      <span class="sr-only">to</span>
    {/if}
    <span class="text-ink-strong" data-slot="change-after">{line.after}</span>
  </span>
  {#if line.revision !== undefined}
    <span class="flex-none text-ink-muted num" data-slot="change-revision"
      >{commentWords.revision(line.revision)}{line.times && line.times > 1
        ? ` · ${commentWords.times(line.times)}`
        : ""}</span
    >
  {/if}
{/snippet}

<!-- Under a rail row its lines stand on the row's words column: past the pill's cell and its gap. -->
<div
  class="flex min-w-0 gap-space-3 data-[inset=rail]:px-space-2 data-[inset=rail]:pb-space-2"
  data-inset={inset}
  data-slot="change-lines"
>
  {#if inset === "rail"}
    <span aria-hidden="true" class="w-c-pin flex-none"></span>
  {/if}
  <div class="flex min-w-0 flex-1 flex-col gap-space-1">
    {#if unanswered}
      <p class="m-0 text-status-attn-ink type-meta" data-slot="no-answer">
        {commentWords.changedNoAnswer}
      </p>
    {/if}
    <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each lines as line, at (`${line.element}-${line.revision}-${at}`)}
        <li class="min-w-0" data-slot="change-line">
          {#if step && line.anchor}
            {@const anchor = line.anchor}
            <button
              class="flex w-full min-w-0 items-start gap-space-1 rounded-xs border-none bg-transparent p-0 text-start type-meta mark-line can-hover:hover:bg-surface-hover"
              onclick={() => step(anchor)}
              type="button"
            >
              <span aria-hidden="true" class="mark-cell text-c-change-ring"
                ><IconRefresh class="size-icon-sm" /></span
              >
              {@render said(line)}
            </button>
          {:else}
            <span
              class="flex min-w-0 items-start gap-space-1 type-meta mark-line"
            >
              <span aria-hidden="true" class="mark-cell text-c-change-ring"
                ><IconRefresh class="size-icon-sm" /></span
              >
              {@render said(line)}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
    {#if unanswered && onask}
      <div class="flex justify-end">
        <Button
          data-slot="ask-again"
          icon={IconRefresh}
          label={commentWords.askAgain}
          onclick={onask}
          pending={asking}
          pendingLabel={commentWords.askingAgain}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  </div>
</div>
