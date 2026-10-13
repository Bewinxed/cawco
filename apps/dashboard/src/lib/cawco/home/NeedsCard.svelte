<script lang="ts">
  /**
   * One thing parked on the operator, as a row of Caw's panel (NeedsCaw):
   * a session's permission or question, a workflow run's question, or a
   * project past its spend cap. The session's mark leads (a run and a
   * budget their glyphs), then the title and its wait, what it wants in the
   * words it is asked, and the kind and where. The row itself opens it (the
   * session at the request, the run, the project's spend) and the panel
   * closes (`onchoose`). In the wide layout (a desk, an iPad; not a phone)
   * a session's ask offers Peek at the title line's end, after its wait:
   * the session's tail, read before answering, and the panel closes as it
   * does when a row is chosen. A permission is answered here too, with Deny and
   * Approve as equal peers (DESIGN.md, The Peer Rule): same size, type and
   * fill strength, tinted fail and done, told apart by hue and glyph;
   * "Always allow" never appears.
   *
   * Nothing is optimistic: an answer is the same `permission.answer` command
   * the session's own card sends, and the row leaves when the hub has taken
   * it — the request card above that pane's composer leaves with it.
   *
   * An approved action is the same row with the call laid out under its
   * reason: when it runs (in this browser's zone), the connection and the
   * account it signs in as, the tool, and the exact arguments in a well that
   * scrolls. Deny and Approve are the permission's peers; Approve names the
   * arguments' hash the hub gave with them, so the hub runs the call shown
   * and refuses any other. One that failed says why (the hub's or the
   * service's words), and one whose call may or may not have happened says
   * so; Remove puts either away once you have read it.
   */
  import { questionsOf } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconCheck,
    IconClose,
    IconDollar,
    IconError,
    IconFolder,
    IconMaximize,
    IconSend,
    IconTick,
    IconWarningTriangle,
    IconWorkflow,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    answerFor,
    cawco,
    decideAction,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
  } from "../client.svelte";
  import ErrorText from "../ErrorText.svelte";
  import { conversationHref } from "../links";
  import OsMark from "../OsMark.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { capLine } from "../usage";
  import { choices } from "./choices.svelte";
  import { clock, type NeedsItem, span } from "./home-state.svelte";
  import { openPeek, peekable, peekTipOff } from "./peek.svelte";

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
      case "watch":
        return item.notice.title;
      case "action":
        if (item.action.state === "unknown") {
          return `This may or may not have happened. Check ${item.action.service}.`;
        }
        return item.action.state === "failed"
          ? `It failed. ${item.action.error ?? `${item.action.service} did not take it.`}`
          : item.action.reason;
      default:
        return capLine(item.cap);
    }
  });

  /** An action's call, laid out: when, through what, the tool, and its arguments as JSON. */
  const call = $derived.by(() => {
    if (item.kind !== "action") {
      return null;
    }
    const { action } = item;
    let { args } = action;
    try {
      args = JSON.stringify(JSON.parse(action.args), null, 2);
    } catch {
      // The hub stores what it serialised; shown as stored if it ever is not JSON.
    }
    return {
      when: whenOf(action.state, action.runAt, action.startedAt, clock.now),
      through: `${action.connection} · ${action.service} as ${action.account}`,
      tool: action.tool,
      args,
    };
  });

  /** "Tue 13 Oct, 09:00 BST", in this browser's zone: the operator's. */
  function stamp(at: number): string {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(at);
  }

  /** When the call runs, or (failed, unknown) when it was tried. */
  function whenOf(
    state: string,
    runAt: number | null,
    startedAt: number | null,
    now: number
  ): string {
    if (state === "unknown" || state === "failed") {
      return startedAt === null ? "Not tried" : `Tried ${stamp(startedAt)}`;
    }
    if (runAt === null) {
      return "As soon as you approve";
    }
    return runAt <= now
      ? `As soon as you approve (was due ${stamp(runAt)})`
      : stamp(runAt);
  }

  /** The hub's refusal of your last decision on an action, in its words. */
  let refusal = $state<string | null>(null);
  /** A decision on its way: both peers hold until the hub answers. */
  let deciding = $state(false);

  async function decide(decision: "approve" | "deny" | "checked") {
    if (item.kind !== "action" || held || deciding) {
      return;
    }
    deciding = true;
    refusal = null;
    try {
      await decideAction(item.action, decision);
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    } finally {
      deciding = false;
    }
  }
  /**
   * A run's, a watch notice's and a budget's last line: the kind, then where
   * it is. An ask's is drawn in the markup: its project, its kind, its
   * machine by its mark.
   */
  const meta = $derived.by(() => {
    if (item.kind === "run") {
      return `Workflow · ${item.place}`;
    }
    return item.kind === "watch" ? `Fleet watch · ${item.place}` : "Budget";
  });
  /**
   * The row stands but cannot be answered yet: the hub is not live, or its
   * session's machine is offline. It keeps its place, dimmed, and its
   * answer waits; nothing is sent until it can land.
   */
  const held = $derived(stale || (item.kind === "ask" && item.stale));
  /**
   * A session's ask can be peeked, in the wide layout: a thread is opened,
   * not peeked (it is the conversation itself), and a run and a budget have
   * no tail.
   */
  const peeks = $derived(item.kind === "ask" && !item.thread && peekable());

  function peekAsk(): void {
    if (item.kind !== "ask") {
      return;
    }
    onchoose();
    openPeek({ viewId: item.instanceId, href, title: item.title });
  }

  /** A permission answered on the row, under the `answer` choice. */
  const answerable = $derived(
    item.kind === "ask" && !item.isQuestion && choices.answer === "a"
  );

  /**
   * The last answer sent to this ask, from here or from its session's card:
   * its stage is the row's truth. In flight, both peers hold and the pressed
   * one spins; refused, the hub's words stand under them and either can be
   * pressed again. The row leaves when the hub has taken the answer.
   */
  const sent = $derived(
    item.kind === "ask" ? answerFor(item.request.requestId) : null
  );
  const answering = $derived(
    sent !== null && sent.stage !== "failed" && sent.stage !== "applied"
  );
  const answerRefused = $derived.by(() => {
    if (sent?.stage !== "failed") {
      return null;
    }
    return sent.reason
      ? `Couldn't send that answer. ${sent.reason}`
      : "Couldn't send that answer.";
  });
  /** Which peer was pressed here, for its spinner. */
  let pressed = $state<PermissionAnswer | null>(null);

  function answer(kind: PermissionAnswer): void {
    if (item.kind !== "ask" || held || answering) {
      return;
    }
    pressed = kind;
    submitCommand(item.instanceId, item.machineId, "permission.answer", {
      requestId: item.request.requestId,
      result: permissionAnswer(item.request, kind),
    });
  }

  /** An approved action waiting for your approval: Deny and Approve stand. */
  const approvable = $derived(
    item.kind === "action" && item.action.state === "proposed"
  );

  /** The permission's own keys (`y`/`a` approve, `n`/`d` deny) while a control here has focus. */
  function onkeydown(event: KeyboardEvent): void {
    if (
      !(answerable || approvable) ||
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
      if (approvable) {
        decide("approve");
      } else {
        answer("allow");
      }
    } else if (key === "n" || key === "d") {
      event.preventDefault();
      if (approvable) {
        decide("deny");
      } else {
        answer("deny");
      }
    }
  }
</script>

<div
  class="row"
  data-flip
  data-kind={item.kind}
  data-peek={peeks || undefined}
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
    {#if item.kind === "ask" || item.kind === "watch"}
      <SessionMark
        id={item.instanceId}
        place={item.cwd || item.machineId}
        status="attn"
      />
    {:else if item.kind === "run"}
      <IconWorkflow aria-hidden="true" />
    {:else if item.kind === "action"}
      {#if item.action.state === "unknown"}
        <IconWarningTriangle aria-hidden="true" />
      {:else if item.action.state === "failed"}
        <IconError aria-hidden="true" />
      {:else}
        <IconSend aria-hidden="true" />
      {/if}
    {:else}
      <IconDollar aria-hidden="true" />
    {/if}
  </span>
  <span class="name">{item.title}</span>
  {#if item.raisedAt !== undefined}
    <span class="wait">{span(clock.now - item.raisedAt)}</span>
  {/if}
  {#if peeks}
    <!-- Glance → peek → dive: read what led here before answering. -->
    <span class="end">
      <Tip disabled={peekTipOff()} label="Peek">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-label="Peek {item.title}"
            class="peek touch-hit pointer-hit focus-inset"
            onclick={peekAsk}
            {onkeydown}
            type="button"
          >
            <IconMaximize aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    </span>
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
  {:else if item.kind === "action" && call}
    <!-- The exact call: when, through which account, the tool, the arguments. -->
    <dl class="call">
      <dt>Runs</dt>
      <dd>{call.when}</dd>
      <dt>Through</dt>
      <dd>{call.through}</dd>
      <dt>Tool</dt>
      <dd class="tool">{call.tool}</dd>
    </dl>
    <!-- A scroller with no focusable child is itself in the tab order
         (keyboard-focusable scrollers), so a keyboard scrolls it too. -->
    <pre class="args focus-inset">{call.args}</pre>
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
      <span>Approved action</span>
      {#if item.action.taskId}
        <span aria-hidden="true" class="dot">·</span>
        <span class="task">{item.action.taskId}</span>
      {/if}
    </span>
  {:else}
    <span class="meta">{meta}</span>
  {/if}
  {#if item.kind === "ask" && answerable}
    <div class="peers">
      {#if answerRefused}
        <ErrorText
          class="refusal"
          message={answerRefused}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        aria-label="Deny {item.ask} on {item.title}"
        class="peer deny"
        disabled={held || (answering && pressed !== "deny")}
        failed={answerRefused !== null && pressed === "deny"}
        icon={IconClose}
        label="Deny"
        onclick={() => answer("deny")}
        {onkeydown}
        pending={answering && pressed === "deny"}
        pendingLabel="Denying…"
        size="sm"
        variant="secondary"
      />
      <Button
        aria-label="Approve {item.ask} on {item.title}"
        class="peer approve"
        disabled={held || (answering && pressed !== "allow")}
        failed={answerRefused !== null && pressed === "allow"}
        icon={IconTick}
        label="Approve"
        onclick={() => answer("allow")}
        {onkeydown}
        pending={answering && pressed === "allow"}
        pendingLabel="Approving…"
        size="sm"
        variant="secondary"
      />
    </div>
  {:else if item.kind === "action"}
    <div class="peers">
      {#if refusal}
        <ErrorText
          class="refusal"
          message={refusal}
          title="The hub refused that decision"
        />
      {/if}
      {#if approvable}
        <Button
          aria-label="Deny {item.action.tool} on {item.action.connection}"
          class="peer deny"
          disabled={held || deciding}
          onclick={() => decide("deny")}
          {onkeydown}
          size="sm"
          variant="secondary"
        >
          <IconClose />
          Deny
        </Button>
        <Button
          aria-label="Approve {item.action.tool} on {item.action.connection}"
          class="peer approve"
          disabled={held || deciding}
          onclick={() => decide("approve")}
          {onkeydown}
          size="sm"
          variant="secondary"
        >
          <IconTick />
          Approve
        </Button>
      {:else}
        <Button
          aria-label="Remove {item.action.tool} on {item.action
            .connection} from Needs you"
          disabled={held || deciding}
          onclick={() => decide("checked")}
          size="sm"
          variant="secondary"
        >
          <IconCheck />
          Remove
        </Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The session's mark leading on the title's line; the title and its wait;
     what it wants, two lines at most; then the kind and where; a
     permission's peers under them. */
  .row {
    --peek-glyph: var(--icon-md);
    --peek-ink: calc(
      (24px - var(--peek-glyph)) /
      2 +
      var(--peek-glyph) *
      1.25 / 24
    );
    --peek-room: calc(24px - var(--peek-ink) + var(--space-2));
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
  /* Peek, the title line's trailing cell, as a notice's ✕ is (NoticeRow):
     a 24px box round the 16px glyph, centred on the label line, hanging past
     the trailing edge by `--peek-ink` (the box's padding round the glyph
     plus the glyph's side bearing: Maximize's arrow ends at 22.75 of 24), so
     its ink ends on the panel's one trailing edge, where a wait's figures and
     Approve's fill end. The wait and, with no wait, the title keep its room
     clear (`--peek-room`), `space-2` short of its box. */
  .row[data-peek] > .wait {
    margin-inline-end: var(--peek-room);
  }
  .row[data-peek]:not(:has(> .wait)) > .name {
    padding-inline-end: var(--peek-room);
  }
  .end {
    position: absolute;
    inset-block-start: calc(var(--space-2) + (1lh - 24px) / 2);
    inset-inline-end: calc(var(--space-3) - var(--peek-ink));
    display: flex;
    font: var(--type-label);
  }
  .peek {
    display: grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
  .peek > :global(svg) {
    inline-size: var(--peek-glyph);
    block-size: var(--peek-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .peek:active {
      transform: scale(var(--press-scale));
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .peek:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  /* An iPad's finger gets the house's 44px area (`touch-hit`), whole and
     centred where the box stood before it hung: moved back inboard by
     `--peek-ink`, so the list never grows a sideways scroll for it. */
  @media (pointer: coarse) {
    /* Under a finger the glyph is the house's touch size (`icon-lg`); its
       ink still ends on the trailing edge (`--peek-ink` follows it). */
    .row {
      --peek-glyph: var(--icon-lg);
    }
    .peek::after {
      inset-inline-start: calc((24px - 44px) / 2 - var(--peek-ink));
      inset-inline-end: calc((24px - 44px) / 2 + var(--peek-ink));
    }
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
  /* The meta line of an ask: the project leads, its name a name (label role,
     strong ink) beside its folder in the project's hue; the machine follows
     by its OS mark; the machine's name gives way first. Both marks stand at
     the house's 16px icon size (`icon-md`), the box OsMark is drawn on: at
     14px its marks were scaled off their pixel grid and read as a smudge at
     1x. */
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
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    flex: none;
  }
  .project-name {
    font: var(--type-label);
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
     in the done status's, the house's success pair (go, not "working"). Both
     pairs are their hue's 3-step mixed 24% toward its 9-step, so they are
     equal in salience (The Peer Rule): the same fill strength, and neither
     changes under the pointer, as the grant variant
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
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }

  /* An approved action: its reason, then the call (when, through, tool) as
     label and value pairs on the meta type, then the arguments in a content
     well that scrolls, then where it is from, then the peers. Everything
     the call says is read before the choice is made, in the order it is
     made: when, as whom, what, with what. */
  .row[data-kind="action"] > .meta {
    grid-row: 5;
  }
  .row[data-kind="action"] > .peers {
    grid-row: 6;
  }
  .call {
    position: relative;
    pointer-events: none;
    grid-row: 3;
    grid-column: 2 / 4;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: var(--space-3);
    margin: var(--space-2) 0 0;
    font: var(--type-meta);
  }
  .call dt {
    color: var(--ink-muted);
  }
  .call dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--ink-strong);
  }
  .call .tool {
    font-family: var(--font-mono);
  }
  /* The arguments as the hub will send them, pretty-printed: a well the
     pointer and the keyboard can scroll, over the row's cover. */
  .args {
    position: relative;
    grid-row: 4;
    grid-column: 2 / 4;
    max-block-size: 12rem;
    margin: var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    overflow: auto;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-xs);
    background: var(--surface-well);
    color: var(--ink-strong);
    font: var(--type-code);
    white-space: pre;
    overscroll-behavior: contain;
  }
  .task {
    font-variant-numeric: tabular-nums;
  }
  .peers > :global(.refusal) {
    flex: 1 1 auto;
    align-self: center;
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
