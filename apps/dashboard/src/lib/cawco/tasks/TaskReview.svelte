<script lang="ts">
  /**
   * A task's review: what the session that worked it handed in. In the
   * task pane (its Review tab) it is the result on the pane's own surface,
   * no lines around it (the owner's pin: "what is this line above and
   * below?"): its words whole (markdown), what to check as a list, what it
   * attached (files and links, one wrapping row), then what it presented
   * (`task_result`'s primary artifact), drawn whole by the artifact panel's
   * own renderer (PreviewPane, inset), filling the room the tab has. The
   * session it is from, and how a failed or stopped one ended, stand in the
   * pane's head; the decision is the pane's foot (TaskDecide), right under
   * the review. The app never draws a file's format here.
   *
   * Two columns once the review is wide enough (the pane expanded, the
   * task's own page): the words beside what it presented.
   *
   * `compact` (a Caw thread's card): the session (its mark and title, and
   * Open ↗, which opens it with this task beside it), its words at most
   * three lines with More, what it attached, which opens the task beside
   * the conversation, and the decision (TaskDecide) as its last band.
   */
  import {
    artifactName,
    commonWords,
    deliverableKind,
    type ResultArtifact,
  } from "@cawco/core";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import {
    IconArrowUpRight,
    IconArtifactPage,
    IconDocument,
    IconFailed,
    IconLink,
  } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { rowHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import {
    folderFileHref,
    folderRawHref,
    outputUrl,
    reviewOf,
    type StagesView,
    type TaskView,
  } from "../project-tasks";
  import SessionMark from "../SessionMark.svelte";
  import { sessionPlace, sessionTitle } from "../session-names.svelte";
  import { sessionStatus } from "../session-status";
  import { openBeside } from "./beside.svelte";
  import Presented, { isPresented } from "./stage/Presented.svelte";
  import TaskDecide from "./TaskDecide.svelte";

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
    /** A thread's card: its session, no stage, its decision; what it attached opens the task. */
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
  class="group flex min-h-0 flex-auto flex-col not-data-compact:gap-y-space-3 data-compact:flex-none data-compact:overflow-hidden data-compact:rounded-md data-compact:border data-compact:border-status-attn-glyph/40 data-compact:bg-surface-raised @task-frame/task-frame:data-framed:grid @task-frame/task-frame:data-framed:grid-cols-(--review-cols) @task-frame/task-frame:data-framed:gap-x-space-5"
  data-compact={compact || undefined}
  data-framed={(!compact && !!presented) || undefined}
  style:--review-cols="var(--c-review-words) minmax(0, 1fr)"
>
  <!-- The result: its words, what to check, what it attached -->
  <div
    data-slot="result"
    class="flex min-w-0 flex-col gap-space-2 group-data-compact:px-space-4 group-data-compact:py-space-3"
    data-band="result"
  >
    {#if compact && from}
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
          <span
            class="mark-line inline-flex flex-none items-center gap-space-1 type-label data-fail:text-status-fail-ink text-ink-muted"
            data-box
            data-fail={newest.state === "failed" || undefined}
          >
            {#if newest.state === "failed"}
              <IconFailed
                aria-hidden="true"
                class="size-icon-md text-status-fail-glyph"
              />
              <span>Failed</span>
            {:else}
              <span>Stopped</span>
            {/if}
          </span>
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
    {#if compact && summary}
      <div
        data-slot="words"
        class="group/words flex flex-col"
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
    {:else if whole}
      <!-- Its words whole, what to check as the list. -->
      <div data-slot="words" class="flex flex-col gap-space-2">
        <MessageBody source={whole} />
        {@render checkList()}
      </div>
    {:else if !(compact || presented)}
      <p data-slot="nothing" class="m-0 type-body text-ink-muted">
        {#if attached.length > 0}
          Nothing presented, only its files.
        {:else if from}
          Nothing handed in.
        {:else}
          No session has worked on it.
        {/if}
      </p>
    {/if}
    {#if listed.length > 0}
      <div class="flex flex-wrap gap-space-3" data-band-part="attachments">
        {#each listed as one, index (index)}
          {@render attachment(one)}
        {/each}
      </div>
    {/if}
  </div>

  <!-- What it presented, drawn whole, filling the room the tab has -->
  {#if !compact && presented}
    <div
      data-slot="stage"
      class="flex min-h-0 flex-auto flex-col overflow-hidden"
      data-band="stage"
      id="stage-{task.id}"
    >
      <Presented {presented} />
    </div>
  {/if}

  {#if compact}
    <div
      class="border-t border-t-border-hairline px-space-4 pt-space-3 pb-space-3"
    >
      <TaskDecide {onchanged} {onmove} {projectId} {stages} {task} />
    </div>
  {/if}
</section>
