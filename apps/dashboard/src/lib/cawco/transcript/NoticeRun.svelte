<script lang="ts">
  /**
   * CawCo's notices to the agent (core `CAWCO_NOTICE`: a leak, a carry-on,
   * a wake, a restart), drawn as CawCo's and never as the person's message:
   * a hairline across the column in the account line's place, with one line
   * set in its middle, the note glyph and what happened in plain words
   * (core words/notices.ts, written where the notice was made). A run of
   * them with no turn between is one row (rows.ts `noticeRunAt`): the
   * newest says what happened last, and "2 more" counts the rest.
   *
   * The line is a button. Open, the text the agent read hangs under it at
   * the text column, as a compaction's brief does; a run lists every notice
   * in order, each by its line with its text under it. What the reader
   * opened is kept per session by the row (`disclosureAt`), so a row the
   * list builds again comes back open. A notice the session has not read
   * yet stands at the queued presence, as a waiting send does.
   */
  import { noticeWords } from "@cawco/core/words/notices";
  import { IconChevronRight as IconChevron, IconInfo } from "#lib/icons.js";
  import MessageBody from "../MessageBody.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import type { Row } from "./rows";

  let { row }: { row: Extract<Row, { kind: "notices" }> } = $props();

  const newest = $derived(row.messages.at(-1));
  const line = $derived(newest?.metadata?.noteTitle ?? noticeWords.fallback);
  const more = $derived(row.messages.length - 1);
  const waiting = $derived(newest?.state === "pending");
  const disclosed = $derived(
    disclosureAt(row.messages[0]?.instanceId ?? "", row.key)
  );
  const open = $derived(disclosed.get());

  /**
   * The reader opened it: the transcript lets go of the tail, so the row
   * they pressed holds its place and what folds under it opens downward
   * (Transcript's `onrevealstart`), as a compaction's brief does.
   */
  function opening(event: Event): void {
    event.currentTarget?.dispatchEvent(
      new CustomEvent("revealstart", { bubbles: true })
    );
  }
</script>

<div
  data-messages={row.messages.map((one) => one.id).join(" ")}
  data-notice-run={row.messages.length}
  data-open={open || undefined}
  data-waiting={waiting || undefined}
  class="group/notice mt-space-3 mb-space-1 data-waiting:opacity-(--ghost-presence)"
>
  <button
    aria-expanded={open}
    class="select-none flex items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-none border-current rounded-xs bg-transparent type-meta text-ink-muted focus-inset touch-hit"
    onclick={() => disclosed.set(!open)}
    type="button"
  >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
    <span
      class="inline-flex items-center gap-space-2 min-w-0 whitespace-nowrap mark-line"
      ><span data-slot="mark" class="inline-flex items-center" data-box
        ><IconInfo aria-hidden="true" class="flex-none size-space-4" /></span
      >
      <span data-slot="words" class="min-w-0 overflow-clip text-ellipsis num"
        >{line}</span
      >
      {#if more > 0}
        <span data-slot="more" class="flex-none text-ink-subtle num"
          >· {noticeWords.more(more)}</span
        >
      {/if}
      <span data-slot="chev" class="inline-flex flex-none" data-box
        ><IconChevron
          aria-hidden="true"
          class="size-icon-sm group-data-open/notice:rotate-90 motion-safe:transition-[rotate] motion-safe:duration-(--dur-toggle) motion-safe:ease-in-out"
        /></span
      ></span
    >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
  </button>
  {#if open}
    <!-- What the agent read, at the text column where a brief opens: one
         notice's text, or every notice of the run in order, each by its
         line with its text under it. -->
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      onintrostart={opening}
      transition:unfold
    >
      <p data-slot="sent" class="mb-space-1 type-meta text-ink-subtle">
        {noticeWords.sent}
      </p>
      {#if row.messages.length === 1}
        <div data-slot="notice-text" class="min-w-0 wrap-anywhere">
          <MessageBody source={newest?.content ?? ""} />
        </div>
      {:else}
        <ol data-slot="notice-list" class="grid gap-space-3">
          {#each row.messages as one (one.id)}
            <li data-slot="notice" class="min-w-0">
              <span
                data-slot="words"
                class="block type-meta text-ink-muted wrap-anywhere text-pretty num"
                >{one.metadata?.noteTitle ?? noticeWords.fallback}</span
              >
              <div data-slot="notice-text" class="min-w-0 wrap-anywhere">
                <MessageBody source={one.content} />
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</div>
