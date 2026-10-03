<script lang="ts">
  /**
   * A fleet delegate — a session this one spawned with `delegate` or
   * `start_session` — folded onto the parent's spine the way a subagent branch
   * is, so the operator can follow a fan-out without leaving the orchestrator.
   * The delegate is a full instance with its own row and transcript; this card
   * only composes what the store already holds: the hub's record of its asks
   * and reports, the daemon's pulse, and, once opened, its live transcript.
   */
  import type { DelegateAskStatus } from "@cawco/core";
  import { TextMorph } from "torph/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import CollapsibleLazy from "#lib/components/ui/collapsible/collapsible-lazy.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight, IconExternal } from "#lib/icons.js";
  import { formatDuration } from "#lib/utils/time.js";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "../client.svelte";
  import { conversationHref, delegateHandle } from "../links";
  import { markHue, sessionSprite } from "../mark";
  import { modelLabel } from "../models.svelte";
  import { CURVE, dur, easeOut } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import type {
    DelegateAskEvent,
    DelegateReportEvent,
    Message,
  } from "../types";
  import Self from "./Delegate.svelte";
  import { disclosure } from "./disclosure.svelte";
  import MessageBody from "./MessageBody.svelte";
  import MessageRow from "./MessageRow.svelte";
  import {
    askDetail,
    askDetailOf,
    askShort,
    askShortOf,
    matchesSession,
  } from "./present";
  import RunBlock from "./RunBlock.svelte";
  import { foldMessages, wellRuns } from "./rows";
  import Subagent from "./Subagent.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import { trayCard } from "./tray.svelte";

  let { message }: { message: Message } = $props();

  const meta = $derived(message.metadata ?? {});
  /** Set by `applyToolResult` once the spawn returned; absent while it is in flight. */
  const id = $derived(meta.delegateInstanceId ?? null);
  const started = $derived(meta.handoffKind === "start");

  const row = $derived(id ? cawco.instanceIndex.byId.get(id) : undefined);
  const branch = $derived(id ? cawco.session(id) : null);

  const events = $derived(id ? cawco.delegateEventsOf(id) : []);
  const askEvents = $derived(
    events.filter((e): e is DelegateAskEvent => e.kind === "ask")
  );
  const reportEvents = $derived(
    events.filter((e): e is DelegateReportEvent => e.kind === "report")
  );
  const parent = $derived(cawco.session(message.instanceId));

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
        at: latest.timestamp ? Date.parse(latest.timestamp) : undefined,
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
  /**
   * The asks still waiting on an answer. One lands in the register as it is
   * asked and leaves it once answered or refused, both through `reflow`.
   */
  const waiting = $derived(asks.filter((ask) => ask.status === "pending"));
  const pendingAsks = $derived(waiting.length);

  const live = $derived(
    row?.status === "running" || row?.status === "starting"
  );
  const activity = $derived(id ? cawco.activityOf(id) : "idle");
  const currentTool = $derived(id ? cawco.currentToolOf(id) : null);
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
  /** What the pill says before its clock: the phase, and how many reports. */
  const pillWords = $derived(
    [
      phase === "reported" ? "" : phaseWord,
      report?.count
        ? `${report.count} report${report.count === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ")
  );

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
  const startedAt = $derived(
    message.timestamp ? Date.parse(message.timestamp) : undefined
  );
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

  /**
   * The pill's words and clock morph letter by letter (TextMorph, over
   * --dur-morph) once the page is live; the server draws them as plain text,
   * which TextMorph would draw empty.
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });

  /** Kept by the call that started it, so a card the reader opened stays open. */
  const disclosed = $derived(disclosure(message));
  const open = $derived(disclosed.get());

  /**
   * The line under the head: what it is doing, that it failed, or — closed —
   * the headline of its last report. `kind` is what a phase change swaps.
   */
  const status = $derived.by(
    (): { kind: string; text: string; err: boolean; beat: boolean } | null => {
      if (phase === "working") {
        return {
          kind: "working",
          text: currentTool
            ? `${currentTool.name} ${currentTool.glance}`.trim()
            : "working",
          err: false,
          beat: true,
        };
      }
      if (phase === "spawning") {
        return { kind: "spawning", text: "starting", err: false, beat: true };
      }
      if (phase === "failed" && failure) {
        return { kind: "failed", text: failure, err: true, beat: false };
      }
      if (report && !open) {
        return {
          kind: "report",
          text: headline(report.body),
          err: report.failed,
          beat: false,
        };
      }
      return null;
    }
  );
  /**
   * A phase change cross-fades the line in one cell over --dur-control, the
   * old one going as the new one comes. A line with nothing after it — the
   * report's headline as the card opens — goes at once, as it always has.
   */
  function lineSwap(_node: Element) {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /**
   * Opening the card is the only sign this transcript is wanted: watching
   * subscribes its frames, the backfill reads what was stored before this tab.
   */
  const onToggle = (next: boolean) => {
    disclosed.set(next);
    if (!id) {
      return;
    }
    if (next) {
      watchDelegate(id);
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — onToggle is a sync callback, nothing here awaits the backfill.
      void readTranscript(id);
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
  /**
   * The rows the card draws: the transcript as it stood before a read under
   * way, until that read has finished. The read publishes the newest turns
   * and then prepends the older ones a chunk at a time, and the card draws
   * from the top — so every chunk replaced the rows it had just drawn, a
   * 100ms render each, as the card was opening.
   */
  let settled: typeof rows = [];
  const shown = $derived.by(() => {
    if (!(branch && (branch.loading || branch.hydrating))) {
      settled = rows;
    }
    return settled;
  });
  const loading = $derived(
    open &&
      !!id &&
      (!branch || branch.loading || branch.hydrating) &&
      shown.length === 0
  );
  const agentName = $derived(harness || "delegate");
  const seed = $derived(id ?? meta.toolId);
  const Sprite = $derived(sessionSprite(seed));
</script>

<div class="branch delegate rail-row">
  <Collapsible.Root onOpenChange={onToggle} {open}>
    <div class="head">
      <Collapsible.Trigger class="bhead rail-line press-tint">
        <!-- The mark the delegate tray's chip flies out of, the first time
             this card leaves the view (tray.svelte.ts). -->
        <span
          aria-hidden="true"
          class="mark rail-cell m{markHue(seed)}"
          {@attach trayCard(() => id)}
          ><Sprite /></span
        >
        <span class="tk">{label}</span>
        <span aria-hidden="true" class="chev"><IconChevronRight /></span>
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
          {#if morphMs}
            <!-- One box per letter once morphed, which a screen reader would
                 spell out: the name is read from the plain copy beside it. -->
            <span aria-hidden="true" class="pill-words"
              ><TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={pillWords}
              />
              {#if elapsed}
                {pillWords ? " · " : ""}
                <span class="elapsed" class:ticking={inFlight}
                  ><TextMorph
                    as="span"
                    duration={morphMs}
                    ease={CURVE.out}
                    text={elapsed}
                  /></span
                >
              {/if}</span
            >
            <span class="sr-only"
              >{[pillWords, elapsed].filter(Boolean).join(" · ")}</span
            >
          {:else}
            {pillWords}
            {#if elapsed}
              {pillWords ? " · " : ""}
              <span class="elapsed" class:ticking={inFlight}>{elapsed}</span>
            {/if}
          {/if}
        </span>
      </Collapsible.Trigger>
      {#if id}
        <a
          aria-label="Open {label} in its own view"
          class="jump touch-hit"
          href={conversationHref(id, cawco.instanceIndex)}
          title="Open {label} in its own view"
        >
          <IconExternal />
        </a>
      {/if}
    </div>

    {#if brief}
      <p class="brief rail-hang">{headline(brief)}</p>
    {/if}

    <!-- The lines under the head: their words at the text column, a live
         beat or an ask's dot in the glyph column under the mark. -->
    {#if status}
      <div class="status">
        {#key status.kind}
          <p
            class="now rail-line"
            class:err={status.err}
            in:lineSwap
            out:lineSwap
          >
            <span aria-hidden="true" class="rail-cell"
              >{#if status.beat}
                <span class="beat"></span>
              {/if}</span
            >
            <span>{status.text}</span>
          </p>
        {/key}
      </div>
    {/if}

    <ul class="asks" {@attach reflow()}>
      {#each waiting as ask (ask.key)}
        <li class="ask rail-line" data-flip title={ask.detail}>
          <span aria-hidden="true" class="rail-cell"
            ><span class="dot"></span></span
          >
          <span class="astate">{ask.status}</span>
          <span class="ashort">{ask.short}</span>
        </li>
      {/each}
    </ul>

    <Collapsible.Content reveal>
      <!-- The rows, then the report as one more unit: a report is often the
           same page as the last row, and drawn in that row's frame it
           doubled the heaviest frame of the card. -->
      <CollapsibleLazy count={shown.length + (report ? 1 : 0)} {open}>
        {#snippet children(
          limit
        )}
          {@const drawn = shown.slice(0, limit)}
          {@const runs = wellRuns(drawn)}
          <div class="inner">
            {#if loading}
              <p class="empty">Loading its transcript…</p>
            {:else if shown.length === 0 && branch?.readFault}
              <!-- A read that failed is said, never shown as an empty transcript. -->
              <p class="empty">
                {branch.readFault.reason === "offline"
                  ? "Its machine is offline"
                  : "Its transcript couldn't be read"}:
                {branch.readFault.message}
              </p>
              <Button
                onclick={() => id && readTranscript(id, true)}
                size="sm"
                variant="outline"
              >
                Try again
              </Button>
            {:else if shown.length === 0}
              <p class="empty">
                {id
                  ? "Nothing in its transcript yet."
                  : "Still starting — no transcript to show."}
              </p>
            {/if}
            {#each drawn as r (r.key)}
              {#if r.kind === "tools"}
                <ToolGroup messages={r.messages} />
              {:else if r.kind === "question"}
                <ToolGroup messages={[r.message]} />
              {:else if r.kind === "delegate"}
                <Self message={r.message} />
              {:else if r.kind === "run"}
                <RunBlock message={r.message} runId={r.runId} />
              {:else if r.kind === "subagent"}
                <Subagent branch={r.branch} spawn={r.spawn} />
              {:else if r.kind === "thinking"}
                <Thinking live={r.live} text={r.text} />
              {:else if r.kind === "stream"}
                <div class="say"><MessageBody source={r.text} streaming /></div>
              {:else if r.kind === "single"}
                <MessageRow
                  {agentName}
                  grouped={r.grouped}
                  message={r.message}
                  runsOn={runs.has(r.key)}
                />
              {/if}
            {/each}

            <!-- The report closes the card: drawn after the last of its rows. -->
            {#if report && !loading && limit > shown.length}
              <section class="report" class:failed={report.failed}>
                <h4>
                  {report.failed ? "Report — failed" : "Report"}
                  {#if report.count > 1}
                    · latest of {report.count}
                  {/if}
                </h4>
                <MessageBody source={report.body} />
              </section>
            {/if}
          </div>
        {/snippet}
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
  /* The same rail row every branch block sits on (app.css `.rail-row`) — the
     subagent fold's grammar, with a second row for the brief and a register
     for the asks, all at the text column. */

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
    min-block-size: 26px;
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    background: none;
    border: 0;
    border-radius: var(--radius-xs);
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: start;
    transition: color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.delegate .bhead:hover) .tk {
      color: var(--brand-ink);
    }
  }
  .chev {
    inline-size: 13px;
    block-size: 13px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  :global(.delegate .bhead[data-state="open"]) .chev {
    transform: rotate(90deg);
  }
  .chev :global(svg) {
    inline-size: 12px;
    block-size: 12px;
    display: block;
  }

  /* The delegate's identity: its sprite on its hue, filling the glyph cell. */
  .mark {
    border-radius: var(--radius-xs);
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  .mark :global(svg) {
    inline-size: 11px;
    block-size: 11px;
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

  /* Cascade order is load-bearing — .tk's base color must lose to the :hover rule above it. */
  .tk {
    font-family: var(--font-mono);
    color: var(--ink-strong);
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--dur-control) var(--ease-out);
  }
  .kind {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
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
    font-weight: var(--weight-body);
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .may {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--brand-ink);
    white-space: nowrap;
  }
  .pill {
    margin-inline-start: auto;
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-xs);
    padding: 2px var(--space-2);
    background: var(--status-idle-bg);
    color: var(--status-idle-ink);
    white-space: nowrap;
    /* A phase change carries its tone across with its words. */
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  .pill.live {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
  /* A clock that ticks holds its width: every reading up to "59m 59s" or
     "23h 59m" fits seven digit-widths, so the pill, pushed to the end of the
     head, never steps sideways as the seconds change. */
  .elapsed.ticking {
    display: inline-block;
    min-inline-size: 7ch;
    text-align: end;
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
    inline-size: 26px;
    block-size: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    transition:
      color var(--dur-control) var(--ease-out),
      background var(--dur-control) var(--ease-out);
  }
  .jump :global(svg) {
    inline-size: 12px;
    block-size: 12px;
    display: block;
  }
  @media (hover: hover) and (pointer: fine) {
    .jump:hover {
      color: var(--brand-ink);
      background: var(--surface-hover);
    }
  }

  /* The brief: the first line of what it was asked, at the text column.
     headline() bounds its length; the wrap is the layout's. */
  .brief {
    margin-block: var(--space-1) 0;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    line-height: var(--leading-body);
    max-inline-size: 68ch;
    overflow-wrap: anywhere;
  }

  .now {
    align-items: start;
    margin-block: var(--space-1) 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-strong);
    line-height: var(--leading-body);
    max-inline-size: 68ch;
  }
  .now.err {
    color: var(--status-fail-ink);
  }
  /* One cell: a phase's line and the next one's cross-fade in place. */
  .status {
    display: grid;

    & > .now {
      grid-area: 1 / 1;
    }
  }
  /* A line's glyph cell is one line tall, so its mark sits on the first
     line of a line that wraps. */
  .now > .rail-cell,
  .ask > .rail-cell {
    block-size: 1lh;
  }
  .beat {
    inline-size: 5px;
    block-size: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    /* Still: the live hue says it, nothing loops. */
    background: var(--status-live-glyph);
  }

  /* The asks register: each ask still waiting on an answer, on its own line
     with its state in words — the dot is the second cue, and the card's only
     warm colour. */
  .asks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-inline-size: 68ch;
  }
  .ask {
    align-items: baseline;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    min-inline-size: 0;

    /* The register is always there for an ask to land in; it takes room
       only with one in it. */
    &:first-child {
      margin-block-start: var(--space-1);
    }
  }
  .dot {
    inline-size: 5px;
    block-size: 5px;
    border-radius: 50%;
    background: var(--status-attn-ink);
  }
  .astate {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-attn-ink);
    text-transform: uppercase;
    letter-spacing: var(--track-caps);
  }
  .ashort {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* Its transcript, in a well of its own — concentric with the report
     inside. The transcript's own x=0 is the text column: the well reaches
     out past it by its padding, and every row inside repeats the columns
     from there. */
  .inner {
    margin-block: var(--space-2) 0;
    margin-inline: calc(var(--x-hang) - var(--space-1)) 0;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .empty {
    padding: var(--space-2) var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .say {
    margin-block-start: var(--space-4);
  }

  .report {
    margin-block-start: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .report h4 {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-block-end: var(--space-2);
  }
  .report.failed h4 {
    color: var(--status-fail-ink);
  }

  @media (width <= 900px) {
    /* Narrow: the model and harness give way before the name does. */
    .meta {
      display: none;
    }
  }
  @media (pointer: coarse) {
    :global(.delegate .bhead) {
      min-block-size: 44px;
    }
  }
</style>
