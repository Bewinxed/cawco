<script lang="ts">
  /**
   * A task's review: a message from the session that worked it, then what
   * that session presented. Three fixed bands and the decision; only the
   * stage scrolls.
   * 1. The result: the session (its mark and title, and Open ↗, which opens
   *    it with this task beside it), its words at most three lines with
   *    More, the `Check:` line, and what it attached (files and links), one
   *    wrapping row. A session that failed or was stopped says so, in the
   *    hub's words.
   * 2. The stage: the artifact the session presented (`task_result`'s
   *    primary artifact), drawn whole by the artifact panel's own renderer
   *    (PreviewPane, inset). Nothing presented: its words whole, with what to
   *    check as a list. The app never draws a file's format here.
   * 3. The decision, pinned: Approve → the next stage the moves allow you,
   *    and Send back, whose note takes the bar's place with the stage still
   *    in view. A session that failed or was stopped: Try again in
   *    Approve's place, a new session on the task.
   *
   * Two columns once the review is wide enough (the pane expanded, the
   * task's own page): the words beside the stage, unclamped.
   *
   * `compact` (a Caw thread's card): the result band and the decision; what
   * it attached, and what it presented, open the task beside the
   * conversation.
   */
  import { artifactName, type ResultArtifact } from "@cawco/core";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconArrowUpRight,
    IconArtifactPage,
    IconDocument,
    IconError,
    IconLink,
  } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { failureWords as message } from "../hub-read";
  import { rowHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import {
    addComment,
    approveTarget,
    folderRawHref,
    outputUrl,
    readTask,
    retryTask,
    reviewOf,
    type StagesView,
    sendBackTarget,
    stageLabel,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { sessionStatus } from "../session-status";
  import { openBeside } from "./beside.svelte";
  import { sessionName } from "./session-name";
  import Presented, { isPresented } from "./stage/Presented.svelte";

  let {
    projectId,
    task,
    stages,
    compact = false,
    onmove,
    onchanged,
    onopen,
  }: {
    projectId: string;
    task: TaskView;
    stages: StagesView;
    /** A thread's card: no stage; what it attached opens the task. */
    compact?: boolean;
    /** Moves the task; throws the hub's refusal. */
    onmove: (stage: string) => Promise<TaskView>;
    /** The hub wrote the task. */
    onchanged: (task: TaskView) => void;
    /** Opens the task in full (`compact`). */
    onopen?: (id: string) => void;
  } = $props();

  // --- the session and what it handed in ----------------------------------------

  const newest = $derived(task.attempts[0] ?? null);
  /** The newest session failed or was stopped, and none runs since. */
  const ended = $derived(
    !!newest &&
      !task.liveAttempt &&
      (newest.state === "failed" || newest.state === "cancelled")
  );
  const review = $derived(reviewOf(task));
  /** The session the review is from: the one that ended, else the newest that handed in. */
  const from = $derived(ended ? newest : (review?.attempt ?? newest));
  const result = $derived(ended ? (newest?.result ?? null) : review?.result);
  const artifacts = $derived(result?.artifacts ?? []);
  /** What it presented: its primary artifact a stage draws, else its first. */
  const presented = $derived.by(() => {
    const shown = artifacts.filter(isPresented);
    return shown.find((one) => one.primary) ?? shown[0] ?? null;
  });
  /** What it attached: everything else it handed in. */
  const attached = $derived(artifacts.filter((one) => one !== presented));
  const summary = $derived(result?.summary ?? "");
  /** Its words whole (markdown): the stage's, or the wide review's column. */
  const whole = $derived(
    ended ? (newest?.result?.summary ?? "") : (review?.whole ?? "")
  );
  const check = $derived(result?.check ?? []);
  /** Nothing presented: its words are the stage. */
  const wordsStage = $derived(!presented && whole.length > 0);

  const row = $derived(
    from ? cawco.instanceIndex.byId.get(from.instanceId) : undefined
  );
  const fromName = $derived(from ? sessionName(from.instanceId) : "");
  const markStatus = $derived(
    ended && newest?.state === "failed" ? "fail" : sessionStatus(row, true)
  );

  // --- band 1: three lines at most, the Check line always one of them ----------

  let more = $state(false);
  let wordsBox = $state<HTMLElement | null>(null);
  let clipped = $state(false);
  $effect(() => {
    const node = wordsBox;
    if (!node) {
      return;
    }
    // Clipped: the summary past its two lines, or the check past its one.
    const measure = () => {
      clipped = [...node.querySelectorAll(".summary, .check")].some(
        (line) => line.scrollHeight > line.clientHeight + 1
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  });

  // --- band 3: the decision ------------------------------------------------------

  const deciding = $derived(task.kind === "you");
  const approveTo = $derived(approveTarget(stages, task.stage));
  const backTo = $derived(sendBackTarget(stages, task.stage));
  let approving = $state(false);
  let sending = $state(false);
  let retrying = $state(false);
  let problem = $state<string | null>(null);
  /** Send back's note while it is open; null when closed. */
  let note = $state<string | null>(null);
  let noteField = $state<HTMLTextAreaElement | null>(null);

  async function approve() {
    if (!approveTo) {
      return;
    }
    approving = true;
    problem = null;
    try {
      await onmove(approveTo.name);
    } catch (error) {
      problem = message(error);
    } finally {
      approving = false;
    }
  }

  /** A new session on the task, as the board's Retry starts one (the hub's `retry`). */
  async function tryAgain() {
    retrying = true;
    problem = null;
    try {
      await retryTask(projectId, task.id);
      onchanged(await readTask(projectId, task.id));
    } catch (error) {
      problem = message(error);
    } finally {
      retrying = false;
    }
  }

  /** Your note goes on the task as your comment, then the task goes back. */
  async function sendBack() {
    const text = note?.trim();
    if (!(backTo && text)) {
      return;
    }
    sending = true;
    problem = null;
    try {
      onchanged(await addComment(projectId, task.id, text));
      await onmove(backTo.name);
      note = null;
    } catch (error) {
      problem = message(error);
    } finally {
      sending = false;
    }
  }

  // --- what it attached ------------------------------------------------------------

  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  const hrefOf = (one: ResultArtifact): string => {
    switch (one.kind) {
      case "link":
        return one.url;
      case "artifact":
        return `/artifact/${encodeURIComponent(one.artifactId)}`;
      case "file":
      case "post":
        break;
    }
    // One of the task's outputs is where the hub copied it; any other
    // file is where it stands in the project's folder.
    return task.outputs.includes(one.path)
      ? outputUrl(projectId, task.id, one.path)
      : folderRawHref(projectId, one.path);
  };
  const nameOf = (one: ResultArtifact): string =>
    one.kind === "link"
      ? `${artifactName(one)} · ${host(one.url)}`
      : artifactName(one);
  const titleOf = (one: ResultArtifact): string => {
    switch (one.kind) {
      case "link":
        return one.url;
      case "artifact":
        return artifactName(one);
      case "file":
      case "post":
        break;
    }
    return one.path;
  };
  const GLYPH = {
    link: IconLink,
    artifact: IconArtifactPage,
    file: IconDocument,
    post: IconDocument,
  } as const;
  /** In a thread's card, what it presented is named among what it attached. */
  const listed = $derived(
    compact && presented ? [presented, ...attached] : attached
  );
</script>

{#snippet attachment(one: ResultArtifact)}
  {@const Icon = GLYPH[one.kind]}
  {#if compact}
    <button
      aria-label="Open {task.id}: {nameOf(one)}"
      class="attachment press-tint focus-inset"
      onclick={() => onopen?.(task.id)}
      title={titleOf(one)}
      type="button"
    >
      <Icon class="attachment-glyph" />
      <span class="attachment-name">{nameOf(one)}</span>
    </button>
  {:else}
    <a
      class="attachment press-tint focus-inset"
      href={hrefOf(one)}
      rel="noopener"
      target="_blank"
      title={titleOf(one)}
    >
      <Icon class="attachment-glyph" />
      <span class="attachment-name">{nameOf(one)}</span>
    </a>
  {/if}
{/snippet}

{#snippet checkList()}
  {#if check.length > 0}
    <h4 class="check-head">Check</h4>
    <ul class="check-list">
      {#each check as line, index (index)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

<section
  aria-label="Review {task.id}"
  class="review"
  class:compact
  class:words-staged={wordsStage}
>
  <!-- Band 1: the session, its words, what it attached -->
  <div class="band result" data-band="result">
    {#if from}
      <div class="session mark-line" data-session={from.instanceId}>
        <SessionMark
          id={from.instanceId}
          place={row?.cwd ?? from.instanceId}
          status={markStatus}
        />
        <span class="session-name">{fromName}</span>
        {#if ended && newest}
          {#if newest.state === "failed"}
            <Badge data-box variant="fail"
              ><IconError /><span>Failed</span></Badge
            >
          {:else}
            <Badge data-box variant="secondary"><span>Stopped</span></Badge>
          {/if}
        {/if}
        <a
          aria-label="Open its session beside this task"
          class="open mark-line press-tint focus-inset"
          data-box
          href={rowHref(from.instanceId)}
          onclick={(event) => {
            event.preventDefault();
            openBeside(from.instanceId, projectId, task.id);
          }}
        >
          <span>Open</span>
          <IconArrowUpRight class="open-glyph" />
        </a>
      </div>
      {#if ended && newest?.endedHow}
        <p class="ended" class:fail={newest.state === "failed"}>
          {newest.endedHow}
        </p>
      {/if}
    {/if}
    {#if summary && !wordsStage}
      <div class="words" bind:this={wordsBox} class:open={more}>
        <p class="summary">{summary}</p>
        <!-- The last line: what to check, and More at its end. -->
        <div class="tail">
          {#if check.length > 0}
            <p class="check">
              <span class="check-label">Check:</span>
              {check.join(" · ")}
            </p>
          {/if}
          {#if clipped || more}
            <button
              aria-expanded={more}
              class="more press-tint focus-inset"
              onclick={() => {
                more = !more;
              }}
              type="button"
            >
              {more ? "Less" : "More"}
            </button>
          {/if}
        </div>
      </div>
      <!-- Two columns: the words whole, what to check as the list. -->
      <div class="words-whole">
        <MessageBody source={whole} />
        {@render checkList()}
      </div>
    {/if}
    {#if listed.length > 0}
      <div class="attachments" data-band-part="attachments">
        {#each listed as one, index (index)}
          {@render attachment(one)}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Band 2: the stage, the only part that scrolls -->
  {#if !compact}
    <div
      class="band stage"
      class:framed={!!presented}
      data-band="stage"
      id="stage-{task.id}"
    >
      {#if presented}
        <Presented {presented} />
      {:else if wordsStage}
        <div class="stage-words">
          <MessageBody source={whole} />
          {@render checkList()}
        </div>
      {:else}
        <p class="none">
          {#if attached.length > 0}
            Nothing presented, only its files.
          {:else if from}
            Nothing handed in.
          {:else}
            No session has worked on it.
          {/if}
        </p>
      {/if}
    </div>
  {/if}

  <!-- Band 3: the decision, pinned -->
  {#if ended || (deciding && (approveTo || backTo))}
    <div class="band decide" data-band="decide">
      <RowFault reason={problem} />
      {#if note === null}
        <div class="acts">
          {#if ended}
            <Button
              label="Try again"
              onclick={tryAgain}
              pending={retrying}
              pendingLabel="Starting…"
              size="sm"
            />
          {:else if deciding && approveTo}
            <Button
              label="Approve → {stageLabel(approveTo.name)}"
              onclick={approve}
              pending={approving}
              pendingLabel="Approving…"
              size="sm"
            />
          {/if}
          {#if deciding && backTo}
            <Button
              disabled={approving || retrying}
              label="Send back"
              onclick={() => {
                note = "";
                requestAnimationFrame(() => noteField?.focus());
              }}
              size="sm"
              variant="outline"
            />
          {/if}
        </div>
      {:else if backTo}
        <form
          class="send-back"
          onsubmit={(event) => {
            event.preventDefault();
            sendBack();
          }}
        >
          <Textarea
            aria-describedby="send-back-{task.id}-goes"
            aria-label="What should change"
            autocomplete="off"
            onkeydown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                note = null;
              } else if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                sendBack();
              }
            }}
            placeholder="What should change"
            rows={2}
            bind:ref={noteField}
            bind:value={note}
          />
          <p class="send-goes" id="send-back-{task.id}-goes">
            Goes on the task as your comment.
          </p>
          <div class="acts">
            <Button
              disabled={!note.trim()}
              label="Send back → {stageLabel(backTo.name)}"
              pending={sending}
              pendingLabel="Sending back…"
              size="sm"
              type="submit"
            />
            <Button
              disabled={sending}
              label="Cancel"
              onclick={() => {
                note = null;
              }}
              size="sm"
              variant="ghost"
            />
          </div>
        </form>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Bands in one fixed frame: only the stage scrolls. */
  .review {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: "result" "stage" "decide";
    min-block-size: 0;
    border-block-start: 1px solid var(--border-hairline);
  }
  .review.compact {
    display: flex;
    flex: none;
    flex-direction: column;
    border: 1px solid
      color-mix(in oklab, var(--status-attn-glyph) 40%, transparent);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    overflow: hidden;
  }
  /* The bands share the pane's inline padding (TaskPane `--pane-inline`). */
  .band {
    padding-inline: var(--pane-inline);
  }
  .compact .band {
    padding-inline: var(--space-4);
  }

  /* Band 1 */
  .result {
    grid-area: result;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-3);
  }
  .session {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .session-name {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
    block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .open :global(.open-glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .ended {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .ended.fail {
    color: var(--status-fail-ink);
  }
  /* Three lines at most until More: two of the summary, then one of what to
     check, so the check is never the line clipped away. */
  .words {
    display: flex;
    flex-direction: column;
  }
  .summary,
  .check {
    margin: 0;
    overflow: hidden;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    display: -webkit-box;
    -webkit-box-orient: vertical;
  }
  .summary {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .check {
    flex: 1 1 auto;
    min-inline-size: 0;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    color: var(--ink-muted);
  }
  .words.open .summary,
  .words.open .check {
    display: block;
  }
  .tail {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .check-label {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* More stands at the end of the last line. */
  .more {
    flex: none;
    margin-inline-start: auto;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* The words whole stand only in two columns. */
  .words-whole {
    display: none;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* What it attached: one wrapping row, no heading. */
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .attachment {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    min-block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-1);
    margin-inline: calc(var(--space-1) * -1);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-muted);
    text-decoration: none;
  }
  .attachment :global(.attachment-glyph) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .attachment-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (pointer: coarse) {
    .attachment {
      min-block-size: 44px;
    }
  }

  /* Band 2: the stage */
  .stage {
    grid-area: stage;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    padding-block: var(--space-3);
    border-block: 1px solid var(--border-hairline);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* A presented artifact fills the stage; its page scrolls inside its frame. */
  .stage.framed {
    overflow: hidden;
  }
  .stage-words {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .check-head {
    margin: var(--space-2) 0 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .check-list {
    margin: 0;
    padding-inline-start: var(--space-5);
    font: var(--type-body);
    color: var(--ink-strong);
    list-style: disc;
  }
  .check-list li::marker {
    color: var(--ink-muted);
  }
  .none {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }

  /* Band 3: the decision, pinned at the foot */
  .decide {
    grid-area: decide;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-3);
    padding-block-end: max(var(--space-3), env(safe-area-inset-bottom));
  }
  .compact .decide {
    border-block-start: 1px solid var(--border-hairline);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .send-back {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .send-goes {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .more:hover,
    .open:hover,
    .attachment:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }

  /* Wide enough for two columns (the pane expanded, the task's own page):
     the words whole beside the stage, the decision under both. */
  @container task-frame (min-width: 56rem) {
    .review:not(.compact) {
      grid-template-columns: var(--c-review-words) minmax(0, 1fr);
      grid-template-areas: "result stage" "decide decide";
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .review:not(.compact) .result {
      min-block-size: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      border-inline-end: 1px solid var(--border-hairline);
    }
    .review:not(.compact) .words {
      display: none;
    }
    .review:not(.compact) .words-whole {
      display: flex;
    }
    .review:not(.compact) .stage {
      border-block-end: 0;
    }
    .review:not(.compact) .decide {
      border-block-start: 1px solid var(--border-hairline);
    }
  }
</style>
