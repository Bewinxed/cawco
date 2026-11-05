<script lang="ts" module>
  import type { TaskRead } from "./fixtures/types";

  /** The top block's shape, read off the task's live state on every read. */
  export type MoveShape =
    | "review"
    | "ask"
    | "stopped"
    | "done"
    | "dropped"
    | "working"
    | "waiting"
    | "ready";

  export function shapeOf(task: TaskRead): MoveShape {
    const [newest] = task.attempts;
    if (task.ask) {
      return "ask";
    }
    if (task.kind === "you") {
      return "review";
    }
    if (task.kind === "done") {
      return "done";
    }
    if (task.kind === "dropped") {
      return "dropped";
    }
    if (newest?.state === "running") {
      return "working";
    }
    if (newest?.state === "cancelled" || newest?.state === "failed") {
      return "stopped";
    }
    if (task.waits.some((wait) => !wait.settled)) {
      return "waiting";
    }
    return "ready";
  }
</script>

<script lang="ts">
  /**
   * Your move: the first block under the head, its shape chosen by the
   * task's live state. In review it holds the result drawn whole, what to
   * check, who did it, what it was built on, the note and the two moves at
   * its foot; a session's ask holds the ask's words and Approve and Deny; a
   * stopped attempt holds how it ended and Retry; done holds what landed;
   * dropped holds why, by whom and Reopen; otherwise it is one quiet line.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconArtifactPage,
    IconClose,
    IconExternal,
    IconHourglass,
    IconNotYet,
    IconStopped,
    IconSuccess,
    IconTick,
    IconTranscript,
    IconTrash,
  } from "#lib/icons.js";
  import { ago, when } from "./when";

  type Pending =
    "passOn" | "sendBack" | "drop" | "retry" | "approve" | "deny" | null;

  let {
    task,
    now,
    wide,
    note = $bindable(""),
    pending = null,
    refusal = null,
    answeredAt = null,
    sendBackTile,
    onpass,
    onsendback,
    onsession,
    onretry,
    onapprove,
    ondeny,
    onreopen,
    onwaits,
  }: {
    task: TaskRead;
    now: number;
    /** The desk's room: the checks stand in three columns. */
    wide: boolean;
    note?: string;
    /** The move the hub has not answered yet. */
    pending?: Pending;
    /** The hub's words for the move it refused or could not take. */
    refusal?: string | null;
    /** When the ask was answered, as the hub wrote it back. */
    answeredAt?: number | null;
    /** Send back's question, unfolded under the pair while it is asked. */
    sendBackTile?: Snippet;
    onpass: () => void;
    onsendback: () => void;
    onsession: () => void;
    onretry: () => void;
    onapprove: () => void;
    ondeny: () => void;
    onreopen: () => void;
    onwaits: () => void;
  } = $props();

  const uid = $props.id();
  const shape = $derived(shapeOf(task));
  const newest = $derived(task.attempts[0]);
  const unsettled = $derived(task.waits.filter((wait) => !wait.settled));
  const met = $derived(task.criteria.filter((one) => one.met === true));
  let reportOpen = $state(false);
</script>

{#snippet presented(result: NonNullable<TaskRead["result"]>)}
  {#if result.presented}
    <figure class="m-0 flex flex-col gap-space-2" data-slot="presented">
      <figcaption class="mark-line flex min-w-0 items-center gap-space-2">
        <IconArtifactPage
          aria-hidden="true"
          class="size-icon-md flex-none text-ink-muted"
        />
        <span
          class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
          >{result.presented.name}</span
        >
        <Button
          aria-label={words.move.openResult}
          href={result.presented.href}
          hit="always"
          icon={IconExternal}
          size="icon-sm"
          variant="ghost"
        />
      </figcaption>
      <div
        class="overflow-hidden rounded-md border border-border-hairline bg-surface-page"
      >
        <img
          alt={result.presented.name}
          class="block h-auto w-full"
          src={result.presented.picture}
        />
      </div>
    </figure>
  {/if}
{/snippet}

{#snippet report(result: NonNullable<TaskRead["result"]>)}
  <div class="flex flex-col gap-space-2" data-slot="report">
    <p class="m-0 type-body text-ink-strong text-pretty">{result.headline}</p>
    <Collapsible.Root bind:open={reportOpen}>
      <Collapsible.Content fade reveal>
        <pre
          class="m-0 max-w-c-measure whitespace-pre-wrap pbe-space-2 type-body text-ink-strong wrap-anywhere">{result.report}</pre>
      </Collapsible.Content>
      <Collapsible.Trigger look="fold"
        >{reportOpen
          ? words.move.hideReport
          : words.move.showReport}</Collapsible.Trigger
      >
    </Collapsible.Root>
  </div>
{/snippet}

{#snippet checks(result: NonNullable<TaskRead["result"]>)}
  <div class="flex flex-col gap-space-3" data-slot="checks">
    <h3 class="m-0 type-label text-ink-strong">{words.move.checks}</h3>
    <div class={["grid gap-space-4", wide ? "grid-cols-3" : "grid-cols-1"]}>
      <div class="flex min-w-0 flex-col gap-space-2">
        <p class="m-0 type-meta text-ink-muted">
          {words.move.sessionChecks}
        </p>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each result.check as line (line)}
            <li class="mark-line flex items-start gap-space-2">
              <span class="mark-cell"
                ><IconTick
                  aria-hidden="true"
                  class="size-icon-md text-ink-muted"
                /></span
              >
              <span class="type-body text-ink-strong wrap-anywhere">{line}</span
              >
            </li>
          {/each}
        </ul>
      </div>
      <div class="flex min-w-0 flex-col gap-space-2">
        <p class="m-0 type-meta text-ink-muted">
          {words.move.acceptance} ·
          <span class="num">{met.length}/{task.criteria.length}</span>
        </p>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each task.criteria as criterion (criterion.text)}
            <li class="mark-line flex items-start gap-space-2">
              <span class="mark-cell">
                {#if criterion.met}
                  <IconSuccess
                    aria-label={words.move.met}
                    class="size-icon-md text-status-done-glyph"
                  />
                {:else}
                  <IconNotYet
                    aria-label={words.move.notShownMet}
                    class="size-icon-md text-ink-muted"
                  />
                {/if}
              </span>
              <span class="flex min-w-0 flex-1 flex-col" data-box>
                <span class="type-body text-ink-strong text-pretty"
                  >{criterion.text}</span
                >
                {#if criterion.met === false}
                  <span class="type-meta text-ink-muted"
                    >{words.move.notShownMet}{criterion.score
                      ? ` · ${words.move.score(criterion.score)}`
                      : ""}</span
                  >
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      </div>
      <div class="flex min-w-0 flex-col gap-space-2">
        <p class="m-0 type-meta text-ink-muted">{words.move.mergeChecks}</p>
        <p class="m-0 type-body text-ink-muted text-pretty">
          {words.move.noMergeChecks}
        </p>
      </div>
    </div>
  </div>
{/snippet}

{#snippet whoDidIt(result: NonNullable<TaskRead["result"]>)}
  <div class="flex items-center gap-space-3" data-slot="who">
    <span class="grid w-c-row-mark flex-none place-items-center" data-box>
      <IconTranscript aria-hidden="true" class="size-icon-md text-ink-muted" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-space-row">
      <span class="truncate type-label text-ink-row"
        >{result.session.title}</span
      >
      <span class="type-meta text-ink-muted text-pretty"
        >{words.move.whoDidIt} · {when(result.at, now)} · {words.move.builtOn}: {words
          .move.builtOnNone}</span
      >
    </span>
    <Button
      class="flex-none"
      hit="always"
      icon={IconTranscript}
      label={words.head.openSession}
      size="sm"
      variant="ghost"
      onclick={onsession}
    />
  </div>
{/snippet}

{#snippet pair()}
  {#if task.passOn && task.sendBack}
    <div class="flex flex-col gap-space-3" data-slot="moves">
      <div class="flex flex-col gap-space-2">
        <label class="type-label text-ink-strong" for={`${uid}-move-note`}
          >{words.move.note}</label
        >
        <Textarea
          id={`${uid}-move-note`}
          placeholder={words.move.notePlaceholder}
          rows={2}
          bind:value={note}
        />
        <div class="flex items-center justify-between gap-space-3">
          <span class="type-meta text-ink-muted text-pretty"
            >{words.move.goesToFiler(task.filedBy)}</span
          >
          <Button
            class="flex-none"
            disabled={note.trim() === ""}
            label={words.move.leaveNote}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>
      <div
        class="flex items-center justify-between gap-space-8"
        data-slot="peers"
      >
        <Button
          aria-expanded={sendBackTile !== undefined}
          class="flex-none"
          hit="always"
          label={words.move.sendBack(task.sendBack.stage)}
          size="lg"
          variant="outline"
          onclick={onsendback}
        />
        <Button
          class="flex-none"
          failed={refusal !== null}
          hit="always"
          label={words.move.passOn(task.passOn)}
          pending={pending === "passOn"}
          pendingLabel={words.move.passingOn}
          size="lg"
          variant="outline"
          onclick={onpass}
        />
      </div>
      {#if sendBackTile}
        {@render sendBackTile()}
      {/if}
      {#if refusal && !sendBackTile}
        <p
          class="m-0 rounded-sm bg-status-fail-bg px-space-3 py-space-2 type-body text-status-fail-ink text-pretty"
          role="alert"
        >
          {refusal}
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet quiet(text: string, live: boolean)}
  <div
    class="mark-line flex min-w-0 items-center gap-space-2"
    data-slot="quiet"
  >
    {#if live}
      <LiveDot />
    {:else}
      <IconHourglass
        aria-hidden="true"
        class="size-icon-md flex-none text-ink-muted"
      />
    {/if}
    <span
      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-body text-ink-strong"
      >{text}</span
    >
  </div>
{/snippet}

<div class="flex flex-col gap-space-5" data-shape={shape} data-slot="your-move">
  {#if shape === "review" && task.result}
    {@render presented(task.result)}
    {@render report(task.result)}
    {@render checks(task.result)}
    {@render whoDidIt(task.result)}
    {@render pair()}
  {:else if shape === "review"}
    {@render pair()}
  {:else if shape === "ask" && task.ask}
    <div class="flex flex-col gap-space-3" data-slot="ask">
      <p
        class="m-0 flex flex-wrap items-baseline gap-x-space-2 type-label text-ink-strong"
      >
        <span>{words.move.asks(task.ask.session.title)}</span>
        <span class="type-meta text-ink-muted">{ago(task.ask.at, now)}</span>
      </p>
      <p class="m-0 type-body text-ink-strong text-pretty">{task.ask.words}</p>
      <pre
        class="m-0 overflow-x-auto rounded-sm bg-code-bg px-space-3 py-space-2 type-code text-ink-strong">{task
          .ask.detail}</pre>
      {#if answeredAt === null}
        <div
          class="flex items-center justify-between gap-space-8"
          data-slot="peers"
        >
          <Button
            class="flex-none"
            hit="always"
            icon={IconTick}
            label={words.move.approve}
            pending={pending === "approve"}
            pendingLabel={words.move.approving}
            size="sm"
            variant="secondary"
            onclick={onapprove}
          />
          <Button
            class="flex-none"
            hit="always"
            icon={IconClose}
            label={words.move.deny}
            pending={pending === "deny"}
            pendingLabel={words.move.denying}
            size="sm"
            variant="secondary"
            onclick={ondeny}
          />
        </div>
      {:else}
        <p
          class="m-0 mark-line flex items-center gap-space-2 type-meta text-ink-muted"
        >
          <IconTick
            aria-hidden="true"
            class="size-icon-sm text-status-done-glyph"
          />
          <span>{words.move.answered(when(answeredAt, now))}</span>
        </p>
      {/if}
    </div>
  {:else if shape === "stopped" && newest}
    <div class="flex flex-col gap-space-3" data-slot="stopped">
      <p
        class="m-0 mark-line flex items-center gap-space-2 type-label text-ink-strong"
      >
        <IconStopped aria-hidden="true" class="size-icon-md text-ink-muted" />
        <span>{words.move.stopped}</span>
      </p>
      <p class="m-0 type-body text-ink-strong text-pretty">
        {words.move.stoppedHow(
          newest.endedHow ?? "",
          when(newest.endedAt ?? newest.startedAt, now)
        )}
        {words.move.reportedToProject}
      </p>
      <div class="flex items-center justify-between gap-space-3">
        <Button
          hit="always"
          icon={IconTranscript}
          label={words.move.openTranscript}
          size="sm"
          variant="ghost"
          onclick={onsession}
        />
        <Button
          failed={refusal !== null}
          hit="always"
          label={words.move.retry}
          pending={pending === "retry"}
          pendingLabel={words.move.retrying}
          size="sm"
          variant="outline"
          onclick={onretry}
        />
      </div>
      {#if refusal}
        <p
          class="m-0 rounded-sm bg-status-fail-bg px-space-3 py-space-2 type-body text-status-fail-ink"
          role="alert"
        >
          {refusal}
        </p>
      {/if}
    </div>
  {:else if shape === "done" && task.result}
    <p
      class="m-0 mark-line flex flex-wrap items-center gap-x-space-2 type-label text-ink-strong"
    >
      <IconSuccess
        aria-hidden="true"
        class="size-icon-md text-status-done-glyph"
      />
      <span>{words.move.done}</span>
      {#if task.result.commit}
        <span class="type-meta text-ink-muted"
          >{words.move.landed(task.result.commit)} · {when(
            task.closedAt ?? task.result.at,
            now
          )}</span
        >
      {/if}
    </p>
    {@render presented(task.result)}
    {@render report(task.result)}
  {:else if shape === "dropped"}
    <div class="flex flex-col gap-space-3" data-slot="dropped">
      <p
        class="m-0 mark-line flex items-center gap-space-2 type-label text-ink-strong"
      >
        <IconTrash aria-hidden="true" class="size-icon-md text-ink-muted" />
        <span>{words.move.dropped}</span>
      </p>
      {#if task.closeReason}
        <p class="m-0 type-body text-ink-strong text-pretty">
          {task.closeReason}
        </p>
      {/if}
      <div class="flex items-center justify-between gap-space-3">
        <span class="type-meta text-ink-muted"
          >{words.move.droppedBy(
            task.closedBy ?? "",
            when(task.closedAt ?? now, now)
          )}</span
        >
        <Button
          class="flex-none"
          hit="always"
          label={words.move.reopen}
          size="sm"
          variant="outline"
          onclick={onreopen}
        />
      </div>
    </div>
  {:else if shape === "working" && newest}
    {@render quiet(words.move.working(newest.session.title), true)}
  {:else if shape === "waiting"}
    <button
      class="press-tint -mx-space-2 rounded-sm px-space-2 py-space-1 text-start hover:bg-surface-hover"
      type="button"
      onclick={onwaits}
    >
      {@render quiet(words.move.waitingOn(unsettled.length), false)}
    </button>
  {:else}
    {@render quiet(words.move.ready, false)}
  {/if}
</div>
