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
  import { IconClose, IconDollar, IconTick, IconWorkflow } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    cawco,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
  } from "../client.svelte";
  import { conversationHref } from "../links";
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
  /** Its last line: the kind, then where it is (machine · project). */
  const meta = $derived.by(() => {
    switch (item.kind) {
      case "ask":
        return `${item.isQuestion ? "Question" : "Permission"} · ${item.place}${item.stale ? " · machine offline" : ""}`;
      case "run":
        return `Workflow · ${item.place}`;
      default:
        return "Budget";
    }
  });
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
  <span class="meta">{meta}</span>
  {#if item.kind === "ask" && answerable}
    <div class="peers">
      <Button
        aria-label="Deny {item.ask} on {item.title}"
        disabled={held}
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
        disabled={held}
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
  /* Equal peers at opposite ends, with nothing between them. */
  .peers {
    position: relative;
    grid-row: 4;
    grid-column: 2 / 4;
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
    margin-top: var(--space-2);
  }
</style>
