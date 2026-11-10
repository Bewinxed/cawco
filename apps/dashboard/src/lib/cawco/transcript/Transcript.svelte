<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  import { transcriptWords } from "@cawco/core/words/transcript";
  /**
   * The scrolling transcript: the folded rows, virtualized. The live tail rides
   * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
   * block and the tool in flight all scroll with the conversation. Announces
   * genuine arrivals — and blocked-on-you — through a dedicated live region
   * beside the log, never through the virtualized container itself.
   */
  import { type Snippet, setContext, untrack } from "svelte";
  import { Virtualizer } from "virtua/svelte";
  import { describeTool } from "#lib/components/features/tool-cards/descriptors.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconChat } from "#lib/icons.js";
  import { crossIn, rise } from "#lib/platform/motion/curves.svelte.js";
  import { stopWords } from "../accounts/switch.svelte";
  import EmptyAsk from "../EmptyAsk.svelte";
  import { askFirst, EMPTY_LINES, firstAskLabel } from "../empty-asks";
  import { provideMarkdownBlocks } from "../markdown-blocks";
  import { provideSessionHere } from "../session-here";
  import { boardStore } from "../stores/board.svelte";
  import type { SessionState } from "../stores/sessions.svelte";
  import {
    faultMessage,
    readOlderPage,
    readTranscript,
    reconnectingNow,
  } from "../stores/transcript-reads.svelte";
  import { provideBlockSources } from "../views/openui/block-media";
  import AccountMoveDivider from "./AccountMoveDivider.svelte";
  import { ArrivalLedger } from "./arrival-ledger.svelte";
  import { provideLedger, type Ticket } from "./arrivals.svelte";
  import Behind from "./Behind.svelte";
  import { transcriptSources } from "./block-sources";
  import CatchUp from "./CatchUp.svelte";
  import CompactionDivider from "./CompactionDivider.svelte";
  import ConnectCard from "./ConnectCard.svelte";
  import { paneDrafts } from "./composer-draft.svelte";
  import Delegate from "./Delegate.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import { ConversationBlocks, provideInlineBlocks } from "./inline-blocks.svelte";
  import { JumpToLatest } from "./jump-to-latest.svelte";
  import { KeptPlace } from "./kept-place.svelte";
  import Latest from "./Latest.svelte";
  import LiveRow from "./LiveRow.svelte";
  import { ListLanding } from "./list-landing.svelte";
  import { ListWhole } from "./list-whole.svelte";
  import { LiveRegion } from "./live-region.svelte";
  import MessageRow from "./MessageRow.svelte";
  import { MountedRows } from "./mounted-rows.svelte";
  import NoticeRun from "./NoticeRun.svelte";
  import { OlderPages } from "./older-pages.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import TranscriptRow from "./Row.svelte";
  import { RecordSeek } from "./record-seek.svelte";
  import { RowBuild } from "./row-build.svelte";
  import { RowPresentation } from "./row-presentation.svelte";
  import { RowRails } from "./row-rails.svelte";
  import type { Row } from "./rows";
  import Subagent from "./Subagent.svelte";
  import SystemLine from "./SystemLine.svelte";
  import { ScrollPin } from "./scroll-pin.svelte";
  import { SendSlides } from "./send-slides.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import TranscriptBlock from "./TranscriptBlock.svelte";
  import { TranscriptFind } from "./transcript-find.svelte";

  let {
    session,
    visible,
    focused,
    agentName,
    onlanded,
    onshown,
    firstScreen = false,
    parkedHeight = 0,
    latestInset,
    afterRows,
    afterRowsAtWork = false,
    headRoom,

    /**
     * Whether this transcript is on screen at all. Governs how OFTEN rows are
     * built: a pane nobody can see reads its session only at the scheduler's
     * slow tier, and never in the flush that brings it on screen.
     */
    /**
     * Whether this is the transcript being worked in. Governs how EAGERLY
     * rows are rebuilt, and who gets to ride the tail and announce.
     *
     * Defaults to `visible`, so the single-pane case — one transcript, on
     * screen, being read — behaves exactly as it always has.
     */
    /** Optional callback when the transcript first renders content. */
    /**
     * Told whether this transcript's list is drawn (`shown`, below), and told
     * false when this transcript goes: the pane's placeholder stands over it
     * exactly while it is not.
     */
  }: {
    session: SessionState;
    visible: boolean;
    focused?: boolean;
    agentName: string;
    onlanded?: () => void;
    onshown?: (shown: boolean) => void;
    /**
     * The rows are the server's first screen of this conversation (the
     * page a cold load was served with): stood in, painted at the tail from
     * the server's HTML on, until the list has landed and is drawn in their
     * place (`servedRows`).
     */
    firstScreen?: boolean;
    /** What stands after the last row, in the list's flow (a project's setup element, SetupWell). */
    afterRows?: Snippet;
    /**
     * What stands after the rows says the agent is at work, in words of
     * its own (a setup element's live line and steps): the bare working
     * line ("Thinking…") stands down, so his work is said once.
     */
    afterRowsAtWork?: boolean;
    /**
     * How far what rises past the composer lent to this conversation (an
     * ask it grows into, an offer on its tray row) stands over the foot, px.
     * Set on the two boxes that read it (`.parked-room`, `.dock`), never on
     * a box around the list: it changes as the composer measures itself and
     * as it is lent from tab to tab, and written above the list it restyled
     * every row in the list each time.
     */
    parkedHeight?: number;
    /** Where the way back to the tail rests, up from the scroller's foot, when the pane says (a docked conversation's). */
    latestInset?: string;
    /**
     * How far a bar floating over the transcript's top stands into it, a CSS
     * length (a docked conversation's panel bar): the first row clears it at
     * rest and scrolls under it.
     */
    headRoom?: string;
  } = $props();

  setContext("cawco:machine", () => session.machineId);
  provideSessionHere(() => session.instanceId);
  // An agent's blocks in its replies (tsk-330): drawn by the rows' markdown,
  // their versions read off this conversation.
  provideInlineBlocks(new ConversationBlocks(() => session));
  // Their pictures, clips, sounds and pages, read from the session's
  // machine, its project's folder and its artifacts.
  provideBlockSources(
    transcriptSources(() => ({
      instanceId: session.instanceId,
      machineId: session.machineId,
      projectId: boardStore.instanceIndex.byId.get(session.instanceId)
        ?.projectId,
    }))
  );
  provideMarkdownBlocks(TranscriptBlock);

  /** One transcript, on screen, being read: `focused` follows `visible`. */
  const isFocused = $derived(focused ?? visible);

  /**
   * The old single flag, kept as the name the rest of this file reads.
   *
   * Everything below that asks "am I the transcript the reader is at" —
   * riding the streaming tail, announcing turns, landing on reactivation —
   * means FOCUSED. Only the row-building freeze means VISIBLE, and it says
   * so where it happens.
   */
  const active = $derived(isFocused);
  // The transcript opens on the latest message, not the top. virtua fires an
  // onscroll on mount (scrollTop 0, tall content) which would flip `atBottom`
  // false before the tail-follow effect runs, leaving the reader at the top —
  // so the first landing is unconditional, and only then does `atBottom` govern.
  // Declared up here because the build reads it, and the server evaluates the
  // rows before the scroller's own state is declared.
  let landed = $state(false);
  /**
   * Whether the list is drawn. Until the first landing has put the rows where
   * they will stay, it is laid out and measured but not painted: see the
   * reveal below. Declared up here with `landed`, which the build reads.
   * This instance's own, from false: a transcript mounted again — a pane
   * remounting, a module replaced in development — measures and lands
   * before it is painted, like the first one.
   */
  let shown = $state(false);
  $effect(() => {
    const drawn = shown || servedRows;
    untrack(() => onshown?.(drawn));
    return () => untrack(() => onshown?.(false));
  });
  /**
   * What the engines below are handed to read of this component and of one
   * another: its props and flags, and each engine as a getter, so an engine
   * constructed later is there by the time one reads it.
   */
  const host = {
    get active() {
      return active;
    },
    get agentName() {
      return agentName;
    },
    get isFocused() {
      return isFocused;
    },
    get landed() {
      return landed;
    },
    set landed(value) {
      landed = value;
    },
    get onlanded() {
      return onlanded;
    },
    get parkedHeight() {
      return parkedHeight;
    },
    get session() {
      return session;
    },
    get shown() {
      return shown;
    },
    set shown(value) {
      shown = value;
    },
    get visible() {
      return visible;
    },
    get slides(): SendSlides {
      return slides;
    },
    get rowBuild(): RowBuild {
      return rowBuild;
    },
    get arrivals(): ArrivalLedger {
      return arrivals;
    },
    get rowDraw(): RowPresentation {
      return rowDraw;
    },
    get mounted(): MountedRows {
      return mounted;
    },
    get whole(): ListWhole {
      return whole;
    },
    get keeper(): KeptPlace {
      return keeper;
    },
    get older(): OlderPages {
      return older;
    },
    get pin(): ScrollPin {
      return pin;
    },
    get seek(): RecordSeek {
      return seek;
    },
    get landing(): ListLanding {
      return landing;
    },
    get jumper(): JumpToLatest {
      return jumper;
    },
    get finder(): TranscriptFind {
      return finder;
    },
    get region(): LiveRegion {
      return region;
    },
  };

  const arrivals = new ArrivalLedger(host);

  const rowBuild = new RowBuild(host);

  const slides = new SendSlides(host);

  /**
   * While the session is stopped at its account's limit, its newest account
   * line is that stop, drawn as an error with its way out
   * (switch.svelte.ts `stopWords`); every older one stays history.
   */
  const stop = $derived.by(() => {
    const instance = boardStore.instanceIndex.byId.get(session.instanceId);
    const words = instance ? stopWords(instance) : undefined;
    const key = words
      ? rowBuild.rows.findLast((one) => one.kind === "account")?.key
      : undefined;
    return words && key ? { key, words } : undefined;
  });
  /**
   * virtua's size for a row it has not measured yet — and a transcript's
   * newest row is always one it has not measured. The smallest row there is:
   * one tool line and its gap. Guessing high put phantom height at the tail
   * (320px for a 40px indicator) that the follow chased and virtua then took
   * back, with a jump that froze its range and dropped the very row that was
   * arriving. Guessing low, a new row can only grow once it is measured —
   * which the follow rides — and it sits inside virtua's render buffer from
   * its first frame. Leaving the size to virtua is worse still: until it has
   * measured a viewport's worth it renders no buffer at all.
   */
  const ROW_ESTIMATE = 21;
  /**
   * The foot's height (the markup's `foot`): the clearance its pane names
   * (`--composer-clearance`), the one length its foot fade runs (FootFade),
   * so the last row ends where the fade begins. A tab's composer floats over
   * the transcript and the clearance is its standing box; docked, the
   * composer has its own place and the clearance is a thin edge. With no
   * pane naming one, the fixed reserve.
   */
  const FOOT_ROOM = "var(--composer-clearance, calc(var(--space-8) * 3))";
  const rowDraw = new RowPresentation(host);

  const rails = new RowRails(host);

  const mounted = new MountedRows(host);

  const whole = new ListWhole(host);

  const keeper = new KeptPlace(host);

  const seek = new RecordSeek(host);

  const older = new OlderPages(host);

  const pin = new ScrollPin(host);

  const landing = new ListLanding(host);

  provideLedger({
    take(id) {
      const ticket = arrivals.tickets.get(id) ?? null;
      if (ticket && ticket.kind !== "arrive") {
        arrivals.tickets.delete(id);
      } else if (ticket && ticket.start === null) {
        const { currentTime } = document.timeline;
        ticket.start = typeof currentTime === "number" ? currentTime : null;
      }
      return ticket;
    },
    done(id) {
      arrivals.tickets.delete(id);
    },
    get watched() {
      return arrivals.watched;
    },
  });
  const jumper = new JumpToLatest(host);

  const finder = new TranscriptFind(host);

  const region = new LiveRegion(host);

  /**
   * THE SERVER'S FIRST SCREEN IS PAINTED, AND STAYS UNTIL THE LIST TAKES IT.
   *
   * A cold load's rows are the page the server read (`firstScreen`), and the
   * server draws them, standing on the transcript's foot as the landed list
   * stands, in a box over the list's own (the markup's `first-screen`): the
   * newest rows are on screen from the HTML's first paint, before any script
   * has run. The list mounts under them unpainted, lands and measures (the
   * reveal), and is drawn in the frame they go: the same rows, in the same
   * columns, on the same foot, so the frame that swaps them moves nothing.
   * The list itself serves nothing (no `ssrCount`): two copies of every row
   * in the HTML, one of them never painted, were what a long session's cold
   * load weighed and hydrated.
   *
   * Only a landing at the tail is stood in for: a transcript returning to the
   * reader's place far up, or opened at a record, lands elsewhere, and the
   * pane's placeholder stands over it instead (`onshown`).
   */
  const servedRows = $derived(
    firstScreen &&
      keeper.standsAtTail &&
      !shown &&
      rowDraw.renderedRows.length > 0
  );
</script>

<!-- One row's content, as the list draws it and as the server's first
     screen stands it in (`servedRows`): `ticket` is the row's arrival or fold
     (`Row`), and `announce` whether a live row speaks (only the list's). -->
{#snippet rowBody(row: Row, ticket: Ticket | null, announce: boolean)}
  <!-- The live row, and the answer it streamed once that has
       landed (rows.ts `keepLive`): one branch, so the settle is
       the same LiveRow updating, not a MessageRow mounting. -->
  {#if row.kind === "live" && afterRowsAtWork && row.indicating && !row.thinking && !row.text}
    <!-- Said by what stands after the rows. -->
  {:else if row.kind === "live" || (row.kind === "single" && row.streamed)}
    <LiveRow {agentName} {announce} {row} />
  {:else if row.kind === "single" || row.kind === "queued"}
    <MessageRow
      {agentName}
      folding={ticket?.kind === "fold"}
      grouped={row.grouped}
      message={row.message}
      runsOn={rails.runsOn.has(row.key)}
    />
  {:else if row.kind === "tools"}
    <ToolGroup messages={row.messages} />
  {:else if row.kind === "question"}
    <QuestionCard asker={agentName} message={row.message} />
  {:else if row.kind === "connect"}
    <ConnectCard
      answer={row.answer}
      asker={agentName}
      instanceId={session.instanceId}
      message={row.message}
    />
  {:else if row.kind === "harness"}
    <SystemLine
      disclosed={disclosureAt(session.instanceId, row.key)}
      harness={row.note}
    />
  {:else if row.kind === "compaction"}
    <CompactionDivider
      lead={ticket?.kind === "arrive" ? ticket.lead : null}
      {row}
    />
  {:else if row.kind === "account"}
    <AccountMoveDivider
      {row}
      stop={stop?.key === row.key ? stop.words : undefined}
    />
  {:else if row.kind === "notices"}
    <NoticeRun {row} />
  {:else if row.kind === "subagent"}
    <Subagent branch={row.branch} spawn={row.spawn} />
  {:else if row.kind === "delegate"}
    <Delegate message={row.message} />
  {:else if row.kind === "thinking"}
    <Thinking live={row.live} text={row.text} />
  {:else if row.kind === "livetool"}
    {@const d = describeTool(row.glance.name, undefined, undefined, "pending")}
    {@const LiveIcon = d.icon}
    <!-- The in-flight tool is a rail row on the same columns as the
         calls it becomes (app.css `.rail-row`, `.rail-line`): one
         line, at the transcript's line height. No colour on the
         glyph: the tool family's `text-tool-*` tint governs it, the
         generic case inheriting the row's strong ink. -->
    <div
      data-tx-rail
      data-slot="livetool"
      class="min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong rail-row rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell {d.color}"
        ><LiveIcon class="size-icon-md" /></span
      >
      <!-- The same anatomy the settled ToolGroup row has: the
           descriptor's verb, then the mono argument, the verb
           omitted where the object is the whole sentence. Printing
           `glance.name` here and `d.label` once it settled changed
           the call's vocabulary the instant it completed. -->
      {#if d.label}
        <span
          class="font-medium text-ink-strong flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{d.label}</span
        >
      {/if}
      <!-- The argument gives way first (ToolGroup's row). -->
      <span
        class="font-(family-name:--font-mono) text-ink-muted overflow-clip text-ellipsis whitespace-nowrap min-w-0 flex-1"
        >{row.glance.glance}</span
      >
    </div>
  {/if}
{/snippet}

<!-- Off-screen, and the only thing on this surface that speaks. Two channels:
     what just arrived (polite, queued behind the reader), and what is blocking
     (assertive, because the run has stopped). -->
<p
  aria-atomic="true"
  aria-live="polite"
  class="sr-only border-none border-current"
  role="status"
>
  {region.announcement}
</p>
<p
  aria-atomic="true"
  aria-live="assertive"
  class="sr-only border-none border-current"
>
  {region.blockedNote || region.trayAlert}
</p>

<!-- Asymmetric content padding is the DESIGN.md ledger signature: inline
     start --space-7 (25), inline end --space-6 (21). The foot's height
     (`.foot`), which what floats over it stands on, is --foot-room. What
     scrolls here is its own stacking context, so nothing in it (a row's
     raised mark, a card's z-index) rises over the pane's fades (FootFade,
     HeadFade): every child but the dock is isolated. The view is kept in
     place by this component alone (`keepPlace`, and virtua inside its
     list): a browser that anchors scrolling moved it a second time for the
     strip before the list. Its scroll drives the pane's head blur
     (HeadFade), which the pane brings in scope with `timeline-scope`. -->
<div
  data-tx-columns
  data-slot="tr"
  aria-label={transcriptWords.transcript}
  style:--foot-room={FOOT_ROOM}
  class="flex-auto overflow-y-auto anchor-none scroll-timeline-transcript-head py-0 ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 min-h-0 relative tx-columns"
  role="log"
  bind:this={pin.scroller}
  {@attach pin.measureView}
  {@attach pin.readerInput}
>
  <!-- Empty is what is drawn: a conversation whose one row is folding away
       as its retry comes in is not empty for the frame between the two, and
       the empty state shown there pushed the fold 53px down. -->
  {#if (session.loading || session.cursor !== null) && rowDraw.renderedRows.length === 0}
    <p
      data-slot="transcript-empty"
      class="mark-line isolate flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
      style:padding-top={headRoom
        ? `calc(var(--space-5) + ${headRoom})`
        : undefined}
    >
      <LiveDot /><span>Loading transcript…</span>
    </p>
  {:else if rowDraw.renderedRows.length === 0}
    <!-- Only once the read has said the conversation is empty, fading in
         where it stands. The two keys that do anything from the composer
         below. Left-aligned: this surface is a ledger. -->
    <div
      class="isolate pt-(--head-room,0px)"
      style:--head-room={headRoom}
      in:crossIn
    >
      <!-- Its one action starts the work (DESIGN.md, The Empty Starts Work
           Rule, a session's own case): its own agent asked, in this
           session's composer, unsent; with no composer standing, the New
           Session form in its folder with the same words. -->
      <EmptyState
        icon={IconChat}
        line={EMPTY_LINES.transcript}
        title="No messages yet"
      >
        {#snippet action()}
          <EmptyAsk
            label={firstAskLabel(session.harness)}
            onask={(anchor) =>
              askFirst(
                session.instanceId,
                paneDrafts.has(session.instanceId),
                anchor
              )}
          />
        {/snippet}
      </EmptyState>
    </div>
  {/if}

  <!-- What is before the first row, while there is a page before it: the
       transcript's loading row, or — that page could not be read — why, and
       the way to ask for it again. The reader sees it only at the very top
       of the rows held; a page is asked for a viewport before that. -->
  <!-- The failed line's button stands off the first row by the line's own
       block padding. -->
  <div
    class="isolate pt-(--head-room,0px) has-data-retry:pb-space-5"
    style:--head-room={headRoom}
    bind:this={pin.headStrip}
    {@attach older.keepPlace}
  >
    {#if rowDraw.renderedRows.length > 0 && session.olderFault}
      <p
        data-slot="transcript-empty"
        class="text-size-meta font-normal text-ink-muted py-space-5"
      >
        {#if session.olderFault.reason !== "offline"}
          The turns before these couldn't be read:
        {:else if reconnectingNow(session.olderFault)}
          This machine is reconnecting:
        {:else}
          This machine is offline:
        {/if}
        {faultMessage(session.olderFault)}
      </p>
      <Button
        data-retry
        onclick={() => readOlderPage(session.instanceId)}
        size="sm"
        variant="outline"
      >
        {commonWords.tryAgain}
      </Button>
    {:else if rowDraw.renderedRows.length > 0 && rowBuild.built.before}
      <p
        data-slot="transcript-empty"
        class="mark-line flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
      >
        <LiveDot /><span>Loading transcript…</span>
      </p>
    {/if}
  </div>

  <!-- The list's own box: what the pin reads virtua's container off. The
       reader's chosen message (its strip holding the keyboard's focus, its
       edit open, its sheet open) wears the selection pill under its well, in
       the well's four corners (MessageRow, Well; The Concentric Rule), and
       the pill glides to the next one chosen. No ghost: under the pointer a
       message shows its strip. -->
  <!-- Its rows take the pointer while the list scrolls: virtua sets
       `pointer-events: none` on its container whenever it reads the
       scroller as scrolling (Virtualizer.svelte `isScrolling`), and this
       scroller is moved by the reader and by the tail's follow alike, so
       while a turn grew under a reader at the tail every row's link and
       button (a review card's Open and More, a message's pictures) went
       dead. Only what set itself `pointer-events-auto` answered. -->
  <div
    data-transcript-shown={shown || undefined}
    data-slot="listing"
    data-shown={shown || undefined}
    class="isolate not-data-shown:invisible *:pointer-events-auto!"
    bind:this={pin.listing}
    style:padding-top={whole.spare ? `${whole.spare}px` : undefined}
    {@attach whole.wholeHeight}
    {@attach highlight({
      rows: '[data-slot="well"]',
      selected: '[data-slot="well"][data-selected]',
      ghost: false,
    })}
  >
    <Virtualizer
      bufferSize={mounted.buffer}
      cache={keeper.cache}
      data={rowDraw.renderedRows}
      getKey={(r) => r.key}
      itemProps={mounted.itemAttrs}
      itemSize={ROW_ESTIMATE}
      keepMounted={mounted.keepMounted}
      onscroll={pin.onListScroll}
      onresize={pin.onresize}
      onscrollend={pin.onscrollend}
      scrollRef={pin.scroller}
      shift={rowDraw.presentation.shifted}
      startMargin={older.olderRoom + whole.spare}
      bind:this={pin.list}
    >
      {#snippet children(row)}
        <TranscriptRow
          continues={rails.continued.has(row.key)}
          handoff={rowDraw.presentation.handed.get(row.key)}
          heightOf={rowDraw.heightOfRow}
          id={row.kind === "tools" ? undefined : row.key}
          leaving={rowDraw.presentation.leaving.has(row.key)}
          marked={seek.marked?.key === row.key ? seek.marked.state : undefined}
          measured={rowDraw.measureRow}
          motion={arrivals.motionOf(row)}
          onleft={rowDraw.leaver(row.key)}
          rowKey={row.key}
        >
          {#snippet children(ticket)}
            {@render rowBody(row, ticket, active)}
          {/snippet}
        </TranscriptRow>
      {/snippet}
    </Virtualizer>
  </div>
  {#if afterRows && shown}
    <div class="isolate" data-slot="after-rows">{@render afterRows()}</div>
  {/if}
  <!-- Room past the end for what rises past the composer (the ask it grows
       into, an offer on its tray row), which stands over the transcript's
       foot and never pushes it (owner, a7443251: "it
       shouldn't push the transcript up"). It moves nothing where the reader
       is: the tail's pin follows the list and the rows, not this, so the
       view holds still as a card parks, and the reader can scroll on to the
       last row, clear above it. -->
  <div
    aria-hidden="true"
    class="isolate invisible h-(--parked-room) pointer-events-none"
    style:--parked-room="{pin.roomHeight}px"
    bind:this={pin.parkedRoom}
  ></div>
  <!-- The foot clears the composer's standing box: the pill at one line, the
       delegate tray's row and the suggestion row on it. `--composer-clearance`
       is that box plus its offsets, set by the pane from the composer's own
       tokens; the old fixed reserve is the floor. A box in the flow rather
       than the scroller's padding: virtua takes the scroller's content box
       for its view. -->
  <div
    data-slot="foot"
    aria-hidden="true"
    class="isolate invisible h-(--foot-room) pointer-events-none"
    bind:this={whole.foot}
  >
    <!-- The pin's mark (`pinNext`): a pixel, deeper than any row of the
         list, so it reports in the round after the one a row's resize is
         delivered in. -->
    <span class="block size-px"
      ><span class="block size-px"
        ><span class="block size-px"
          ><span class="block size-px"
            ><span class="block size-px" bind:this={pin.pinMark}></span></span
          ></span
        ></span
      ></span
    >
  </div>
  <!-- Floating above the composer column, at zero height in the flow, so
       nothing here coming or going moves a row: the catch-up, from the switch
       until it has appended, and — scrolled away from the tail — the way back.
       Where it rests, up from the scroller's foot, is the pane's to say
       (`--latest-inset`): a docked conversation's just over its composer's
       own place; elsewhere it stands a step (`space-2`) over the top of the
       composer's clearance (the foot room less the composer's own dock gap,
       where the last row ends at the tail), so it never sits flush on the
       composer, and over what rises past it (`--parked-room`):
       never under an ask. A sticky box's inset is measured from the
       scrollport's foot, so the foot room is counted once. Over the pane's
       foot fade (FootFade), which only the rows pass under. A column hung
       up from the foot: what overflows its zero height goes up, the pills
       at the bottom and the not-caught-up line over them. -->
  <div
    data-slot="dock"
    class="sticky z-2 bottom-(--dock-bottom) h-0 flex flex-col justify-box-end items-center gap-space-2 pointer-events-none"
    style:--latest-inset={latestInset}
    style:--parked-room="{parkedHeight}px"
    style:--dock-bottom={"var(--latest-inset, calc(var(--foot-room) - var(--space-4) + var(--space-2) + var(--parked-room, 0px)))"}
  >
    <!-- The line over the pills, as on iOS: a phone gives it the whole width. -->
    {#if region.behind}
      <Behind
        fault={region.behind}
        floating
        onretry={() => readTranscript(session.instanceId, "retry")}
      />
    {/if}
    <!-- The record this was opened at is not here: shown where the reader
         landed instead, until they move on. Heard once through the polite
         region above (`arrived`), so this line is no live region itself. -->
    {#if seek.unfound}
      <!-- The dock's raised line, as the not-caught-up line floats (Behind). -->
      <p
        class="max-w-full py-space-2 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-meta font-normal text-ink-muted text-center text-balance"
        data-open-at={seek.unfound}
        in:rise={"--dur-panel"}
        out:rise={"--dur-exit"}
      >
        {seek.unfoundWords}
      </p>
    {/if}
    {#if rowBuild.catching || finder.showLatest || finder.showBack}
      <div class="flex justify-center items-box-end gap-space-2">
        {#if rowBuild.catching}
          <CatchUp />
        {/if}
        {#if finder.showBack}
          <Latest back onjump={finder.backWhereYouWere} />
        {:else if finder.showLatest}
          <Latest onjump={jumper.jump} />
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- The server's first screen (`servedRows`), in the scroller's box (the
     transcript area's, as the pane's placeholder takes it) and in its
     geometry: the ledger's gutters and columns, the strip before the rows,
     the rows as the list draws them, and the foot they stand on at the tail
     (`tailTop`: the parked room is past the tail, never under it), standing
     on its bottom edge. A reversed column scrolls from its end, so it opens
     on its last row with the scroll bar the list will have, if any. It goes
     in the frame the list is drawn. -->
{#if servedRows}
  <div
    data-slot="first-screen"
    style:--foot-room={FOOT_ROOM}
    class="absolute inset-0 isolate flex flex-col-reverse overflow-y-auto anchor-none ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
  >
    <div>
      {#if rowBuild.built.before}
        <div class="isolate">
          <p
            data-slot="transcript-empty"
            class="mark-line flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
          >
            <LiveDot /><span>Loading transcript…</span>
          </p>
        </div>
      {/if}
      <div class="isolate">
        {#each rowDraw.renderedRows as row (row.key)}
          <TranscriptRow continues={rails.continued.has(row.key)}>
            {#snippet children()}
              {@render rowBody(row, null, false)}
            {/snippet}
          </TranscriptRow>
        {/each}
      </div>
      <div aria-hidden="true" class="isolate h-(--foot-room)"></div>
    </div>
  </div>
{/if}
