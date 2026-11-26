<script lang="ts">
  /**
   * One thing waiting on the operator that no conversation holds, as a row
   * of Caw's panel (NeedsCaw): a project past its spend cap, a project's
   * task waiting on you (its review, or a failed attempt), which opens the
   * task with its deliverable and the way to act on it first, a fleet watch
   * notice, a sign-in that ended, a machine lost or waiting to join, a
   * pairing, a failed install, an offer, a tool to update, or an onboarding
   * step. A session's ask or an artifact's pick is its conversation's
   * (ConversationRow). Each row carries only what the person needs to pick
   * it: its project only when the lane spans several. Its mark leads, with
   * no status dot: every row here waits on him.
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
   * The stream relay's journey is the journey's own card (RelayJourney,
   * `row`), drawn whole in the row's place.
   *
   * HTTPS on the tailnet is an onboarding row of the same kind: one line and
   * its meta, then every step on the path in order, each with its control (Tailscale's
   * DNS page to open, its command to copy, the docs) and its own tick as the
   * hub finds it taken; once HTTPS is on, the row's tick with the https
   * dashboard to open.
   *
   * This browser's presence is one more: its notice as its line (what
   * Chrome shares, and that what needs you shows here instead of on your
   * phone), then Skip and Allow as peers. Allow asks the browser for Idle
   * Detection and notifications on one press; a refusal says what the
   * browser blocked and where to change it; once allowed, the row's tick.

   */
  import type { WaitingOffer } from "@cawco/core/project-conversation";
  import type {
    TailnetHttps,
    TailnetHttpsTodo,
  } from "@cawco/core/tailnet-https";
  import { configurePage } from "@cawco/core/words/configure";
  import { connectWords } from "@cawco/core/words/connect";
  import { contactWords } from "@cawco/core/words/contact";
  import { causeLine } from "@cawco/core/words/install";
  import { lfsWords } from "@cawco/core/words/lfs";
  import { mcpWords } from "@cawco/core/words/mcp";
  import { offerWords } from "@cawco/core/words/offers";
  import { outsiderWords } from "@cawco/core/words/outsiders";
  import { pairingWords } from "@cawco/core/words/pairing";
  import { presenceWords } from "@cawco/core/words/presence";
  import { tailnetWords } from "@cawco/core/words/tailnet";
  import RelayJourney from "#lib/cawco/relay/RelayJourney.svelte";
  import {
    actOnRelayCard,
    proveOnStart,
    stepsHere,
  } from "#lib/cawco/relay/relay.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconCheck,
    IconClose,
    IconDollar,
    IconError,
    IconExternal,
    IconFolder,
    IconKey,
    IconLock,
    IconMonitor,
    IconNeedsYou,
    IconPhone,
    IconSend,
    IconServer,
    IconSuccess,
    IconTailnetHttps,
    IconTick,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { isTyping } from "#lib/utils/typing.js";
  import CopyBox from "../CopyBox.svelte";
  import ErrorText from "../ErrorText.svelte";
  import { answerMachine, answerPairing } from "../hub-auth.svelte";
  import { allowHere, onPhone, person, skipHere } from "../person.svelte";
  import RowFault from "../RowFault.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { cawOf } from "../session-status";
  import { span } from "../span";

  import { decideAction } from "../stores/needs.svelte";
  import {
    answerDesignOffer,
    answerOutsider,
    dismissLfsRefusal,
  } from "../stores/offers.svelte";
  import { relayStore } from "../stores/relay.svelte";
  import { capLine } from "../usage";
  import {
    clock,
    type NeedsItem,
    type ProjectMarking,
  } from "./home-state.svelte";
  import NeedsMeta from "./NeedsMeta.svelte";
  import NeedsRow from "./NeedsRow.svelte";
  import { answersHere } from "./needs-answer.svelte";
  import StepRow from "./StepRow.svelte";
  import ToolNeedsRow from "./ToolNeedsRow.svelte";

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

  // The relay's start ticked while its row stands: this screen proves it.
  $effect(() => {
    if (item.kind === "relay") {
      proveOnStart(item.journey);
    }
  });

  /** The panel's lane spans several projects: a row names its own. */
  const answersOf = answersHere();
  const answers = $derived(answersOf());

  /** Where a press on the row goes: its session, a setup page, a task; none for a row answered on itself. */
  const href = $derived(
    item.kind === "tailnet" ||
      item.kind === "desk" ||
      item.kind === "relay" ||
      item.kind === "machine"
      ? undefined
      : item.href
  );
  /** A task's line: its review in `stage`, or its failed attempt. */
  const taskWant = (reason: "review" | "failed", stage: string): string =>
    reason === "review"
      ? `Review the draft: it waits on you in ${stage}`
      : "Its session failed: read why, then try again";

  /** What it asks for, in the words it is asked: its second line. */
  const want = $derived.by(() => {
    switch (item.kind) {
      case "watch":
        // Why, in the notice's words: its title is the row's own first line
        // when the board holds no row, and never said twice.
        return item.notice.body;
      case "tailnet":
        return item.done
          ? tailnetWords.done(item.tailnet.dashboard ?? "")
          : tailnetWords.lead;
      case "desk":
        if (item.done) {
          return presenceWords.done(
            item.agent !== null || item.idle,
            onPhone()
          );
        }
        return item.unavailable
          ? presenceWords.unavailable
          : presenceWords.lead(item, onPhone());
      case "relay":
        return "";
      case "pairing":
        return pairingWords.asks(item.request.userCode);
      case "admission":
        return "Waits to join your fleet. Admitted, it runs sessions like your other machines.";
      case "install":
        return causeLine(item.install);
      case "mcp":
        return mcpWords.signInEnded(configurePage("mcp"));
      case "machine":
        return contactWords.lostLine(item.name, item.minutes, item.hub);
      case "task":
        return taskWant(item.reason, item.stage);
      case "action":
        if (item.action.state === "unknown") {
          return `This may or may not have happened. Check ${item.action.service}.`;
        }
        return item.action.state === "failed"
          ? `It failed. ${item.action.error ?? `${item.action.service} did not take it.`}`
          : item.action.reason;
      case "tool":
        return item.want;
      case "cap":
        return capLine(item.cap);
      case "offer":
        return offerLine(item.offer);
    }
    return "";
  });

  /** The row's second line, lean: a task in review says so. */
  const leanWant = $derived(
    item.kind === "task" && item.reason === "review" ? "Review the draft" : want
  );
  /** The row names its project only when the lane spans several. */
  const leanPlace = $derived(
    "project" in item && answers?.manyProjects && item.project
      ? item.project.name
      : null
  );

  /** An offer's line: what it asks, in the hub's words for its kind. */
  function offerLine(offer: WaitingOffer): string {
    switch (offer.kind) {
      case "design":
        return offerWords.designLine(
          new Intl.ListFormat("en", { type: "conjunction" }).format(
            offer.sources
          )
        );
      case "lfs-refused":
        return lfsWords.refusedLine(offer.endpoint);
      case "outsider":
        return outsiderWords.line(offer.firstLine, offer.count);
    }
  }

  /** An offer's answer on its way: its buttons hold until the hub answers, and the row leaves on its frame. */
  let offering = $state<"yes" | "no" | null>(null);
  async function answerOffer(yes: boolean) {
    if (item.kind !== "offer" || held || offering) {
      return;
    }
    const { offer } = item;
    offering = yes ? "yes" : "no";
    refusal = null;
    try {
      if (offer.kind === "design") {
        await answerDesignOffer(offer.projectId, yes ? "build" : "dismiss");
      } else if (offer.kind === "outsider") {
        await answerOutsider(
          offer.projectId,
          offer.itemId,
          yes ? "accept" : "decline"
        );
      } else {
        await dismissLfsRefusal(offer.projectId, offer.endpoint);
      }
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      offering = null;
    }
  }

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
  /** A watch notice's and a budget's last line: the kind, then where it is. */
  const meta = $derived.by(() => {
    switch (item.kind) {
      case "watch":
        return `Fleet watch · ${item.place}`;
      case "tailnet":
        return tailnetWords.meta(item.tailnet.host);
      case "desk":
        return presenceWords.meta;
      case "relay":
        return "";
      case "pairing":
        return item.place ? `Pairing · ${item.place}` : "Pairing";
      case "admission":
        return ["Machine", item.machine.platform, item.place]
          .filter(Boolean)
          .join(" · ");
      case "mcp":
      case "machine":
      case "offer":
      case "tool":
        return item.place;
      case "install":
        return item.install.route === "ssh"
          ? connectWords.addMachineOver("over SSH")
          : connectWords.addMachineOver("by a command");
      case "action":
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
   * The row stands but cannot be answered yet: the hub is not live. It
   * keeps its place, dimmed, and its answer waits; nothing is sent until it
   * can land.
   */
  const held = $derived(stale);

  /** The row was chosen: it opens, and the panel closes. */
  const chosen = (): void => onchoose();

  /**
   * One step on the path to HTTPS, laid out: what to do, where or why, and
   * its control, a page to open or its command to copy.
   */
  function tailnetTodo(
    tailnet: TailnetHttps,
    todo: TailnetHttpsTodo
  ): {
    label: string;
    note: string;
    href?: string;
    link?: string;
    command?: string;
  } {
    switch (todo.step) {
      case "enable-magicdns":
      case "enable-https":
        return {
          label:
            todo.step === "enable-magicdns"
              ? tailnetWords.stepMagicDns
              : tailnetWords.stepHttps,
          note: tailnetWords.adminNote,
          href: tailnetWords.dnsPage,
          link: tailnetWords.openDnsPage,
        };
      case "operator":
        return {
          label: tailnetWords.stepOperator,
          note: tailnetWords.runOnce(tailnet.host),
          command: todo.command,
        };
      case "userspace":
        return {
          label: tailnetWords.stepUserspace,
          note: tailnetWords.userspaceNote(tailnet.host),
          href: tailnetWords.userspacePage,
          link: tailnetWords.openDocs,
        };
      case "port":
        break;
    }
    return {
      label: tailnetWords.stepPort(tailnet.port ?? 0),
      note: tailnetWords.portNote(tailnet.host),
      command: todo.command,
    };
  }

  /** Every step on the tailnet's path, while one stands; none once HTTPS is on. */
  const todos = $derived.by(() => {
    if (item.kind !== "tailnet" || item.done) {
      return [];
    }
    const { tailnet } = item;
    return (tailnet.steps ?? []).map((todo) => ({
      step: todo.step,
      done: todo.done,
      ...tailnetTodo(tailnet, todo),
    }));
  });
  /** An approved action waiting for your approval: Deny and Approve stand. */
  const approvable = $derived(
    item.kind === "action" && item.action.state === "proposed"
  );

  /** The permission's own keys (`y`/`a` approve, `n`/`d` deny) while a control here has focus. */
  function onkeydown(event: KeyboardEvent): void {
    if (
      !approvable ||
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
      decide("approve");
    } else if (key === "n" || key === "d") {
      event.preventDefault();
      decide("deny");
    }
  }
</script>

{#snippet dot()}
  <span data-slot="dot" aria-hidden="true" class="flex-none text-ink-muted"
    >·</span
  >
{/snippet}

<!-- A meta line's project: its folder in the project's hue, its name a
     name (label role, strong ink), then the dot. -->
{#snippet projectMark(project: ProjectMarking)}
  <span
    data-slot="project"
    class="mark-line inline-flex min-w-0 flex-none items-center gap-space-1"
    data-box
  >
    <IconFolder
      data-needs-card-mark
      aria-hidden="true"
      class="size-icon-md flex-none"
      style="color: var(--color-mark-{project.hue})"
    />
    <span data-slot="project-name" class="type-label text-ink-strong"
      >{project.name}</span
    >
  </span>
  {@render dot()}
{/snippet}

{#if item.kind === "tool"}
  <ToolNeedsRow {item} {onchoose} />
{:else if item.kind === "relay"}
  <!-- The stream relay's journey: its own card, drawn as Needs you's row
       (its title, the steps, the onboarding meta line), the same card
       Settings › Browsers draws from the same journey. It stands in the
       row's box: its padding and corner, so its title's mark stands in the
       panel's one leading column. -->
  <div
    data-slot="row"
    class="rounded-sm px-space-3 py-space-2 data-stale:opacity-55"
    data-kind="relay"
    data-share="pane:{item.key}"
    data-stale={stale || undefined}
  >
    <RelayJourney
      candidates={item.journey.candidates}
      domain={relayStore.relayDomain}
      machine={item.journey.machine}
      onact={actOnRelayCard}
      row
      steps={stepsHere(item.journey.steps)}
      summary={item.journey.summary}
      view={item.done ? "done" : "journey"}
    />
  </div>
{:else}
  <!-- lead, end and below are this card's; the row's box, cover, title, wait and want are NeedsRow's. -->
  <NeedsRow
    {held}
    {href}
    kind={item.kind}
    onchoose={chosen}
    {onkeydown}
    share="pane:{item.key}"
    title={item.title}
    want={leanWant}
    wait={item.raisedAt === undefined ? null : span(clock.now - item.raisedAt)}
  >
    {#snippet lead()}
      {#if item.kind === "watch"}
        <SessionMark
          caw={cawOf(item.instanceId)}
          id={item.instanceId}
          place={item.cwd || item.machineId}
          status="idle"
        />
      {:else if item.kind === "desk"}
        {#if item.done}
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md text-status-done-ink"
          />
        {:else if onPhone()}
          <!-- The device asked about: this phone, or this computer. -->
          <IconPhone aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconMonitor aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "tailnet"}
        {#if item.done}
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md text-status-done-ink"
          />
        {:else}
          <IconTailnetHttps aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "pairing"}
        <IconLock aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "admission"}
        <IconServer aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "install"}
        <IconError aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "mcp"}
        <IconKey aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "machine"}
        <IconServer aria-hidden="true" class="size-icon-md" />
      {:else if item.kind === "task"}
        {#if item.reason === "failed"}
          <IconError aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconNeedsYou aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "offer"}
        {#if item.offer.kind === "lfs-refused"}
          <IconWarningTriangle aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconNeedsYou aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else if item.kind === "action"}
        {#if item.action.state === "unknown"}
          <IconWarningTriangle aria-hidden="true" class="size-icon-md" />
        {:else if item.action.state === "failed"}
          <IconError aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconSend aria-hidden="true" class="size-icon-md" />
        {/if}
      {:else}
        <IconDollar aria-hidden="true" class="size-icon-md" />
      {/if}
    {/snippet}
    {#snippet below()}
      {#if item.kind === "task"}
        {#if leanPlace}
          <span
            data-slot="meta"
            class="pointer-events-none relative col-start-2 col-end-4 row-3 min-w-0 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
            >{leanPlace}</span
          >
        {/if}
      {:else if item.kind === "action" && call}
        <!-- The exact call: when, through which account, the tool, the arguments. -->
        <!-- An approved action: its reason, then the call (when, through, tool)
           as label and value pairs on the meta type, then the arguments in a
           content well that scrolls, then where it is from, then the peers.
           Everything the call says is read before the choice is made, in the
           order it is made: when, as whom, what, with what. -->
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
        <pre
          data-slot="args"
          class="focus-inset relative col-start-2 col-end-4 row-4 mx-0 my-space-2 max-h-48 overflow-auto overscroll-contain rounded-xs border border-border-well bg-surface-well px-space-3 py-space-2 type-code whitespace-pre text-ink-strong">{call.args}</pre>
        <span
          data-where
          data-slot="meta"
          class="mark-line pointer-events-none relative col-start-2 col-end-4 row-5 flex min-w-0 items-center gap-space-1 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
        >
          {#if item.project}
            {@render projectMark(item.project)}
          {/if}
          <span class="flex-none">Approved action</span>
          {#if item.action.taskId}
            {@render dot()}
            <span class="flex-none num">{item.action.taskId}</span>
          {/if}
        </span>
      {:else if item.kind === "tailnet"}
        <!-- Where it comes from, under what it wants, as every row's meta
           stands; its steps follow. -->
        <span
          data-slot="meta"
          class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
          >{meta}</span
        >
        {#if todos.length > 0}
          <!-- Every step on the path, in order: a step that stands says what to
             do, where or why, and its control; a step taken is its tick and
             its label. -->
          <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
          <ol
            data-slot="steps"
            class="relative col-start-2 col-end-4 row-4 mx-0 my-space-3 grid list-none gap-space-3 p-0"
            role="list"
          >
            <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
            {#each todos as one, index (one.step)}
              <StepRow
                done={one.done}
                doneWord={tailnetWords.stepDone}
                label={one.label}
                n={index + 1}
                step={one.step}
              >
                {#if !one.done}
                  <span
                    data-slot="step-note"
                    class="col-start-2 min-w-0 type-meta wrap-anywhere text-ink-muted"
                    >{one.note}</span
                  >
                  {#if one.command}
                    <div
                      data-slot="step-command"
                      class="col-start-2 mt-space-1 flex min-w-0 [&>*]:min-w-0 [&>*]:flex-auto"
                      data-box
                    >
                      <CopyBox
                        label={tailnetWords.command}
                        text={one.command}
                        wrap
                      />
                    </div>
                  {:else if one.href}
                    <div
                      data-slot="step-link"
                      class="col-start-2 mt-space-1 flex min-w-0 [&>*]:min-w-0 [&>*]:flex-initial"
                      data-box
                    >
                      <Button
                        href={one.href}
                        icon={IconExternal}
                        label={one.link}
                        rel="noopener"
                        size="sm"
                        target="_blank"
                        variant="secondary"
                      />
                    </div>
                  {/if}
                {/if}
              </StepRow>
            {/each}
          </ol>
        {/if}
      {:else if item.kind === "desk" && !item.done}

      {:else if item.kind === "desk" && !item.done}
        <!-- Where it comes from, then Skip and Allow as peers (The Peer
           Rule) on the same line while the row has the room (a desk's
           panel), under it where it hasn't (a phone's): the ask keeps the
           height of a permission row. Skip puts the row away in this
           browser, the presence menu still offers it; Allow calls the
           browser's own prompts on the press. A refusal stands over the
           peers, naming each blocked setting and where to turn it on. -->
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-3 flex flex-wrap items-center justify-end gap-x-space-2 gap-y-space-2 coarse:gap-x-space-4"
        >
          <span
            data-slot="meta"
            class="pointer-events-none me-auto min-w-0 flex-none overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
            >{meta}</span
          >
          {#if person.refusal}
            <!-- Wrapped, never cut to one line: the setting's name and where
               to turn it on are the whole point of it. -->
            <p
              data-slot="desk-refusal"
              class="type-meta m-0 w-full text-pretty wrap-anywhere text-status-fail-ink"
              role="alert"
            >
              {person.refusal.title}. {person.refusal.message}
            </p>
          {/if}
          <span class="flex flex-none gap-space-2 coarse:gap-space-4">
            <Button
              data-skip
              disabled={person.pending === "allow"}
              label={presenceWords.skip}
              onclick={skipHere}
              size="sm"
              variant="secondary"
            />
            {#if item.agent !== null || item.idle || item.notify}
              <Button
                data-allow
                disabled={person.pending === "allow"}
                label={presenceWords.allow}
                onclick={() => allowHere("row")}
                pending={person.pending === "allow"}
                pendingLabel={presenceWords.allowing}
                size="sm"
                variant="secondary"
              />
            {/if}
          </span>
        </div>
      {:else}
        <NeedsMeta text={meta} />
      {/if}
      {#if item.kind === "tailnet" && item.done}

      {:else if item.kind === "tailnet" && item.done}
        <!-- Ticked: the https dashboard to open. -->
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-5 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
        >
          <Button
            href={item.tailnet.dashboard}
            icon={IconExternal}
            label={tailnetWords.openDashboard}
            rel="noopener"
            size="sm"
            target="_blank"
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
            hit="always"
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
            hit="always"
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
            <ErrorText
              message={refusal}
              title="The hub refused that decision"
            />
          {/if}
          {#if approvable}
            <Button
              data-deny
              aria-label="Deny {item.action.tool} on {item.action.connection}"
              answer="deny"
              hit="always"
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
              aria-label="Approve {item.action.tool} on {item.action
                .connection}"
              answer="approve"
              hit="always"
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
      {:else if item.kind === "offer"}
        {@const offer = item.offer}
        <div
          data-slot="peers"
          class="relative col-start-2 col-end-4 row-4 mt-space-2 flex justify-end gap-space-2 coarse:gap-space-4"
        >
          {#if refusal}
            <ErrorText message={refusal} title="The hub refused that answer" />
          {/if}
          {#if offer.kind === "outsider"}
            <Button
              disabled={held || offering === "yes"}
              label={outsiderWords.drop}
              onclick={() => answerOffer(false)}
              pending={offering === "no"}
              pendingLabel={outsiderWords.dropping}
              size="sm"
              variant="secondary"
            />
            <Button
              disabled={held || offering === "no"}
              label={outsiderWords.letThrough}
              onclick={() => answerOffer(true)}
              pending={offering === "yes"}
              pendingLabel={outsiderWords.lettingThrough}
              size="sm"
              variant="secondary"
            />
          {:else if offer.kind === "lfs-refused"}
            <Button
              disabled={held}
              label={lfsWords.dismiss}
              onclick={() => answerOffer(false)}
              pending={offering === "no"}
              pendingLabel={lfsWords.dismissing}
              size="sm"
              variant="secondary"
            />
          {:else}
            <Button
              disabled={held || offering === "yes"}
              label={offerWords.notNow}
              onclick={() => answerOffer(false)}
              pending={offering === "no"}
              pendingLabel={offerWords.notNowPending}
              size="sm"
              variant="secondary"
            />
            <Button
              disabled={held || offering === "no"}
              label={offerWords.build}
              onclick={() => answerOffer(true)}
              pending={offering === "yes"}
              pendingLabel={offerWords.filing}
              size="sm"
              variant="secondary"
            />
          {/if}
        </div>
      {:else if item.kind === "mcp" && item.why}
        <!-- Why the sign-in ended, the provider's own words under Show
           details, over the row's cover: its press still opens Configure. -->
        <RowFault
          class="relative col-start-2 col-end-4 row-4 mt-space-1"
          data-needs-card-mcp-why
          details={item.why}
          reason={mcpWords.signInEndedWhy}
        />
      {/if}
    {/snippet}
  </NeedsRow>
{/if}
