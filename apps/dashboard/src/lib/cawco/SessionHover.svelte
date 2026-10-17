<script lang="ts">
  import type { ThreadMessage } from "@cawco/core";
  /**
   * The rail's session card: resting the pointer on a session row (Working,
   * Finished, a project's sessions) opens the delegate tray's panel
   * (HoverPanel) beside the rail, level with the row, with what the row
   * cannot show: the session's live tail, and the question it is waiting on
   * or why it failed. Moving to the next row glides the one card there.
   *
   * Rows opt in with `data-hover-session="<instance id>"`. The tray's
   * timings: it opens after a 350ms rest, and closes 300ms after the
   * pointer leaves both the row and the card, so crossing the 4px gap to
   * the card (bridged) keeps it. A fine pointer only; touch has no hover.
   *
   * The card is portalled to the body: the rail isolates its stacking
   * (kit-highlight), so a card drawn inside it would paint under the panes.
   */
  import { Portal } from "bits-ui";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconAsk, IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import { STOPPING_LABEL } from "./activity";
  import { cawco, isFailed, readThread, readTranscript } from "./client.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { instanceTitle } from "./home/home-state.svelte";
  import { markHue, sessionSprite } from "./mark";
  import RunSteps from "./RunSteps.svelte";
  import { threadIdOf } from "./thread-tabs";
  import DelegateTail, {
    type TailNote,
  } from "./transcript/DelegateTail.svelte";
  import { askDetailOf } from "./transcript/present";
  import { runIdOf } from "./workflow-runs";
  import { workflowState } from "./workflow-state.svelte";

  /** The rail whose session rows open the card. */
  let { within }: { within: HTMLElement | undefined } = $props();

  const OPEN_AFTER = 350;
  const CLOSE_AFTER = 300;

  let openId = $state<string | null>(null);
  let gliding = $state(false);
  let place = $state({ x: 0, y: 0, origin: 0 });
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;

  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

  /**
   * The row the pointer is on starts reading its tail now, while the open
   * delay runs, so the card mostly opens (or glides) onto a tail already in.
   */
  let fetched: string | null = null;
  function prefetch(id: string): void {
    if (id === fetched) {
      return;
    }
    fetched = id;
    const threadId = threadIdOf(id);
    if (threadId) {
      readThreadCard(threadId);
      return;
    }
    // A workflow run's card reads its running step's tail, not its own.
    const tail = runningStep(id) ?? (runIdOf(id) ? null : id);
    if (tail && !cawco.session(tail)?.messages.length) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the card draws whatever has arrived.
      void readTranscript(tail);
    }
  }

  /** A thread's card reads its messages, so it opens on its newest line. */
  function readThreadCard(threadId: string): void {
    const thread = cawco.threadOf(`thread:${threadId}`);
    if (!thread) {
      return;
    }
    if (!cawco.threadMessagesOf(threadId)) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the card draws whatever has arrived.
      void readThread(thread.projectId, threadId).catch(() => undefined);
    }
  }

  /**
   * The session whose live tail the card draws: a run's running step, the
   * session itself, and none for a thread, whose card is its newest line
   * (held for a tail that never comes, the card kept the last one's size).
   */
  const watchOf = (id: string | null): string | null => {
    if (!id || threadIdOf(id)) {
      return null;
    }
    return runIdOf(id) ? runningStep(id) : id;
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

  /** The session of a run's running step, whose tail is the run's live tail. */
  function runningStep(id: string): string | null {
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

  /** The row the open card stands beside. */
  let anchor: HTMLElement | null = null;

  function stand(row: HTMLElement): void {
    const box = row.getBoundingClientRect();
    const rail = within?.getBoundingClientRect();
    place = {
      x: Math.round((rail?.right ?? box.right) + 4),
      y: Math.round(box.top),
      origin: Math.round(box.height / 2),
    };
  }
  function open(row: HTMLElement, id: string): void {
    gliding = openId !== null && openId !== id;
    anchor = row;
    stand(row);
    openId = id;
  }
  function close(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    openId = null;
    anchor = null;
    gliding = false;
  }
  function hold(): void {
    clearTimeout(closing);
  }
  function release(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    closing = setTimeout(close, CLOSE_AFTER);
  }

  $effect(() => {
    const root = within;
    if (!root) {
      return;
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !fine()) {
        return;
      }
      const row = (event.target as Element).closest<HTMLElement>(
        "[data-hover-session]"
      );
      const id = row?.dataset.hoverSession;
      if (!(row && id)) {
        if (openId) {
          release();
        } else {
          clearTimeout(dwell);
        }
        return;
      }
      if (id === openId) {
        hold();
        // A session listed twice (Working, and under its project): the card
        // glides to whichever of its rows the pointer is on.
        if (row !== anchor) {
          gliding = true;
          anchor = row;
          stand(row);
        }
        return;
      }
      prefetch(id);
      clearTimeout(dwell);
      hold();
      if (openId) {
        open(row, id);
      } else {
        dwell = setTimeout(() => open(row, id), OPEN_AFTER);
      }
    };
    const leave = () => release();
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerleave", leave);
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerleave", leave);
      clearTimeout(dwell);
      clearTimeout(closing);
    };
  });

  /**
   * The open card keeps to its row as the rail's list scrolls under a
   * resting pointer, a frame at a time and with no glide. A row scrolled out
   * of the list's box closes it, the way the pointer leaving does. Scroll
   * does not bubble, so the one listener captures on the rail.
   */
  const isOpen = $derived(openId !== null);
  $effect(() => {
    const root = within;
    if (!(root && isOpen)) {
      return;
    }
    let frame = 0;
    let gone = false;
    const follow = (event: Event) => {
      const scroller = event.target;
      if (frame || !(scroller instanceof Element)) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const row = anchor;
        if (!row || (row.isConnected && !scroller.contains(row))) {
          return;
        }
        const box = row.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        const out =
          !row.isConnected || box.bottom <= view.top || box.top >= view.bottom;
        if (out) {
          if (!gone) {
            release();
          }
        } else {
          gliding = false;
          stand(row);
        }
        gone = out;
      });
    };
    root.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", follow, { capture: true });
      cancelAnimationFrame(frame);
    };
  });

  type Tone = "live" | "needs" | "stopping" | "done" | "failed" | "idle";
  const toneOf = (id: string): Tone => {
    const thread = cawco.threadOf(id);
    if (thread) {
      if (thread.status === "needs-you") {
        return "needs";
      }
      return thread.status === "working" ? "live" : "idle";
    }
    const row = cawco.instanceIndex.byId.get(id);
    if (row && isFailed(row)) {
      return "failed";
    }
    // Asked to end, its machine yet to confirm the process gone.
    if (row?.status === "stopping") {
      return "stopping";
    }
    if (
      (runIdOf(id) && cawco.activityOf(id) === "blocked") ||
      (cawco.session(id)?.pending ?? []).some((each) => !each.routedTo)
    ) {
      return "needs";
    }
    if (cawco.activityOf(id) === "working") {
      return "live";
    }
    return row?.status === "stopped" ? "done" : "idle";
  };
  const WORD: Record<Tone, string> = {
    live: "Working",
    needs: "Needs you",
    stopping: STOPPING_LABEL,
    done: "Finished",
    failed: "Failed",
    idle: "Idle",
  };

  /** The row the tail ends on: the question waiting, or the failure. */
  const noteOf = (id: string, tone: Tone): TailNote | null => {
    if (tone === "needs") {
      const asking = (cawco.session(id)?.pending ?? []).find(
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
    if (tone === "failed") {
      // A delegate whose work item failed fails for the item's reason; its
      // session's own error is only the process's.
      const item = cawco.workItemFor(id);
      const why =
        item?.state === "failed"
          ? item.firstLines.error
          : cawco.instanceIndex.byId.get(id)?.lastError;
      return {
        key: "fail",
        kind: "fail",
        text: why || "It failed without saying why.",
      };
    }
    return null;
  };
</script>

<Portal>
  <HoverPanel
    aria-hidden="true"
    {gliding}
    key={openId}
    onpointerenter={hold}
    onpointerleave={release}
    side="right"
    style="--x: {place.x}px; --y: {place.y}px; --origin: {place.origin}px; --room: 360px"
    watch={watchOf(openId)}
  >
    {#snippet children(id)}
      {@const row = cawco.instanceIndex.byId.get(id)}
      {@const tone = toneOf(id)}
      {@const Sprite = sessionSprite(id)}
      {@const runId = runIdOf(id)}
      {@const thread = cawco.threadOf(id)}
      <div data-nest-host>
        <!-- literal: 240px -->
        <div
          data-slot="head"
          class="mark-line mb-space-2 flex min-w-(--head-min) items-center gap-space-2"
          style:--head-min="240px"
        >
          <!-- literal: 17px -->
          <span
            data-slot="mark"
            aria-hidden="true"
            class="grid size-(--mark-box) flex-none place-items-center rounded-xs bg-(--mark-bg) bg-mark-overlay"
            style:--mark-box="17px"
            style:--mark-bg="var(--mark-{markHue(row?.cwd || id)})"
            data-box
          >
            {#if thread}
              <CawFace size={14} status={thread.status} />
            {:else}
              <Sprite />
            {/if}
          </span>
          <span
            data-slot="title"
            class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap text-size-label font-medium text-ink-strong"
            >{row ? instanceTitle(row) : "Session"}</span
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
              <!-- literal: 5px, 50% -->
              <span
                data-slot="dot"
                class="size-(--dot) rounded-(--dot-r) bg-status-live-glyph"
                style:--dot="5px"
                style:--dot-r="50%"
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
      </div>
    {/snippet}
  </HoverPanel>
</Portal>

<style>
  /* residual: foreign-dom — the glyph the mark holds (the session's sprite,
     a thread's CawFace) and the state's icon or spinner: svg those
     components draw. */
  [data-slot="mark"] :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--mark-glyph);
  }
  [data-session-hover-tone] :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
</style>
