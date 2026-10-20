<script lang="ts">
  /**
   * A session, delegate or Caw thread a message links to by its id
   * (`cawco:session/<id>`, references.ts), drawn as the composer draws a
   * mention (`.mention-chip`): its state's glyph and its live title, never
   * the id. Pressing it opens the house popover (`kit-pop`) at the chip with
   * the session's card, the one the rail's rows open on a rest (SessionHover
   * `sessionCard`: its live tail), and Open session. Escape or a press
   * outside closes it, and the focus goes back to the chip. An id this
   * browser does not know draws the link's label as words.
   */
  import type { FindLiveState } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "#lib/components/ui/popover/index.js";
  import {
    cawco,
    readThread,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "./client.svelte";
  import { liveShape } from "./find/find-rows";
  import { instanceTitle } from "./home/home-state.svelte";
  import { type BoardRow, rowHref } from "./links";
  import { sessionCard } from "./SessionHover.svelte";
  import { threadIdOf, threadTabId } from "./thread-tabs";

  let { id, label }: { id: string; label: Snippet } = $props();

  /** Its row in the fleet's index: a session's by its id, a thread's by its tab id. */
  const row = $derived.by(() => {
    const index = cawco.instanceIndex.byId;
    return index.get(id) ?? index.get(threadTabId(id));
  });

  /** Its state on Find's scale (hub find.ts `stateOf`), from what this browser holds. */
  function stateOf(session: BoardRow): FindLiveState {
    const thread = cawco.threadOf(session.id);
    if (thread) {
      return thread.status === "ready" ? "idle" : thread.status;
    }
    switch (session.status) {
      case "sleeping":
        return "sleeping";
      case "unknown":
        return "unknown";
      case "running":
      case "starting":
      case "moving":
        break;
      default:
        return "ended";
    }
    const doing = cawco.activityOf(session.id);
    if (doing === "blocked") {
      return "needs-you";
    }
    return doing === "working" ? "working" : "idle";
  }

  const shape = $derived(row ? liveShape(stateOf(row)) : null);
  const title = $derived(row ? instanceTitle(row) : "");

  let open = $state(false);

  // Open, the card's tail is read and kept live, as the rail's card keeps
  // its own (HoverPanel `watch`); a thread's card is its newest line.
  $effect(() => {
    const key = open ? row?.id : undefined;
    if (!key) {
      return;
    }
    const threadId = threadIdOf(key);
    if (threadId) {
      const thread = cawco.threadOf(key);
      if (thread && !cawco.threadMessagesOf(threadId)) {
        readThread(thread.projectId, threadId).catch(() => undefined);
      }
      return;
    }
    watchDelegate(key);
    if (!cawco.session(key)?.messages.length) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the tail draws whatever has arrived.
      void readTranscript(key);
    }
    return () => unwatchDelegate(key);
  });
</script>

{#if row && shape}
  <Popover bind:open>
    <PopoverTrigger
      class="mention-chip mark-line not-prose cursor-pointer"
      aria-label="{title}, {shape.word}"
      data-session-chip={row.id}
      data-slot="mention-chip"
      data-tone={shape.tone}
      ><span class="mention-glyph" aria-hidden="true" data-box
        ><shape.glyph /></span
      ><span class="min-w-0 self-baseline overflow-clip text-ellipsis"
        >{title}</span
      ></PopoverTrigger
    >
    <PopoverContent
      class="w-max max-w-[min(440px,calc(100vw-2*var(--space-5)))] gap-3 p-3"
      align="start"
      data-session-card={row.id}
    >
      {@render sessionCard(row.id)}
      <Button
        class="self-start"
        href={rowHref(row.id)}
        onclick={() => {
          open = false;
        }}
        size="sm"
        variant="secondary">Open session</Button
      >
    </PopoverContent>
  </Popover>
{:else}
  {@render label()}
{/if}
