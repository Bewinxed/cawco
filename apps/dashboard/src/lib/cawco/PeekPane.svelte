<script lang="ts" module>
  /** Which session the board is peeking, and where a dive would land. */
  export interface PeekTarget {
    /** Where Open goes. */
    href: string;
    /** What the board row the peek came from calls it. */
    title: string;
    /** The instance the peek is watching. */
    viewId: string;
  }
</script>

<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import { machineLabel } from "@cawco/core/machine-names";
  import { damagedWords } from "@cawco/core/protocol";
  import { questionsOf } from "@cawco/core/question";
  import { humanize, mcpParts } from "@cawco/core/tool-presentation";
  import { getToolGlance } from "@cawco/core/transcript-rules";
  import { askWords } from "@cawco/core/words/asks";
  import { peekWords } from "@cawco/core/words/peek";
  import { planWords } from "@cawco/core/words/plan";
  /**
   * The middle step of the board's loop: glance at the fleet, peek at one
   * session, dive into it. A peek answers "what is this one actually doing"
   * without leaving the board, so it shows the tail of the conversation rather
   * than the conversation — the last handful of turns, rendered flat, with the
   * live text still arriving. Anything that needs reading properly is a dive.
   *
   * What it said runs the sheet's whole height, under the bar floating at
   * its top (BarFloat) and the foot tray floating at its end (the peek's
   * surface brief, Foot tray): the asks, the plan's row and the status row
   * as one glass panel, where a session's composer holds its asks.
   *
   * It reads the same session state the route does and reads its history the
   * same way, so peeking a session and then opening it costs one transcript
   * read between them, not two.
   */
  import { untrack } from "svelte";
  import {
    BarFloat,
    BarGlass,
    BarItem,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import {
    IconChevronUp,
    IconClose,
    IconExternal,
    IconFolder,
    IconFork,
    IconMaximizeLinear,
    IconStop,
    IconTick,
  } from "#lib/icons.js";
  import { smoothText } from "#lib/utils/smooth-text.svelte.js";
  import { goto } from "$app/navigation";
  import {
    ACTIVITY_LABEL,
    SLEEPING_LABEL,
    STOPPED_LABEL,
    STOPPING_LABEL,
    UNKNOWN_HINT,
    UNKNOWN_LABEL,
  } from "./activity";
  import ContextMeter from "./ContextMeter.svelte";
  import {
    answeredOr,
    cawco,
    isFailed,
    isResumable,
    isStale,
    openSession,
    type PendingPermission,
    type PermissionAnswer,
    permissionAnswer,
    readTranscript,
    refreshContext,
    setPeeked,
    showContext,
    submitCommand,
    takeOverBrowser,
  } from "./client.svelte";
  import { folderPrefs } from "./folder-prefs.svelte";
  import { frameSize } from "./frame-observer";
  import { conversationHref } from "./links";
  import { echoBeat } from "./motion/echo.svelte";
  import { unfold, unfolding } from "./motion/fold.svelte";
  import OsMark from "./OsMark.svelte";
  import { plainMarkdown, plainStreaming } from "./plain-markdown";
  import { planProgress } from "./plan/PlanPane.svelte";
  import PlanTree, { stepsTree, todosTree } from "./plan/PlanTree.svelte";
  import RowFault from "./RowFault.svelte";
  import { refusals } from "./refusals.svelte";
  import SessionMark from "./SessionMark.svelte";
  import { sessionAct, stopOnRow } from "./session-acts.svelte";
  import { sessionPlace } from "./session-names.svelte";
  import { cawOf, sessionStatus } from "./session-status";
  import { startFork } from "./spawn/new-session.svelte";
  import TaskRing from "./TaskRing.svelte";
  import FootFade from "./transcript/FootFade.svelte";
  import MessageRow from "./transcript/MessageRow.svelte";
  import type { Message } from "./types";

  interface Props {
    /** Puts the peek away; the board keeps its place. */
    onclose: () => void;
    /** The plan's steps stand open over what it said; its row's press flips it. */
    stepsOpen?: boolean;
    target: PeekTarget;
  }

  let { target, onclose, stepsOpen = $bindable(false) }: Props = $props();

  /**
   * The opened steps stand on the step at work, centred in the height they
   * open to: the height the fold is bound for (`unfolding`), read in the
   * frame after it starts, since the box is still shut as it mounts; with no
   * fold (reduced motion) the box's own.
   */
  function onStep(box: HTMLElement): () => void {
    const frame = requestAnimationFrame(() => {
      const now = box.querySelector<HTMLElement>("[data-status=in_progress]");
      if (now) {
        const open = unfolding.get(box)?.height ?? box.clientHeight;
        box.scrollTop = now.offsetTop + now.offsetHeight / 2 - open / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }

  /** The foot tray's height: what it said keeps that much room at its end. */
  let footH = $state(0);
  // Read as it mounts, and a change in the next frame (frameSize).
  const footSize = frameSize<HTMLElement>((node) => {
    footH = node.offsetHeight;
  });

  // A peek is a live view, so it subscribes for frames exactly like an open tab
  // and unsubscribes the moment it is put away. Untracked: `setPeeked` reads the
  // peeked id it writes, and tracking that read re-ran this effect on its own
  // write, subscribing and unsubscribing until Svelte gave up.
  $effect(() => {
    const id = target.viewId;
    untrack(() => setPeeked(id));
    return () => untrack(() => setPeeked(null));
  });

  // Opening writes to the store, so it stays in an effect and the reads below
  // stay derived — the route's bargain, for the same reason: the fields this
  // writes are ones the store reads back, and tracking them would loop. A live
  // session the board never opened has already said everything it has said,
  // and frames only carry what comes next, so its history is read back once.
  $effect(() => {
    const id = target.viewId;
    untrack(() => {
      openSession(id);
      const held = cawco.session(id);
      if (!(held?.initialized && held.messages.length > 0)) {
        detach(readTranscript(id), "readTranscript");
      }
    });
  });

  const session = $derived(cawco.session(target.viewId) ?? null);
  const row = $derived(cawco.instanceIndex.byId.get(target.viewId) ?? null);

  const failed = $derived(row ? isFailed(row) : false);
  const sleeping = $derived(row ? isResumable(row) : false);
  /** The hub can't reach this row's machine — distinct from idle and asleep. */
  const stale = $derived(row ? isStale(row) : false);
  const running = $derived(
    row?.status === "running" || row?.status === "starting"
  );
  const activity = $derived(cawco.activityOf(target.viewId));
  /** What was asked of it and is on its way, or did not go (session-acts). */
  const act = $derived(row ? sessionAct(row.id) : undefined);
  const stateLabel = $derived.by(() => {
    if (act?.pending) {
      return act.pending;
    }
    if (failed) {
      return "Failed";
    }
    if (row?.status === "stopping") {
      return STOPPING_LABEL;
    }
    if (row?.status === "stopped") {
      return STOPPED_LABEL;
    }
    if (sleeping) {
      return SLEEPING_LABEL;
    }
    if (stale) {
      return UNKNOWN_LABEL;
    }
    return ACTIVITY_LABEL[activity];
  });
  const tool = $derived(cawco.currentToolOf(target.viewId));
  /**
   * A tool by the name the transcript gives it (@cawco/core `describeTool`'s
   * `tool-name` rule: an MCP tool's own name past its server, in words), not
   * its identifier: "Ask user question", never "AskUserQuestion".
   */
  const toolWord = (name: string): string =>
    humanize(mcpParts(name)?.tool ?? name);

  const machine = $derived.by(() => {
    const machineId = session?.machineId || row?.machineId || "";
    return (
      cawco.machines.find((entry) => entry.machineId === machineId) ?? null
    );
  });

  const host = $derived(
    machine
      ? machineLabel(machine.hostname)
      : session?.machineId || row?.machineId || ""
  );

  const cwd = $derived(session?.cwd || row?.cwd || "");

  /** The harness that owns the conversation a fork branches from. */
  const forkHarness = $derived(row?.harness ?? session?.harness ?? null);
  /** The SDK session a fork branches from, once its harness is known. */
  const forkable = $derived(
    forkHarness ? (session?.sessionId ?? row?.sessionId ?? null) : null
  );

  async function fork() {
    if (!(forkable && machine && forkHarness)) {
      return;
    }
    // The item stays "Forking…" until the hub has made the fork, then the
    // page leaves for it; a refusal stays in the item, in the hub's words,
    // and so does no answer, in the machine's.
    const forked = await startFork({
      machineId: machine.machineId,
      cwd,
      sessionId: forkable,
      harness: forkHarness,
    });
    // No mode to run in: the New Session form took it.
    if (!forked) {
      return;
    }
    const instanceId = answeredOr(
      machine.machineId,
      forked,
      "whether the fork started is not known"
    );
    await goto(conversationHref(instanceId, cawco.instanceIndex));
  }

  /**
   * What the hub holds parked for this session, whatever its row says: the
   * hub settles the asks of a process that died (`permission_settled`), and
   * one whose agent is restarting is still waiting on its answer.
   */
  const parked = $derived<PendingPermission[]>(session?.pending ?? []);

  // Only a live session has a window to report on, and only one that has been
  // asked has a number; asking once per peek is what makes the meter say
  // something rather than sit at a dash.
  $effect(() => {
    const id = target.viewId;
    const machineId = session?.machineId;
    if (!(machineId && running)) {
      return;
    }
    untrack(() => detach(refreshContext(id, machineId), "refreshContext"));
  });
  // The meter draws the peeked session's reading while it runs: its turns'
  // ends read it again only while one does (client.svelte.ts `showContext`).
  $effect(() => {
    const id = target.viewId;
    if (running) {
      return showContext(id);
    }
  });

  // The hub's plan, live: a peeked session is streamed (`setPeeked`), and the
  // hub sends its streamers the plan whole on subscribe, then its deltas.
  const plan = $derived(cawco.planOf(target.viewId));
  const progress = $derived(plan ? planProgress(plan) : null);
  const planned = $derived(Boolean(progress && progress.total > 0));
  /** The step at work on the plan's row, else the last one done. */
  const nowStep = $derived(
    plan?.steps.find((step) => step.status === "in_progress")?.content ??
      plan?.steps.findLast((step) => step.status === "completed")?.content ??
      ""
  );
  /**
   * The status row: while the session runs or its machine is out of reach,
   * and for one with no plan. An ask standing is its state, said whole above
   * it; an ended session's plan ring says it ended.
   */
  const statusShown = $derived(
    parked.length === 0 && (running || stale || !planned)
  );
  /** Its steps, else (a task attempt that wrote none) its task's to-dos. */
  const planRows = $derived(
    plan && plan.steps.length > 0 ? stepsTree(plan) : todosTree(plan)
  );

  /** How much conversation a peek is: enough to see what it is up to. */
  const TAIL = 10;

  /** What a tail says. The rest is chrome the transcript renders and this does not. */
  const SPOKEN = new Set<Message["type"]>([
    "user",
    "user.peer",
    "assistant",
    "tool.use",
    "tool.handoff",
    "result.error",
  ]);

  /**
   * The failure the tray says, when the session's last turn says the same
   * words: said once, in the tray, never twice down the sheet's foot.
   */
  const failure = $derived(failed ? (row?.lastError ?? "").trim() : "");

  const tail = $derived.by(() => {
    const spoken = (session?.messages ?? []).filter(
      (message) => SPOKEN.has(message.type) && message.content.trim().length > 0
    );
    const last = spoken.at(-1);
    const told =
      last?.type === "result.error" &&
      failure !== "" &&
      last.content.trim() === failure;
    return (told ? spoken.slice(0, -1) : spoken).slice(-TAIL);
  });

  const stream = smoothText(() => session?.streaming ?? "");
  /** The paced stream, flat, held to its last whole word. */
  const streamed = $derived(plainStreaming(stream.text));

  const glanceOf = (message: Message): string =>
    getToolGlance(
      message.metadata?.toolInput as Record<string, unknown> | undefined
    );

  function answer(request: PendingPermission, kind: PermissionAnswer): void {
    if (!session) {
      return;
    }
    // Not optimistic: the request leaves when the hub has taken the answer.
    submitCommand(session.instanceId, session.machineId, "permission.answer", {
      requestId: request.requestId,
      result: permissionAnswer(request, kind),
    });
  }

  /**
   * The answer that is not Deny: a browser ask is taken over (the hub
   * refuses an Approve on one), anything else approved. A refused take-over
   * reads in the hub's words under the ask's own buttons, with Try again,
   * never a toast (DESIGN.md, The Work Outlives Its Surface Rule).
   */
  const takeKey = (requestId: string) => `take:${requestId}`;
  async function accept(request: PendingPermission): Promise<void> {
    if (!request.browserAsk) {
      answer(request, "allow");
      return;
    }
    refusals.delete(takeKey(request.requestId));
    const refused = await takeOverBrowser(
      request.requestId,
      request.browserAsk
    );
    if (refused) {
      refusals.set(takeKey(request.requestId), { reason: refused });
    }
  }
</script>

<!-- The plan's steps, opened upward from its row over what it said: capped
     (`c-peek-steps-h`) and scrolled inside, opened on the step at work, each
     edge with more past it fading out (the house edge fade). In a tray at
     its cap they give the room first (`shrink-100`), down to about five
     rows (`c-peek-steps-min-h`): an ask standing above them stays whole
     while there is room, and the plan's row below them never moves. -->
{#snippet steps()}
  <div
    data-slot="peek-plan"
    class="kit-edge-fade-block fade-len-c-edge-fade-len relative min-h-c-peek-steps-min-h shrink-100 overflow-y-auto overscroll-contain max-h-c-peek-steps-h"
    in:unfold
    out:unfold
    {@attach onStep}
  >
    <PlanTree nodes={planRows} />
  </div>
{/snippet}

<div
  data-slot="peek"
  class="relative flex min-h-0 flex-1 flex-col overflow-hidden timeline-scope-transcript-head"
  style:--peek-foot="calc({footH}px + var(--space-4))"
>
  <!-- The bar floats over what it said (The Title Bars Follow Liquid Glass
       Rule; the peek's surface brief): the session's title by its project's
       folder in the project's hue, then its machine's OS mark, the machine
       named in its tooltip; no path. At the trailing edge Open, the
       maximize symbol in its glass group, which dives, and Close in one of
       its own. The title takes the right-click: Open, Fork, Stop, Close.
       First in the document, so it is read and tabbed first and a trapped
       sheet's focus lands on it; it stands over the tail by its layer. -->
  <BarFloat tint="bg-surface-raised">
    {#snippet leading()}
      <ContextMenu.Root>
        <ContextMenu.Trigger box="none">
          <h2
            class="pointer-events-auto mark-line m-0 flex min-w-0 flex-1 items-center gap-space-2 ps-space-2 text-body font-medium"
          >
            {#if cwd}
              <IconFolder
                class="identity-ink size-icon-md shrink-0"
                style="--identity-h: {folderPrefs.hue(cwd)}"
              />
            {/if}
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{target.title}</span
            >
            {#if machine}
              <span
                data-box
                class="inline-flex flex-none text-ink-muted"
                aria-label={host}
                role="img"
                title={host}
                ><OsMark class="size-space-4" os={machine.os} /></span
              >
            {/if}
          </h2>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item onSelect={() => goto(target.href)}>
            <IconExternal />
            <span>{peekWords.open}</span>
          </ContextMenu.Item>
          <ContextMenu.PendingItem
            disabled={!(forkable && machine)}
            icon={IconFork}
            label="Fork"
            pendingLabel="Forking…"
            run={fork}
          />
          {#if running && row}
            <ContextMenu.Item onSelect={() => stopOnRow(row.id, row.machineId)}>
              <IconStop />
              <span>{activity === "working" ? "Stop mid-turn" : "Stop"}</span>
            </ContextMenu.Item>
          {/if}
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={onclose}>
            <IconClose />
            <span>{peekWords.close}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/snippet}
    {#snippet trailing()}
      <BarGlass form="group">
        <BarItem
          href={target.href}
          icon={IconMaximizeLinear}
          label={peekWords.open}
        />
      </BarGlass>
      <BarGlass form="group">
        <BarItem icon={IconClose} label={peekWords.close} onclick={onclose} />
      </BarGlass>
    {/snippet}
  </BarFloat>

  <!-- What it said runs the sheet's whole height, under the bar and the
       tray, and follows new turns and the stream: a peek is for the last
       thing said. Each session peeked opens at its own end; its foot keeps
       the tray's height clear, so the last line rests above the tray and
       stays pinned as the tray grows. Its rows keep their height
       (`*:shrink-0`): a clamped paragraph hides its overflow, so a flex
       column longer than the tail shrank it below its lines. -->
  {#key target.viewId}
    <div
      data-slot="peek-tail"
      class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-c-top-bar-h pb-(--peek-foot) scroll-timeline-transcript-head *:shrink-0"
      {@attach followTail()}
    >
      <!-- One reading measure for what it said and the tray: a sheet as
           wide as an iPad keeps its lines short. -->
      <div
        class="mx-auto flex w-full max-w-c-measure flex-col gap-3 *:shrink-0"
      >
        {#if session?.loading && tail.length === 0}
          <p class="mark-line flex items-center gap-space-2 text-meta">
            <LiveDot /><span>Reading…</span>
          </p>
        {:else if session?.readFault && tail.length === 0}
          <!-- A read that failed is not a session with nothing to say. -->
          <p class="text-meta text-error-9">
            Couldn't read this session: {session.readFault.message}
          </p>
        {:else if tail.length === 0 && !session?.streaming}
          <p class="text-meta">Nothing said yet.</p>
        {:else}
          {#each tail as message, index (message.id ?? index)}
            {#if message.type === "tool.use" || message.type === "tool.handoff"}
              <p class="flex items-baseline gap-1.5 text-meta text-ink-muted">
                <span class="shrink-0"
                  >{toolWord(
                    message.metadata?.toolName ?? message.content
                  )}</span
                >
                {#if glanceOf(message)}
                  <span class="shrink-0">·</span>
                  <span class="truncate font-(family-name:--font-mono)"
                    >{glanceOf(message)}</span
                  >
                {/if}
              </p>
            {:else if message.type === "user"}
              <MessageRow agentName="Agent" {message} />
            {:else if message.type === "user.peer"}
              <!-- The one voice worth tinting: what the session was asked. -->
              <p
                class="line-clamp-4 rounded-lg bg-action-solid/10 px-3 py-2 text-body wrap-break-word whitespace-pre-wrap"
              >
                {message.content}
              </p>
            {:else if message.type === "result.error"}
              <!-- A failed turn's last words are the agent's too: flat. -->
              <p class="line-clamp-3 text-body wrap-break-word text-error-9">
                {plainMarkdown(message.content)}
              </p>
            {:else}
              <!-- The agent's words read flat: its markdown, without the syntax. -->
              <p
                class="line-clamp-6 text-body wrap-break-word whitespace-pre-wrap"
              >
                {plainMarkdown(message.content)}
              </p>
            {/if}
          {/each}
          {#if session?.streaming}
            <p class="text-body wrap-break-word whitespace-pre-wrap">
              {streamed}
              <span
                class="inline-block h-icon-md w-space-1 rounded-xs bg-action-solid/60 align-text-bottom"
              ></span>
            </p>
          {/if}
        {/if}
      </div>
    </div>
  {/key}

  <!-- The sheet's ground under the tray, as the bar has its scroll edge:
       solid at the foot, clear where the tail's last line rests, so rows
       leave under the tray's glass into the ground. -->
  <FootFade ground="raised" room="var(--peek-foot)" />

  <!-- The foot tray: what is live floats over the end of what it said as
       one glass panel (the house float panel), where a session's composer
       holds its asks. Top to bottom: a failure as itself, the asks as
       themselves, the plan's row, the status row, a stop that did not go.
       Capped at half the sheet (`c-peek-tray-h`): several asks scroll
       inside it, the rows below them held. -->
  <div
    data-slot="peek-foot"
    class="absolute inset-x-space-2 bottom-space-2 z-2 mx-auto flex max-h-c-peek-tray-h max-w-c-measure flex-col gap-space-3 rounded-(--c-float-panel-r) border border-border-hairline bg-material-panel p-space-3 text-body shadow-overlay glass-backdrop reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none"
    {@attach footSize}
  >
    {#if failed}
      <!-- The failure as itself, in the failed pair. -->
      <p
        class="shrink-0 rounded-md bg-status-fail-bg px-3 py-2.5 text-body text-status-fail-ink"
      >
        {row?.lastError || "Failed without saying why."}
      </p>
    {:else if row?.damaged}
      <!-- A damaged record that does not stop the session (its wake-ups), or
           one whose process still runs: said where its failure would be. -->
      <p
        class="shrink-0 rounded-md bg-status-fail-bg px-3 py-2.5 text-body text-status-fail-ink"
      >
        {damagedWords(row.damaged)}
      </p>
    {/if}

    {#if parked.length > 0}
      <!-- Each ask whole, oldest first, as itself: a permission's own words
           and the command it runs; a question's own question; a sign-in's
           service and the session's reason. A question and a sign-in are
           answered on their card in the session. -->
      <div
        data-slot="peek-asks"
        class="kit-edge-fade-block fade-len-c-edge-fade-len flex min-h-0 flex-col gap-space-2 overflow-y-auto overscroll-contain"
      >
        {#each parked as request (request.requestId)}
          {@const question =
            questionsOf(request.toolName, request.input)?.[0] ?? null}
          {@const connect = request.connectAsk ?? null}
          <div
            data-slot="peek-ask"
            class="flex shrink-0 flex-col gap-2 rounded-md bg-status-attn-bg px-3 py-2.5 text-status-attn-ink"
          >
            {#if question}
              <p class="text-body">{question.question}</p>
              <div class="flex items-center justify-end">
                <Button href={target.href} size="sm" variant="secondary"
                  >Answer</Button
                >
              </div>
            {:else if connect}
              <p class="text-body font-medium">
                {connect.again
                  ? askWords.reconnectTitle(connect.server)
                  : askWords.connectTitle(connect.server)}
              </p>
              {#if connect.reason}
                <p class="text-meta text-ink-muted">{connect.reason}</p>
              {/if}
              <div class="flex items-center justify-end">
                <Button href={target.href} size="sm" variant="secondary"
                  >{connect.again
                    ? askWords.reconnect(connect.server)
                    : askWords.connect(connect.server)}</Button
                >
              </div>
            {:else}
              <p class="text-body">{request.presentation.summary}</p>
              {#if request.presentation.command}
                <!-- What runs, under why: Approve here is made on the command. -->
                <code
                  data-slot="block"
                  class="block truncate whitespace-pre border-l-2 border-border-hairline ps-2 font-(family-name:--font-mono) text-meta text-ink-muted"
                  >{request.presentation.command.trim().split("\n")[0]}</code
                >
              {/if}
              <!-- Equal peers at opposite ends, each outlined in its tint
                   (DESIGN.md, The Peer Rule's apart form). -->
              <div
                data-slot="choice"
                class="flex items-center justify-between gap-space-8"
              >
                <Button
                  data-deny
                  answer="deny-edge"
                  hit="always"
                  aria-label="Deny {request.presentation.summary}"
                  onclick={() => answer(request, "deny")}
                  size="sm"
                  variant="secondary"
                >
                  <IconClose />
                  <span>Deny</span>
                </Button>
                <Button
                  data-approve
                  answer="approve-edge"
                  hit="always"
                  aria-label="{request.browserAsk
                    ? askWords.takeOver
                    : 'Approve'} {request.presentation.summary}"
                  onclick={() => accept(request)}
                  size="sm"
                  variant="secondary"
                >
                  <IconTick />
                  <span
                    >{request.browserAsk ? askWords.takeOver : "Approve"}</span
                  >
                </Button>
              </div>
              <!-- A refused take-over, under the buttons that asked: its
                   words name the way on, the Take over just above. -->
              <RowFault
                data-take-refusal={request.requestId}
                reason={refusals.reason(takeKey(request.requestId))}
              />
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if planned && progress}
      <!-- The plan as itself: its ring in the project's hue, the step at
           work, its figure. A press opens its steps upward over what it
           said; a press folds them. A press outside leaves them open. -->
      {#if stepsOpen}
        {@render steps()}
      {/if}
      <button
        type="button"
        data-slot="peek-plan-row"
        class="group/plan mark-line flex min-w-0 shrink-0 items-center gap-space-2 rounded-sm text-start text-meta text-ink-muted hover:text-ink-strong focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-offset-(--focus-ring-offset) focus-visible:outline-focus-ring"
        aria-expanded={stepsOpen}
        aria-label={planWords.ringLabel(progress.done, progress.total)}
        onclick={() => {
          stepsOpen = !stepsOpen;
        }}
      >
        <span
          data-box
          class="identity-ink inline-flex size-icon-md shrink-0 items-center justify-center"
          style="--identity-h: {folderPrefs.hue(cwd)}"
          ><TaskRing done={progress.done} total={progress.total} /></span
        >
        <span
          class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
          >{stepsOpen ? "" : nowStep}</span
        >
        <span class="tabular-nums"
          >{planWords.figure(progress.done, progress.total)}</span
        >
        <IconChevronUp
          class="size-icon-sm flex-none transition-[rotate] duration-(--dur-control) ease-out group-aria-expanded/plan:rotate-180"
        />
      </button>
    {/if}

    {#if statusShown}
      <!-- The session as its mark (its state in the mark's name and
           tooltip), the tool at work and its target, the context left as
           its meter. The mark's echo runs only on a beat (motion/echo):
           this row is its list of one. -->
      <div
        data-slot="peek-status"
        class="mark-line flex min-w-0 shrink-0 items-center gap-space-2 text-meta"
        {@attach echoBeat()}
      >
        <span
          data-box
          class="inline-flex size-icon-md shrink-0 items-center justify-center"
          aria-label={stateLabel}
          role="img"
          title={stale ? UNKNOWN_HINT : stateLabel}
          ><SessionMark
            caw={cawOf(target.viewId)}
            id={target.viewId}
            place={sessionPlace(target.viewId)}
            status={sessionStatus(row)}
          /></span
        >
        <span
          class="mark-line flex min-w-0 flex-1 items-center gap-1.5 text-ink-muted"
          data-box
        >
          <!-- What it is doing, while the hub can say: a machine out of
               reach leaves only what it was last seen doing. -->
          {#if activity === "working" && tool && !stale}
            <span class="shrink-0">{toolWord(tool.name)}</span>
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-(family-name:--font-mono)"
              >{tool.glance}</span
            >
          {/if}
        </span>
        {#if running}
          <span class="flex shrink-0 items-center gap-space-1" data-box>
            <ContextMeter
              compaction={session?.lastCompaction ?? null}
              onrefresh={() => {
                if (session) {
                  detach(
                    refreshContext(session.instanceId, session.machineId),
                    "refreshContext"
                  );
                }
              }}
              status={session?.sdkStatus ?? null}
              usage={session?.context ?? null}
            />
          </span>
        {/if}
      </div>
    {/if}

    <!-- A stop asked from here that did not go, said where it was asked,
         with its way back. -->
    <RowFault
      again={act?.fault?.again}
      againLabel={act?.fault?.againLabel}
      class="shrink-0"
      reason={act?.fault?.reason}
    />
  </div>
</div>
