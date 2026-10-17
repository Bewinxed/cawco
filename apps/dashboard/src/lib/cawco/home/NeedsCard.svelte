<script lang="ts">
  /**
   * One thing parked on the operator, as a row of Caw's panel (NeedsCaw):
   * a session's permission or question, a workflow run's question, a
   * project past its spend cap, or a project's task waiting on you (its
   * review, or a failed attempt), which opens the task with its deliverable
   * and the way to act on it first. The session's mark leads (a run and a
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
   *
   * An onboarding choice nobody answered (the fleet's upstream choice) is
   * the same row with its risk as its line and its two options as the
   * peers; it opens nothing, and leaves once the hub has the answer.
   */
  import { questionsOf } from "@cawco/core";
  import { UPSTREAM_WORDS } from "@cawco/core/upstream-guard";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconCheck,
    IconClose,
    IconDollar,
    IconError,
    IconFolder,
    IconLock,
    IconMaximize,
    IconNeedsYou,
    IconSend,
    IconServer,
    IconShield,
    IconTick,
    IconWarningTriangle,
    IconWorkflow,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    answerFleetUpstream,
    answerFor,
    cawco,
    decideAction,
    type PermissionAnswer,
    permissionAnswer,
    submitCommand,
  } from "../client.svelte";
  import ErrorText from "../ErrorText.svelte";
  import { answerMachine, answerPairing } from "../hub-auth.svelte";
  import { conversationHref } from "../links";
  import OsMark from "../OsMark.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { cawOf } from "../session-status";
  import { capLine } from "../usage";
  import { choices } from "./choices.svelte";
  import { askView, clock, type NeedsItem, span } from "./home-state.svelte";
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
    if (item.kind === "choice") {
      return;
    }
    if (item.kind !== "ask") {
      return item.href;
    }
    // An ask opens where it was made (`askView`).
    return conversationHref(askView(item), cawco.instanceIndex);
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
      case "choice":
        return UPSTREAM_WORDS.risk;
      case "pairing":
        return `Wants to run your fleet with code ${item.request.userCode}. Approve only if it's the code on that device.`;
      case "admission":
        return "Waits to join your fleet. Admitted, it runs sessions like your other machines.";
      case "task":
        return item.reason === "review"
          ? `Review the draft: it waits on you in ${item.stage}`
          : "Its session failed: read why, then try again";
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
      refusal = failureWords(error);
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
    switch (item.kind) {
      case "run":
        return `Workflow · ${item.place}`;
      case "watch":
        return `Fleet watch · ${item.place}`;
      case "choice":
        return "Onboarding · each project can change it";
      case "pairing":
        return item.place ? `Pairing · ${item.place}` : "Pairing";
      case "admission":
        return ["Machine", item.machine.platform, item.place]
          .filter(Boolean)
          .join(" · ");
      default:
        return "Budget";
    }
  });

  /** Your answer to a pairing or a waiting machine, on its way, and the hub's refusal of it. */
  let admitting = $state<boolean | null>(null);
  async function admitOrDeny(approve: boolean) {
    if (
      !(item.kind === "pairing" || item.kind === "admission") ||
      held ||
      admitting !== null
    ) {
      return;
    }
    admitting = approve;
    refusal = null;
    try {
      await (item.kind === "pairing"
        ? answerPairing(item.request.userCode, approve)
        : answerMachine(item.machine.machineId, approve));
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      admitting = null;
    }
  }
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
    openPeek({ viewId: item.instanceId, href: href ?? "", title: item.title });
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

  /** The upstream choice's answer on its way, by the option pressed; the hub's refusal in its words. */
  let choosing = $state<boolean | null>(null);
  let choiceRefusal = $state<string | null>(null);
  async function choose(posts: boolean): Promise<void> {
    if (item.kind !== "choice" || stale || choosing !== null) {
      return;
    }
    choosing = posts;
    choiceRefusal = null;
    try {
      await answerFleetUpstream(posts);
    } catch (error) {
      choiceRefusal = failureWords(error);
    } finally {
      choosing = null;
    }
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

<!-- mark-line: a grid whose first row is the mark line; its words take
     .mark-text, centred on the lead (the rows under it hold other things) -->
<div
  data-slot="row"
  class="row"
  data-flip
  data-kind={item.kind}
  data-peek={peeks || undefined}
  data-share="pane:{item.kind === 'ask' ? item.instanceId : item.key}"
  data-stale={held || undefined}
>
  <!-- The whole row opens it; the panel closes. A choice opens nothing:
       it is answered here. -->
  {#if href !== undefined}
    <a
      data-slot="cover"
      aria-label="Open {item.title}"
      class="cover press-tint focus-inset"
      {href}
      onclick={onchoose}
      {onkeydown}><span class="sr-only">Open {item.title}</span></a
    >
  {/if}
  <!-- The session's own mark, as the rail draws it; a run and a budget their glyphs. -->
  <span data-slot="lead" class="lead">
    {#if item.kind === "ask" || item.kind === "watch"}
      <SessionMark
        caw={cawOf(item.instanceId)}
        id={item.instanceId}
        place={item.cwd || item.machineId}
        status="attn"
      />
    {:else if item.kind === "run"}
      <IconWorkflow aria-hidden="true" />
    {:else if item.kind === "choice"}
      <IconShield aria-hidden="true" />
    {:else if item.kind === "pairing"}
      <IconLock aria-hidden="true" />
    {:else if item.kind === "admission"}
      <IconServer aria-hidden="true" />
    {:else if item.kind === "task"}
      {#if item.reason === "failed"}
        <IconError aria-hidden="true" />
      {:else}
        <IconNeedsYou aria-hidden="true" />
      {/if}
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
  <span data-slot="name" class="name mark-text">{item.title}</span>
  {#if item.raisedAt !== undefined}
    <span data-slot="wait" class="wait mark-text"
      >{span(clock.now - item.raisedAt)}</span
    >
  {/if}
  {#if peeks}
    <!-- Glance → peek → dive: read what led here before answering. -->
    <span data-slot="end" class="end">
      <Tip disabled={peekTipOff()} label="Peek">
        {#snippet children(tip)}
          <button
            data-needs-card-peek
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
  <span data-slot="want" class="want">{want}</span>
  {#if item.kind === "ask" && item.request.presentation.command}
    <!-- What runs, under why: its first line, so Approve here is made on
         the command as much as on the card. -->
    <code class="cmd"
      >{item.request.presentation.command.trim().split("\n")[0]}</code
    >
  {/if}
  {#if item.kind === "ask"}
    <!-- Where it came from: the project first, in its mark and strong ink;
         then what it asks for; then the machine, by its OS mark. -->
    <span data-where data-slot="meta" class="meta where mark-line">
      {#if item.project}
        <span data-slot="project" class="project mark-line" data-box>
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="mark"
            style="color: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="project-name"
            >{item.project.name}</span
          >
        </span>
        <span data-slot="dot" aria-hidden="true" class="dot">·</span>
      {/if}
      <span>{item.isQuestion ? "Question" : "Permission"}</span>
      <span data-slot="dot" aria-hidden="true" class="dot">·</span>
      <span data-slot="machine" class="machine mark-line" data-box>
        <OsMark class="mark" os={item.machine.os} />
        <span class="machine-name">{item.machine.name}</span>
      </span>
      {#if item.stale}
        <span data-slot="dot" aria-hidden="true" class="dot">·</span>
        <span>machine offline</span>
      {/if}
    </span>
  {:else if item.kind === "action" && call}
    <!-- The exact call: when, through which account, the tool, the arguments. -->
    <dl data-slot="call" class="call">
      <dt>Runs</dt>
      <dd>{call.when}</dd>
      <dt>Through</dt>
      <dd>{call.through}</dd>
      <dt>Tool</dt>
      <dd data-slot="tool" class="tool">{call.tool}</dd>
    </dl>
    <!-- A scroller with no focusable child is itself in the tab order
         (keyboard-focusable scrollers), so a keyboard scrolls it too. -->
    <pre data-slot="args" class="args focus-inset">{call.args}</pre>
    <span data-where data-slot="meta" class="meta where mark-line">
      {#if item.project}
        <span data-slot="project" class="project mark-line" data-box>
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="mark"
            style="color: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="project-name"
            >{item.project.name}</span
          >
        </span>
        <span data-slot="dot" aria-hidden="true" class="dot">·</span>
      {/if}
      <span>Approved action</span>
      {#if item.action.taskId}
        <span data-slot="dot" aria-hidden="true" class="dot">·</span>
        <span class="task">{item.action.taskId}</span>
      {/if}
    </span>
  {:else if item.kind === "task"}
    <span data-where data-slot="meta" class="meta where mark-line">
      {#if item.project}
        <span data-slot="project" class="project mark-line" data-box>
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="mark"
            style="color: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="project-name"
            >{item.project.name}</span
          >
        </span>
        <span data-slot="dot" aria-hidden="true" class="dot">·</span>
      {/if}
      <span>Task</span>
      <span data-slot="dot" aria-hidden="true" class="dot">·</span>
      <span class="task">{item.taskId}</span>
    </span>
  {:else}
    <span data-slot="meta" class="meta">{meta}</span>
  {/if}
  {#if item.kind === "ask" && answerable}
    <div data-slot="peers" class="peers">
      {#if answerRefused}
        <ErrorText
          class="refusal"
          message={answerRefused}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        data-deny
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
        data-approve
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
  {:else if item.kind === "choice"}
    <!-- Its two options as the peers: same size, type and fill (The Peer
         Rule); keeping agents off comes first, as the recommended one. -->
    <div data-slot="peers" class="peers">
      {#if choiceRefusal}
        <ErrorText
          class="refusal"
          message={choiceRefusal}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        class="peer"
        disabled={stale || choosing === true}
        failed={choiceRefusal !== null}
        label={UPSTREAM_WORDS.keepOff}
        onclick={() => choose(false)}
        pending={choosing === false}
        pendingLabel="Saving…"
        size="sm"
        variant="secondary"
      />
      <Button
        class="peer"
        disabled={stale || choosing === false}
        label={UPSTREAM_WORDS.allow}
        onclick={() => choose(true)}
        pending={choosing === true}
        pendingLabel="Saving…"
        size="sm"
        variant="secondary"
      />
    </div>
  {:else if item.kind === "pairing" || item.kind === "admission"}
    {@const who =
      item.kind === "pairing"
        ? `${item.title}, code ${item.request.userCode}`
        : item.title}
    <div data-slot="peers" class="peers">
      {#if refusal}
        <ErrorText
          class="refusal"
          message={refusal}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        data-deny
        aria-label="Deny {who}"
        class="peer deny"
        disabled={held || admitting === true}
        icon={IconClose}
        label="Deny"
        onclick={() => admitOrDeny(false)}
        pending={admitting === false}
        pendingLabel="Denying…"
        size="sm"
        variant="secondary"
      />
      <Button
        data-approve
        aria-label="{item.kind === 'pairing' ? 'Approve' : 'Admit'} {who}"
        class="peer approve"
        disabled={held || admitting === false}
        icon={IconTick}
        label={item.kind === "pairing" ? "Approve" : "Admit"}
        onclick={() => admitOrDeny(true)}
        pending={admitting === true}
        pendingLabel={item.kind === "pairing" ? "Approving…" : "Admitting…"}
        size="sm"
        variant="secondary"
      />
    </div>
  {:else if item.kind === "action"}
    <div data-slot="peers" class="peers">
      {#if refusal}
        <ErrorText
          class="refusal"
          message={refusal}
          title="The hub refused that decision"
        />
      {/if}
      {#if approvable}
        <Button
          data-deny
          aria-label="Deny {item.action.tool} on {item.action.connection}"
          class="peer deny"
          disabled={held || deciding}
          onclick={() => decide("deny")}
          {onkeydown}
          size="sm"
          variant="secondary"
        >
          <IconClose />
          <span>Deny</span>
        </Button>
        <Button
          data-approve
          aria-label="Approve {item.action.tool} on {item.action.connection}"
          class="peer approve"
          disabled={held || deciding}
          onclick={() => decide("approve")}
          {onkeydown}
          size="sm"
          variant="secondary"
        >
          <IconTick />
          <span>Approve</span>
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
          <span>Remove</span>
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
      (24px - var(--peek-glyph)) / 2 + var(--peek-glyph) * 1.25 / 24
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
  /* The first row's words stand on the lead's middle (.mark-text, app.css). */
  .name {
    grid-row: 1;
    grid-column: 2;
    align-self: center;
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wait {
    grid-row: 1;
    grid-column: 3;
    align-self: center;
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
    min-inline-size: 0;
    overflow: clip;
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
  /* A choice's risk is the whole of what it asks: read whole, never cut. */
  .row[data-kind="choice"] > .want {
    display: block;
    -webkit-line-clamp: unset;
    line-clamp: none;
  }
  /* A choice's options are its words, longer than Deny and Approve, too
     long to stand side by side in the panel: they stack, each the text
     column's width, so the two stay peers in size (The Peer Rule). */
  .row[data-kind="choice"] > .peers {
    flex-direction: column;
    align-items: stretch;
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
  /* A shell ask's command: one line under its reason, in the transcript's
     command rule, cut with an ellipsis; its place and the peers move down
     one row. */
  .cmd {
    position: relative;
    pointer-events: none;
    grid-row: 3;
    grid-column: 2 / 4;
    min-inline-size: 0;
    margin-block: 2px var(--space-1);
    padding-inline-start: var(--space-2);
    border-inline-start: 2px solid var(--border-hairline);
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: pre;
  }
  .row:has(> .cmd) > .meta {
    grid-row: 4;
  }
  .row:has(> .cmd) > .peers {
    grid-row: 5;
  }
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
