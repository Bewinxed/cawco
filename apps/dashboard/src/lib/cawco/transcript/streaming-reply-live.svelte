<script lang="ts">
  /**
   * Fixture for the design graph: an agent's reply streaming into the
   * transcript as a session's tail draws it (LiveRow, MessageBody, the
   * markdown), its words sent by a mock of the hub's stream at the pace its
   * dial names. When the reply has all landed it stays a moment, then the
   * stream starts it again, so the fade can be watched for as long as they
   * like. The transcript is watched (its ledger's `watched`), so each
   * chunk's words fade in as they land, as in a session on screen.
   */
  import { onDestroy, untrack } from "svelte";
  import { track } from "#lib/platform/track.js";
  import type { Message } from "../types";
  import { provideLedger } from "./arrivals.svelte";
  import LiveRow from "./LiveRow.svelte";

  type Pace = "usual" | "fast" | "slow";

  let {
    pace = "usual",
    again = 0,
  }: {
    /** How fast the hub sends the reply's words. */
    pace?: Pace;
    /** Bumped by the graph's Start again. */
    again?: number;
  } = $props();

  provideLedger({
    done: () => undefined,
    take: () => null,
    watched: true,
  });

  /** A reply as an agent writes one: prose, a list, code spans, a closing line. */
  const REPLY = `I found why the preview drops its socket after the Mac wakes. The relay keeps the old connection's id in \`pending\`, so the first frame after the wake is answered for a session that is already gone, and the dashboard reads that as a refusal.

What I changed:

- The relay forgets a connection's pending frames when its socket closes, in \`relay/socket.ts\`, instead of waiting for the next read.
- The dashboard retries a refused preview once before it shows the error, so a wake that lands mid-frame recovers on its own.
- \`bun run check\` passes, and the preview came back after three sleeps in a row on the phone and on the Mac.

One thing I left alone: the hub still logs the stale id as a warning. It is harmless now, but it reads like a fault, so I can quiet it in a follow-up if you want.`;

  /** Words a chunk carries, and chunks a second, for each pace. */
  const PACES: Record<Pace, { words: number; perSecond: number }> = {
    usual: { words: 4, perSecond: 10 },
    fast: { words: 2, perSecond: 30 },
    slow: { words: 4, perSecond: 3 },
  };

  /** The reply's chunks, each its words and the whitespace after them. */
  const chunksOf = (words: number): string[] => {
    const parts = REPLY.match(/\S+\s*/gu) ?? [];
    const chunks: string[] = [];
    for (let at = 0; at < parts.length; at += words) {
      chunks.push(parts.slice(at, at + words).join(""));
    }
    return chunks;
  };

  /**
   * What the mock hub has sent of the reply, whether the reply has landed as
   * its message, and which run of it this is.
   */
  let sent = $state("");
  let landed = $state(false);
  let run = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stream(rate: { words: number; perSecond: number }): void {
    clearTimeout(timer);
    const chunks = chunksOf(rate.words);
    let at = 0;
    sent = "";
    landed = false;
    run += 1;
    const next = (): void => {
      if (at < chunks.length) {
        sent += chunks[at];
        at += 1;
        timer = setTimeout(next, 1000 / rate.perSecond);
      } else {
        landed = true;
        timer = setTimeout(() => stream(rate), 2500);
      }
    };
    timer = setTimeout(next, 400);
  }

  $effect(() => {
    // Read so a change of pace or a press of Start again starts over.
    track(again);
    const rate = PACES[pace];
    untrack(() => stream(rate));
  });
  onDestroy(() => clearTimeout(timer));

  const message = {
    id: "reply",
    instanceId: "streaming-reply",
    type: "assistant",
    content: REPLY,
    timestamp: new Date(Date.UTC(2026, 10, 19, 14, 2)).toISOString(),
  } satisfies Message;
</script>

<div
  data-slot="transcript"
  class="tx-columns min-h-0 ps-space-7 pe-space-6 pt-space-2 pb-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
>
  {#key run}
    <LiveRow
      agentName="Claude"
      announce={false}
      row={landed
        ? {
            kind: "single",
            key: `reply-${run}`,
            message,
            grouped: false,
            streamed: true,
          }
        : {
            kind: "live",
            key: `reply-${run}`,
            thinking: null,
            thinkingLive: false,
            indicating: sent === "",
            text: sent,
            grouped: false,
          }}
    />
  {/key}
</div>
