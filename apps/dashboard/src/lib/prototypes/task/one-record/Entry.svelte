<script lang="ts">
  /**
   * One entry of the record: one change by its actor at its clock time
   * (DESIGN.md, The Row Grid Rule: its kind's glyph centred in the 28px lead
   * column, its words on one text column after it, its clock time on one
   * trailing column in tabular figures). What it is in label, who made it
   * in meta, then what changed. The person's acts stand inside the entry
   * they answer: Approve and Deny in a session's ask, Retry in an attempt's
   * end, Send back and Pass on in a hand-in, Reopen in a drop; each pair at
   * its row's two ends with nothing between (The Peer Rule). An attempt
   * holds its own entries one step in; an older attempt folds to one line.
   *
   * It follows its props: whether its acts are live, which one is pending
   * and which question stands open come from the screen.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { taskReviewWords } from "@cawco/core/words/task-review";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import LiveDot from "#lib/components/ui/live-dot/live-dot.svelte";
  import {
    IconArtifactPage,
    IconChevronDown,
    IconChevronRight,
    IconFolderGit,
    IconTranscript,
  } from "#lib/icons.js";
  import AskInPage from "./AskInPage.svelte";
  import ChecksStrip from "./ChecksStrip.svelte";
  import { clock, minutesAgo } from "./clock";
  import EntrySelf from "./Entry.svelte";
  import { entryGlyph, TONE_INK } from "./glyphs";
  import type { Acts, Asking, Entry, Opened, Pending, TaskView } from "./model";
  import ReviewMove from "./ReviewMove.svelte";

  let {
    entry,
    now,
    view,
    pending = null,
    asking = null,
    stale = false,
    opened = null,
    folded = false,
    onopen,
    onact,
  }: {
    entry: Entry;
    /** When the task was read. */
    now: number;
    view: TaskView;
    pending?: Pending | null;
    asking?: Asking | null;
    /** The hub isn't answering: acts wait for it. */
    stale?: boolean;
    opened?: Opened | null;
    /** An older attempt, folded to one line until it is opened. */
    folded?: boolean;
    onopen: Acts["onopen"];
    onact: Acts["onact"];
  } = $props();

  const mark = $derived(entryGlyph(entry));
  /** An older attempt opened by the reader: a fold of the page's own, not a record. */
  let unfolded = $state(false);
  const showFolded = $derived(folded && !unfolded);

  /** The newest entry that needs the person: only its acts are live. */
  const live = $derived(entry.id === view.opensAt);
  const kindWord = $derived.by(() => {
    switch (entry.kind) {
      case "filed":
        return words.entry.filed;
      case "changed":
        return entry.what.startsWith("update triage")
          ? words.entry.triaged
          : words.entry.briefChanged;
      case "moved":
        return words.entry.moved;
      case "attempt":
        return entry.endedAt === null
          ? words.entry.attemptRunning
          : words.attemptLine(entry.n);
      case "ask":
        return words.entry.sessionAsks;
      case "ended":
        return words.entry.attemptEnded;
      case "handed":
        return words.entry.handedIn;
      case "refused":
        return words.entry.refused;
      case "comment":
        return words.entry.comment;
      case "landed":
        return words.entry.landed;
      case "dropped":
        return words.entry.dropped;
      default:
        return "";
    }
  });
  const resultOpen = $derived(
    opened?.what === "result" && opened.entry === entry.id
  );
  const sessionOpen = $derived(
    opened?.what === "session" && opened.entry === entry.id
  );
  /** Who takes the task up where Send back puts it (hub stages.ts `sendBackOf`). */
  const whoTakesUp = (review: NonNullable<TaskView["review"]>): string => {
    if (review.sendBackBy === "nobody") {
      return taskReviewWords.backToNobody(review.sendBack);
    }
    return review.sendBackBy === "attempt"
      ? taskReviewWords.backToAttempt
      : taskReviewWords.backToStart;
  };
  const nested = $derived(
    entry.kind === "attempt"
      ? [...entry.entries].sort((a, b) => a.at - b.at)
      : []
  );
</script>

<!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
<li
  id="entry-{entry.id}"
  data-entry={entry.id}
  data-kind={entry.kind}
  class="grid grid-cols-(--entry-cols) gap-x-space-3 gap-y-space-1 py-space-3"
>
  <span class={["mark-cell type-label", TONE_INK[mark.tone]]}>
    <mark.glyph class="size-icon-md" aria-hidden="true" />
  </span>
  <p class="m-0 flex min-w-0 flex-wrap items-baseline gap-x-space-2 type-label">
    <span class="text-ink-row">{kindWord}</span>
    {#if entry.kind === "moved"}
      <span class="text-ink-strong">{entry.from} → {entry.to}</span>
    {/if}
    <span class="min-w-0 type-meta text-ink-muted wrap-anywhere"
      >{entry.actor.name}</span
    >
  </p>
  <time
    class="type-meta text-end text-ink-muted num"
    datetime={new Date(entry.at).toISOString()}>{clock(entry.at)}</time
  >

  <div class="col-start-2 col-end-4 grid min-w-0 gap-space-2 empty:hidden">
    {#if entry.kind === "filed"}
      <p class="m-0 type-meta text-ink-muted">
        {words.inStage(entry.stage)}{#if entry.from}
          · {words.entry.filedFrom}
          <span class="text-link-ink">{entry.from}</span>{/if}
      </p>
    {:else if entry.kind === "changed"}
      <p class="m-0 type-body text-pretty text-ink-strong">{entry.what}</p>
      {#if entry.reason}
        <p class="m-0 type-meta text-pretty text-ink-muted">{entry.reason}</p>
      {/if}
    {:else if entry.kind === "moved"}
      {#if entry.reason}
        <p class="m-0 type-meta text-pretty text-ink-muted">{entry.reason}</p>
      {/if}
    {:else if entry.kind === "attempt"}
      {#if showFolded}
        <button
          type="button"
          class="mark-line flex min-w-0 items-center gap-space-2 justify-self-start rounded-xs press-tint text-start type-meta text-ink-muted hover:text-ink-strong"
          aria-expanded={false}
          aria-label={words.unfoldAttempt(entry.n)}
          onclick={() => {
            unfolded = true;
          }}
        >
          <IconChevronRight class="size-icon-sm" aria-hidden="true" />
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{entry.session.title} · {words.folded(entry.entries.length)}</span
          >
        </button>
      {:else}
        <p
          class="m-0 flex flex-wrap items-center gap-x-space-4 gap-y-space-1 type-meta text-ink-muted"
        >
          <span
            class="flex items-center gap-space-2 mark-line text-ink-strong type-label"
          >
            {#if entry.session.state === "working"}<LiveDot />{/if}
            <span class="wrap-anywhere">{entry.session.title}</span>
          </span>
          {#if entry.session.type}<span
              >{words.runsAs} {entry.session.type}</span
            >{/if}
          {#if entry.endedAt !== null}
            <span class="num">{clock(entry.at)}–{clock(entry.endedAt)}</span>
          {/if}
          {#if entry.todos && entry.todos.total > 0}
            <span class="num"
              >{words.todos(entry.todos.done, entry.todos.total)}</span
            >
          {/if}
          {#if entry.todos && entry.todos.offered > 0}
            <span>{words.todosOffered(entry.todos.offered)}</span>
          {/if}
        </p>
        <div class="flex flex-wrap items-center gap-space-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={sessionOpen}
            onclick={() => onopen({ what: "session", entry: entry.id })}
          >
            <IconTranscript data-icon="inline-start" aria-hidden="true" />
            <span>{words.openSession}</span>
          </Button>
          {#if entry.endedAt === null}
            <Button
              size="sm"
              variant="ghost"
              tone="destructive"
              disabled={stale}
            >
              <span>{words.stopAttempt}</span>
            </Button>
          {/if}
          {#if folded}
            <Button
              size="sm"
              variant="ghost"
              tone="muted"
              aria-label={words.foldAttempt(entry.n)}
              onclick={() => {
                unfolded = false;
              }}
            >
              <IconChevronDown data-icon="inline-start" aria-hidden="true" />
              <span>{words.foldAttempt(entry.n)}</span>
            </Button>
          {/if}
        </div>
        {#if nested.length > 0}
          <ol class="m-0 grid list-none p-0" in:unfold>
            {#each nested as child (child.id)}
              <EntrySelf
                entry={child}
                {now}
                {view}
                {pending}
                {asking}
                {stale}
                {opened}
                {onopen}
                {onact}
              />
            {/each}
          </ol>
        {/if}
      {/if}
    {:else if entry.kind === "ask"}
      <p class="m-0 type-body text-pretty text-ink-strong">{entry.words}</p>
      {#if entry.detail}
        <pre
          class="m-0 overflow-x-auto rounded-sm bg-code-bg p-space-3 type-code text-ink-strong whitespace-pre-wrap wrap-anywhere">{entry.detail}</pre>
      {/if}
      {#if entry.answer}
        <p class="m-0 type-meta text-ink-muted">
          {words.answered(
            entry.answer.answer === "approved" ? words.approve : words.deny,
            entry.answer.by
          )} · <span class="num">{clock(entry.answer.at)}</span>
        </p>
      {:else}
        <p class="m-0 type-meta text-ink-muted">
          {words.askAgo(minutesAgo(entry.at, now))}
        </p>
        {#if entry.notCarried}
          <p class="m-0 type-meta text-pretty text-error-11" role="alert">
            {entry.notCarried}
          </p>
        {/if}
        <div class="flex items-center justify-between gap-space-8">
          <Button
            hit="always"
            size="lg"
            variant="secondary"
            label={words.approve}
            pending={pending === "approve"}
            pendingLabel={words.approve}
            disabled={stale || pending === "deny"}
            onclick={() => onact("approve")}
          />
          <Button
            hit="always"
            size="lg"
            variant="secondary"
            label={words.deny}
            pending={pending === "deny"}
            pendingLabel={words.deny}
            disabled={stale || pending === "approve"}
            onclick={() => onact("deny")}
          />
        </div>
      {/if}
    {:else if entry.kind === "ended"}
      <p class="m-0 type-body text-pretty text-ink-strong">{entry.words}</p>
      <p class="m-0 type-meta text-ink-muted">
        {words.reportedTo(entry.reportedTo)}
      </p>
      {#if live}
        <div class="flex flex-wrap items-center gap-space-2">
          <Button
            size="sm"
            label={words.retryAttempt}
            variant="outline"
            pending={pending === "retry"}
            pendingLabel={words.retrying}
            disabled={stale}
            onclick={() => onact("retry")}
          />
        </div>
      {/if}
    {:else if entry.kind === "handed"}
      <p class="m-0 type-body text-pretty text-ink-strong max-w-c-measure">
        {entry.result.headline}
      </p>
      {#if entry.result.presented || entry.result.report}
        <button
          type="button"
          class="flex min-w-0 items-center gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 text-start shadow-tile press-tint hover:bg-surface-hover aria-expanded:border-border-control-strong"
          aria-expanded={resultOpen}
          onclick={() => onopen({ what: "result", entry: entry.id })}
        >
          <IconArtifactPage
            class="size-icon-lg flex-none text-ink-muted"
            aria-hidden="true"
          />
          <span class="grid min-w-0 flex-1">
            <span class="type-label text-ink-strong truncate"
              >{entry.result.presented?.name ?? words.result}</span
            >
            <span class="type-meta text-ink-muted">{words.openResult}</span>
          </span>
          <IconChevronRight
            class="size-icon-md flex-none text-ink-muted"
            aria-hidden="true"
          />
        </button>
      {/if}
      {#if entry.result.checks.length > 0}
        <ChecksStrip checks={entry.result.checks} tally />
      {/if}
      {#if entry.result.commits.length > 0}
        <p
          class="m-0 mark-line flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
        >
          <IconFolderGit class="size-icon-sm" aria-hidden="true" />
          {#each entry.result.commits as commit (commit.sha)}
            <code
              class="rounded-xs bg-surface-recess px-space-1 type-code text-ink-strong"
              >{commit.sha}</code
            >
          {/each}
        </p>
      {/if}
      {#if live && view.review}
        <div class="flex items-center justify-between gap-space-8 pt-space-1">
          <ReviewMove
            move="sendBack"
            look="peer"
            review={view.review}
            {pending}
            {stale}
            expanded={asking?.what === "sendBack"}
            onpress={() => onact("ask:sendBack")}
          />
          <ReviewMove
            move="passOn"
            look="peer"
            review={view.review}
            {pending}
            {stale}
            onpress={() => onact("passOn")}
          />
        </div>
        {#if asking?.what === "sendBack"}
          <AskInPage
            title={words.sendBackAsk(view.review.sendBack)}
            consequence={whoTakesUp(view.review)}
            field={words.note}
            verb={words.sendBack(view.review.sendBack)}
            pendingVerb={words.sendingBack}
            pending={pending === "sendBack"}
            onconfirm={() => onact("sendBack")}
            oncancel={() => onact("cancel")}
          />
        {/if}
      {/if}
    {:else if entry.kind === "refused"}
      <p class="m-0 type-body text-pretty text-error-11" role="alert">
        {entry.words}
      </p>
    {:else if entry.kind === "comment"}
      <p
        class="m-0 type-body text-pretty text-ink-strong whitespace-pre-line max-w-c-measure"
      >
        {entry.text}
      </p>
      {#if entry.names && "commit" in entry.names}
        <p
          class="m-0 mark-line flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
        >
          <IconFolderGit class="size-icon-sm" aria-hidden="true" />
          <span>{words.result}</span>
          <code
            class="rounded-xs bg-surface-recess px-space-1 type-code text-ink-strong"
            >{entry.names.commit}</code
          >
        </p>
      {/if}
      {#if entry.went}
        <p class="m-0 type-meta text-ink-muted">
          {entry.went.to === "session"
            ? words.reached(entry.went.session)
            : words.waitedInFile}
        </p>
      {/if}
    {:else if entry.kind === "landed"}
      <p
        class="m-0 flex flex-wrap items-center gap-space-2 type-body text-ink-strong"
      >
        <span>{entry.where}</span>
        <code
          class="rounded-xs bg-surface-recess px-space-1 type-code text-ink-strong"
          >{entry.commit}</code
        >
      </p>
    {:else if entry.kind === "dropped"}
      <p class="m-0 type-body text-pretty text-ink-strong">
        <span class="text-ink-muted">{words.closeReason}:</span>
        {entry.reason}
      </p>
      {#if live}
        <div class="flex flex-wrap items-center gap-space-2">
          <Button
            size="sm"
            variant="outline"
            label={words.reopenInto(entry.reopenInto)}
            aria-expanded={asking?.what === "reopen"}
            disabled={stale}
            onclick={() => onact("ask:reopen")}
          />
        </div>
        {#if asking?.what === "reopen"}
          <AskInPage
            title={words.reopenAsk(entry.reopenInto)}
            consequence={words.reopenConsequence}
            verb={words.reopenInto(entry.reopenInto)}
            pendingVerb={words.reopening}
            pending={pending === "reopen"}
            onconfirm={() => onact("reopen")}
            oncancel={() => onact("cancel")}
          />
        {/if}
      {/if}
    {/if}
  </div>
</li>
