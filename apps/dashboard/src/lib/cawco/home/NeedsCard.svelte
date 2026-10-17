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
      case "cap":
        break;
    }
    return capLine(item.cap);
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
      case "action":
      case "ask":
      case "cap":
      case "task":
        break;
    }
    return "Budget";
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

<!-- The session's mark leading on the title's line; the title and its wait;
     what it wants, two lines at most; then the kind and where; a
     permission's peers under them. Its machine is offline: it stands,
     dimmed as every stale row is. -->
<!-- literal: auto minmax(0, 1fr) auto; 44px; 24px -->
<!-- mark-line: a grid whose first row is the mark line; its words take
     .mark-text, centred on the lead (the rows under it hold other things) -->
<div
  data-slot="row"
  class="group/row relative grid min-h-(--row-min) grid-cols-(--row-cols) items-baseline gap-x-space-3 rounded-sm px-space-3 py-space-2 data-stale:opacity-55 can-hover:has-[[data-slot=cover]:hover]:bg-surface-hover"
  data-flip
  data-kind={item.kind}
  data-peek={peeks || undefined}
  data-share="pane:{item.kind === 'ask' ? item.instanceId : item.key}"
  data-stale={held || undefined}
  style:--peek-glyph="var(--c-peek-glyph)"
  style:--peek-ink={"calc((24px - var(--peek-glyph)) / 2 + var(--peek-glyph) * 1.25 / 24)"}
  style:--peek-room="calc(24px - var(--peek-ink) + var(--space-2))"
  style:--row-cols="auto minmax(0, 1fr) auto"
  style:--row-min="44px"
>
  <!-- The whole row opens it; the panel closes. A choice opens nothing:
       it is answered here. Everything over the cover takes no pointer, so
       a press anywhere that is not a control opens it; the peers take
       theirs back. -->
  {#if href !== undefined}
    <a
      data-slot="cover"
      aria-label="Open {item.title}"
      class="press-tint focus-inset absolute inset-0 rounded-inherit"
      {href}
      onclick={onchoose}
      {onkeydown}><span class="sr-only">Open {item.title}</span></a
    >
  {/if}
  <!-- The session's own mark, as the rail draws it; a run and a budget their
       glyphs; centred in the panel's one leading column, a notice's tile
       wide (NoticeRow), so both groups' words start on one line. -->
  <!-- literal: 28px, 18px -->
  <span
    data-slot="lead"
    class="pointer-events-none relative col-1 row-1 grid h-(--lead-h) w-(--lead-w) place-items-center self-center text-ink-muted [&>svg]:size-icon-md"
    style:--lead-h="18px"
    style:--lead-w="28px"
  >
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
  <!-- The first row's words stand on the lead's middle (.mark-text,
       app.css). Peek, the title line's trailing cell, as a notice's ✕ is
       (NoticeRow): the wait and, with no wait, the title keep its room clear
       (`--peek-room`), `space-2` short of its box. -->
  <span
    data-slot="name"
    class={[
      "mark-text pointer-events-none relative col-2 row-1 min-w-0 self-center overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong",
      item.raisedAt === undefined && "group-data-peek/row:pe-(--peek-room)",
    ]}>{item.title}</span
  >
  {#if item.raisedAt !== undefined}
    <span
      data-slot="wait"
      class="mark-text pointer-events-none relative col-3 row-1 self-center type-meta num text-ink-muted group-data-peek/row:me-(--peek-room)"
      >{span(clock.now - item.raisedAt)}</span
    >
  {/if}
  {#if peeks}
    <!-- Glance → peek → dive: read what led here before answering. A 24px
         box round the 16px glyph, centred on the label line, hanging past
         the trailing edge by `--peek-ink` (the box's padding round the
         glyph plus the glyph's side bearing: Maximize's arrow ends at 22.75
         of 24), so its ink ends on the panel's one trailing edge, where a
         wait's figures and Approve's fill end. -->
    <!-- literal: 24px -->
    <span
      data-slot="end"
      class="absolute end-(--end-x) top-(--end-top) flex type-label"
      style:--end-top="calc(var(--space-2) + (1lh - 24px) / 2)"
      style:--end-x="calc(var(--space-3) - var(--peek-ink))"
    >
      <Tip disabled={peekTipOff()} label="Peek">
        {#snippet children(tip)}
          <!-- An iPad's finger gets the house's 44px area (`touch-hit`),
               whole and centred where the box stood before it hung: moved
               back inboard by `--peek-ink`, so the list never grows a
               sideways scroll for it. -->
          <!-- literal: 24px; 44px -->
          <button
            data-needs-card-peek
            {...tip}
            aria-label="Peek {item.title}"
            class="touch-hit pointer-hit focus-inset grid size-(--peek-box) cursor-pointer place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted transition-tint-press hover:bg-surface-hover hover:text-ink-strong motion-safe:active:transform-(--peek-press)"
            onclick={peekAsk}
            {onkeydown}
            style:--peek-box="24px"
            style:--peek-hit-end="calc((24px - 44px) / 2 + var(--peek-ink))"
            style:--peek-hit-start="calc((24px - 44px) / 2 - var(--peek-ink))"
            style:--peek-press="scale(var(--press-scale))"
            type="button"
          >
            <IconMaximize aria-hidden="true" class="size-(--peek-glyph)" />
          </button>
        {/snippet}
      </Tip>
    </span>
  {/if}
  <span
    data-slot="want"
    class="pointer-events-none relative col-start-2 col-end-4 row-2 line-clamp-2 line-clamp-std-2 type-body wrap-anywhere text-ink-strong group-kind-choice/row:block group-kind-choice/row:line-clamp-undo"
    >{want}</span
  >
  {#if item.kind === "ask" && item.request.presentation.command}
    <!-- What runs, under why: its first line, so Approve here is made on
         the command as much as on the card. A shell ask's command: one line
         under its reason, in the transcript's command rule, cut with an
         ellipsis; its place and the peers move down one row. -->
    <code
      class="pointer-events-none relative col-start-2 col-end-4 row-3 mt-space-row mb-space-1 min-w-0 overflow-hidden border-s-2 border-s-border-hairline ps-space-2 font-mono text-size-meta text-ellipsis whitespace-pre text-ink-muted"
      >{item.request.presentation.command.trim().split("\n")[0]}</code
    >
  {/if}
  {#if item.kind === "ask"}
    <!-- Where it came from: the project first, in its mark and strong ink;
         then what it asks for; then the machine, by its OS mark. The meta
         line of an ask: the project leads, its name a name (label role,
         strong ink) beside its folder in the project's hue; the machine
         follows by its OS mark; the machine's name gives way first. Both
         marks stand at the house's 16px icon size (`icon-md`), the box
         OsMark is drawn on: at 14px its marks were scaled off their pixel
         grid and read as a smudge at 1x. -->
    <span
      data-where
      data-slot="meta"
      class={[
        "mark-line pointer-events-none relative col-start-2 col-end-4 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted",
        item.request.presentation.command ? "row-4" : "row-3",
      ]}
    >
      {#if item.project}
        <span
          data-slot="project"
          class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
          data-box
        >
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="size-icon-md flex-none text-(--folder-ink)"
            style="--folder-ink: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="type-label text-ink-strong"
            >{item.project.name}</span
          >
        </span>
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none text-ink-muted">·</span
        >
      {/if}
      <span class="flex-none"
        >{item.isQuestion ? "Question" : "Permission"}</span
      >
      <span data-slot="dot" aria-hidden="true" class="flex-none text-ink-muted"
        >·</span
      >
      <span
        data-slot="machine"
        class="mark-line inline-flex min-w-0 flex-initial items-center gap-space-1"
        data-box
      >
        <OsMark class="size-icon-md flex-none" os={item.machine.os} />
        <span class="min-w-0 overflow-clip text-ellipsis"
          >{item.machine.name}</span
        >
      </span>
      {#if item.stale}
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none text-ink-muted">·</span
        >
        <span class="flex-none">machine offline</span>
      {/if}
    </span>
  {:else if item.kind === "action" && call}
    <!-- The exact call: when, through which account, the tool, the arguments. -->
    <!-- An approved action: its reason, then the call (when, through, tool)
         as label and value pairs on the meta type, then the arguments in a
         content well that scrolls, then where it is from, then the peers.
         Everything the call says is read before the choice is made, in the
         order it is made: when, as whom, what, with what. -->
    <!-- literal: auto minmax(0, 1fr) -->
    <dl
      data-slot="call"
      class="pointer-events-none relative col-start-2 col-end-4 row-3 mx-0 mt-space-2 mb-0 grid grid-cols-(--call-cols) gap-x-space-3 type-meta"
      style:--call-cols="auto minmax(0, 1fr)"
    >
      <dt class="text-ink-muted">Runs</dt>
      <dd class="m-0 wrap-anywhere text-ink-strong">{call.when}</dd>
      <dt class="text-ink-muted">Through</dt>
      <dd class="m-0 wrap-anywhere text-ink-strong">{call.through}</dd>
      <dt class="text-ink-muted">Tool</dt>
      <dd
        data-slot="tool"
        class="m-0 font-(family-name:--font-mono) wrap-anywhere text-ink-strong"
      >
        {call.tool}
      </dd>
    </dl>
    <!-- A scroller with no focusable child is itself in the tab order
         (keyboard-focusable scrollers), so a keyboard scrolls it too. The
         arguments as the hub will send them, pretty-printed: a well the
         pointer and the keyboard can scroll, over the row's cover. -->
    <!-- literal: 12rem -->
    <pre
      data-slot="args"
      class="focus-inset relative col-start-2 col-end-4 row-4 mx-0 my-space-2 max-h-(--args-max) overflow-auto overscroll-contain rounded-xs border border-border-well bg-surface-well px-space-3 py-space-2 type-code whitespace-pre text-ink-strong"
      style:--args-max="12rem">{call.args}</pre>
    <span
      data-where
      data-slot="meta"
      class="mark-line pointer-events-none relative col-start-2 col-end-4 row-5 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
    >
      {#if item.project}
        <span
          data-slot="project"
          class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
          data-box
        >
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="size-icon-md flex-none text-(--folder-ink)"
            style="--folder-ink: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="type-label text-ink-strong"
            >{item.project.name}</span
          >
        </span>
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none text-ink-muted">·</span
        >
      {/if}
      <span class="flex-none">Approved action</span>
      {#if item.action.taskId}
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none text-ink-muted">·</span
        >
        <span class="flex-none num">{item.action.taskId}</span>
      {/if}
    </span>
  {:else if item.kind === "task"}
    <span
      data-where
      data-slot="meta"
      class="mark-line pointer-events-none relative col-start-2 col-end-4 row-3 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
    >
      {#if item.project}
        <span
          data-slot="project"
          class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
          data-box
        >
          <IconFolder
            data-needs-card-mark
            aria-hidden="true"
            class="size-icon-md flex-none text-(--folder-ink)"
            style="--folder-ink: var(--mark-{item.project.hue})"
          />
          <span data-slot="project-name" class="type-label text-ink-strong"
            >{item.project.name}</span
          >
        </span>
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none text-ink-muted">·</span
        >
      {/if}
      <span class="flex-none">Task</span>
      <span data-slot="dot" aria-hidden="true" class="flex-none text-ink-muted"
        >·</span
      >
      <span class="flex-none num">{item.taskId}</span>
    </span>
  {:else}
    <span
      data-slot="meta"
      class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
      >{meta}</span
    >
  {/if}
  {#if item.kind === "ask" && answerable}
    <!-- Deny then Approve together at the trailing edge, the same size, each
         tinted by what it does: Deny in the fail status's fill and ink,
         Approve in the done status's, the house's success pair (go, not
         "working"). Both pairs are their hue's 3-step mixed 24% toward its
         9-step, so they are equal in salience (The Peer Rule): the same fill
         strength, and neither changes under the pointer, as the grant
         variant holds still, so neither is made the more inviting. On a
         finger the gap opens (The 44 Touch Rule), the separation the rule's
         opposite ends gave a rushed thumb. -->
    <div
      data-slot="peers"
      class={[
        "relative col-start-2 col-end-4 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4",
        item.request.presentation.command ? "row-5" : "row-4",
      ]}
    >
      {#if answerRefused}
        <ErrorText
          message={answerRefused}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        data-deny
        aria-label="Deny {item.ask} on {item.title}"
        answer="deny"
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
        answer="approve"
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
         Rule); keeping agents off comes first, as the recommended one. Its
         options are its words, longer than Deny and Approve, too long to
         stand side by side in the panel: they stack, each the text
         column's width, so the two stay peers in size. -->
    <div
      data-slot="peers"
      class="relative col-start-2 col-end-4 row-4 mt-space-2 flex flex-col items-stretch justify-end gap-space-2 coarse:gap-space-4"
    >
      {#if choiceRefusal}
        <ErrorText
          message={choiceRefusal}
          title="The hub refused that answer"
        />
      {/if}
      <Button
        edge="none"
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
        edge="none"
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
    <div
      data-slot="peers"
      class="relative col-start-2 col-end-4 row-4 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
    >
      {#if refusal}
        <ErrorText message={refusal} title="The hub refused that answer" />
      {/if}
      <Button
        data-deny
        aria-label="Deny {who}"
        answer="deny"
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
        answer="approve"
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
    <div
      data-slot="peers"
      class="relative col-start-2 col-end-4 row-6 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
    >
      {#if refusal}
        <ErrorText message={refusal} title="The hub refused that decision" />
      {/if}
      {#if approvable}
        <Button
          data-deny
          aria-label="Deny {item.action.tool} on {item.action.connection}"
          answer="deny"
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
          answer="approve"
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
  /* residual: pseudo — under a finger the peek's 44px area (touch-hit's
     ::after), moved back inboard by --peek-ink. */
  @media (pointer: coarse) {
    [data-needs-card-peek]::after {
      inset-inline-start: var(--peek-hit-start);
      inset-inline-end: var(--peek-hit-end);
    }
  }
</style>
