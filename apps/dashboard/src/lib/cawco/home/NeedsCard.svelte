<script lang="ts">
  /**
   * One thing parked on the operator: a session's permission or question, or
   * a workflow run's question. The card body opens the session at the
   * request; a permission can be answered here (the `answer` choice), with
   * Deny and Approve as equal recessed peers (DESIGN.md, The Peer Rule): same
   * fill, size and type, told apart by glyph only. A question is answered in
   * its session, so it gets one Answer that opens it. "Always allow" never
   * appears here. A project past its spend cap says what it spent against
   * what, what that holds back, and when it resets; its button opens the
   * project's spend.
   *
   * Nothing is optimistic: an answer is the same `permission.answer` command
   * the session's own card sends, and the card leaves when the hub has taken
   * it — the request card above that pane's composer leaves with it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconMaximize, IconTick } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    cawco,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
  } from "../client.svelte";
  import { conversationHref } from "../links";
  import { resetLabel, usd } from "../usage";
  import { choices } from "./choices.svelte";
  import { clock, type NeedsItem, span } from "./home-state.svelte";
  import { openPeek } from "./peek.svelte";

  let { item, stale }: { item: NeedsItem; stale: boolean } = $props();

  const href = $derived.by(() => {
    if (item.kind !== "ask") {
      return item.href;
    }
    // A project's Caw asked in a thread: the card opens the thread.
    return item.thread
      ? `/session/${item.thread}`
      : conversationHref(item.instanceId, cawco.instanceIndex);
  });
  const waited = $derived.by(() => {
    if (item.kind === "cap") {
      return `resets ${resetLabel(new Date(item.cap.resetsAt).toISOString(), clock.now)}`;
    }
    return item.raisedAt === undefined
      ? "waiting"
      : `waiting ${span(clock.now - item.raisedAt)}`;
  });
  /** What a cap holds back, as the card's line says it. */
  const HOLDS = {
    pause: "attempts paused",
    quiet: "Caw paused",
    both: "attempts and Caw paused",
  } as const;
  /** A permission answered on the card, under the `answer` choice. */
  const answerable = $derived(
    item.kind === "ask" && !item.isQuestion && choices.answer === "a"
  );

  function answer(kind: PermissionAnswer): void {
    if (item.kind !== "ask" || stale) {
      return;
    }
    submitCommand(item.instanceId, item.machineId, "permission.answer", {
      requestId: item.request.requestId,
      result: permissionAnswer(item.request, kind),
    });
  }

  /** The permission card's own keys (`y`/`a` allow, `n`/`d` deny) while a control here has focus. */
  function onkeydown(event: KeyboardEvent): void {
    if (
      !answerable ||
      isTyping() ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "y" || key === "a") {
      event.preventDefault();
      answer("allow");
    } else if (key === "n" || key === "d") {
      event.preventDefault();
      answer("deny");
    }
  }
</script>

<article
  class="card"
  data-flip
  data-share="pane:{item.kind === "ask" ? item.instanceId : item.key}"
  data-stale={stale || undefined}
>
  <!-- The whole card opens the session, at the request. -->
  <a aria-label="Open {item.title}" class="cover focus-inset" {href} {onkeydown}
    ><span class="sr-only">Open {item.title}</span></a
  >
  <div class="head">
    <span class="title">{item.title}</span>
    <span class="num wait">{waited}</span>
    <!-- A thread is opened, not peeked: it is the conversation itself. -->
    {#if item.kind === "ask" && !item.thread}
      {@const ask = item}
      <!-- Glance → peek → dive: read what led here before answering. -->
      <Tip label="Peek">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-label="Peek {item.title}"
            class="peek touch-hit focus-inset"
            onclick={() =>
              openPeek({ viewId: ask.instanceId, href, title: ask.title })}
            type="button"
          >
            <IconMaximize aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    {/if}
  </div>
  <span class="place">{item.place}</span>
  <p class="ask">
    {#if item.kind === "cap"}
      {usd(item.cap.spentUsd)}
      of {usd(item.cap.usd)} this {item.cap.period} · {HOLDS[item.cap.onCap]}
    {:else}
      {item.kind === "run" ? "Waiting on your answer" : item.ask}
    {/if}
  </p>
  {#if item.kind === "cap"}
    <div class="actions">
      <Button {href} size="sm" variant="secondary">See spend</Button>
    </div>
  {:else if item.kind === "run"}
    <div class="actions">
      <Button {href} size="sm" variant="secondary">Open</Button>
    </div>
  {:else if item.isQuestion}
    <div class="actions">
      <Button {href} size="sm" variant="secondary">Answer</Button>
    </div>
  {:else if answerable}
    <div class="actions peers">
      <Button
        aria-label="Deny {item.ask} on {item.title}"
        disabled={stale}
        onclick={() => answer("deny")}
        {onkeydown}
        size="sm"
        variant="secondary"
      >
        <IconClose class="text-[var(--ink-muted)]" />
        Deny
      </Button>
      <Button
        aria-label="Approve {item.ask} on {item.title}"
        disabled={stale}
        onclick={() => answer("allow")}
        {onkeydown}
        size="sm"
        variant="secondary"
      >
        <IconTick class="text-[var(--ink-strong)]" />
        Approve
      </Button>
    </div>
  {/if}
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .card:has(.cover:hover) {
      background: var(--surface-hover);
    }
  }
  .card[data-stale] {
    opacity: 0.55;
  }
  /* Everything over the cover takes no pointer, so a press anywhere that is
     not a control opens the session; the controls take theirs back. */
  .cover {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .head,
  .place,
  .ask {
    position: relative;
    pointer-events: none;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }
  .title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .wait,
  .place {
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .place {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ask {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-row);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .peek {
    display: inline-grid;
    flex: none;
    place-items: center;
    align-self: center;
    width: 28px;
    height: 28px;
    margin: -4px calc(-1 * var(--space-2)) -4px 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    pointer-events: auto;
    transition: var(--transition-control);
  }
  .peek :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .peek:hover {
      background: var(--surface-fill);
      color: var(--ink-strong);
    }
  }
  .actions {
    position: relative;
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-1);
  }
  /* Equal peers at opposite ends, with nothing between them. */
  .peers {
    justify-content: space-between;
    gap: var(--space-8);
  }
</style>
