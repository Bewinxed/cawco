<script lang="ts">
  /**
   * A task's Session tab: the session that worked it, read in place (the
   * owner's pin: "the session needs to be a tab directly vieweable"),
   * rather than a link out. What it is running now, its plan, its last
   * turns flat with the live words still arriving, and its own composer to
   * say something to it; Open puts the whole session beside the task. Its
   * state is said once, in the pane's head, so nothing here repeats it.
   * The sessions that worked it before are listed under it.
   *
   * The session is watched while the tab shows it (`watchDelegate`): its
   * frames stream here as an open tab's do, and stop when the tab goes.
   */
  import { commonWords, getToolGlance, planWords } from "@cawco/core";
  import { humanize, mcpParts } from "@cawco/core/tool-presentation";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import { IconArrowUpRight, IconTranscript } from "#lib/icons.js";
  import { smoothText } from "#lib/utils/smooth-text.svelte.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import {
    cawco,
    latestCommandFor,
    openSession,
    readTranscript,
    sendFailureNotice,
    submitCommand,
    unwatchDelegate,
    watchDelegate,
  } from "../client.svelte";
  import { failureWords } from "../hub-read";
  import { rowHref } from "../links";
  import { plainMarkdown, plainStreaming } from "../plain-markdown";
  import { planProgress } from "../plan/PlanPane.svelte";
  import PlanTree, { stepsTree, todosTree } from "../plan/PlanTree.svelte";
  import {
    attemptWord,
    readTask,
    startTask,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { sessionPlace, sessionTitle } from "../session-names.svelte";
  import type { MarkStatus } from "../TreeMark.svelte";
  import Composer from "../transcript/Composer.svelte";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import MessageRow from "../transcript/MessageRow.svelte";
  import type { Message } from "../types";
  import { openBeside } from "./beside.svelte";

  let {
    projectId,
    task,
    onchanged,
  }: {
    projectId: string;
    task: TaskView;
    /** The hub wrote the task: a session started on it. */
    onchanged: (task: TaskView) => void;
  } = $props();

  /** Its first session, asked of the hub; a refusal is said under Start, in its words. */
  let starting = $state(false);
  let startProblem = $state<string | null>(null);
  async function start() {
    starting = true;
    startProblem = null;
    try {
      await startTask(projectId, task.id);
      onchanged(await readTask(projectId, task.id));
    } catch (error) {
      startProblem = failureWords(error);
    } finally {
      starting = false;
    }
  }

  const newest = $derived(task.attempts[0] ?? null);
  const id = $derived(newest?.instanceId ?? null);
  const live = $derived(task.liveAttempt);
  const name = $derived(
    id ? (sessionTitle(id) ?? commonWords.itsSession) : commonWords.itsSession
  );

  // Watched while the tab shows it: its frames stream here.
  $effect(() => {
    const watching = id;
    if (!watching) {
      return;
    }
    untrack(() => {
      watchDelegate(watching);
      openSession(watching);
      const held = cawco.session(watching);
      if (!(held?.initialized && held.messages.length > 0)) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget — the read publishes into the store the tail reads
        void readTranscript(watching);
      }
    });
    return () => untrack(() => unwatchDelegate(watching));
  });

  const session = $derived(id ? (cawco.session(id) ?? null) : null);
  const row = $derived(id ? (cawco.instanceIndex.byId.get(id) ?? null) : null);
  const machineId = $derived(session?.machineId || row?.machineId || "");
  const tool = $derived(id && live ? cawco.currentToolOf(id) : null);
  const toolWord = (toolName: string): string =>
    humanize(mcpParts(toolName)?.tool ?? toolName);

  const plan = $derived(id ? cawco.planOf(id) : undefined);
  const progress = $derived(plan ? planProgress(plan) : null);
  const planRows = $derived(
    plan && plan.steps.length > 0 ? stepsTree(plan) : todosTree(plan)
  );

  /** How much of the conversation the tab reads: its last turns. */
  const TAIL = 10;
  const SPOKEN = new Set<Message["type"]>([
    "user",
    "user.peer",
    "assistant",
    "tool.use",
    "tool.handoff",
    "result.error",
  ]);
  const tail = $derived(
    (session?.messages ?? [])
      .filter(
        (message) =>
          SPOKEN.has(message.type) && message.content.trim().length > 0
      )
      .slice(-TAIL)
  );
  const stream = smoothText(() => session?.streaming ?? "");
  const streamed = $derived(plainStreaming(stream.text));
  const glanceOf = (message: Message): string =>
    getToolGlance(
      message.metadata?.toolInput as Record<string, unknown> | undefined
    );

  // --- saying something to it ------------------------------------------------------

  const draft = new ComposerDraft();
  /** What the Composer stands over its foot: its box holds that much room. */
  let foot = $state(0);
  const sending = $derived(
    id
      ? latestCommandFor(id, "send")?.stage === "submitted" &&
          !latestCommandFor(id, "send")?.waiting
      : false
  );
  const sendError = $derived(id ? sendFailureNotice(id) : "");

  /** Earlier sessions that worked it, newest first. */
  const earlier = $derived(task.attempts.slice(1));
  const TONE: Record<string, MarkStatus> = {
    Working: "live",
    Done: "done",
    Failed: "fail",
  };
</script>

{#if !(newest && id)}
  <!-- No session has worked it: its one action starts the first. While
       the hub can't start one, the pane's head says why and its foot
       offers Try again, so this says no more. -->
  <EmptyState
    icon={IconTranscript}
    line="A session works it in a workspace of its own, and reads it here."
    title="No session yet"
  >
    {#snippet action()}
      {#if !task.startProblem}
        <div class="flex flex-col items-start gap-space-2">
          <Button
            data-start-session
            label="Start a session"
            onclick={start}
            pending={starting}
            pendingLabel="Starting…"
            size="sm"
            variant="outline"
          />
          <RowFault reason={startProblem} />
        </div>
      {/if}
    {/snippet}
  </EmptyState>
{:else}
  <section
    aria-label="Session"
    class="flex flex-col gap-space-3"
    data-session-tab={id}
  >
    <div
      class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2"
    >
      {#if tool}
        <span
          data-slot="tool"
          class="mark-line flex min-w-0 flex-auto items-center gap-space-1 type-meta text-ink-muted"
          data-box
        >
          <span class="flex-none">{toolWord(tool.name)}</span>
          {#if tool.glance}
            <span aria-hidden="true" class="flex-none">·</span>
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-(family-name:--font-mono) liga-none"
              >{tool.glance}</span
            >
          {/if}
        </span>
      {/if}
      <Button
        class="ms-auto"
        data-box
        href={rowHref(id)}
        onclick={(event: MouseEvent) => {
          event.preventDefault();
          openBeside(id, projectId, task.id);
        }}
        size="sm"
        variant="ghost"
      >
        <span>Open</span>
        <IconArrowUpRight data-box />
      </Button>
    </div>

    {#if progress && progress.total > 0}
      <!-- What it set out to do, before what it last said about doing it. -->
      <div
        data-slot="plan"
        class="flex flex-col gap-space-1 rounded-md bg-surface-well px-space-3 py-space-2 inset-ring inset-ring-border-well"
      >
        <p class="m-0 type-label text-ink-strong">
          {planWords.plan}
          <span data-slot="num" class="num type-meta text-ink-muted"
            >{progress.done}/{progress.total}</span
          >
        </p>
        <PlanTree nodes={planRows} />
      </div>
    {/if}

    <!-- Its last turns, flat, following the newest. -->
    <div
      data-slot="tail"
      class="flex min-w-0 flex-col gap-space-3"
      {@attach followTail()}
    >
      {#if session?.loading && tail.length === 0}
        <p class="m-0 type-meta text-ink-muted">Reading…</p>
      {:else if session?.readFault && tail.length === 0}
        <!-- A read that failed is not a session with nothing to say. -->
        <p class="m-0 type-meta text-status-fail-ink">
          Couldn't read this session: {session.readFault.message}
        </p>
      {:else if tail.length === 0 && !session?.streaming}
        <p class="m-0 type-meta text-ink-muted">Nothing said yet.</p>
      {:else}
        {#each tail as message, index (message.id ?? index)}
          {#if message.type === "tool.use" || message.type === "tool.handoff"}
            <p
              class="m-0 flex min-w-0 items-baseline gap-space-1 type-meta text-ink-muted"
            >
              <span class="flex-none"
                >{toolWord(message.metadata?.toolName ?? message.content)}</span
              >
              {#if glanceOf(message)}
                <span aria-hidden="true" class="flex-none">·</span>
                <span
                  class="min-w-0 truncate font-(family-name:--font-mono) liga-none"
                  >{glanceOf(message)}</span
                >
              {/if}
            </p>
          {:else if message.type === "user"}
            <MessageRow agentName={name} {message} />
          {:else if message.type === "user.peer"}
            <p
              class="m-0 line-clamp-4 rounded-lg bg-surface-well px-space-3 py-space-2 type-body text-ink-strong wrap-anywhere whitespace-pre-wrap"
            >
              {message.content}
            </p>
          {:else if message.type === "result.error"}
            <p
              class="m-0 line-clamp-3 type-body text-status-fail-ink wrap-anywhere"
            >
              {plainMarkdown(message.content)}
            </p>
          {:else}
            <p
              class="m-0 line-clamp-6 type-body text-ink-strong wrap-anywhere whitespace-pre-wrap"
            >
              {plainMarkdown(message.content)}
            </p>
          {/if}
        {/each}
        {#if session?.streaming}
          <p
            class="m-0 type-body text-ink-strong wrap-anywhere whitespace-pre-wrap"
          >
            {streamed}
          </p>
        {/if}
      {/if}
    </div>

    {#if machineId && live}
      <!-- Its own Composer, words alone: talking to the session is this
           tab's, the decision is the pane's foot. -->
      <div
        data-slot="say"
        class="relative h-(--say-h) w-full flex-none"
        style:--say-h="calc({foot}px + var(--space-3))"
      >
        <Composer
          agentName={name}
          attach={false}
          busy={session?.busy ?? false}
          {draft}
          onfoot={(next) => {
            foot = next.stack;
          }}
          onstop={() => {
            submitCommand(id, machineId, "interrupt", {});
          }}
          onsubmit={(text, extras, commandId) =>
            submitCommand(id, machineId, "send", { text, extras }, commandId)}
          placeholder="Message {name}"
          {sendError}
          {sending}
        />
      </div>
    {/if}

    {#if earlier.length > 0}
      <!-- The sessions that worked it before this one. -->
      <ol
        data-slot="sessions"
        aria-label="Earlier sessions"
        class="m-0 flex list-none flex-col gap-space-1 p-0"
      >
        {#each earlier as attempt (attempt.workItemId)}
          {@const word = attemptWord(attempt.state)}
          <li>
            <a
              data-slot="session"
              class="mark-line press-tint focus-inset flex min-w-0 flex-wrap items-center gap-space-2 rounded-sm px-space-2 py-space-1 text-ink-strong no-underline hover:bg-surface-hover"
              href={rowHref(attempt.instanceId)}
              onclick={(event) => {
                event.preventDefault();
                openBeside(attempt.instanceId, projectId, task.id);
              }}
            >
              <SessionMark
                id={attempt.instanceId}
                place={sessionPlace(attempt.instanceId)}
                status={TONE[word] ?? "idle"}
              />
              <span
                class="min-w-0 flex-initial overflow-clip text-ellipsis whitespace-nowrap type-label"
                >{sessionTitle(attempt.instanceId) ??
                  commonWords.itsSession}</span
              >
              <span class="flex-none type-meta text-ink-muted">{word}</span>
              <time
                class="ms-auto flex-none type-meta text-ink-muted"
                datetime={new Date(
                  attempt.endedAt ?? attempt.startedAt
                ).toISOString()}
                >{formatDistanceToNow(
                  new Date(attempt.endedAt ?? attempt.startedAt)
                )}</time
              >
              {#if attempt.endedHow}
                <span class="basis-full type-meta text-ink-muted wrap-anywhere"
                  >{attempt.endedHow}</span
                >
              {/if}
            </a>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}
