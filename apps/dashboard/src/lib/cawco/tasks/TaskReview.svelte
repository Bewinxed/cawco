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
   * 3. The decision, pinned: the note field ("What should change"), always
   *    there, then Approve → the next stage the moves allow you, Comment,
   *    which leaves the note on the task and moves nothing, and Send back →
   *    the stage the hub names (`sendBack`), with who takes it up there
   *    under it. Approve and Send back take a written note with them. A
   *    session that failed or was stopped: Try again in Approve's place, a
   *    new session on the task.
   *
   * The result band is never empty. No session handed in a result (its
   * work landed from another session, or it waits on a decision), it says
   * what is under review instead: the commits its words say landed and its
   * description. In review, it names the cards it waits on you to answer
   * (beside it, TaskNeeds leaves them out: `decisionsNamed`).
   *
   * Two columns once the review is wide enough (the pane expanded, the
   * task's own page): the words beside the stage, unclamped.
   *
   * `compact` (a Caw thread's card, inside the task's own box): the result
   * band and the decision; what it attached, and what it presented, open
   * the task beside the conversation.
   */
  import {
    artifactName,
    commonWords,
    deliverableKind,
    type ResultArtifact,
    taskReviewWords as words,
  } from "@cawco/core";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
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
  import { artifactNamed } from "../artifact-names.svelte";
  import { cawco } from "../client.svelte";
  import { failureWords as message } from "../hub-read";
  import { idForWords, type SentWords } from "../id";
  import { rowHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import { plainMarkdown } from "../plain-markdown";
  import {
    addComment,
    approveTarget,
    decisionWait,
    folderFileHref,
    folderRawHref,
    landedOf,
    outputUrl,
    readTask,
    retryTask,
    reviewOf,
    type StagesView,
    stageLabel,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import { referenceOf } from "../references";
  import SessionMark from "../SessionMark.svelte";
  import { sessionPlace, sessionTitle } from "../session-names.svelte";
  import { sessionStatus } from "../session-status";
  import { openBeside } from "./beside.svelte";
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
  /** No session handed in a result: the task's own words say what is under review. */
  const unreported = $derived(!(ended || result));
  /** The commits its words say landed. */
  const landed = $derived(unreported ? landedOf(task) : []);
  /** The decisions it waits on you to answer, while it is in review. */
  const asked = $derived(
    task.kind === "you" ? task.waits.filter(decisionWait) : []
  );
  const described = $derived(unreported ? task.description.trim() : "");
  const summary = $derived(result?.summary || plainMarkdown(described));
  /** Its words whole (markdown): the stage's, or the wide review's column. */
  const whole = $derived(
    ended ? (newest?.result?.summary ?? "") : review?.whole || described
  );
  const check = $derived(result?.check ?? []);
  /**
   * Nothing presented: a session's words are the stage (a thread's card has
   * none). A task's own words stay in the result band, as a summary does.
   */
  const wordsStage = $derived(
    !(compact || presented || unreported) && whole.length > 0
  );

  const row = $derived(
    from ? cawco.instanceIndex.byId.get(from.instanceId) : undefined
  );
  const fromName = $derived(
    from ? (sessionTitle(from.instanceId) ?? commonWords.itsSession) : ""
  );
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
      clipped = [
        ...node.querySelectorAll('[data-slot="summary"], [data-slot="check"]'),
      ].some((line) => line.scrollHeight > line.clientHeight + 1);
    };
    // Read now, and a change in the next frame (frameObserver): More comes
    // and goes on it.
    measure();
    const observer = frameObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });

  // --- band 3: the decision ------------------------------------------------------

  const deciding = $derived(task.kind === "you");
  const approveTo = $derived(approveTarget(stages, task.stage));
  /** Where Send back puts it and who takes it up there: the hub's rule. */
  const back = $derived(deciding ? task.sendBack : null);
  const backBy = $derived.by(() => {
    switch (back?.by) {
      case "attempt":
        return words.backToAttempt;
      case "start":
        return words.backToStart;
      case "nobody":
        return words.backToNobody(stageLabel(back.stage));
      case undefined:
        return "";
    }
  });
  /** The decision's write under way, while one is. */
  let acting = $state<"approve" | "back" | "comment" | "retry" | null>(null);
  let problem = $state<string | null>(null);
  /** Your note, written before any of the decision's buttons. */
  let note = $state("");
  const noteText = $derived(note.trim());

  /** The note a write that did not go through carried, and its comment's id. */
  let noteSent: SentWords | null = null;

  /** Your note, when there is one, goes on the task as your comment; nothing moves. */
  async function leaveNote() {
    const text = noteText;
    if (!text) {
      return;
    }
    // The same note again, after a write that did not go through, is the same comment.
    noteSent = idForWords(noteSent, text);
    onchanged(await addComment(projectId, task.id, text, noteSent.id));
    noteSent = null;
    note = "";
  }

  /** One of the decision's writes; its refusal is said above the buttons. */
  async function act(
    which: NonNullable<typeof acting>,
    work: () => Promise<unknown>
  ) {
    acting = which;
    problem = null;
    try {
      await work();
    } catch (error) {
      problem = message(error);
    } finally {
      acting = null;
    }
  }

  const comment = () => act("comment", leaveNote);

  /** The note first, when written, then the task goes on. */
  const approve = () =>
    act("approve", async () => {
      if (approveTo) {
        await leaveNote();
        await onmove(approveTo.name);
      }
    });

  /** The note first, when written, then the task goes where the hub says. */
  const sendBack = () =>
    act("back", async () => {
      if (back) {
        await leaveNote();
        await onmove(back.stage);
      }
    });

  /** A new session on the task, as the board's Retry starts one (the hub's `retry`). */
  const tryAgain = () =>
    act("retry", async () => {
      await retryTask(projectId, task.id);
      onchanged(await readTask(projectId, task.id));
    });

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
    // file is its address in the project's folder (`?file=`), and a
    // picture, video or sound there is its bytes.
    if (task.outputs.includes(one.path)) {
      return outputUrl(projectId, task.id, one.path);
    }
    return ["image", "video", "audio"].includes(deliverableKind(one.path))
      ? folderRawHref(projectId, one.path)
      : folderFileHref(projectId, one.path);
  };
  /** An artifact handed in with no name of its own is named by its title, never its id. */
  const nameOf = (one: ResultArtifact): string => {
    if (one.kind === "link") {
      return `${artifactName(one)} · ${host(one.url)}`;
    }
    if (one.kind === "artifact" && !one.name) {
      return artifactNamed(one.artifactId)?.name ?? "Its page";
    }
    return artifactName(one);
  };
  const titleOf = (one: ResultArtifact): string => {
    switch (one.kind) {
      case "link":
        return one.url;
      case "artifact":
        return nameOf(one);
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
  /** The words line: its summary, unless the stage carries its words. */
  const wordsLine = $derived(summary.length > 0 && !wordsStage);
  /** The result band has something to say. */
  const banded = $derived(
    !!from ||
      wordsLine ||
      listed.length > 0 ||
      landed.length > 0 ||
      asked.length > 0
  );
</script>

{#snippet attachment(one: ResultArtifact)}
  {@const Icon = GLYPH[one.kind]}
  {#if compact}
    <button
      data-slot="attachment"
      aria-label="Open {task.id}: {nameOf(one)}"
      class="select-none inline-flex items-center gap-space-1 max-w-(--attach-max-w) min-h-c-btn-h-xs px-space-1 -mx-space-1 my-(--attach-my) rounded-sm type-label text-ink-muted no-underline hover:bg-surface-hover hover:text-ink-strong coarse:min-h-c-btn-h-lg coarse:my-(--attach-my-coarse) press-tint focus-inset"
      onclick={() => onopen?.(task.id)}
      style:--attach-my="calc((1lh - var(--c-btn-h-xs)) / 2)"
      style:--attach-my-coarse="calc((1lh - var(--c-btn-h-lg)) / 2)"
      style:--attach-max-w="calc(100% + var(--space-1) * 2)"
      title={titleOf(one)}
      type="button"
    >
      <Icon class="flex-none size-icon-sm" />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{nameOf(one)}</span
      >
    </button>
  {:else}
    <a
      data-slot="attachment"
      class="inline-flex items-center gap-space-1 max-w-(--attach-max-w) min-h-c-btn-h-xs px-space-1 -mx-space-1 my-(--attach-my) rounded-sm type-label text-ink-muted no-underline hover:bg-surface-hover hover:text-ink-strong coarse:min-h-c-btn-h-lg coarse:my-(--attach-my-coarse) press-tint focus-inset"
      href={hrefOf(one)}
      rel="noopener"
      style:--attach-my="calc((1lh - var(--c-btn-h-xs)) / 2)"
      style:--attach-my-coarse="calc((1lh - var(--c-btn-h-lg)) / 2)"
      style:--attach-max-w="calc(100% + var(--space-1) * 2)"
      target="_blank"
      title={titleOf(one)}
    >
      <Icon class="flex-none size-icon-sm" />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{nameOf(one)}</span
      >
    </a>
  {/if}
{/snippet}

{#snippet checkList()}
  {#if check.length > 0}
    <h4 class="mt-space-2 mx-0 mb-0 type-label text-ink-strong">Check</h4>
    <ul
      data-slot="check-list"
      class="m-0 ps-space-5 type-body text-ink-strong list-disc marker:text-ink-muted"
    >
      {#each check as line, index (index)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

<section
  aria-label="Review {task.id}"
  class="group flex-auto grid grid-cols-1 grid-rows-(--review-rows) grid-areas-(--review-areas) @task-frame/task-frame:not-data-compact:grid-areas-(--review-areas-wide) min-h-0 border-t border-t-border-hairline data-compact:flex data-compact:flex-none data-compact:flex-col @task-frame/task-frame:not-data-compact:grid-cols-(--review-cols) @task-frame/task-frame:not-data-compact:grid-rows-(--review-rows-wide)"
  data-compact={compact || undefined}
  data-words-staged={wordsStage || undefined}
  style:--review-areas={'"result" "stage" "decide"'}
  style:--review-areas-wide={'"result stage" "decide decide"'}
  style:--review-rows="auto minmax(0, 1fr) auto"
  style:--review-rows-wide="minmax(0, 1fr) auto"
  style:--review-cols="var(--c-review-words) minmax(0, 1fr)"
>
  <!-- Band 1: the session, its words, what it attached; with no result,
       what landed, what it waits on you to answer, its description. -->
  <div
    data-slot="result"
    style:--area="result"
    class="row-(--area) col-(--area) flex flex-col gap-space-2 py-space-3 px-(--pane-inline) group-data-compact:px-space-3 @task-frame/task-frame:not-data-compact:min-h-0 @task-frame/task-frame:not-data-compact:overflow-y-auto @task-frame/task-frame:not-data-compact:overscroll-contain @task-frame/task-frame:not-data-compact:border-e @task-frame/task-frame:not-data-compact:border-e-border-hairline"
    data-band="result"
    data-compact={compact || undefined}
  >
    {#if from}
      <div
        data-slot="session"
        class="flex items-center gap-space-2 min-w-0 mark-line"
        data-session={from.instanceId}
      >
        <SessionMark
          id={from.instanceId}
          place={sessionPlace(from.instanceId)}
          status={markStatus}
        />
        <span
          class="min-w-0 overflow-clip type-label text-ink-strong text-ellipsis whitespace-nowrap"
          >{fromName}</span
        >
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
          class="inline-flex flex-none items-center gap-space-1 ms-auto h-c-btn-h-xs px-space-2 rounded-sm type-label text-ink-strong no-underline hover:bg-surface-hover hover:text-ink-strong mark-line press-tint focus-inset"
          data-box
          href={rowHref(from.instanceId)}
          onclick={(event) => {
            event.preventDefault();
            openBeside(from.instanceId, projectId, task.id);
          }}
        >
          <span>Open</span>
          <IconArrowUpRight class="size-icon-sm" />
        </a>
      </div>
      {#if ended && newest?.endedHow}
        <p
          data-slot="ended"
          class="m-0 type-body text-ink-muted wrap-anywhere data-fail:text-status-fail-ink"
          data-fail={newest.state === "failed" || undefined}
        >
          {newest.endedHow}
        </p>
      {/if}
    {/if}
    {#if landed.length > 0}
      <p
        data-slot="landed"
        class="flex flex-wrap items-baseline gap-x-space-2 gap-y-0 m-0 type-body text-ink-strong"
      >
        <span class="type-label">{words.landed}</span>
        {#each landed as sha (sha)}
          <span class="font-(family-name:--font-mono) liga-none">{sha}</span>
        {/each}
      </p>
    {/if}
    {#if asked.length > 0}
      <div
        data-slot="asked"
        class="flex flex-wrap items-baseline gap-x-space-2 gap-y-space-1 type-body text-ink-strong"
      >
        <span class="flex-none type-label">{words.waitsOnAnswer}</span>
        <!-- A long question wraps or ends inside its chip, never past the
             card's edge at 320 wide. -->
        {#each asked as wait (wait.target)}
          {@const drawn = referenceOf(wait.href)}
          <span class="min-w-0 max-w-full wrap-anywhere">
            {#if drawn.draw === "element"}
              <drawn.element
                id={drawn.id}
                kind={drawn.kind}
                label={wait.label}
              />
            {:else}
              {wait.label}
            {/if}
          </span>
        {/each}
      </div>
    {/if}
    {#if wordsLine}
      <div
        data-slot="words"
        class="group/words flex flex-col @task-frame/task-frame:not-data-compact:hidden"
        data-compact={compact || undefined}
        data-more={more || undefined}
        bind:this={wordsBox}
      >
        <p
          data-slot="summary"
          class="m-0 type-body text-ink-strong text-pretty line-clamp-2 group-data-more/words:block"
        >
          {summary}
        </p>
        <!-- The last line: what to check, and More at its end. -->
        <div class="flex items-baseline gap-space-2">
          {#if check.length > 0}
            <p
              data-slot="check"
              class="flex-auto min-w-0 m-0 type-body text-ink-muted text-pretty line-clamp-1 group-data-more/words:block"
            >
              <span class="font-medium text-ink-strong">Check:</span>
              {check.join(" · ")}
            </p>
          {/if}
          {#if clipped || more}
            <button
              data-slot="more"
              aria-expanded={more}
              class="select-none flex-none ms-auto px-space-2 py-0 rounded-sm type-label text-ink-strong underline underline-offset-2 hover:bg-surface-hover hover:text-ink-strong press-tint focus-inset"
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
      <div
        class="hidden flex-col gap-space-2 @task-frame/task-frame:not-data-compact:flex"
        data-compact={compact || undefined}
      >
        <MessageBody source={whole} />
        {@render checkList()}
      </div>
    {/if}
    {#if listed.length > 0}
      <div class="flex flex-wrap gap-space-3" data-band-part="attachments">
        {#each listed as one, index (index)}
          {@render attachment(one)}
        {/each}
      </div>
    {/if}
    {#if !banded}
      <p data-slot="nothing" class="m-0 type-body text-ink-muted">
        {words.nothingToReview}
      </p>
    {/if}
  </div>

  <!-- Band 2: the stage, the only part that scrolls -->
  {#if !compact}
    <div
      data-slot="stage"
      style:--area="stage"
      class="row-(--area) col-(--area) flex flex-col min-h-0 py-space-3 px-(--pane-inline) group-data-compact:px-space-4 border-y border-y-border-hairline overflow-y-auto overscroll-contain data-framed:overflow-hidden @task-frame/task-frame:border-b-none"
      data-band="stage"
      data-framed={!!presented || undefined}
      id="stage-{task.id}"
    >
      {#if presented}
        <Presented {presented} />
      {:else if wordsStage}
        <div class="flex flex-col gap-space-2">
          <MessageBody source={whole} />
          {@render checkList()}
        </div>
      {:else}
        <p class="m-0 type-body text-ink-muted">
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

  <!-- Band 3: the decision, pinned: the note, always there, then the
       buttons; under them, who takes it up once it is sent back. -->
  {#if ended || deciding}
    <form
      class="flex flex-col gap-space-2 pt-space-3 pb-(--decide-end) px-(--pane-inline) group-data-compact:px-space-3 group-data-compact:border-t group-data-compact:border-t-border-hairline row-(--area) col-(--area) @task-frame/task-frame:border-t @task-frame/task-frame:border-t-border-hairline"
      data-band="decide"
      onsubmit={(event) => {
        event.preventDefault();
        comment();
      }}
      style:--area="decide"
      style:--decide-end="max(var(--space-3), env(safe-area-inset-bottom))"
    >
      {#if deciding}
        <Textarea
          aria-describedby="note-{task.id}-goes"
          aria-label={words.note}
          autocomplete="off"
          onkeydown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              comment();
            }
          }}
          placeholder={words.note}
          rows={2}
          bind:value={note}
        />
        <p class="m-0 type-meta text-ink-muted" id="note-{task.id}-goes">
          {words.noteGoes}
        </p>
      {/if}
      <RowFault reason={problem} />
      <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
        {#if ended}
          <Button
            disabled={acting !== null && acting !== "retry"}
            label={commonWords.tryAgain}
            onclick={tryAgain}
            pending={acting === "retry"}
            pendingLabel="Starting…"
            size="sm"
          />
        {:else if deciding && approveTo}
          <Button
            disabled={acting !== null && acting !== "approve"}
            label={words.approve(stageLabel(approveTo.name))}
            onclick={approve}
            pending={acting === "approve"}
            pendingLabel={words.approving}
            size="sm"
          />
        {/if}
        {#if deciding}
          <Button
            disabled={!noteText || (acting !== null && acting !== "comment")}
            label={words.comment}
            pending={acting === "comment"}
            pendingLabel={words.commenting}
            size="sm"
            type="submit"
            variant="outline"
          />
        {/if}
        {#if back}
          <Button
            aria-describedby="back-{task.id}-by"
            disabled={acting !== null && acting !== "back"}
            label={words.sendBack(stageLabel(back.stage))}
            onclick={sendBack}
            pending={acting === "back"}
            pendingLabel={words.sendingBack}
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
      {#if back}
        <p
          class="m-0 type-meta text-ink-muted text-pretty"
          id="back-{task.id}-by"
        >
          {backBy}
        </p>
      {/if}
    </form>
  {/if}
</section>
