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
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconChevronRight, IconExternal } from "#lib/icons.js";
  import { formatDuration } from "#lib/utils/time.js";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "../client.svelte";
  import { conversationHref, resolveSessionTitle } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import { markHue, sessionSprite } from "../mark";
  import { modelLabel } from "../models.svelte";
  import { tickingClock } from "../motion/clock.svelte.js";
  import { dur, easeOut } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import type {
    DelegateAskEvent,
    DelegateReportEvent,
    Message,
  } from "../types";
  import { disclosure } from "./disclosure.svelte";
  import InlineTranscript from "./InlineTranscript.svelte";
  import {
    askDetail,
    askDetailOf,
    askShort,
    askShortOf,
    matchesSession,
  } from "./present";
  import { trayCard } from "./tray.svelte";

  let { message }: { message: Message } = $props();

  const meta = $derived(message.metadata ?? {});
  /** Set by `applyToolResult` once the spawn returned; absent while it is in flight. */
  const id = $derived(meta.delegateInstanceId ?? null);
  const started = $derived(meta.handoffKind === "start");

  const row = $derived(id ? cawco.instanceIndex.byId.get(id) : undefined);
  const branch = $derived(id ? cawco.session(id) : null);

  /**
   * The session the delegate reports to, when that is not the one whose
   * transcript draws this card: a fork's copied history, or a session whose
   * continuation took its delegates on. Its asks, reports and live state are
   * that session's, so the card draws the call as it was made and says
   * where the delegate answers now.
   */
  const elsewhere = $derived(
    row?.parentInstanceId && row.parentInstanceId !== message.instanceId
      ? row.parentInstanceId
      : null
  );
  const ownerName = $derived.by(() => {
    if (!elsewhere) {
      return "";
    }
    const owner = cawco.instanceIndex.byId.get(elsewhere);
    return resolveSessionTitle({
      title: owner?.title ?? owner?.derivedTitle,
      cwd: owner?.cwd,
      id: elsewhere,
    });
  });

  const events = $derived(id && !elsewhere ? cawco.delegateEventsOf(id) : []);
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

  /**
   * The delegate's title: the spawn result's once it returned, the title the
   * call gave it while it is in flight. Never its id.
   */
  const label = $derived(
    meta.delegateTitle ??
      (typeof toolInput.title === "string" ? toolInput.title : "")
  );
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
      /** The delegate's own short outcome, when it finished with finish_item. */
      headline: string | undefined;
      failed: boolean;
      count: number;
      at: number | undefined;
    } | null => {
      const last = reportEvents.at(-1);
      if (last) {
        return {
          body: last.payload.body,
          headline: last.payload.headline,
          failed: last.payload.failed,
          count: reportEvents.length,
          at: new Date(last.createdAt).getTime(),
        };
      }
      if (!id || elsewhere) {
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
        headline: latest.metadata?.reportHeadline,
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
      if (!id || elsewhere) {
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
    | "stopping"
    | "stopped"
    | "failed"
    | "elsewhere";
  const phase = $derived.by((): Phase => {
    if (elsewhere) {
      return "elsewhere";
    }
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
    // Asked to end, its machine yet to confirm the process gone.
    if (row?.status === "stopping") {
      return "stopping";
    }
    if (row?.status === "stopped") {
      return "stopped";
    }
    // At rest, what it reported is what the card says, whether or not its
    // processes are still held: a finished delegate is put to sleep at once.
    if (report) {
      return "reported";
    }
    return row?.status === "sleeping" ? "sleeping" : "idle";
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
    elsewhere
      ? `reports to ${ownerName}`
      : [
          phase === "reported" ? "" : phaseWord,
          report?.count
            ? `${report.count} report${report.count === 1 ? "" : "s"}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
  );

  // Elapsed is a clock: while it runs the card re-reads it on its own, and once
  // it has settled the last report is the end of the run. A clock nobody can
  // see does not tick (motion/clock).
  const clock = tickingClock(() => inFlight);
  const startedAt = $derived(
    message.timestamp ? Date.parse(message.timestamp) : undefined
  );
  const endedAt = $derived(inFlight ? clock.now : report?.at);
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
      : (row?.lastError ??
          (report?.failed ? (report.headline ?? headline(report.body)) : ""))
  );

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
          text: report.headline ?? headline(report.body),
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

  const agentName = $derived(harness || "delegate");
  const seed = $derived(id ?? meta.toolId);
  const Sprite = $derived(sessionSprite(seed));
</script>

<!-- The same rail row every branch block sits on (app.css `.rail-row`) — the
     subagent fold's grammar, with a second row for the brief and a register
     for the asks, all at the text column. Its transcript's well
     (InlineTranscript) reaches out past that column by its padding. -->
<div
  data-slot="rail-row"
  class="rail-row"
  style:--well-at="calc(var(--x-hang) - var(--space-1))"
>
  <Collapsible.Root onOpenChange={onToggle} {open}>
    <!-- The head row: the trigger takes the width, the jump link beside it
         keeps its own 26px so a click on it never toggles. -->
    <div
      data-slot="head"
      class="flex items-center gap-space-1"
      style:--hit-gap-x="var(--space-1)"
    >
      <!-- literal: 26px -->
      <!-- literal: 44px -->
      <Collapsible.Trigger
        data-bhead
        class="group/bhead rail-line press-tint min-h-(--bhead-min) coarse:min-h-(--bhead-min-coarse) flex-auto min-w-0 text-size-label font-medium bg-transparent border-none border-current rounded-xs p-0 text-inherit cursor-pointer text-start transition-[color] dur-control ease-out"
        style="--bhead-min: 26px; --bhead-min-coarse: 44px"
      >
        <!-- The mark the delegate tray's chip flies out of, the first time
             this card leaves the view (tray.svelte.ts): the delegate's
             sprite on its hue, filling the glyph cell. -->
        <!-- literal: 11px -->
        <span
          data-rail-cell
          data-slot="mark"
          aria-hidden="true"
          class="rail-cell rounded-xs bg-mark-overlay bg-(--mark-bg)"
          style:--mark-bg="var(--mark-{markHue(seed)})"
          style:--sprite="11px"
          {@attach trayCard(() => (elsewhere ? null : id))}
          ><Sprite class="size-(--sprite) block text-mark-glyph" /></span
        >
        <span
          class="font-mono text-ink-strong group-hover/bhead:text-brand-ink flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap transition-[color] dur-control ease-out"
          >{label}</span
        >
        <!-- literal: 13px -->
        <!-- literal: rotate(90deg) -->
        <span
          data-slot="chev"
          aria-hidden="true"
          class="size-(--chev) flex-none grid place-items-center text-ink-muted motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out group-state-open/bhead:transform-(--chev-turn)"
          data-box
          style:--chev="13px"
          style:--chev-turn="rotate(90deg)"
          ><IconChevronRight class="size-icon-sm block" /></span
        >
        <!-- Its words on their x-height in the box (.mark-text): the trim's
             room given back as padding, so the box keeps its 18px line. -->
        {#if started}
          <!-- literal: 18px -->
          <span
            data-slot="kind"
            class="mark-text flex-none text-size-meta font-normal text-ink-strong border border-border-hairline rounded-xs py-(--kind-py) px-space-2 leading-(--kind-lh) whitespace-nowrap"
            data-box
            style:--kind-py="calc((1lh - 1ex) / 2)"
            style:--kind-lh="18px">session</span
          >
        {:else if type}
          <!-- literal: 18px -->
          <span
            data-slot="kind"
            class="mark-text flex-none text-size-meta font-normal text-ink-strong border border-border-hairline rounded-xs py-(--kind-py) px-space-2 leading-(--kind-lh) whitespace-nowrap"
            data-box
            style:--kind-py="calc((1lh - 1ex) / 2)"
            style:--kind-lh="18px">{type}</span
          >
        {/if}
        <!-- Narrow: the model and harness give way before the name does. -->
        {#if harness}
          <span
            data-slot="meta"
            class="text-ink-muted text-size-meta font-normal flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap max-desk:hidden"
            >{harness}</span
          >
        {/if}
        {#if model}
          <span
            data-slot="meta"
            class="text-ink-muted text-size-meta font-normal flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap max-desk:hidden"
            >{modelLabel(model)}</span
          >
        {/if}
        {#if mayDelegate}
          <span
            class="flex-none text-size-meta font-normal text-brand-ink whitespace-nowrap"
            >may delegate</span
          >
        {/if}
        <!-- Its words on their x-height in the box (.mark-text): 2px past
             the trim's room given back, so the box keeps its height. A phase
             change carries its tone across with its words. -->
        <span
          class="mark-text ms-auto flex-none text-size-meta font-normal num rounded-xs py-(--pill-py) px-space-2 bg-status-idle-bg text-status-idle-ink whitespace-nowrap transition-[background-color,color] dur-control ease-out tone-live:bg-status-live-bg tone-live:text-status-live-ink tone-attn:bg-status-attn-bg tone-attn:text-status-attn-ink tone-done:bg-status-done-bg tone-done:text-status-done-ink tone-fail:bg-status-fail-bg tone-fail:text-status-fail-ink"
          data-tone={tone}
          data-delegate-tone={tone}
          data-box
          style:--pill-py="calc(2px + (1lh - 1ex) / 2)"
        >
          <MorphText text={pillWords} />
          {#if elapsed}
            {pillWords ? " · " : ""}
            <!-- The clock is plain tabular figures: a second ticking over
                 changes digits in place, never the pill's width, and nothing
                 animates on a tick. It is a timer (live off): in the
                 transcript's log the phase words are read when they change,
                 not every second. A clock that ticks holds its width: every
                 reading up to "59m 59s" or "23h 59m" fits seven
                 digit-widths, so the pill, pushed to the end of the head,
                 never steps sideways as the seconds change. -->
            <!-- literal: 7ch -->
            <span
              class="data-ticking:inline-block data-ticking:min-w-(--elapsed-min) data-ticking:text-end"
              data-ticking={inFlight || undefined}
              role="timer"
              style:--elapsed-min="7ch"
              {@attach clock.watch}>{elapsed}</span
            >
          {/if}
        </span>
      </Collapsible.Trigger>
      <!-- The way out to the delegate's own view — a glyph beside the head,
           in the muted ink until pointed at, so the head stays a disclosure
           and this stays a link. -->
      {#if id}
        <!-- literal: 26px -->
        <a
          aria-label="Open {label} in its own view"
          class="touch-hit flex-none size-(--jump) grid place-items-center rounded-xs text-ink-muted transition-[color,background] dur-control ease-out hover:text-brand-ink hover:bg-surface-hover"
          href={conversationHref(id, cawco.instanceIndex)}
          title="Open {label} in its own view"
          style:--jump="26px"
        >
          <IconExternal class="size-icon-sm block" />
        </a>
      {/if}
    </div>

    <!-- The brief: the first line of what it was asked, at the text column.
         headline() bounds its length; the wrap is the layout's. -->
    {#if brief}
      <!-- literal: 68ch -->
      <p
        class="rail-hang mt-space-1 mb-0 text-size-body font-normal text-ink-muted leading-body max-w-(--measure) wrap-anywhere"
        style:--measure="68ch">{headline(brief)}</p>
    {/if}

    <!-- The lines under the head: their words at the text column, a live
         beat or an ask's dot in the glyph column under the mark. One cell: a
         phase's line and the next one's cross-fade in place. A line's glyph
         cell is one line tall, so its mark sits on the first line of a line
         that wraps. -->
    {#if status}
      <div class="grid">
        {#key status.kind}
          <!-- literal: 68ch -->
          <p
            class="rail-line col-start-1 row-start-1 items-start mt-space-1 mb-0 text-size-meta font-normal text-ink-strong data-err:text-status-fail-ink leading-body max-w-(--measure)"
            data-err={status.err || undefined}
            style:--measure="68ch"
            in:lineSwap
            out:lineSwap
          >
            <!-- Still: the live hue says it, nothing loops. -->
            <!-- literal: 5px -->
            <!-- literal: 50% -->
            <span
              data-slot="rail-cell"
              aria-hidden="true"
              class="rail-cell h-lh"
              style:--beat="5px"
              style:--beat-r="50%"
              >{#if status.beat}
                <span
                  class="size-(--beat) flex-none rounded-(--beat-r) bg-status-live-glyph"
                ></span>
              {/if}</span
            >
            <span>{status.text}</span>
          </p>
        {/key}
      </div>
    {/if}

    <!-- The asks register: each ask still waiting on an answer, on its own
         line with its state in words — the dot is the second cue, and the
         card's only warm colour. The register is always there for an ask to
         land in; it takes room only with one in it. -->
    <!-- literal: 68ch -->
    <ul
      class="list-none m-0 p-0 flex flex-col gap-space-row max-w-(--measure)"
      style:--measure="68ch"
      {@attach reflow()}
    >
      {#each waiting as ask (ask.key)}
        <li
          data-slot="ask"
          class="rail-line items-baseline text-size-body font-normal leading-body text-ink-strong min-w-0 first:mt-space-1"
          data-flip
          title={ask.detail}
        >
          <!-- literal: 5px -->
          <!-- literal: 50% -->
          <span
            data-slot="rail-cell"
            aria-hidden="true"
            class="rail-cell h-lh"
            style:--dot="5px"
            style:--dot-r="50%"
            ><span
              data-slot="dot"
              class="size-(--dot) rounded-(--dot-r) bg-status-attn-ink"
            ></span></span
          >
          <span
            class="flex-none text-size-meta font-normal text-status-attn-ink uppercase tracking-caps"
            >{ask.status}</span
          >
          <span class="min-w-0 wrap-anywhere">{ask.short}</span>
        </li>
      {/each}
    </ul>

    <Collapsible.Content reveal>
      <InlineTranscript afterCount={report ? 1 : 0} {agentName} {id} {open}>
        <!-- The report closes the card: drawn after the last of its rows. -->
        {#snippet after()}
          {#if report}
            <section
              data-delegate-failed={report.failed || undefined}
              class="group/report mt-space-4 p-space-3 rounded-xs bg-surface-raised shadow-tile"
              data-failed={report.failed || undefined}
            >
              <h4
                class="text-size-label font-medium tracking-caps uppercase text-ink-muted group-data-failed/report:text-status-fail-ink mb-space-2"
              >
                {report.failed ? "Report — failed" : "Report"}
                {#if report.count > 1}
                  · latest of {report.count}
                {/if}
              </h4>
              <MessageBody source={report.body} />
            </section>
          {/if}
        {/snippet}
      </InlineTranscript>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  /* residual: foreign-dom */
  /* This card's head rule reached every head under the card, so a subagent
     or delegate card inside its transcript (InlineTranscript renders both)
     took the trigger's flex and floor from it too. The subagent card's own
     head sets neither, so they stay here for the nested heads; this card's
     own head carries them as utilities. */
  [data-slot="rail-row"] :global([data-slot="rail-row"] [data-bhead]) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }
</style>
