<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import CollapsibleLazy from "$lib/components/ui/collapsible/collapsible-lazy.svelte";
  import { IconChevronRight, IconExternal } from "$lib/icons";
  import { formatDuration } from "$lib/utils/time";
  import {
    backfillSession,
    unwatchDelegate,
    watchDelegate,
    whiffle,
  } from "../client.svelte";
  import {
    askDetail,
    askDetailOf,
    askShort,
    askShortOf,
    matchesSession,
  } from "../frames";
  import { conversationHref, delegateHandle } from "../links";
  import { markHue, sessionSprite } from "../mark";
  import { modelLabel } from "../models.svelte";
  /**
   * A fleet delegate — a session this one spawned with `delegate` or
   * `start_session` — folded onto the parent's spine the way a subagent branch
   * is, so the operator can follow a fan-out without leaving the orchestrator.
   * The delegate is a full instance with its own row and transcript; this card
   * only composes what the store already holds: the hub's record of its asks
   * and reports, the daemon's pulse, and, once opened, its live transcript.
   */
  import type {
    DelegateAskEvent,
    DelegateAskStatus,
    DelegateReportEvent,
    Message,
  } from "../types";
  import Self from "./Delegate.svelte";
  import MessageBody from "./MessageBody.svelte";
  import MessageRow from "./MessageRow.svelte";
  import { foldMessages } from "./rows";
  import Subagent from "./Subagent.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let { message }: { message: Message } = $props();

  const meta = $derived(message.metadata ?? {});
  /** Set by `applyToolResult` once the spawn returned; absent while it is in flight. */
  const id = $derived(meta.delegateInstanceId ?? null);
  const started = $derived(meta.handoffKind === "start");

  const row = $derived(id ? whiffle.instanceIndex.byId.get(id) : undefined);
  const branch = $derived(id ? whiffle.session(id) : null);

  const events = $derived(id ? whiffle.delegateEventsOf(id) : []);
  const askEvents = $derived(
    events.filter((e): e is DelegateAskEvent => e.kind === "ask")
  );
  const reportEvents = $derived(
    events.filter((e): e is DelegateReportEvent => e.kind === "report")
  );
  const parent = $derived(whiffle.session(message.instanceId));

  const toolInput = $derived.by((): Record<string, unknown> => {
    const raw = meta.toolInput;
    return typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  });

  const label = $derived.by(() => {
    if (row) {
      return delegateHandle(row);
    }
    const stub = message.content.split("/").filter(Boolean).pop();
    if (id) {
      return `${stub ?? "session"}#${id.slice(0, 8)}`;
    }
    return stub ?? "delegate";
  });
  const type = $derived(
    typeof toolInput.type === "string" ? toolInput.type : ""
  );
  const harness = $derived(
    row?.harness ?? branch?.harness ?? String(toolInput.harness ?? "")
  );
  const model = $derived(
    branch?.model ?? row?.model ?? String(toolInput.model ?? "")
  );
  const mayDelegate = $derived(
    row?.canDelegate === true || toolInput.can_delegate === true
  );
  const brief = $derived(meta.handoffBrief ?? "");

  /**
   * The newest turn it reported and how many there were — off the hub's rows,
   * or off the parent transcript's own `[Report from delegate …]` peer lines
   * for a delegate that ran before the hub kept them.
   */
  const report = $derived.by(
    (): {
      body: string;
      failed: boolean;
      count: number;
      at: number | undefined;
    } | null => {
      const last = reportEvents.at(-1);
      if (last) {
        return {
          body: last.payload.body,
          failed: last.payload.failed,
          count: reportEvents.length,
          at: new Date(last.createdAt).getTime(),
        };
      }
      if (!id) {
        return null;
      }
      const peers = (parent?.messages ?? []).filter(
        (m) =>
          m.type === "user.peer" &&
          m.metadata?.reportKind !== undefined &&
          matchesSession(m.metadata?.peerSession, id)
      );
      const latest = peers.at(-1);
      if (!latest) {
        return null;
      }
      return {
        body: latest.content,
        failed: latest.metadata?.reportKind === "failed",
        count: peers.length,
        at: latest.timestamp?.getTime(),
      };
    }
  );

  /**
   * Its permission asks routed to this parent, oldest first. The hub's rows
   * carry the state; older asks are read back out of the parent transcript,
   * answered where the parent's `answer_delegate` call names their requestId.
   */
  const asks = $derived.by(
    (): Array<{
      key: string;
      status: DelegateAskStatus;
      short: string;
      detail: string;
    }> => {
      if (!id) {
        return [];
      }
      if (askEvents.length > 0) {
        return askEvents.map((ask) => ({
          key: String(ask.id),
          status: ask.status ?? "pending",
          short: askShortOf(ask.toolName, ask.payload.input ?? {}),
          detail: askDetailOf(ask.toolName, ask.payload.input ?? {}),
        }));
      }
      const parentMessages = parent?.messages ?? [];
      return parentMessages
        .filter(
          (m) =>
            m.type === "user.delegate_ask" &&
            matchesSession(m.metadata?.peerSession, id)
        )
        .map((ask, index) => {
          const requestId = ask.metadata?.askRequestId;
          let status: DelegateAskStatus = "pending";
          if (requestId) {
            const answer = parentMessages.find(
              (m) =>
                m.type === "tool.use" &&
                (m.metadata?.toolName ?? "").includes("answer_delegate") &&
                JSON.stringify(m.metadata?.toolInput ?? null).includes(
                  requestId
                )
            );
            if (answer) {
              const input = answer.metadata?.toolInput;
              const denied =
                typeof input === "object" &&
                input !== null &&
                !Array.isArray(input) &&
                input.deny === true;
              status = denied ? "denied" : "answered";
            }
          }
          return {
            key: ask.id ?? `ask-${index}`,
            status,
            short: askShort(ask.content),
            detail: askDetail(ask.content),
          };
        });
    }
  );
  const pendingAsks = $derived(
    asks.filter((ask) => ask.status === "pending").length
  );

  const live = $derived(
    row?.status === "running" || row?.status === "starting"
  );
  const activity = $derived(id ? whiffle.activityOf(id) : "idle");
  const currentTool = $derived(id ? whiffle.currentToolOf(id) : null);
  const spawnFailed = $derived(!id && meta.toolStatus === "error");

  type Phase =
    | "spawning"
    | "working"
    | "blocked"
    | "reported"
    | "idle"
    | "sleeping"
    | "stopped"
    | "failed";
  const phase = $derived.by((): Phase => {
    if (spawnFailed || row?.status === "error") {
      return "failed";
    }
    if (!id) {
      return "spawning";
    }
    if (pendingAsks > 0 || activity === "blocked") {
      return "blocked";
    }
    if (live && activity === "working") {
      return "working";
    }
    if (row?.status === "sleeping") {
      return "sleeping";
    }
    if (row?.status === "stopped") {
      return "stopped";
    }
    return report ? "reported" : "idle";
  });
  const inFlight = $derived(phase === "spawning" || phase === "working");
  const tone = $derived.by(() => {
    if (phase === "failed") {
      return "fail";
    }
    if (phase === "blocked") {
      return "attn";
    }
    if (inFlight) {
      return "live";
    }
    return phase === "reported" ? "done" : "idle";
  });
  const phaseWord = $derived(phase === "blocked" ? "needs an answer" : phase);

  // Elapsed is a clock: while it runs the card re-reads it on its own, and once
  // it has settled the last report is the end of the run.
  let now = $state(Date.now());
  $effect(() => {
    if (!inFlight) {
      return;
    }
    const tick = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(tick);
  });
  const startedAt = $derived(message.timestamp?.getTime());
  const endedAt = $derived(inFlight ? now : report?.at);
  const elapsed = $derived(
    startedAt && endedAt && endedAt > startedAt
      ? formatDuration(endedAt - startedAt)
      : ""
  );

  const headline = (text: string): string => {
    const line =
      text
        .split("\n")
        .map((each) => each.trim())
        .find(Boolean) ?? "";
    return line.length > 120 ? `${line.slice(0, 119)}…` : line;
  };

  const failure = $derived(
    spawnFailed
      ? headline(String(meta.toolResult ?? "The spawn failed."))
      : (row?.lastError ?? (report?.failed ? headline(report.body) : ""))
  );

  let open = $state(false);
  /**
   * Opening the card is the only sign this transcript is wanted: watching
   * subscribes its frames, the backfill reads what was stored before this tab.
   */
  const onToggle = (next: boolean) => {
    open = next;
    if (!id) {
      return;
    }
    if (next) {
      watchDelegate(id);
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — onToggle is a sync callback, nothing here awaits the backfill.
      void backfillSession(id);
    } else {
      unwatchDelegate(id);
    }
  };

  const rows = $derived.by(() => {
    if (!branch) {
      return [];
    }
    const folded = foldMessages(branch.messages, branch.subagents);
    if (branch.streaming) {
      folded.push({
        kind: "stream",
        key: "delegate:stream",
        text: branch.streaming,
      });
    }
    return folded;
  });
  const loading = $derived(
    open &&
      !!id &&
      (!branch || branch.loading || branch.hydrating) &&
      rows.length === 0
  );
  const agentName = $derived(harness || "delegate");
  const seed = $derived(id ?? meta.toolId);
  const Sprite = $derived(sessionSprite(seed));
</script>

<div class="branch delegate">
  <Collapsible.Root onOpenChange={onToggle} {open}>
    <div class="head">
      <Collapsible.Trigger class="bhead">
        <span aria-hidden="true" class="chev"><IconChevronRight /></span>
        <span aria-hidden="true" class="mark m{markHue(seed)}"><Sprite /></span>
        <span class="tk">{label}</span>
        {#if started}
          <span class="kind">session</span>
        {:else if type}
          <span class="kind">{type}</span>
        {/if}
        {#if harness}
          <span class="meta">{harness}</span>
        {/if}
        {#if model}
          <span class="meta">{modelLabel(model)}</span>
        {/if}
        {#if mayDelegate}
          <span class="may">may delegate</span>
        {/if}
        <span class="pill {tone}">
          {#if phase !== 'reported'}
            {phaseWord}
          {/if}
          {#if report?.count}
            {#if phase !== 'reported'}
              {' · '}
            {/if}
            {report.count}
            report{report.count === 1 ? '' : 's'}
          {/if}
          {#if elapsed}
            {' · '}{elapsed}
          {/if}
        </span>
      </Collapsible.Trigger>
      {#if id}
        <a
          aria-label="Open {label} in its own view"
          class="jump touch-hit"
          href={conversationHref(id, whiffle.instanceIndex)}
          title="Open {label} in its own view"
        >
          <IconExternal />
        </a>
      {/if}
    </div>

    {#if brief}
      <p class="brief">{headline(brief)}</p>
    {/if}

    {#if phase === 'working'}
      <p class="now">
        <span aria-hidden="true" class="beat"></span>
        {currentTool ? `${currentTool.name} ${currentTool.glance}`.trim() : 'working'}
      </p>
    {:else if phase === 'spawning'}
      <p class="now"><span aria-hidden="true" class="beat"></span>starting</p>
    {:else if phase === 'failed' && failure}
      <p class="now err">{failure}</p>
    {:else if report && !open}
      <p class="now" class:err={report.failed}>{headline(report.body)}</p>
    {/if}

    {#if asks.length}
      <ul class="asks">
        {#each asks as ask (ask.key)}
          <li class="ask {ask.status}" title={ask.detail}>
            <span aria-hidden="true" class="dot"></span>
            <span class="astate">{ask.status}</span>
            <span class="ashort">{ask.short}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <Collapsible.Content>
      <CollapsibleLazy {open}>
        <div class="inner">
          {#if loading}
            <p class="empty">Loading its transcript…</p>
          {:else if rows.length === 0}
            <p class="empty">
              {id ? 'Nothing in its transcript yet.' : 'Still starting — no transcript to show.'}
            </p>
          {/if}
          {#each rows as r (r.key)}
            {#if r.kind === 'tools'}
              <ToolGroup messages={r.messages} />
            {:else if r.kind === 'question'}
              <ToolGroup messages={[r.message]} />
            {:else if r.kind === 'delegate'}
              <Self message={r.message} />
            {:else if r.kind === 'subagent'}
              <Subagent branch={r.branch} spawn={r.spawn} />
            {:else if r.kind === 'thinking'}
              <Thinking live={r.live} text={r.text} />
            {:else if r.kind === 'stream'}
              <div class="say"><MessageBody source={r.text} streaming /></div>
            {:else if r.kind === 'single'}
              <MessageRow {agentName} message={r.message} />
            {/if}
          {/each}

          {#if report}
            <section class="report" class:failed={report.failed}>
              <h4>
                {report.failed ? 'Report — failed' : 'Report'}
                {#if report.count > 1}
                  · latest of {report.count}
                {/if}
              </h4>
              <MessageBody source={report.body} />
            </section>
          {/if}
        </div>
      </CollapsibleLazy>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  /* A branch's own rows draw their own rails, and they start their own line
     — they must not inherit the continuation the OUTER row published, or a
     nested tool run paints the tail weight and hugs the row above it. */
  .branch :global(*) {
    --rail-head: var(--rail);
    --rail-gap: var(--space-4);
  }
  /* The same rail every branch block sits on — the subagent fold's grammar,
     with a second row for the brief and a register for the asks. */
  .branch {
    /* Where the mark starts: the chevron and the head row's gap. Every line
       under the head indents to it. */
    --glyph: calc(13px + var(--space-2));
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
  }

  /* The head row: the trigger takes the width, the jump link beside it keeps
     its own 26px so a click on it never toggles. The trigger is a bits-ui
     element, so it is addressed globally on purpose. */
  .head {
    --hit-gap-x: var(--space-1);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  :global(.delegate .bhead) {
    min-height: 26px;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.delegate .bhead:hover) .tk {
      color: var(--accent-text);
    }
  }
  :global(.delegate [data-slot="collapsible-content"]) {
    overflow: hidden;
  }
  :global(.delegate [data-slot="collapsible-content"][data-state="open"]) {
    animation: delegate-down calc(var(--dur-control) * 2) var(--ease-out);
  }
  :global(.delegate [data-slot="collapsible-content"][data-state="closed"]) {
    animation: delegate-up var(--dur-exit) var(--ease-out);
  }
  @keyframes delegate-down {
    from {
      height: 0;
    }
    to {
      height: var(--bits-collapsible-content-height);
    }
  }
  @keyframes delegate-up {
    from {
      height: var(--bits-collapsible-content-height);
    }
    to {
      height: 0;
    }
  }

  .chev {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    transition: transform var(--dur-control) var(--ease-out);
  }
  :global(.delegate .bhead[data-state="open"]) .chev {
    transform: rotate(90deg);
  }
  .chev :global(svg) {
    width: 13px;
    height: 13px;
    display: block;
  }

  .mark {
    width: 17px;
    height: 17px;
    border-radius: var(--radius-xs);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  .mark :global(svg) {
    width: 11px;
    height: 11px;
    display: block;
    color: var(--mark-glyph);
  }
  .mark.m2 {
    background-color: var(--mark-2);
  }
  .mark.m3 {
    background-color: var(--mark-3);
  }
  .mark.m4 {
    background-color: var(--mark-4);
  }
  .mark.m5 {
    background-color: var(--mark-5);
  }
  .mark.m6 {
    background-color: var(--mark-6);
  }
  .mark.m7 {
    background-color: var(--mark-7);
  }
  .mark.m8 {
    background-color: var(--mark-8);
  }

  /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .tk's base color must lose to the :hover rule above it. */
  .tk {
    font-family: var(--font-mono);
    color: var(--ink-strong);
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--dur-control) var(--ease-out);
  }
  .kind {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    color: var(--ink-strong);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    padding: 0 var(--space-2);
    line-height: 18px;
    white-space: nowrap;
  }
  .meta {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .may {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    color: var(--accent-text);
    white-space: nowrap;
  }
  .pill {
    margin-left: auto;
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-xs);
    padding: 2px var(--space-2);
    background: var(--status-idle-bg);
    color: var(--status-idle-ink);
    white-space: nowrap;
  }
  .pill.live {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
  .pill.attn {
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .pill.done {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
  .pill.fail {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }

  /* The way out to the delegate's own view — a glyph beside the head, in the
     muted ink until pointed at, so the head stays a disclosure and this stays
     a link. */
  .jump {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    transition:
      color var(--dur-control) var(--ease-out),
      background var(--dur-control) var(--ease-out);
  }
  .jump :global(svg) {
    width: 13px;
    height: 13px;
    display: block;
  }
  @media (hover: hover) and (pointer: fine) {
    .jump:hover {
      color: var(--accent-text);
      background: var(--surface-hover);
    }
  }

  /* The brief: the first line of what it was asked, indented under the glyph
     column. headline() bounds its length; the wrap is the layout's. */
  .brief {
    margin: var(--space-1) 0 0 var(--glyph);
    font-size: var(--text-label);
    color: var(--ink-muted);
    line-height: var(--leading-body);
    max-width: 68ch;
    overflow-wrap: anywhere;
  }

  .now {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: var(--space-1) 0 0 var(--glyph);
    font-size: var(--text-label);
    color: var(--ink-strong);
    line-height: var(--leading-body);
    max-width: 68ch;
  }
  .now.err {
    color: var(--status-fail-ink);
  }
  .beat {
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--status-live-ink);
    animation: beat var(--breath) var(--ease-in-out) infinite;
  }
  @keyframes beat {
    50% {
      opacity: 0.3;
    }
  }

  /* The asks register: each ask on its own line with its state in words —
     the dot is the second cue. A pending one is the card's only warm colour. */
  .asks {
    list-style: none;
    margin: var(--space-1) 0 0 var(--glyph);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 68ch;
  }
  .ask {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    min-width: 0;
  }
  .dot {
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--status-idle-ink);
    align-self: center;
  }
  .ask.pending .dot {
    background: var(--status-attn-ink);
  }
  .ask.answered .dot {
    background: var(--status-done-ink);
  }
  .ask.denied .dot {
    background: var(--status-fail-ink);
  }
  .astate {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .ask.pending .astate {
    color: var(--status-attn-ink);
  }
  .ask.denied .astate {
    color: var(--status-fail-ink);
  }
  .ashort {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* Its transcript, in a well of its own — concentric with the report inside. */
  .inner {
    margin: var(--space-2) 0 0 var(--glyph);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .empty {
    padding: var(--space-2) var(--space-2);
    font-size: var(--text-label);
    color: var(--ink-muted);
  }
  .say {
    margin-top: var(--space-4);
  }
  /* The hand-off and every follow-up are user turns. In the main column a
     user turn bleeds into the gutters and sits in a sunken well; in here the
     well is already sunken and there are no gutters, so the turn stays flush
     and lifts instead — the report's own surface, concentric with the well. */
  .inner :global(section.turn.you) {
    margin-inline: 0;
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }

  .report {
    margin-top: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .report h4 {
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-bottom: var(--space-2);
  }
  .report.failed h4 {
    color: var(--status-fail-ink);
  }

  @media (max-width: 900px) {
    .branch {
      margin-left: 0;
    }
    /* Narrow: the model and harness give way before the name does. */
    .meta {
      display: none;
    }
  }
  @media (pointer: coarse) {
    :global(.delegate .bhead) {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.delegate .bhead),
    .chev,
    .jump {
      transition: none;
    }
    /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .tk's base transition must lose to the :hover rule above it. */
    .tk {
      transition: none;
    }
    :global(.delegate [data-slot="collapsible-content"][data-state="open"]),
    :global(.delegate [data-slot="collapsible-content"][data-state="closed"]) {
      animation: none;
    }
    .beat {
      animation: none;
    }
  }
</style>
