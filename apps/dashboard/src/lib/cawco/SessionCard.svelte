<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  /**
   * A session's card, as the house hover panel (HoverPanel) draws it: its
   * mark, title and state, then what its row cannot show: its live tail and
   * the question it is waiting on or why it failed. The rail's session
   * card (SessionHover) and a session's chip in written words
   * (SessionReference) both draw this. `open`, when given, is where the
   * card's "Open session" action goes.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconAsk, IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import { STOPPING_LABEL } from "./activity";
  import { cawco, isFailed } from "./client.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { markHue, sessionSprite } from "./mark";
  import {
    type NamedSession,
    sessionAnswer,
    sessionPlace,
    sessionTitle,
  } from "./session-names.svelte";
  import { cawOf } from "./session-status";
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
    unknown: "idle",
    ended: "done",
  };

  type Tone = "live" | "needs" | "stopping" | "done" | "failed" | "idle";
  const toneOf = (of: string): Tone => {
    const row = cawco.instanceIndex.byId.get(of);
    if (row && isFailed(row)) {
      return "failed";
    }
    // Asked to end, its machine yet to confirm the process gone.
    if (row?.status === "stopping") {
      return "stopping";
    }
    if ((cawco.session(of)?.pending ?? []).some((each) => !each.routedTo)) {
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
  /** The hub's answer, for a session this browser holds no row of (session-names.svelte.ts). */
  const answer = $derived(row ? undefined : sessionAnswer(id));
  const tone = $derived(answer ? NAMED_TONE[answer.state] : toneOf(id));
  /** A project's conversation's mark is Caw (session-status.ts `cawOf`). */
  const caw = $derived(cawOf(id));
  const Sprite = $derived(sessionSprite(id));
</script>

<div data-nest-host>
  <div
    data-slot="head"
    data-session-hover-head
    class="mark-line mb-space-2 flex min-w-c-session-hover-head items-center gap-space-2"
  >
    <span
      data-slot="mark"
      data-session-hover-mark
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
  <DelegateTail instanceId={id} note={noteOf(id, tone)} />
  {#if open}
    <div data-slot="acts" class="mt-space-3 flex gap-space-2">
      <Button href={open} size="sm" variant="outline">Open session</Button>
    </div>
  {/if}
</div>
