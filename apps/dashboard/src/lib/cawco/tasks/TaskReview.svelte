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
      clipped = [
        ...node.querySelectorAll('[data-slot="summary"], [data-slot="check"]'),
      ].some((line) => line.scrollHeight > line.clientHeight + 1);
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
    <!-- literal: 44px -->
    <button
      data-slot="attachment"
      aria-label="Open {task.id}: {nameOf(one)}"
      class="inline-flex items-center gap-space-1 max-w-full min-h-c-btn-h-xs px-space-1 -mx-space-1 my-(--attach-my) rounded-sm type-label text-ink-muted no-underline hover:bg-surface-hover hover:text-ink-strong coarse:min-h-(--hit) coarse:my-(--attach-my-coarse) press-tint focus-inset"
      onclick={() => onopen?.(task.id)}
      style:--hit="44px"
      style:--attach-my="calc((1lh - var(--c-btn-h-xs)) / 2)"
      style:--attach-my-coarse="calc((1lh - var(--hit)) / 2)"
      title={titleOf(one)}
      type="button"
    >
      <Icon class="flex-none size-icon-sm" />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{nameOf(one)}</span
      >
    </button>
  {:else}
    <!-- literal: 44px -->
    <a
      data-slot="attachment"
      class="inline-flex items-center gap-space-1 max-w-full min-h-c-btn-h-xs px-space-1 -mx-space-1 my-(--attach-my) rounded-sm type-label text-ink-muted no-underline hover:bg-surface-hover hover:text-ink-strong coarse:min-h-(--hit) coarse:my-(--attach-my-coarse) press-tint focus-inset"
      href={hrefOf(one)}
      rel="noopener"
      style:--hit="44px"
      style:--attach-my="calc((1lh - var(--c-btn-h-xs)) / 2)"
      style:--attach-my-coarse="calc((1lh - var(--hit)) / 2)"
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

<!-- literal: minmax(0, 1fr); auto minmax(0, 1fr) auto; minmax(0, 1fr) auto; var(--c-review-words) minmax(0, 1fr); the bands' areas -->
<section
  aria-label="Review {task.id}"
  class="group flex-auto grid grid-cols-(--review-cols-one) grid-rows-(--review-rows) grid-areas-(--review-areas) @task-frame/task-frame:not-data-compact:grid-areas-(--review-areas-wide) min-h-0 border-t border-t-border-hairline data-compact:flex data-compact:flex-none data-compact:flex-col data-compact:border data-compact:border-status-attn-glyph/40 data-compact:rounded-md data-compact:bg-surface-raised data-compact:overflow-hidden @task-frame/task-frame:not-data-compact:grid-cols-(--review-cols) @task-frame/task-frame:not-data-compact:grid-rows-(--review-rows-wide)"
  data-compact={compact || undefined}
  data-words-staged={wordsStage || undefined}
  style:--review-cols-one="minmax(0, 1fr)"
  style:--review-areas={'"result" "stage" "decide"'}
  style:--review-areas-wide={'"result stage" "decide decide"'}
  style:--review-rows="auto minmax(0, 1fr) auto"
  style:--review-rows-wide="minmax(0, 1fr) auto"
  style:--review-cols="var(--c-review-words) minmax(0, 1fr)"
>
  <!-- Band 1: the session, its words, what it attached -->
  <div
    data-slot="result"
    style:--area="result"
    class="row-(--area) col-(--area) flex flex-col gap-space-2 py-space-3 px-(--pane-inline) group-data-compact:px-space-4 @task-frame/task-frame:not-data-compact:min-h-0 @task-frame/task-frame:not-data-compact:overflow-y-auto @task-frame/task-frame:not-data-compact:overscroll-contain @task-frame/task-frame:not-data-compact:border-e @task-frame/task-frame:not-data-compact:border-e-border-hairline"
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
          place={row?.cwd ?? from.instanceId}
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
    {#if summary && !wordsStage}
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
              class="flex-none ms-auto px-space-2 py-0 rounded-sm type-label text-ink-strong underline underline-offset-2 hover:bg-surface-hover hover:text-ink-strong press-tint focus-inset"
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

  <!-- Band 3: the decision, pinned -->
  {#if ended || (deciding && (approveTo || backTo))}
    <!-- literal: max(var(--space-3), env(safe-area-inset-bottom)) -->
    <div
      class="flex flex-col gap-space-2 pt-space-3 pb-(--decide-end) px-(--pane-inline) group-data-compact:px-space-4 group-data-compact:border-t group-data-compact:border-t-border-hairline row-(--area) col-(--area) @task-frame/task-frame:border-t @task-frame/task-frame:border-t-border-hairline"
      data-band="decide"
      style:--area="decide"
      style:--decide-end="max(var(--space-3), env(safe-area-inset-bottom))"
    >
      <RowFault reason={problem} />
      {#if note === null}
        <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
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
          class="flex flex-col gap-space-2"
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
          <p class="m-0 type-meta text-ink-muted" id="send-back-{task.id}-goes">
            Goes on the task as your comment.
          </p>
          <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
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
