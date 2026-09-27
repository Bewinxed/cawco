<script lang="ts" module>
  import type { CacheSnapshot } from "virtua";

  /**
   * Where each conversation was left, by session id: virtua's measured sizes
   * and the scroll offset, so a pane that mounts again lands in one write
   * instead of hunting for its tail across several re-ranges.
   */
  const landings = new Map<
    string,
    { cache: CacheSnapshot; offset: number; count: number; tail: boolean }
  >();
  /** A running average of measured row heights — virtua's first estimate for a pane with no landing yet. */
  let measuredHeight = 0;
  let measuredCount = 0;
</script>

<script lang="ts">
  /**
   * The scrolling transcript: the folded rows, virtualized. The live tail rides
   * as rows of its own (see `buildRows`), so streaming text, an open reasoning
   * block and the tool in flight all scroll with the conversation. Announces
   * genuine arrivals — and blocked-on-you — through a dedicated live region
   * beside the log, never through the virtualized container itself.
   */
  import { onDestroy, setContext, tick, untrack } from "svelte";
  import { Virtualizer, type VirtualizerHandle } from "virtua/svelte";
  import { browser } from "$app/environment";
  import { describeTool } from "$lib/components/features/tool-cards/descriptors";
  import Arrival from "$lib/whiffle/motion/Arrival.svelte";
  import { ARRIVAL, arrivalVars } from "$lib/whiffle/motion/arrival";
  import Reveal from "$lib/whiffle/motion/Reveal.svelte";
  import Stream from "$lib/whiffle/motion/Stream.svelte";
  import Swap from "$lib/whiffle/motion/Swap.svelte";
  import type { SessionState } from "../client.svelte";
  import type { Message } from "../types";
  import { rebuildScheduler } from "../workspace/scheduler.svelte";
  import CatchUp from "./CatchUp.svelte";
  import Delegate from "./Delegate.svelte";
  import MessageBody from "./MessageBody.svelte";
  import MessageRow from "./MessageRow.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import Queued from "./Queued.svelte";
  import { buildRowsFrom, type FoldMemo, type Row } from "./rows";
  import Subagent from "./Subagent.svelte";
  import SystemLine from "./SystemLine.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import Who from "./Who.svelte";

  let {
    session,
    visible,
    focused,
    agentName,
    machineName = "",
    cwd = "",
    onlanded,
  }: {
    session: SessionState;
    /**
     * Whether this transcript is on screen at all. Governs how OFTEN rows are
     * built: a pane nobody can see reads its session only at the scheduler's
     * slow tier, and never in the flush that brings it on screen.
     */
    visible: boolean;
    /**
     * Whether this is the transcript being worked in. Governs how EAGERLY
     * rows are rebuilt, and who gets to ride the tail and announce.
     *
     * Defaults to `visible`, so the single-pane case — one transcript, on
     * screen, being read — behaves exactly as it always has.
     */
    focused?: boolean;
    agentName: string;
    /** Where this session runs — named in the empty state, nowhere else. */
    machineName?: string;
    /** The folder it runs in — named in the empty state, nowhere else. */
    cwd?: string;
    /** Optional callback when the transcript first renders content. */
    onlanded?: () => void;
  } = $props();

  setContext("whiffle:machine", () => session.machineId);

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

  /**
   * The folded rows — frozen while this pane is off screen.
   *
   * The session layout keeps one pane per open tab and never unmounts it, so
   * the scroll offset and the half-typed message survive a switch. The cost of
   * that was paid on every streamed frame: a session streaming into a tab the
   * reader is NOT looking at rebuilt every row and re-parsed the streaming
   * turn's markdown, frame after frame, forever. Measured at 1.09s of script
   * and 513 layouts per 300 streamed frames — MORE than the same stream costs
   * in the pane actually on screen, because the background session was the
   * large one. With several tabs open and one session streaming, the reader
   * pays that for a picture nobody can see.
   *
   * So an invisible transcript stops reading the session at all. While
   * `visible` is false the body below touches only `visible` and the array it
   * already built, which means nothing the session writes can invalidate it —
   * there is no recompute to skip because there is no invalidation. virtua
   * stays mounted on the rows it already has, so the DOM, the heights it
   * measured and the scroll offset are all untouched and a frozen pane costs
   * nothing per frame.
   *
   * Flipping `visible` or `focused` back on does NOT rebuild in that flush.
   * The switch used to fold every message and re-render every row inside the
   * same task as the tab change — the dock's `appendChild`, the scroll
   * restore and a 256ms fold, all before the first paint — which is the
   * delay the reader felt as the tab sticking. Now the switch paints the
   * frozen rows as they are (`held`), and the catch-up runs after that paint
   * as an APPEND: the fold restarts at the last turn before the old end, so
   * every row before it keeps its identity and the keyed each touches only
   * the rows that are actually new. The tail-follow effect below then rides
   * to the new tail if the reader was at the tail when they left.
   *
   * The grid adds a third state between those two. A pane that is visible but
   * NOT focused still has to show what its agent is saying, but rebuilding it
   * on every frame of its own stream is what makes four panes cost four times
   * one. So it reads the session under `untrack` and depends on nothing but a
   * counter the scheduler bumps when this pane's turn comes round. The session
   * can write as often as it likes; only the tick invalidates this. A hidden
   * pane takes the same turns at the scheduler's slow tier, so that by the
   * time it is switched to there is usually nothing left to fold.
   */
  let frozen: Row[] = [];
  /** What `frozen` was folded from — the incremental fold's memory. */
  let memo: FoldMemo | null = null;
  /** Whether `frozen` holds a real build yet — the first one is unconditional. */
  let primed = false;
  /** Bumped by the scheduler. The ONLY dependency of an unfocused rebuild. */
  let rebuildTick = $state(0);
  /**
   * The switch flush, and the frame it paints: while this holds, the rows
   * are the frozen ones whatever the session says. Set on the rising edge of
   * `visible` / `focused` when there is something to catch up on, cleared
   * once that flush has painted.
   */
  let held = $state(false);
  /**
   * From the switch until the append lands — what the tail indicator shows.
   * Distinct from `held` because the fold itself happens after the hold is
   * released, and the indicator should stay until it has.
   */
  let catching = $state(false);
  // The transcript opens on the latest message, not the top. virtua fires an
  // onscroll on mount (scrollTop 0, tall content) which would flip `atBottom`
  // false before the tail-follow effect runs, leaving the reader at the top —
  // so the first landing is unconditional, and only then does `atBottom` govern.
  // Declared up here because the build reads it, and the server evaluates the
  // rows before the scroller's own state is declared.
  let landed = $state(false);
  /**
   * What the session looked like when these rows were last built.
   *
   * Coming back to a conversation used to rebuild every row and re-render
   * them — markdown parsed, code highlighted — whether or not a single word
   * had arrived while it was away. Measured on a real switch: one 256ms task
   * with the main thread blocked for all of it, which is the delay a reader
   * feels as the tab "sticking".
   *
   * Nothing that has not changed needs rebuilding. When the print matches,
   * the SAME array is returned, so the keyed each sees identical rows, no
   * component re-renders, and the pane simply becomes visible again.
   */
  let builtPrint = "";
  const printOf = (): string =>
    `${session.messages.length}:${session.streaming.length}:` +
    `${session.thinkingStream.length}:${session.busy ? 1 : 0}:${session.pending.length}:` +
    `${session.openBlock}:${session.thinkingClosing}:${session.currentTool?.toolId ?? ""}:${session.sdkStatus}:` +
    `${session.messages.at(-1)?.metadata?.sendFailed ?? ""}`;
  /** Dev-only: the gate that catches an accidentally tracked session read. */
  const countBuild = (): void => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }
    const w = window as unknown as {
      __transcriptBuilds?: Record<string, number>;
    };
    w.__transcriptBuilds ??= {};
    const key = session.instanceId;
    w.__transcriptBuilds[key] = (w.__transcriptBuilds[key] ?? 0) + 1;
  };
  const built = $derived.by<{ rows: Row[]; shifted: boolean }>(() => {
    // The switch flush paints what is already there; the catch-up comes
    // after the paint, through `held` clearing.
    if (held) {
      return { rows: frozen, shifted: false };
    }
    // A pane born off screen would otherwise hold an empty transcript until it
    // was first looked at, so the first build never consults the tier.
    if (!isFocused && primed) {
      // Read, not used: this is `built`'s reactive dependency on the unfocused
      // tier's own clock — its change is what re-runs this branch to re-check
      // the print, in place of the tracked reads `untrack` below hides.
      // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
      void rebuildTick;
      return untrack(() =>
        printOf() === builtPrint ? { rows: frozen, shifted: false } : run()
      );
    }
    // Reading the print tracks exactly the handful of fields that mean "there
    // is something new to draw", so an unchanged session cannot invalidate
    // this at all — and a changed one still rebuilds on the very next frame.
    if (primed && printOf() === builtPrint) {
      return { rows: frozen, shifted: false };
    }
    return run();
  });

  /**
   * The switch itself, before the DOM updates: on the rising edge of
   * `visible` or `focused`, hold the rows for this flush and schedule the
   * catch-up behind its paint. `$effect.pre` because the hold has to be in
   * place before the Virtualizer reads `built` in the same flush.
   *
   * The delay is `requestAnimationFrame` THEN `setTimeout(0)`, not either
   * alone. A rAF callback runs at the top of the next frame, before that
   * frame paints, and Svelte flushes the state change it makes in a
   * microtask right behind it — still before the paint, which is exactly the
   * blocking this exists to avoid. `setTimeout(0)` alone is a macrotask the
   * browser may run within the same frame interval, ahead of its rendering
   * step. The pair pins the work to the far side of one real paint.
   *
   * Nothing is held when the print already matches: a pane whose rows are
   * current simply becomes visible, with no indicator to flash.
   */
  let wasVisible = false;
  let wasFocused = false;
  $effect.pre(() => {
    const nowVisible = visible;
    const nowFocused = isFocused;
    const rising = (nowVisible && !wasVisible) || (nowFocused && !wasFocused);
    wasVisible = nowVisible;
    wasFocused = nowFocused;
    if (!(rising && primed)) {
      return;
    }
    untrack(() => {
      if (held || printOf() === builtPrint) {
        return;
      }
      held = true;
      catching = true;
      returning = true;
      requestAnimationFrame(() => {
        setTimeout(() => {
          held = false;
        }, 0);
      });
    });
  });

  function run(): { rows: Row[]; shifted: boolean } {
    countBuild();
    builtPrint = printOf();
    return build();
  }

  function build(): { rows: Row[]; shifted: boolean } {
    const folded = buildRowsFrom(session, memo);
    const { rows: next } = folded;
    ({ memo } = folded);
    // PREPEND DETECTION for virtua's `shift` mode: an older history chunk
    // arriving puts new rows ABOVE everything on screen — without `shift`,
    // virtua keeps the scroll OFFSET and the content lurches toward the top
    // (the post-SSR "jumps to the top then back" flash). A prepend is exact:
    // the tail row is unchanged and the old first row now sits deeper.
    // Returned WITH the rows so the Virtualizer reads both in the same flush.
    //
    // Only once LANDED. Before the first landing there is no position to
    // keep — `land` teleports to the tail regardless — and asking for a shift
    // then is worse than useless: virtua has not attached its scroller yet
    // (that waits a tick after mount), so the anchoring jump stays pending
    // until the landing's own write has already put the scroller at its
    // maximum. Applied on top of that, the jump is clamped, fires no scroll
    // event, and virtua's range stays latched at empty until the reader
    // scrolls — a switched-to pane with a sized box and not one row in it.
    const oldFirst = frozen[0]?.key;
    const oldLast = frozen.at(-1)?.key;
    const shifted =
      untrack(() => landed) &&
      frozen.length > 0 &&
      next.length > frozen.length &&
      next.at(-1)?.key === oldLast &&
      oldFirst !== undefined &&
      next.findIndex((row) => row.key === oldFirst) > 0;
    return { rows: next, shifted };
  }

  /**
   * Take a turn in the rotation while unfocused — the visible tier beside the
   * pane being read, the slow tier when hidden behind it — and give it back
   * on focus. The fingerprint is every cheap O(1) reading that means "there
   * is something new to draw" — deliberately not a deep comparison, because
   * the point is to skip the expensive build, not to do an expensive check
   * first.
   */
  $effect(() => {
    if (isFocused) {
      return;
    }
    return rebuildScheduler.join(
      session.instanceId,
      printOf,
      () => {
        rebuildTick += 1;
      },
      visible ? "visible" : "hidden"
    );
  });

  // Side effects that the derived CANNOT carry (Svelte forbids writes inside
  // $derived). An $effect runs after the derived is read but before the DOM
  // renders, so the bookkeeping stays in sync with what the Virtualizer sees.
  $effect(() => {
    const { rows: next } = built;
    // SETTLE CONTINUITY: a rebuild where the live tail (`stream:*`) departs
    // means those new rows are the SAME content wearing their final keys.
    // Pre-marking them seen stops a paragraph the reader already watched
    // streaming from fading in over itself.
    const prevKeys = new Set(frozen.map((row) => row.key));
    const hadLiveTail = frozen.some((row) => row.key.startsWith("stream:"));
    const hasLiveTail = next.some((row) => row.key.startsWith("stream:"));
    if (hadLiveTail && !hasLiveTail) {
      for (const row of next) {
        if (!prevKeys.has(row.key)) {
          seen.add(row.key);
        }
      }
      // SETTLE RE-SNAP: virtua swaps the live-tail rows for their final
      // keyed versions, which may measure differently for a frame. That
      // reflow fires a native scroll event that `onscroll` reads as the
      // user scrolling up — `atBottom` flips false and the follow loop
      // disengages, stranding the viewport hundreds of pixels from the
      // bottom. The settle is NOT a user gesture; the reader was following
      // and should keep following. Re-assert `atBottom` so the tail-follow
      // effect re-engages on the next tick.
      if (
        atBottom ||
        (scroller &&
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
            400)
      ) {
        atBottom = true;
      }
    }
    frozen = next;
    primed = true;
    // The append has landed: the rows on screen are the session's again, and
    // the indicator under them has nothing left to wait for.
    if (untrack(() => catching && !held)) {
      catching = false;
    }
  });
  const rows = $derived(built.rows);
  const snapshot = untrack(() => {
    const saved = landings.get(session.instanceId);
    return saved?.count === built.rows.length ? saved : undefined;
  });
  const itemSize = measuredCount ? measuredHeight / measuredCount : 320;

  // Virtua removes missing keys immediately. Keep a reasoning tail in its
  // original slot until Swap has closed it, including thinking -> tool/done.
  interface Departure {
    index: number;
    row: Extract<Row, { kind: "live" }>;
    until: number;
  }
  let retired: Departure | null = null;
  let exitTick = $state(0);
  let priorLive: { row: Extract<Row, { kind: "live" }>; index: number } | null =
    null;
  const presentation = $derived.by(() => {
    // biome-ignore lint/complexity/noVoid: expiry invalidates the retained row without changing session data.
    void exitTick;
    const next = built.rows;
    const index = next.findIndex((row) => row.kind === "live");
    const live = next[index];
    if (live?.kind === "live") {
      retired = null;
      priorLive = { row: live, index };
    } else {
      if (priorLive && !priorLive.row.text) {
        retired = { ...priorLive, until: Date.now() + ARRIVAL.reserveMs + 50 };
      }
      priorLive = null;
    }
    if (retired && Date.now() >= retired.until) {
      retired = null;
    }
    if (!retired) {
      return { rows: next, departing: null };
    }
    const displayed = [...next];
    displayed.splice(Math.min(retired.index, displayed.length), 0, retired.row);
    return { rows: displayed, departing: retired };
  });
  const departing = $derived(presentation.departing);
  const renderedRows = $derived(presentation.rows);
  $effect(() => {
    const leaving = departing;
    if (!leaving) {
      return;
    }
    const timer = setTimeout(
      () => {
        exitTick += 1;
      },
      Math.max(0, leaving.until - Date.now())
    );
    return () => clearTimeout(timer);
  });

  /**
   * How many rows the SERVER paints — and nothing the browser ever hears about.
   *
   * `ssrCount` is virtua's server-render escape hatch: without it the store has
   * no viewport and no scroll offset to reason from, so it renders the empty
   * range `[0, -1]` and the server's HTML carries a transcript with no rows in
   * it. Handing it the row count makes the server emit exactly that many, which
   * (with the `ListItem` patch that keeps them in normal flow until mount) is
   * what puts the conversation in the first response.
   *
   * The catch is that it is not a render hint — it is a LATCH. The store reads
   * it ONCE, at construction (`createVirtualStore(data.length, itemSize,
   * ssrCount, …)`), sets `isSSR = !!ssrCount`, and pins its range at
   * `[0, ssrCount - 1]`; `$getRange` then short-circuits to that frozen pair for
   * as long as `isSSR` holds. The only thing in the whole store that clears the
   * flag is `ACTION_SCROLL_OFFSET_CHANGE` — a genuine scroll event whose offset
   * actually differs from the one on file.
   *
   * So a hydrating client that is handed `ssrCount` inherits that latch, and a
   * transcript shorter than its viewport can never shed it: there is nothing to
   * scroll, so no scroll event, so the range stays pinned at the row count the
   * page happened to hydrate with. Rows built after that — the message the
   * operator just sent, every frame the agent streams back — were folded, keyed
   * and handed to the Virtualizer correctly and then dropped on the floor by a
   * range that had stopped moving. Only a reload (a new store, a new count)
   * showed them. That is the whole "transcript does not update live" defect.
   *
   * Gating on `browser` is therefore not a micro-optimisation but the contract:
   * the count belongs to the server render, and the client builds a store that
   * measures its viewport like any other. The hydrating render draws no rows for
   * the microtask before `onMount` wires virtua's ResizeObserver to the
   * scroller; ResizeObserver notifications are delivered in the rendering step
   * BEFORE paint, so the measured range lands in the same frame and the gap is
   * never seen.
   */
  const ssrCount = $derived(browser ? undefined : built.rows.length);

  /**
   * Compaction is a genuinely live process — the model is rewriting its own
   * context — and it says so with one sticky pill and a beating dot. It used to
   * warp the entire transcript through an SVG displacement filter; distorting
   * text the operator may be mid-sentence in, and repainting the whole scroll
   * surface every frame, is not a state indicator. The pill alone carries it.
   */
  const compacting = $derived(session.sdkStatus === "compacting");

  let scroller = $state<HTMLElement | undefined>();
  /** virtua's imperative handle — `scrollToIndex` reaches the true last row even
      as rows are still being measured, which a one-shot scrollTop cannot. */
  let list = $state<VirtualizerHandle | undefined>();
  let atBottom = $state(true);

  function saveLanding(): void {
    if (!(list && scroller && landed)) {
      return;
    }
    const cache = list.getCache();
    landings.set(session.instanceId, {
      cache,
      offset: scroller.scrollTop,
      count: built.rows.length,
      tail:
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
        120,
    });
    // virtua 0.50 serializes [sizes, defaultSize]; -1 marks an unmeasured row.
    const [sizes] = cache as unknown as [number[], number];
    for (const size of sizes) {
      if (size >= 0) {
        measuredHeight += size;
        measuredCount += 1;
      }
    }
  }

  $effect.pre(() => {
    if (!visible) {
      untrack(saveLanding);
    }
  });
  onDestroy(saveLanding);

  function onscroll(): void {
    if (!(scroller && landed)) {
      return;
    }
    // Every write this component makes is tagged with the position it wrote.
    // An event that matches the tag is our OWN motion — the paced follow, or
    // the glue pinning a row that is opening — and says nothing about where
    // the reader is looking. Anything else is the READER: wheel, scrollbar
    // drag, keyboard, momentum, anything.
    //
    // The tag used to be honoured only while the PACED loop was running, and
    // the glue runs with that loop deliberately stopped. So every frame a row
    // spent opening was read as the reader scrolling away — against a
    // `scrollHeight` the virtualizer had not re-measured yet, so the gap read
    // as large — and `atBottom` went false mid-arrival. The follow then
    // disengaged and the transcript stranded, which is worse than it sounds:
    // `nearTail` is what licenses an arrival, so from that point on NO further
    // row animated at all. Measured on a run of three tool calls: the first
    // opened 0 → 26px normally, the scroller froze at 604px, and the second
    // and third appeared at full height with no motion.
    if (Math.abs(scroller.scrollTop - lastWrite) <= 1) {
      return;
    }
    stopFollow();
    unglue();
    atBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }

  /**
   * Put the last row fully in view, above the floating composer stack.
   *
   * `scrollToIndex(…, 'end')` seats the last row's foot on the VIEWPORT's foot,
   * which is behind the composer: the clearance is padding under the list, and
   * virtua's box math stops at the list. So the landing is two moves — virtua
   * measures its way to the true last row, then one more frame runs the scroller
   * to its own maximum, past the padding band, which is exactly the height of
   * the composer column. A tall permission card therefore never sits on top of
   * the message that raised it.
   */
  /** The follow loop's handle, and its own LAST WRITE — the tag that tells the
   *  loop's scroll events from the reader's without caring which input device
   *  made them (a scrollbar drag fires no wheel event; a tagged write needs no
   *  event taxonomy at all). */
  let following: number | null = null;
  let landingFrame: number | null = null;
  let lastWrite = -1;
  function stopFollow(): void {
    if (following !== null) {
      cancelAnimationFrame(following);
    }
    following = null;
  }

  /**
   * TELEPROMPTER FOLLOW. Streaming arrives in irregular bursts, and any scheme
   * that moves per-arrival — a tween, native smooth scroll, damped chasing —
   * inherits that jitter, because the impulse IS the burst. So the follow is
   * decoupled: one loop at a CONSTANT reading pace, and bursts merely
   * accumulate below the fold while the viewport advances steadily. Velocity,
   * not distance, is what the eye judges as smooth. The pace ramps only under
   * a real backlog (more than half a viewport behind); past two viewports it
   * is a teleport, not a ride; reduced motion always snaps; and the loop
   * yields to the reader two ways — `atBottom` going false ends it, and any
   * scroll event that is not its own tagged write ends it in `onscroll`.
   */
  /**
   * THE ARRIVAL GLUE.
   *
   * A row now opens its own height, which means `scrollHeight` grows for the
   * length of the animation. The teleprompter below moves at a pace of its own
   * choosing — 360px/s, or fast enough to close the gap in 400ms — and a pace
   * chasing a target that is itself still moving is two animations arguing
   * about where the bottom is. On screen that reads as the transcript
   * shivering while the row lands, and the row's own motion never being seen.
   *
   * So for exactly as long as a row is opening, the follow is not paced at all:
   * the viewport is pinned to the bottom and the row's growth is what moves it.
   * The scroll and the animation become one motion, at the animation's rate,
   * because there is only one of them left. The pace comes back the moment the
   * space is open, for the streaming that follows.
   */
  let opening = 0;
  const resizing = new Set<Element>();
  let glued: ResizeObserver | null = null;

  function unglue(): void {
    glued?.disconnect();
    glued = null;
  }

  /**
   * Pin the viewport to the bottom — from a ResizeObserver, not a frame
   * callback, and that is the whole point.
   *
   * The rendering steps run animations, then `requestAnimationFrame`
   * callbacks, and only THEN deliver resize observations. The virtualizer
   * learns a row's new height from its own ResizeObserver, so inside a frame
   * callback the scroller's `scrollHeight` is still last frame's total: a glue
   * that pinned from rAF pinned to a bottom that had already moved.
   *
   * Measured, per arriving row: the scroll delta each frame was exactly the
   * PREVIOUS frame's height delta, and the last row's bottom edge oscillated
   * 96 → 79 → 90 → 94 → 96 px from the fold — a 17px shimmy, once per row,
   * against motion that is otherwise smooth. Observing instead puts the pin
   * after the virtualizer has re-measured and before the frame is painted, so
   * the viewport and the opening row move on the same frame and the row's own
   * curve is the only motion left.
   */
  function pinBottom(): void {
    if (!(scroller && atBottom && opening > 0)) {
      unglue();
      return;
    }
    const bottom = scroller.scrollHeight - scroller.clientHeight;
    if (Math.abs(scroller.scrollTop - bottom) > 0.5) {
      scroller.scrollTop = bottom;
      lastWrite = scroller.scrollTop;
    }
  }

  /** Watch the row that is opening: it is the thing whose growth moves the
   *  bottom, so it is the thing worth observing. */
  function glue(row: Element): void {
    glued ??= new ResizeObserver(pinBottom);
    glued.observe(row);
  }

  /** Svelte scopes keyframe names, so an arriving row's reserve is matched by suffix. */
  const isOpening = (name: string): boolean => name.endsWith("reserve");

  /** A thinking row opening or closing on the kit's reveal. */
  const isThinking = (event: Event): boolean =>
    (event.target as Element).matches('[data-slot="thinking-steps-content"]');

  function startResizing(row: Element): void {
    resizing.add(row);
    opening = resizing.size;
    // The paced loop and the glue must never both be writing scrollTop.
    stopFollow();
    glue(row);
  }

  function endResizing(row: Element): void {
    resizing.delete(row);
    opening = resizing.size;
    if (opening === 0) {
      unglue();
      if (atBottom) {
        followBottom();
      }
    }
  }

  function onanimationstart(event: AnimationEvent): void {
    if (isOpening(event.animationName)) {
      startResizing(event.target as Element);
    }
  }

  function onanimationend(event: AnimationEvent): void {
    if (isOpening(event.animationName)) {
      endResizing(event.target as Element);
    }
  }

  function onrevealstart(event: Event): void {
    if (isThinking(event)) {
      startResizing(event.target as Element);
    }
  }

  function onrevealend(event: Event): void {
    if (isThinking(event)) {
      endResizing(event.target as Element);
    }
  }

  $effect(() => {
    const node = scroller;
    if (!node) {
      return;
    }
    node.addEventListener("animationcancel", onanimationend);
    node.addEventListener("revealstart", onrevealstart);
    node.addEventListener("revealend", onrevealend);
    const removed = new MutationObserver(() => {
      const before = resizing.size;
      for (const element of resizing) {
        if (!element.isConnected) {
          resizing.delete(element);
        }
      }
      if (before === resizing.size) {
        return;
      }
      opening = resizing.size;
      if (opening === 0) {
        unglue();
        if (atBottom) {
          followBottom();
        }
      }
    });
    removed.observe(node, { childList: true, subtree: true });
    return () => {
      removed.disconnect();
      node.removeEventListener("animationcancel", onanimationend);
      node.removeEventListener("revealstart", onrevealstart);
      node.removeEventListener("revealend", onrevealend);
      if (landingFrame !== null) {
        cancelAnimationFrame(landingFrame);
      }
      stopFollow();
      unglue();
      resizing.clear();
      opening = 0;
    };
  });

  const FOLLOW_SPEED = 360; // px/s — a calm reading pace
  function followBottom(): void {
    if (!scroller || opening > 0) {
      return;
    }
    const target = () =>
      scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
    const gap = target() - scroller.scrollTop;
    if (gap <= 0) {
      return;
    }
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      gap > scroller.clientHeight * 2
    ) {
      scroller.scrollTop = scroller.scrollHeight;
      lastWrite = scroller.scrollTop;
      return;
    }
    if (following !== null) {
      return; // one loop; it reads the live target
    }
    let last = performance.now();
    const step = (now: number): void => {
      if (!(scroller && atBottom)) {
        stopFollow();
        return;
      }
      const dt = Math.min(64, now - last);
      last = now;
      const remaining = target() - scroller.scrollTop;
      if (remaining <= 0.5) {
        if (remaining > 0) {
          scroller.scrollTop = target();
          lastWrite = scroller.scrollTop;
        }
        stopFollow();
        return;
      }
      // Duration-bounded, not distance-bounded: any engagement finishes in
      // ≤400ms (remaining/0.4 px/s closes the whole gap in 0.4s, recomputed
      // per frame so it decelerates into place). Only a genuinely small hop —
      // one message's worth — rides at the reading pace. Without this bound
      // the loop trod water at 360px/s for the whole duration of a long
      // stream it was chasing: a five-second crawl nobody asked for.
      const speed = Math.max(FOLLOW_SPEED, remaining / 0.4);
      scroller.scrollTop += Math.min(remaining, (speed * dt) / 1000);
      lastWrite = scroller.scrollTop;
      following = requestAnimationFrame(step);
    };
    following = requestAnimationFrame(step);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first landing and streaming follow share the scroll ownership state
  function land(): void {
    if (landed && opening > 0) {
      return;
    }
    // `scrollToIndex` is virtua's far-row measuring power — needed for the
    // first landing and for catching up from a real distance. For the
    // message-sized follow it was the hard jump per stream batch that read as
    // jitter, so a followable gap goes to the loop untouched.
    const gap = scroller
      ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      : 0;
    const instant = !landed;
    if (instant) {
      if (snapshot && scroller) {
        scroller.scrollTop = snapshot.tail
          ? scroller.scrollHeight
          : snapshot.offset;
        lastWrite = scroller.scrollTop;
        atBottom = snapshot.tail;
      } else {
        list?.scrollToIndex(rows.length - 1, { align: "end" });
        atBottom = true;
      }
      landed = true;
      settle();
      return;
    }
    // A tab-return whose catch-up has just appended: the reader left at the
    // tail, so the new turns ride in from where they were. A gap past the
    // followable bound is first closed to within it in one silent write, and
    // the loop rides the rest — the same arrival at any distance, rather than
    // a teleport for a long absence. virtua measures the rows the ride
    // crosses as they enter the viewport; the loop reads the live target
    // every frame, so an estimate that firms up mid-ride is absorbed.
    const riding = returning && gap > 0;
    // Consumed by the land that has somewhere to go: the rising edge lands
    // once on the frozen rows (gap 0) before the append does.
    if (gap > 0) {
      returning = false;
    }
    const bound = (scroller?.clientHeight ?? 0) * 2;
    const followable = !!scroller && (gap <= bound || riding);
    if (!followable) {
      if (list) {
        list.scrollToIndex(rows.length - 1, { align: "end" });
      } else if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }
    if (landingFrame !== null) {
      cancelAnimationFrame(landingFrame);
    }
    landingFrame = requestAnimationFrame(() => {
      landingFrame = null;
      if (!(scroller && active && atBottom)) {
        return;
      }
      // The live follow and the catch-up ride the loop. The closing write sits inside
      // the same frame as the loop's start, so the scroll event it raises
      // carries the loop's own tag and is not read as the reader scrolling.
      if (followable) {
        if (
          riding &&
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop >
            bound
        ) {
          // One pixel inside the bound: `followBottom` teleports past it,
          // and a scrollTop the browser rounds must not land on the far side.
          scroller.scrollTop =
            scroller.scrollHeight - scroller.clientHeight - bound + 1;
          lastWrite = scroller.scrollTop;
        }
        followBottom();
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      settle();
    });
    atBottom = true;
    landed = true;
  }

  /** Fire `onlanded` once, the first time the transcript has content. */
  let settled = false;
  function settle(): void {
    if (settled) {
      return;
    }
    settled = true;
    onlanded?.();
  }

  // A conversation with nothing in it never lands — `land` needs a row to
  // scroll to — so the handshake would never be answered and a pane waiting on
  // it would hold an invisible transcript for good. An empty read that has
  // finished IS settled; say so.
  $effect(() => {
    if (session.loading || rows.length > 0) {
      return;
    }
    landed = true;
    settle();
  });

  // Follow the tail while the reader is already at the bottom — a scroll up to
  // read history is never yanked back by the next frame. `clearance` is a
  // dependency too: when a permission card grows the composer column, the row
  // that was flush with the composer is now behind it, so the tail re-lands.
  //
  // `active` is read FIRST, before the tail it follows. Reading `session.streaming`
  // ahead of the guard re-ran this effect on every streamed frame of a pane
  // nobody was looking at — the same cost `rows` above stops paying, arriving
  // by the other door. Guarding first means an off-screen pane has no
  // dependency on the stream at all; and because `active` is itself tracked,
  // switching back re-runs this once, on rows that have just caught up.
  /** Whether the CURRENT land follows a tab-return: the catch-up's append
   *  is what changed `rows`, and a reader who left at the tail rides to the
   *  new one rather than being teleported. Plain var: raised with the hold
   *  when a switch has something to catch up on, consumed by the land that
   *  follows the append, and dropped if the reader was scrolled up — they
   *  stay where they were. */
  let returning = false;
  $effect(() => {
    if (!active && landed) {
      return;
    }
    // Read, not used: these two are this effect's tracked dependencies, read
    // in this order and only after the `active` guard above — see the doc
    // comment above this effect for why the order and the guard matter.
    // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
    void rows.length;
    if (active) {
      // biome-ignore lint/complexity/noVoid: track streaming only while focused
      void session.streaming;
    }
    if (rows.length === 0) {
      return;
    }
    if (!landed || atBottom) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — this effect does not await the land, it only arms it.
      void tick().then(() => {
        if (!landed || (active && atBottom)) {
          land();
        }
      });
    } else {
      returning = false;
    }
  });

  // A landing is not the last word on the tail's height: virtua measures rows
  // as they mount, and the list grows a little after `land` has written its
  // pixel, leaving the last row under the composer with nothing to re-seat it.
  // So while the reader is pinned at the tail and no ride owns the scroll, any
  // change in the scroller's or the list's size pins it again. The write is
  // tagged the way the loop's are, so `onscroll` does not read it as the
  // reader leaving. Re-armed whenever the scroller's children change — the
  // note, the empty state and the catch-up line come and go around the list.
  $effect(() => {
    if (!(active && scroller)) {
      return;
    }
    // Read, not used: this effect's tracked dependencies — see the comment
    // above it for why it re-arms on these and nothing else.
    // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
    void compacting;
    // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
    void catching;
    // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
    void (rows.length === 0);
    const box = scroller;
    const observer = new ResizeObserver(() => {
      if (!(landed && atBottom) || following !== null || opening > 0) {
        return;
      }
      if (box.scrollTop >= box.scrollHeight - box.clientHeight) {
        return;
      }
      box.scrollTop = box.scrollHeight;
      lastWrite = box.scrollTop;
    });
    observer.observe(box);
    for (const child of box.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  });
  // Composer height changes are handled entirely by CSS: `--composer-clearance`
  // on the parent adjusts `.tr`'s `padding-bottom`, the browser updates
  // `scrollHeight`, and the existing follow loop (which watches `rows.length`
  // and `session.streaming`) catches any overshoot on the next frame. No JS
  // needed — a padding change is layout, not a scroll event.

  // ── Enter motion ────────────────────────────────────────────────────────
  // A new tail turn fades in and rises 8px over ~150ms on MOUNT only — the one
  // live channel DESIGN.md §motion permits to move, never the structure.
  //
  // Coexisting with virtua is the whole trick: virtua mounts and unmounts rows
  // as they cross the viewport, so a naive `in:` transition would replay on
  // every scroll. The guard below fires the animation only when the row is a
  // GENUINELY new arrival — landed, at the tail, and its key never seen before.
  // The motion is opacity + `transform`, neither of which changes the measured
  // box, so virtua's ResizeObserver and scroll math are untouched.
  const seen = new Set<string>();

  /**
   * Which rows draw a rail, and which of them continue the one above.
   *
   * The rail is painted per row, because rows are virtualised siblings and
   * there is no element spanning a run to hang one line on. Consecutive rail
   * rows therefore have to abut and paint the continuation weight rather than
   * each restarting the head gradient — otherwise a run reads as a stack of
   * stubs, which is exactly how the in-flight tool looked against the
   * completed calls above it.
   */
  const NO_RAIL = new Set([
    "user",
    "assistant",
    "user.peer",
    "user.rule",
    "user.delegate_ask",
    "ui.command_output",
    "ui.error",
    "ui.session_error",
    "result.error",
  ]);

  function railLed(row: Row): boolean {
    if (row.kind === "single") {
      return !NO_RAIL.has(row.message.type);
    }
    return (
      row.kind === "tools" ||
      row.kind === "harness" ||
      row.kind === "thinking" ||
      (row.kind === "live" && row.thinking !== null) ||
      row.kind === "livetool" ||
      row.kind === "subagent" ||
      row.kind === "delegate"
    );
  }

  /**
   * A row the ledger emits but never paints: a successful result, an assistant
   * frame that carried nothing but a tool call, a thinking block with no text.
   * `MessageRow` renders nothing for these, so they stand between two rail rows
   * at zero height — adjacent on screen, one apart in the list. Reading the
   * list literally is why a run of tool calls kept drawing its line in
   * disconnected stubs.
   */
  function unpainted(row: Row): boolean {
    if (row.kind !== "single") {
      return false;
    }
    const m = row.message;
    if (m.type === "result.success") {
      return true;
    }
    return (
      (m.type === "assistant" || m.type === "thinking") && !m.content.trim()
    );
  }

  /** Keys of rows whose line is the same line as the row above them ON SCREEN. */
  const continued = $derived.by(() => {
    const keys = new Set<string>();
    const rowList = built.rows;
    for (let i = 1; i < rowList.length; i += 1) {
      if (!railLed(rowList[i])) {
        continue;
      }
      let above = i - 1;
      while (above >= 0 && unpainted(rowList[above])) {
        above -= 1;
      }
      if (above >= 0 && railLed(rowList[above])) {
        keys.add(rowList[i].key);
      }
    }
    return keys;
  });

  /**
   * Whether a row is ARRIVING, decided once per row and never revisited.
   *
   * The animation itself is `Arrival` — the same component the /motion lab
   * tunes, with the same storyboard and the same tuned values. Nothing about
   * the motion lives here any more; this decides only whether a given row is
   * an arrival at all. Virtua mounts and unmounts rows as they cross the
   * viewport, so a row is fresh only if the transcript has landed, is
   * following the tail, and has never shown this key before.
   */
  /**
   * ROWS SHARE A CLOCK TOO.
   *
   * Rows do not arrive in a burst the way a chunk of words does — each one is
   * its own frame off the socket, milliseconds apart. Left alone every row
   * therefore starts its storyboard the instant it mounts, and three tool
   * calls landing in quick succession play the same animation over the top of
   * each other. So arrivals queue on one clock, exactly as the pieces inside a
   * row do: a row lands no sooner than `staggerMs` after the one before it,
   * and a run cascades.
   *
   * The queue is bounded. Past `CATCH_UP` rows deep it collapses to nothing —
   * a hundred rows replaying history one at a time is a slideshow, and the
   * reader is waiting on it.
   */
  const CATCH_UP = 4;
  let nextRow = 0;

  function leadFor(): number {
    const now = performance.now();
    const from = Math.max(nextRow, now);
    const wait = from - now;
    if (wait > ARRIVAL.staggerMs * CATCH_UP) {
      nextRow = now + ARRIVAL.staggerMs;
      return 0;
    }
    nextRow = from + ARRIVAL.staggerMs;
    return wait;
  }

  /**
   * Decided once per row, and it decides two things at once: whether this row
   * is arriving at all, and if it is, its place in the queue. Both have to be
   * answered on the row's first render — virtua re-renders the same row as it
   * crosses the viewport, and a second answer would restart a running
   * animation or hand out a second slot.
   */
  const decided = new Map<string, { fresh: boolean; lead: number }>();

  /**
   * How many rows may appear at once and still be an ARRIVAL rather than a
   * LOAD. A turn puts a handful of rows on the ledger — a reply, its tools, a
   * note. History puts down dozens.
   */
  const BULK = 8;
  /** How close to the end a row must be to be arriving at the end. */
  const TAIL = 3;

  /**
   * How long after landing the transcript stays silent.
   *
   * Landing is not one event — history can arrive in several chunks, a tab
   * switch re-mounts a pane, a catch-up appends behind the reader. Each of
   * those is a small enough append to look exactly like a message arriving,
   * which is how opening a conversation came to play its last few rows in as
   * if they had just been said. Nothing animates until the transcript has been
   * still for this long; a real message is always further away than that.
   */
  const SETTLE_MS = 700;
  let landedAt = 0;

  $effect(() => {
    if (landed && landedAt === 0) {
      landedAt = performance.now();
    }
  });

  /**
   * Whether the transcript was streaming as of the last flush.
   *
   * A turn ends by REPLACING the streaming row with a settled one under a
   * different key, so the settled row looks like a brand new arrival — and
   * re-revealed a message the reader had just watched arrive word by word:
   * full, then gone, then back again. Effects run after render, so during the
   * render that performs the swap this still holds the previous frame's
   * answer, which is the one worth asking.
   */
  let wasStreaming = false;
  $effect(() => {
    wasStreaming = built.rows.some(
      (r) => r.kind === "live" && r.text.length > 0
    );
  });

  let counted = 0;
  /**
   * Whether the last change to the list was history landing rather than a
   * message arriving.
   *
   * This is the difference between a transcript that animates when a message
   * comes in and one that animates every time you open it. `landed` alone
   * cannot tell them apart: a session that finishes loading with nothing in it
   * lands immediately, and then its entire history arrives AFTER the landing
   * with every key unseen — which is a refresh, or a tab switch, playing the
   * whole conversation in as if it had just been said.
   */
  const bulk = $derived.by(() => {
    const n = built.rows.length;
    const grew = n - untrack(() => counted);
    untrack(() => {
      counted = n;
    });
    return grew > BULK;
  });

  /**
   * Whether this ROW's place in the transcript permits an arrival at all —
   * everything the decision knows that is not about identity. Split out from
   * `arrive` because one row can host several arrivals: a run of tool calls
   * shares a row, and each call in it lands separately.
   */
  function allowed(row: Row): boolean {
    const rowList = built.rows;
    const atTail =
      rowList.findIndex((r) => r.key === row.key) >= rowList.length - TAIL;
    // The settled half of a turn that just finished streaming. Its words are
    // already on screen; revealing them again is not an arrival, it is a
    // flicker.
    const settling =
      wasStreaming && row.kind === "single" && row.message.type === "assistant";
    const pastSettle = landedAt > 0 && performance.now() - landedAt > SETTLE_MS;
    // Measured here, not read off `atBottom`. That flag is recomputed by
    // `onscroll` against a 120px threshold, and sending a message resizes the
    // composer — which changes this scroller's padding, and its scrollHeight,
    // in the same breath as the row lands. The flag could therefore be false
    // for reasons that have nothing to do with where the reader is looking,
    // and a row that drew the short straw was decided as history for good.
    // A reader within a screenful of the end is at the end.
    const reach = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      : Number.POSITIVE_INFINITY;
    const nearTail = atBottom || (!!scroller && reach < scroller.clientHeight);
    return landed && pastSettle && nearTail && atTail && !bulk && !settling;
  }

  /**
   * Decide one arrival, once, under `id`, and take its place in the queue.
   */
  function arrive(id: string, row: Row): { fresh: boolean; lead: number } {
    const known = decided.get(id);
    if (known) {
      return known;
    }
    const fresh = !seen.has(id) && allowed(row);
    seen.add(id);
    const answer = { fresh, lead: fresh ? leadFor() : 0 };
    decided.set(id, answer);
    if (fresh) {
      // A thing arrives ONCE. Virtua mounts and unmounts rows as they cross
      // the viewport, and the answer cached here outlives the component that
      // asked for it — so without this the same row played its arrival again
      // every time it was scrolled back into view, or the tab was returned to,
      // with whatever place in the queue it had the first time. The current
      // render has already read the answer by the time this runs.
      queueMicrotask(() => {
        answer.fresh = false;
      });
    }
    return answer;
  }

  /**
   * Never fresh, and never queued. What a row gets when it is not the thing
   * that arrives.
   */
  const STILL = { fresh: false, lead: 0 };

  function enter(row: Row): { fresh: boolean; lead: number } {
    /*
     * A TOOL RUN IS NOT ONE ARRIVAL.
     *
     * Consecutive tool calls fold into a single row keyed by the FIRST of
     * them, and that row is created once. Deciding at row level therefore
     * decided the whole run on its first call: every later call was appended
     * into a row that had already arrived, so it never reached `Arrival` at
     * all — no space reserved, no lift, and no place in the stagger queue. Its
     * only motion was the glyph's `Reveal`, drawing on a cascade whose window
     * had closed, which resolves to `delay: 0` — the flat pop the operator
     * reported as "consecutive tools are not animating". Measured on a live
     * transcript: one `reserve` for the run, then five bare `reveal delay=0`.
     *
     * So the row yields. The arrivals inside it are the CALLS, decided by
     * `enterTool` and played by `ToolGroup`, which is also what makes the rail
     * grow one call at a time instead of one run at a time.
     */
    if (row.kind === "tools") {
      return STILL;
    }
    return arrive(row.key, row);
  }

  /**
   * One tool CALL's arrival. Decided here rather than inside `ToolGroup` so
   * that it survives the group being unmounted and remounted by the
   * virtualizer — a component-local answer would be lost on every scroll, and
   * the run would replay itself each time it came back into view.
   */
  const callId = (m: Message): string => `call:${m.id ?? m.toolCallId}`;

  function enterTool(
    row: Row
  ): (m: Message) => { fresh: boolean; lead: number } {
    return (m) => arrive(callId(m), row);
  }

  // Seed every key already present before the transcript lands on its latest
  // message, so nothing that streamed in as history animates when scrolled to.
  $effect(() => {
    if (landed) {
      return;
    }
    // History is not growth. `bulk` measures how much the list grew since it
    // was last asked, and it is asked ONLY when a row is undecided — which,
    // while loading, never happens, because every key is being seeded here
    // first. So its baseline sat at zero until the first genuine arrival,
    // which then read the whole history as one enormous append and refused
    // to animate. That row appeared at full height instead of opening, and
    // took the pinned viewport 26px with it in a single frame: the one jolt
    // at the start of every tool run.
    counted = rows.length;
    for (const r of rows) {
      seen.add(r.key);
      // A tool run's calls are seeded individually, because they are now what
      // arrives — seeding only the row key would leave every historical call
      // in it undecided, and a scroll back through history would play them.
      if (r.kind === "tools") {
        for (const m of r.messages) {
          seen.add(callId(m));
        }
      }
    }
  });

  // ── The live region ─────────────────────────────────────────────────────
  // The scroll container is NOT the live region. virtua mounts and unmounts
  // rows as they cross the viewport, so `aria-live` on it re-reads history the
  // moment the operator scrolls, and re-reads the streaming turn on every token.
  // Instead: the same landed/seen-set guard the enter motion uses picks out
  // genuine arrivals, and says one coarse sentence about each.

  /**
   * What identifies a row for announcement purposes. The streaming rows are
   * deliberately unannounceable — their text arrives token by token, and a live
   * region fed from it is a stutter. The settled `single` row the turn becomes
   * is what says "replied". The in-flight tool is keyed by its call id rather
   * than its row key, which virtua reuses for every tool in turn.
   */
  function announceKeyOf(row: Row): string {
    if (
      row.kind === "stream" ||
      row.kind === "thinking" ||
      row.kind === "live"
    ) {
      return "";
    }
    // A harness notification is plumbing the operator never asked for. It is
    // worth a line on the rail and nothing at all in the ear.
    if (row.kind === "harness") {
      return "";
    }
    // Nor a queued message: the operator just sent it. Reading their own words
    // back to them, then again when the session starts on them, is noise.
    if (row.kind === "queued") {
      return "";
    }
    if (row.kind === "livetool") {
      return `livetool:${row.glance.toolId}`;
    }
    return row.key;
  }

  /**
   * The whole announceable vocabulary, and it is five phrases long. A row that
   * maps to nothing says nothing — a settled tool run, a prepended history
   * chunk and the operator's own message are all visible on a surface the
   * operator is looking at.
   */
  function phraseOf(row: Row): string {
    if (row.kind === "single") {
      // The operator's own message needs no reading back to them.
      return row.message.type === "user" ? "" : "Agent replied";
    }
    if (row.kind === "livetool") {
      return `${row.glance.name} running`;
    }
    return "";
  }

  /** What the polite region currently holds. Replaced, never appended to. */
  let announcement = $state("");
  const announced = new Set<string>();

  $effect(() => {
    // Before the transcript lands, everything on it is history, not an arrival.
    // A pane that is off screen is the same case twice over: it has no business
    // speaking about a surface the reader cannot see, and its rows are frozen
    // anyway. Both branches still SEED `announced`, so coming back to a tab
    // announces what arrived while it was away exactly once, rather than
    // re-reading the whole transcript.
    if (!(landed && active)) {
      for (const r of rows) {
        announced.add(announceKeyOf(r));
      }
      return;
    }
    let phrase = "";
    for (const r of rows) {
      const key = announceKeyOf(r);
      if (!key || announced.has(key)) {
        continue;
      }
      announced.add(key);
      const said = phraseOf(r);
      if (said) {
        phrase = said;
      }
    }
    // A batch that lands in one frame says only its last line: three sentences
    // read back-to-back is the spam this region exists to stop.
    if (phrase) {
      announcement = phrase;
    }
  });

  // The end of a turn is a state change, not a row: the last thing the agent
  // said may have landed several frames before it stopped working. `busy`
  // falling is the only honest signal for it.
  // `busy` is still TRACKED off screen — it flips once a turn, not once a
  // frame, so it costs nothing — but only a pane on screen says so out loud.
  // Following it either way is what keeps `wasBusy` honest: dropping the
  // bookkeeping while hidden would make the next switch announce a turn that
  // finished minutes ago.
  let wasBusy = false;
  $effect(() => {
    const { busy } = session;
    if (active && landed && wasBusy && !busy) {
      announcement = "Turn finished";
    }
    wasBusy = busy;
  });

  /**
   * The blocked-on-you line, which interrupts: it is the one state where the
   * run has stopped and only the operator can restart it. Empty otherwise, so
   * clearing the block does not itself announce anything.
   */
  const blockedNote = $derived.by(() => {
    if (!landed) {
      return "";
    }
    if (session.pending.length > 0) {
      return "Agent needs your permission";
    }
    if (rows.at(-1)?.kind === "question") {
      return "Question from the agent";
    }
    return "";
  });
</script>

<!-- Off-screen, and the only thing on this surface that speaks. Two channels:
     what just arrived (polite, queued behind the reader), and what is blocking
     (assertive, because the run has stopped). -->
<p aria-atomic="true" aria-live="polite" class="spoken" role="status">
  {announcement}
</p>
<p aria-atomic="true" aria-live="assertive" class="spoken">{blockedNote}</p>

<div
  aria-label="Session transcript"
  class="tr"
  {onanimationend}
  {onanimationstart}
  {onscroll}
  role="log"
  style={arrivalVars(ARRIVAL)}
  bind:this={scroller}
>
  <!-- Pinned to the top of the transcript viewport (the foot is the composer's),
       first child so `position: sticky` actually holds. -->
  {#if compacting}
    <div class="compacting-note" role="status">
      <span aria-hidden="true" class="beat"></span>
      Compacting context…
    </div>
  {/if}
  {#if session.loading && rows.length === 0}
    <p class="empty">Loading transcript…</p>
  {:else if rows.length === 0}
    <!-- Not a shrug: where this session runs, then the two keys that do anything
         from the composer below. Left-aligned — this surface is a ledger. -->
    <div class="blank">
      <!-- Both halves or neither: the identity line is `machine : folder`, and
           half of it is a dangling colon. -->
      {#if machineName && cwd}
        <p class="b-where">{machineName} : {cwd}</p>
      {/if}
      <h2 class="b-lead">No messages yet.</h2>
      <p class="b-hint">
        Send the first instruction below — / lists this session's commands, @
        names a machine or session.
      </p>
    </div>
  {/if}

  <Virtualizer
    cache={snapshot?.cache}
    data={renderedRows}
    getKey={(r) => r.key}
    {itemSize}
    scrollRef={scroller}
    shift={built.shifted}
    {ssrCount}
    bind:this={
      () => list,
      (value) => { list = value as unknown as VirtualizerHandle; }
    }
  >
    {#snippet children(row)}
      {@const landing = enter(row)}
      <Arrival
        continues={continued.has(row.key)}
        lead={landing.lead}
        opens
        owns={false}
        params={ARRIVAL}
        still={!landing.fresh}
      >
        {#if row.kind === 'single'}
          <MessageRow {agentName} message={row.message} />
        {:else if row.kind === 'tools'}
          <ToolGroup landing={enterTool(row)} messages={row.messages} />
        {:else if row.kind === 'question'}
          <QuestionCard message={row.message} />
        {:else if row.kind === 'harness'}
          <SystemLine harness={row.note} />
        {:else if row.kind === 'subagent'}
          <Subagent branch={row.branch} spawn={row.spawn} />
        {:else if row.kind === 'delegate'}
          <Delegate message={row.message} />
        {:else if row.kind === 'thinking'}
          <Thinking live={row.live} text={row.text} />
        {:else if row.kind === 'live'}
          {@const livePhase = row.text ? 'answer' : 'reasoning'}
          <!-- One container for the whole live tail. The reasoning unreveals
               in place, the answer reveals into the same box, and the box
               tweens from one height to the other — the space is never
               surrendered between them. -->
          <Swap
            phase={departing?.row.key === row.key ? 'empty' : livePhase}
            value={departing?.row.key === row.key ? null : row}
          >
            {#snippet children(face)}
              {#if face?.thinking === null && face.text}
                <section class="turn">
                  <Who name={agentName} />
                  <MessageBody source={face.text} streaming />
                </section>
              {:else if face}
                <Thinking
                  announce={active}
                  live={face.indicating}
                  text={face.thinking ?? ''}
                />
              {/if}
            {/snippet}
          </Swap>
        {:else if row.kind === 'queued'}
          <Queued queued={row.queued} />
        {:else if row.kind === 'livetool'}
          {@const d = describeTool(row.glance.name, undefined, undefined, 'pending')}
          {@const LiveIcon = d.icon}
          <div class="livetool">
            <span class="ic breathe {d.color}"
              ><Reveal><LiveIcon /></Reveal></span
            >
            <!-- The same anatomy the settled ToolGroup row has: the descriptor's
                 verb, then the mono argument, the verb omitted where the object
                 is the whole sentence. Printing `glance.name` here and `d.label`
                 once it settled changed the call's vocabulary the instant it
                 completed. -->
            {#if d.label}
              <span class="tk"><Stream text={d.label} /></span>
            {/if}
            <span class="arg"><Stream text={row.glance.glance} /></span>
          </div>
        {/if}
      </Arrival>
    {/snippet}
  </Virtualizer>
  <!-- Under the last row, inside the scroller, from the switch until the
       catch-up has appended: the transcript the reader left is on screen
       already; this says the rest is on its way. -->
  {#if catching}
    <CatchUp />
  {/if}
</div>

<style>
  .tr {
    flex: 1 1 auto;
    overflow-y: auto;
    /* asymmetric content padding is the DESIGN.md ledger signature:
       left --space-7 (25), right --space-6 (21). */
    padding-top: 0;
    padding-right: var(--space-6);
    padding-left: var(--space-7);
    /* The foot clears the floating composer COLUMN, not the bare pill: a
       permission card stacks above the input inside it and can stand 400px
       tall, which used to bury the very message that raised it.
       `--composer-clearance` is that column's measured height plus its offsets,
       published by the pane; the old fixed reserve is the floor, so a bare
       composer looks exactly as it did. */
    padding-bottom: max(
      calc(var(--space-8) * 3),
      var(--composer-clearance, 0px)
    );
    min-height: 0;
    position: relative;
  }
  .empty {
    font-size: var(--text-label);
    color: var(--ink-muted);
    padding: var(--space-5) 0;
  }

  /* The empty transcript. Quiet by construction — no fill, no border, no
     illustration; it is a caption on the ledger, so it sits where every other
     row starts rather than in the middle of the pane. */
  .blank {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-8) 0;
    line-height: var(--leading-body);
  }
  .b-where {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .b-lead {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .b-hint {
    max-width: 44ch;
    font-size: var(--text-label);
    color: var(--ink-muted);
  }

  .compacting-note {
    position: sticky;
    top: var(--space-3);
    z-index: 3;
    width: fit-content;
    max-width: 100%;
    margin: 0 auto var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font-size: var(--text-label);
    color: var(--ink-strong);
  }
  .compacting-note .beat {
    width: 6px;
    height: 6px;
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

  /* The live region is read, never seen: off-screen rather than
     `display: none`, which assistive tech skips entirely. */
  .spoken {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Motion is opt-in: the dot only beats when the reader hasn't asked for
     reduced motion. Without the query the pill's presence alone carries
     the state — the dot is still. */
  .compacting-note .beat {
    animation: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .compacting-note .beat {
      animation: beat var(--breath) var(--ease-in-out) infinite;
    }
  }
  @media (max-width: 900px) {
    .tr {
      padding-left: var(--space-5);
      padding-right: var(--space-5);
    }
  }
  .turn {
    margin-top: var(--space-4);
  }
  /* The in-flight tool sits on the same rail column as the calls it becomes,
     at every width — see the breakpoint below. */
  .livetool {
    /* one rhythm value (--space-4) tops every row type; the rail indent is
       --space-2 margin + --space-3 padding, shared across every rail block. */
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    color: var(--ink-strong);
  }
  .livetool .ic {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    /* No `color` here: the tool family's `text-tool-*` tint governs the glyph;
       the generic case inherits --ink-strong from .livetool. */
  }
  .livetool .ic :global(svg) {
    width: 15px;
    height: 15px;
  }
  .livetool .tk {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    flex: 0 0 auto;
  }
  .livetool .arg {
    font-family: var(--font-mono);
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  /* The in-flight tool's glyph breathes — the one live channel — so the running
     row reads as in-progress against the still, completed rows in ToolGroup.
     This IS the progress indicator on tool usage; done rows hold their glyph. */
  @media (max-width: 900px) {
    .livetool {
      margin-left: 0;
    }
  }

  @keyframes breathe {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .livetool .ic.breathe :global(svg) {
      animation: breathe var(--breath) var(--ease-in-out) infinite;
    }
  }

  /* No per-row enter CSS here. The row wrapper IS `Arrival` — one storyboard,
     one implementation, tuned on /motion. */
</style>
