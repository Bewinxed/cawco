<script lang="ts" module>
  import { cawco, readThread } from "./client.svelte";
  import { threadIdOf } from "./thread-tabs";
  import { runIdOf } from "./workflow-runs";
  import { workflowState } from "./workflow-state.svelte";

  /** The session of a run's running step, whose tail is the run's live tail. */
  export function runningStep(id: string): string | null {
    const runId = runIdOf(id);
    if (!runId) {
      return null;
    }
    return (
      workflowState.details[runId]?.steps.find(
        (step) => step.status === "running" && step.instanceId
      )?.instanceId ?? null
    );
  }

  /**
   * The session whose live tail a card draws: a run's running step, the
   * session itself, and none for a thread, whose card is its newest line.
   */
  export const tailOf = (id: string | null): string | null => {
    if (!id || threadIdOf(id)) {
      return null;
    }
    return runIdOf(id) ? runningStep(id) : id;
  };

  /** A thread's card reads its messages, so it opens on its newest line. */
  export function readThreadCard(threadId: string): void {
    const thread = cawco.threadOf(`thread:${threadId}`);
    if (!thread) {
      return;
    }
    if (!cawco.threadMessagesOf(threadId)) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the card draws whatever has arrived.
      void readThread(thread.projectId, threadId).catch(() => undefined);
    }
  }
</script>

<script lang="ts">
  import type { ThreadMessage } from "@cawco/core";
  import { commonWords } from "@cawco/core";
  /**
   * A session's card, as the house hover panel (HoverPanel) draws it: its
   * mark, title and state, then what its row cannot show: its live tail and
   * the question it is waiting on or why it failed; a thread's newest line;
   * a workflow run's steps over its running step's tail. The rail's session
   * card (SessionHover) and a session's chip in written words
   * (SessionReference) both draw this. `open`, when given, is where the
   * card's "Open session" action goes.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconAsk, IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import { STOPPING_LABEL } from "./activity";
  import { isFailed } from "./client.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { markHue, sessionSprite } from "./mark";
  import RunSteps from "./RunSteps.svelte";
  import {
    type NamedSession,
    sessionAnswer,
    sessionPlace,
    sessionTitle,
  } from "./session-names.svelte";
  import DelegateTail, {
    type TailNote,
  } from "./transcript/DelegateTail.svelte";
  import { askDetailOf } from "./transcript/present";

  let { id, open }: { id: string; open?: string } = $props();

  /** A session the hub's names answered for, in its state on the card's scale. */
  const NAMED_TONE: Record<NamedSession["state"], Tone> = {
    working: "live",
    "needs-you": "needs",
    idle: "idle",
    sleeping: "idle",
    ready: "idle",
    unknown: "idle",
    ended: "done",
  };

  /** A thread's newest line, as the card's tail ends on it. */
  const newestLine = (message: ThreadMessage | undefined): string | null => {
    if (!message) {
      return null;
    }
    const words = message.author === "event" ? message.noteTitle : message.body;
    return words.trim().split("\n")[0] ?? null;
  };
  const SPEAKER: Record<ThreadMessage["author"], string> = {
    caw: "Caw",
    event: "Event",
    you: "You",
  };

  type Tone = "live" | "needs" | "stopping" | "done" | "failed" | "idle";
  const toneOf = (of: string): Tone => {
    const thread = cawco.threadOf(of);
    if (thread) {
      if (thread.status === "needs-you") {
        return "needs";
      }
      return thread.status === "working" ? "live" : "idle";
    }
    const row = cawco.instanceIndex.byId.get(of);
    if (row && isFailed(row)) {
      return "failed";
    }
    // Asked to end, its machine yet to confirm the process gone.
    if (row?.status === "stopping") {
      return "stopping";
    }
    if (
      (runIdOf(of) && cawco.activityOf(of) === "blocked") ||
      (cawco.session(of)?.pending ?? []).some((each) => !each.routedTo)
    ) {
      return "needs";
    }
    if (cawco.activityOf(of) === "working") {
      return "live";
    }
    return row?.status === "stopped" ? "done" : "idle";
  };
  const WORD: Record<Tone, string> = {
    live: "Working",
    needs: commonWords.needsYou,
    stopping: STOPPING_LABEL,
    done: "Finished",
    failed: "Failed",
    idle: "Idle",
  };

  /** The row the tail ends on: the question waiting, or the failure. */
  const noteOf = (of: string, shownTone: Tone): TailNote | null => {
    if (shownTone === "needs") {
      const asking = (cawco.session(of)?.pending ?? []).find(
        (each) => !each.routedTo
      );
      if (asking) {
        const text = askDetailOf(
          asking.toolName,
          asking.input as Parameters<typeof askDetailOf>[1]
        );
        return { key: `ask:${text}`, kind: "ask", text };
      }
    }
    if (shownTone === "failed") {
      // A delegate whose work item failed fails for the item's reason; its
      // session's own error is only the process's.
      const item = cawco.workItemFor(of);
      const why =
        item?.state === "failed"
          ? item.firstLines.error
          : cawco.instanceIndex.byId.get(of)?.lastError;
      return {
        key: "fail",
        kind: "fail",
        text: why || "It failed without saying why.",
      };
    }
    return null;
  };

  const row = $derived(cawco.instanceIndex.byId.get(id));
  const thread = $derived(cawco.threadOf(id));
  /** The hub's answer, for a session this browser holds no row of (session-names.svelte.ts). */
  const answer = $derived(row || thread ? undefined : sessionAnswer(id));
  const tone = $derived(answer ? NAMED_TONE[answer.state] : toneOf(id));
  const caw = $derived(
    thread?.status ?? (answer?.kind === "thread" ? answer.state : null)
  );
  const Sprite = $derived(sessionSprite(id));
  const runId = $derived(runIdOf(id));
</script>

<div data-nest-host>
  <div
    data-slot="head"
    class="mark-line mb-space-2 flex min-w-c-session-hover-head items-center gap-space-2"
  >
    <span
      data-slot="mark"
      aria-hidden="true"
      class="grid size-c-row-mark flex-none place-items-center rounded-xs bg-(--mark-bg) bg-mark-overlay"
      style:--mark-bg="var(--mark-{markHue(sessionPlace(id))})"
      data-box
    >
      {#if caw}
        <CawFace size={14} status={caw} />
      {:else}
        <Sprite />
      {/if}
    </span>
    <span
      data-slot="title"
      class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap text-size-label font-medium text-ink-strong"
      >{sessionTitle(id) ?? ""}</span
    >
    <span
      aria-label={WORD[tone]}
      class="grid size-icon-md flex-none place-items-center text-ink-muted status-needs:text-status-attn-ink status-done:text-status-done-ink status-failed:text-status-fail-ink"
      data-session-hover-tone={tone}
      data-status={tone}
      data-box
      role="img"
    >
      {#if tone === "live"}
        <span
          data-slot="dot"
          class="size-space-2 rounded-pill bg-status-live-glyph"
        ></span>
      {:else if tone === "needs"}
        <IconAsk />
      {:else if tone === "stopping"}
        <Spinner aria-hidden="true" role="presentation" />
      {:else if tone === "done"}
        <IconSuccess />
      {:else if tone === "failed"}
        <IconWarningTriangle />
      {/if}
    </span>
  </div>
  {#if thread}
    <!-- A thread's card: its newest line. -->
    {@const newest = cawco.threadMessagesOf(thread.id)?.at(-1)}
    {@const line = newestLine(newest)}
    {#if newest && line}
      <p class="flex min-w-0 gap-space-2 text-size-meta text-ink-strong">
        <span data-slot="who" class="flex-none font-medium"
          >{SPEAKER[newest.author]}</span
        >
        <span class="min-w-0 truncate">{line}</span>
      </p>
    {/if}
  {:else if runId}
    <!-- A workflow run's card: its steps under it, then the live tail of
         the one running, the way a session's card ends on its own. -->
    {@const step = runningStep(id)}
    <RunSteps glyph={'[data-slot="mark"]'} interactive={false} {runId} />
    {#if step}
      <DelegateTail instanceId={step} note={null} />
    {:else if tone === "failed"}
      <DelegateTail instanceId="" note={noteOf(id, tone)} />
    {/if}
  {:else}
    <DelegateTail instanceId={id} note={noteOf(id, tone)} />
  {/if}
  {#if open}
    <div data-slot="acts" class="mt-space-3 flex gap-space-2">
      <Button href={open} size="sm" variant="outline">Open session</Button>
    </div>
  {/if}
</div>
