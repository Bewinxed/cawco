<script lang="ts">
  /**
   * One thing parked on the operator, as a row of Caw's panel (NeedsCaw):
   * a session's permission or question, a workflow run's question, or a
   * project past its spend cap. The session's mark leads (a run and a
   * budget their glyphs), then the title and its wait, what it wants in the
   * words it is asked, and the kind and where. The row itself opens it (the
   * session at the request, the run, the project's spend) and the panel
   * closes (`onchoose`). A permission is answered here too, with Deny and
   * Approve as equal recessed peers (DESIGN.md, The Peer Rule): same fill,
   * size and type, told apart by glyph only; "Always allow" never appears.
   *
   * Nothing is optimistic: an answer is the same `permission.answer` command
   * the session's own card sends, and the row leaves when the hub has taken
   * it — the request card above that pane's composer leaves with it.
   */
  import { questionsOf } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconClose,
    IconDollar,
    IconFolder,
    IconTick,
    IconWorkflow,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    cawco,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
  } from "../client.svelte";
  import { conversationHref } from "../links";
  import OsMark from "../OsMark.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { capLine } from "../usage";
  import { choices } from "./choices.svelte";
  import { clock, type NeedsItem, span } from "./home-state.svelte";

  let {
    item,
    stale,
    onchoose,
  }: {
    item: NeedsItem;
    stale: boolean;
    /** The row was chosen: it opens, and the panel closes. */
    onchoose: () => void;
  } = $props();

  const href = $derived.by(() => {
    if (item.kind !== "ask") {
      return item.href;
    }
    // A project's Caw asked in a thread: the row opens the thread.
    return item.thread
      ? `/session/${item.thread}`
      : conversationHref(item.instanceId, cawco.instanceIndex);
  });
  /** What it asks for, in the words it is asked: its second line. */
  const want = $derived.by(() => {
    switch (item.kind) {
      case "ask":
        return item.isQuestion
          ? (questionsOf(item.request.toolName, item.request.input)?.[0]
              ?.question ?? item.ask)
          : item.ask;
      case "run":
        return "Waiting on your answer";
      default:
        return capLine(item.cap);
    }
  });
  /**
   * A run's and a budget's last line: the kind, then where it is. An ask's
   * is drawn in the markup: its project, its kind, its machine by its mark.
   */
  const meta = $derived(
    item.kind === "run" ? `Workflow · ${item.place}` : "Budget"
  );
  /**
   * The row stands but cannot be answered yet: the hub is not live, or its
   * session's machine is offline. It keeps its place, dimmed, and its
   * answer waits; nothing is sent until it can land.
   */
  const held = $derived(stale || (item.kind === "ask" && item.stale));
  /** A permission answered on the row, under the `answer` choice. */
  const answerable = $derived(
    item.kind === "ask" && !item.isQuestion && choices.answer === "a"
  );

  function answer(kind: PermissionAnswer): void {
    if (item.kind !== "ask" || held) {
      return;
    }
    submitCommand(item.instanceId, item.machineId, "permission.answer", {
      requestId: item.request.requestId,
      result: permissionAnswer(item.request, kind),
    });
  }

  /** The permission's own keys (`y`/`a` allow, `n`/`d` deny) while a control here has focus. */
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

<div
  class="row"
  data-flip
  data-share="pane:{item.kind === "ask" ? item.instanceId : item.key}"
  data-stale={held || undefined}
>
  <!-- The whole row opens it; the panel closes. -->
  <a
    aria-label="Open {item.title}"
    class="cover press-tint focus-inset"
    {href}
    onclick={onchoose}
    {onkeydown}
    ><span class="sr-only">Open {item.title}</span></a
  >
  <!-- The session's own mark, as the rail draws it; a run and a budget their glyphs. -->
  <span class="lead">
    {#if item.kind === "ask"}
      <SessionMark
        id={item.instanceId}
        place={item.cwd || item.machineId}
        status="attn"
      />
    {:else if item.kind === "run"}
      <IconWorkflow aria-hidden="true" />
    {:else}
      <IconDollar aria-hidden="true" />
    {/if}
  </span>
  <span class="name">{item.title}</span>
  {#if item.raisedAt !== undefined}
    <span class="wait">{span(clock.now - item.raisedAt)}</span>
  {/if}
  <span class="want">{want}</span>
  {#if item.kind === "ask"}
    <!-- Where it came from: the project first, in its mark and strong ink;
         then what it asks for; then the machine, by its OS mark. -->
    <span class="meta where">
      {#if item.project}
        <span class="project">
          <IconFolder
            aria-hidden="true"
            class="mark"
            style="color: var(--mark-{item.project.hue})"
          />
          <span class="project-name">{item.project.name}</span>
        </span>
        <span aria-hidden="true" class="dot">·</span>
      {/if}
      <span>{item.isQuestion ? "Question" : "Permission"}</span>
      <span aria-hidden="true" class="dot">·</span>
      <span class="machine">
        <OsMark class="mark" os={item.machine.os} />
        <span class="machine-name">{item.machine.name}</span>
      </span>
      {#if item.stale}
        <span aria-hidden="true" class="dot">·</span>
        <span>machine offline</span>
      {/if}
    </span>
  {:else}
    <span class="meta">{meta}</span>
  {/if}
  {#if item.kind === "ask" && answerable}
    <div class="peers">
      <Button
        aria-label="Deny {item.ask} on {item.title}"
        class="peer deny"
        disabled={held}
        onclick={() => answer("deny")}
        {onkeydown}
        size="sm"
        variant="secondary"
      >
        <IconClose />
        Deny
      </Button>
      <Button
        aria-label="Approve {item.ask} on {item.title}"
        class="peer approve"
        disabled={held}
        onclick={() => answer("allow")}
        {onkeydown}
        size="sm"
        variant="secondary"
      >
        <IconTick />
        Approve
      </Button>
    </div>
  {/if}
</div>

<style>
  /* The session's mark leading on the title's line; the title and its wait;
     what it wants, two lines at most; then the kind and where; a
     permission's peers under them. */
  .row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: var(--space-3);
    align-items: baseline;
    min-block-size: 44px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
  }
  /* Its machine is offline: it stands, dimmed as every stale row is. */
  .row[data-stale] {
    opacity: 0.55;
  }
  /* Everything over the cover takes no pointer, so a press anywhere that is
     not a control opens it; the peers take theirs back. */
  .cover {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  @media (hover: hover) and (pointer: fine) {
    .row:has(.cover:hover) {
      background: var(--surface-hover);
    }
  }
  .lead,
  .name,
  .wait,
  .want,
  .meta {
    position: relative;
    pointer-events: none;
  }
  /* The mark centred in the panel's one leading column, a notice's tile
     wide (NoticeRow), so both groups' words start on one line. */
  .lead {
    grid-row: 1;
    grid-column: 1;
    align-self: center;
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 18px;
    color: var(--ink-muted);
  }
  .lead > :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .name {
    grid-row: 1;
    grid-column: 2;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wait {
    grid-row: 1;
    grid-column: 3;
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .want {
    grid-row: 2;
    grid-column: 2 / 4;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .meta {
    grid-row: 3;
    grid-column: 2 / 4;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The meta line of an ask: the project leads in its mark and strong ink,
     the machine follows by its OS mark; the machine's name gives way first. */
  .where {
    display: flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
  }
  .where > * {
    flex: none;
  }
  .project,
  .machine {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
  }
  .machine {
    flex: 0 1 auto;
  }
  .where :global(.mark) {
    inline-size: 14px;
    block-size: 14px;
    flex: none;
  }
  .project-name {
    font: var(--type-label);
    font-size: var(--text-meta);
    color: var(--ink-strong);
  }
  .machine-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    color: var(--ink-muted);
  }
  /* Deny then Approve together at the trailing edge, the same size, each
     tinted by what it does: Deny in the fail status's fill and ink, Approve
     in the live status's. Equal in salience (The Peer Rule): the same fill
     strength, and neither changes under the pointer, as the grant variant
     holds still, so neither is made the more inviting. On a finger the gap
     opens (The 44 Touch Rule), the separation the rule's opposite ends
     gave a rushed thumb. */
  .peers {
    position: relative;
    grid-row: 4;
    grid-column: 2 / 4;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  @media (pointer: coarse) {
    .peers {
      gap: var(--space-4);
    }
  }
  .peers > :global(.peer) {
    border-color: transparent;
  }
  .peers > :global(.deny),
  .peers > :global(.deny:hover) {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .peers > :global(.approve),
  .peers > :global(.approve:hover) {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
</style>
