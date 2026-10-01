<script lang="ts" module>
  /** A row the tail adds after the transcript's own: the question waiting, or the failure. */
  export interface TailNote {
    key: string;
    kind: "ask" | "asked" | "fail";
    text: string;
  }
</script>

<script lang="ts">
  /**
   * The last six things a delegate did, one line each, read off its own live
   * transcript: the tray panel's answer to "what is it doing right now?".
   * A row that arrives lifts the stack by one row and rises into the bottom
   * slot while the top row dissolves under the mask; rows that come faster
   * than one lift queue and play back to back, so the tail never skips.
   */
  import type { Component } from "svelte";
  import { tick, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import {
    describeTool,
    type ToolStatus,
  } from "$lib/components/features/tool-cards/descriptors";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconCpu, IconHandoff, IconReport, IconRules } from "$lib/icons";
  import { whiffle } from "../client.svelte";
  import { CURVE, dur, easeOut, motionOk } from "../motion/curves.svelte";
  import type { Message } from "../types";
  import MessageBody from "./MessageBody.svelte";

  let {
    instanceId,
    note = null,
  }: {
    instanceId: string;
    note?: TailNote | null;
  } = $props();

  type Row =
    | {
        key: string;
        kind: "tool";
        icon: Component;
        color: string;
        verb: string;
        arg: string;
        live: boolean;
      }
    | { key: string; kind: "reason" }
    | { key: string; kind: "say" | "stream"; text: string }
    | { key: string; kind: "peer"; icon: Component; lead: string; name: string }
    | TailNote;

  /** Rows on screen, the height of the tail; one row's height, in px. */
  const SLOTS = 6;
  const ROW = 24;

  const lastLine = (text: string): string =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? "";

  const keyOf = (m: Message, i: number) =>
    m.id ?? m.sdkUuid ?? `${m.type}:${m.timestamp?.getTime() ?? i}`;

  function rowOf(m: Message, i: number): Row | null {
    const meta = m.metadata ?? {};
    const key = keyOf(m, i);
    switch (m.type) {
      case "tool.use":
      case "tool.handoff": {
        const status = (meta.toolStatus ?? "pending") as ToolStatus;
        const d = describeTool(
          meta.toolName,
          (meta.toolInput ?? undefined) as Record<string, unknown> | undefined,
          typeof meta.toolResult === "string" ? meta.toolResult : undefined,
          status
        );
        return {
          key,
          kind: "tool",
          icon: d.icon,
          color: d.color,
          verb: d.label,
          arg: d.object ?? d.detail ?? "",
          live: status === "pending",
        };
      }
      case "thinking":
        return m.content.trim() ? { key, kind: "reason" } : null;
      case "assistant": {
        const text = lastLine(m.content);
        return text ? { key, kind: "say", text } : null;
      }
      case "user.rule":
        return {
          key,
          kind: "peer",
          icon: IconRules,
          lead: "Rule ·",
          name: meta.ruleName ?? "",
        };
      case "user.peer":
        return meta.reportKind
          ? {
              key,
              kind: "peer",
              icon: IconReport,
              lead: "Report from",
              name: meta.peerName ?? "",
            }
          : {
              key,
              kind: "peer",
              icon: IconHandoff,
              lead: "Hand-off from",
              name: meta.peerName ?? "",
            };
      default:
        return null;
    }
  }

  const branch = $derived(whiffle.session(instanceId));
  /** The read is still under way (or not begun) and nothing has arrived to show. */
  const loading = $derived(!branch || branch.loading || branch.hydrating);

  /** The newest rows, oldest first: a few more than the tail shows, for the one leaving. */
  const rows = $derived.by((): Row[] => {
    const messages = branch?.messages ?? [];
    const out: Row[] = [];
    for (
      let i = messages.length - 1;
      i >= 0 && out.length < SLOTS + 2;
      i -= 1
    ) {
      const row = rowOf(messages[i], i);
      // Back-to-back reasoning blocks are one "Reasoning" line.
      if (row && !(row.kind === "reason" && out[0]?.kind === "reason")) {
        out.unshift(row);
      }
    }
    // What is being written right now, keyed to where it will settle.
    const at = messages.length;
    if (branch?.thinkingStream && out.at(-1)?.kind !== "reason") {
      out.push({ key: `live:reason:${at}`, kind: "reason" });
    }
    const streaming = branch?.streaming ? lastLine(branch.streaming) : "";
    if (streaming) {
      out.push({ key: `live:say:${at}`, kind: "stream", text: streaming });
    }
    if (note) {
      out.push(note);
    }
    return out;
  });

  /* ---- the tail's motion ---------------------------------------------- */

  /** The keys on screen, oldest first: SLOTS of them, one more while it leaves. */
  let shown = $state<string[]>([]);
  /** The last data each key had, for a row drawn on its way out. */
  const last = new Map<string, Row>();
  const byKey = $derived(new Map(rows.map((row) => [row.key, row])));
  const dataOf = (key: string) => byKey.get(key) ?? last.get(key);

  let column = $state<HTMLElement>();
  let queue: string[] = [];
  let playing = false;

  const isLive = (key: string) => key.startsWith("live:");
  const settlesAs = (key: string) =>
    key.startsWith("live:say") ? "say" : "reason";

  function take(target: Row[]): void {
    for (const row of target) {
      last.set(row.key, row);
    }
    const keys = target.map((row) => row.key);
    const present = new Set(keys);
    queue = queue.filter((key) => present.has(key));
    const anchor = [...shown, ...queue].findLast((key) => present.has(key));
    if (anchor === undefined) {
      // Nothing on screen is in the transcript any more (or yet): it is simply there.
      shown = keys.slice(-SLOTS);
      queue = [];
      return;
    }
    const known = new Set([...shown, ...queue]);
    const arrivals = keys
      .slice(keys.indexOf(anchor) + 1)
      .filter((key) => !known.has(key));
    // A line being written that has just settled keeps its place: same row, new key.
    const end = shown.at(-1);
    if (
      end &&
      isLive(end) &&
      !present.has(end) &&
      arrivals.length &&
      dataOf(arrivals[0])?.kind === settlesAs(end)
    ) {
      shown = [...shown.slice(0, -1), arrivals.shift() as string];
    }
    if (arrivals.length) {
      queue.push(...arrivals);
      pump();
    }
  }

  $effect(() => {
    const target = rows;
    untrack(() => take(target));
  });

  /** Plays the queue one row at a time: the first lift over --dur-morph, the rest back to back at --dur-control. */
  function pump(): void {
    if (playing) {
      return;
    }
    playing = true;
    // biome-ignore lint/complexity/noVoid: the queue plays on its own; nothing waits on it.
    void lift(dur("--dur-morph"));
  }

  /** One row into the bottom slot, then the next one queued, if any. */
  async function lift(ms: number): Promise<void> {
    const key = queue.shift();
    if (key === undefined) {
      playing = false;
      return;
    }
    if (!motionOk.current) {
      // Reduced motion: the rows shift at once and the new one fades in place.
      shown = [...shown, key].slice(-SLOTS);
      await tick();
      await column?.lastElementChild?.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: dur("--dur-control"),
          easing: CURVE.out,
        }
      ).finished;
      return lift(dur("--dur-control"));
    }
    shown = [...shown, key];
    await tick();
    if (!column) {
      playing = false;
      return;
    }
    const timing = { duration: ms, easing: CURVE.out };
    const leaving = shown.length > SLOTS ? column.firstElementChild : null;
    column.lastElementChild?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    leaving?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    await column.animate(
      [{ transform: `translateY(${ROW}px)` }, { transform: "none" }],
      timing
    ).finished;
    shown = shown.slice(-SLOTS);
    return lift(dur("--dur-control"));
  }
</script>

<div class="tail" style:--row="{ROW}px">
  {#if shown.length}
    <div
      class="column"
      bind:this={column}
      in:fade={{ duration: dur('--dur-control'), easing: easeOut }}
    >
      {#each shown as key (key)}
        {@const row = dataOf(key)}
        <div class="row {row?.kind ?? ''}">
          {#if row?.kind === 'tool'}
            {@const Icon = row.icon}
            <span class="ic {row.color}" class:breathe={row.live}
              ><Icon /></span
            >
            {#if row.verb}
              <span class="verb">{row.verb}</span>
            {/if}
            <span class="arg">{row.arg}</span>
          {:else if row?.kind === 'reason'}
            <span class="ic"><IconCpu /></span>
            <span class="verb">Reasoning</span>
          {:else if row?.kind === 'say'}
            <span class="text">{row.text}</span>
          {:else if row?.kind === 'stream'}
            <span class="text"
              ><MessageBody source={row.text} streaming /></span
            >
          {:else if row?.kind === 'peer'}
            {@const Icon = row.icon}
            <span class="ic"><Icon /></span>
            <span class="verb">{row.lead}</span>
            <span class="text">{row.name}</span>
          {:else if row}
            <span class="text">{row.text}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else if loading}
    <!-- Its transcript is on the way: three rows' worth of the house skeleton. -->
    <div aria-label="Loading its transcript" class="column" role="status">
      {#each [240, 180, 280] as width (width)}
        <div class="row">
          <Skeleton class="h-3" style="inline-size: {width}px" />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Six rows high, the top 24px dissolving: a row leaving at the top fades out
     through the mask as the stack lifts. */
  /* The stack stands on the tail's foot and spills over its top, in the flow,
     so the widest row is the tail's width (the panel sizes to it). */
  .tail {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    block-size: calc(var(--row) * 6);
    overflow: hidden;
    margin-inline: calc(var(--space-2) * -1);
    color: var(--ink-strong);
    mask-image: linear-gradient(to bottom, transparent, #000 24px);
  }
  .column {
    flex: none;
    display: flex;
    flex-direction: column;
  }
  .row {
    flex: none;
    block-size: var(--row);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-2);
    min-inline-size: 0;
    font-size: var(--text-meta);
    white-space: nowrap;
  }
  .ic {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    display: grid;
    place-items: center;

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
  }
  .reason .ic,
  .peer .ic {
    color: var(--ink-muted);
  }
  .verb {
    flex: none;
    font-weight: var(--weight-strong);
  }
  .reason .verb,
  .peer .verb {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .arg,
  .text {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arg {
    font-family: var(--font-mono);
    color: var(--ink-muted);
  }
  /* The line being written, one line tall however the message renders. */
  .stream .text :global(*) {
    display: inline;
    margin: 0;
    padding: 0;
    font-size: inherit;
    line-height: inherit;
  }
  .ask {
    color: var(--status-attn-ink);
  }
  .asked {
    color: var(--ink-muted);
  }
  .fail {
    color: var(--status-fail-ink);
  }
</style>
