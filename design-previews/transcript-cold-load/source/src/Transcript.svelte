<!--
  The transcript's cold load, as the design (report dbc77f55, §1) has it.

  The shell is drawn before the hub answers: this component mounts with the
  veil up, its generation drawing running from that first frame
  (generate.js, transitions.dev's UI generation skeleton), and the load's
  promise pending. When the window around the kept
  place is in hand (or the newest page, for the tail), the rows are built and
  only then is virtua mounted, its cache built from the sizes this tab kept by
  row key: virtua reads `cache` once, as it is made, cut to the rows it holds
  then, so a list mounted before its rows drops every size (prototype
  question 1). The view is put on the place unseen (`restore`, from
  Transcript.svelte as written on main, b7b06ab9a), and once every row in
  view is drawn and measured the list comes in over the drawing as it fades,
  on the drawing's one clock.

  Then the place is held for LANDING_HOLD_MS while the rows around it go on
  measuring; older pages come in above with virtua's `shift` and newer ones
  below as the reader nears either end, and the row being read does not move.
-->
<script>
  import { Virtualizer } from "virtua/svelte";
  import { flushSync, onMount, tick, untrack } from "svelte";
  import { SESSION, newer, older } from "./hub.js";
  import { flushPlace, keepPlace, keepSizes, readSizes } from "./place.js";
  import Row from "./Row.svelte";
  import GenStrip from "./GenStrip.svelte";
  import Veil from "./Veil.svelte";

  /** `loading`: the load's promise, started before anything mounted. `align`: the veil's edge. */
  let { loading, align } = $props();

  /** virtua's size for a row it has not measured (Transcript.svelte). */
  const ROW_ESTIMATE = 21;
  /** The most frames a place is put back over while the rows around it measure. */
  const KEEP_FRAMES = 12;
  /** How long a landing's place is held once the list is drawn, ms. */
  const LANDING_HOLD_MS = 1500;
  const BUFFER_STEPS = 8;
  const GONE_WORDS = "Where you were isn't in this session any more.";

  let rows = $state.raw([]);
  /** Rows before the first one held (`null`: the conversation's start is in hand), and after the last. */
  let cursor = $state(null);
  let after = $state(null);
  let shifted = $state(false);
  let cache = $state.raw(undefined);
  let mounted = $state(false);
  let readingOlder = false;
  let readingNewer = false;

  let scroller = $state();
  let listing = $state();
  let list = $state();
  let strip = $state();
  /** The veil's generation run (generate.js); none for a reader who asked for less motion. */
  let veilRun = $state.raw();
  let viewHeight = $state(0);
  let buffer = $state(0);
  let shown = $state(false);
  let veiled = $state(true);
  let landed = false;
  let olderRoom = $state(0);
  let unfound = $state(false);

  /** The place being returned to, until the landing has used it. */
  let resume = null;
  let atBottom = false;
  let keptPlace = null;
  let keepFrame = 0;
  let readerMoved = 0;
  let holdUntil = 0;
  let lastTop = 0;
  let listStart = 0;
  let lastWrite = null;
  let placeWrite = null;
  let onScreen = null;

  // What the demo's proof reads (scripts/probe-kit/specs/transcript-cold-load-preview.ts).
  const t0 = performance.now();
  const log = { writes: [], readerMoved: [], held: [], drawn: null, landing: null };
  let phase = "land";
  let frameNo = 0;

  const rowHolding = (block) => rows.findIndex((row) => row.key === block);

  // ── The landing ─────────────────────────────────────────────────────

  /**
   * Put the view on the place being returned to, from virtua's sizes as they
   * stand; says whether the scroller had to move. The tail is the scroller's
   * end. Called until it no longer moves: each write brings rows into range
   * that virtua measures, which moves the row again.
   */
  function restore() {
    if (!resume) {
      return false;
    }
    if (resume.tail) {
      return pinBottom();
    }
    const index = rowHolding(resume.block);
    return index >= 0 && scrollToRow(index, resume.into);
  }

  /**
   * Whether this engine keeps a scroll offset in whole pixels, cutting off what
   * is written past one (WebKit: 455.65625 reads back 455), as the first write
   * of a fraction showed; null until one has.
   */
  let wholePixels = null;

  /**
   * Whether the scroller already stands at `target`, or as near as the
   * engine's steps let it: a write that would read back where the view
   * already is moves nothing, and is not made (Transcript.svelte learns that
   * per target, `placeWrite`, after one such write each).
   */
  function standsAt(target) {
    const now = scroller.scrollTop;
    return (
      Math.abs(now - target) <= 0.5 ||
      (wholePixels === true && now === Math.floor(target)) ||
      (placeWrite !== null && Math.abs(placeWrite.target - target) <= 0.5 && now === placeWrite.read)
    );
  }

  function writeTop(target) {
    const from = scroller.scrollTop;
    scroller.scrollTop = target;
    lastWrite = scroller.scrollTop;
    placeWrite = { target, read: lastWrite };
    if (wholePixels === null && target % 1 > 0.01 && lastWrite !== target) {
      wholePixels = lastWrite === Math.floor(target);
    }
    log.writes.push({ phase, frame: frameNo, ms: Math.round(performance.now() - t0), from, target: +target.toFixed(2) });
  }

  /** The row at `index` at the view's top, `into` pixels past its top (Transcript.svelte `scrollToRow`). */
  function scrollToRow(index, into) {
    if (!(list && scroller && listing)) {
      return false;
    }
    const start = listing.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    // Never past the row's own end as virtua has it sized: a row it has not
    // measured is ROW_ESTIMATE tall.
    const reach = Math.min(into, Math.max(0, list.getItemSize(index) - 1));
    const target = Math.min(
      Math.max(0, start + list.getItemOffset(index) + reach),
      scroller.scrollHeight - scroller.clientHeight
    );
    if (standsAt(target)) {
      return false;
    }
    writeTop(target);
    return true;
  }

  function pinBottom() {
    const target = scroller.scrollHeight - scroller.clientHeight;
    if (standsAt(target)) {
      return false;
    }
    writeTop(target);
    return true;
  }

  /**
   * Every row in the viewport is drawn and measured: the rows the offset
   * covers abut from the view's top down, and none is still hidden awaiting
   * its size (Transcript.svelte, the reveal).
   */
  function measured() {
    const container = listing.firstElementChild;
    const view = scroller.getBoundingClientRect();
    const boxes = [];
    for (const item of container.children) {
      const box = item.getBoundingClientRect();
      if (box.bottom > view.top && box.top < view.bottom) {
        if (item.style.visibility === "hidden") {
          return false;
        }
        boxes.push(box);
      }
    }
    boxes.sort((a, b) => a.top - b.top);
    if (scroller.scrollTop > 0 && (boxes[0]?.top ?? view.bottom) > view.top + 1) {
      return false;
    }
    return boxes.every((box, i) => i === 0 || box.top <= boxes[i - 1].bottom + 1);
  }

  /** Wait, unseen, until the place stays put and every row in view is measured; then draw. */
  function reveal() {
    const container = listing.firstElementChild;
    let frame = null;
    phase = "reveal";
    const wait = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = null;
        frameNo += 1;
        if (restore()) {
          wait();
          return;
        }
        if (!measured()) {
          return;
        }
        changes.disconnect();
        drawAtLanding();
      });
    };
    const changes = new MutationObserver(wait);
    changes.observe(container, { attributes: true, attributeFilter: ["style"], childList: true, subtree: true });
    wait();
  }

  /** The list drawn where its landing put it, the place then held while the rows around it measure. */
  function drawAtLanding() {
    const kept = resume;
    resume = null;
    shown = true;
    atBottom = kept.tail;
    keptPlace = kept.tail ? null : { block: kept.block, into: kept.into };
    const top = kept.tail ? null : blockTop(kept.block);
    log.drawn = {
      ms: Math.round(performance.now() - t0),
      frame: frameNo,
      error: kept.tail
        ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
        : top === null
          ? null
          : top + Math.min(kept.into, list.getItemSize(rowHolding(kept.block)) - 1),
    };
    holdUntil = performance.now() + LANDING_HOLD_MS;
    phase = "hold";
    holdPlace();
    crossFade();
  }

  /**
   * The list comes in over the drawing: transitions.dev's UI generation
   * reveal (generate.js `reveal`), its opacity from 0 and its blur from 3px
   * over 475ms on cubic-bezier(.22, 1, .36, 1), from 930ms into the drawing
   * or now if that has passed, as the drawing fades out after it. All on the
   * drawing's one clock. For a reader who asked for less motion, no drawing:
   * the list fades in over 200ms, as theirs does.
   */
  function crossFade() {
    if (!veilRun) {
      const fade = scroller.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      fade.id = "generate-reveal";
      veiled = false;
      return;
    }
    veilRun.reveal(scroller).then(() => {
      veiled = false;
    });
  }

  // ── The place, held ────────────────────────────────────────────────

  /**
   * While a landing's hold runs, or for the frames after a change to the rows
   * that is not only in front, put the kept place back at the view's top as
   * the rows around it measure (Transcript.svelte `holdPlace`).
   */
  function holdPlace() {
    cancelAnimationFrame(keepFrame);
    keepFrame = 0;
    const place = keptPlace;
    if (!(place && landed && shown) || atBottom || resume !== null) {
      return;
    }
    const moved = readerMoved;
    let frames = 0;
    const step = () => {
      keepFrame = requestAnimationFrame(() => {
        keepFrame = 0;
        if (atBottom || readerMoved !== moved) {
          return;
        }
        const top = list ? list.findItemIndex(lastTop) : -1;
        const index = top >= 0 && rows[top]?.key === place.block ? top : rowHolding(place.block);
        phase = "hold";
        const wrote = index >= 0 && scrollToRow(index, place.into);
        if (wrote) {
          frames += 1;
          keptPlace = place;
        }
        if ((wrote && frames < KEEP_FRAMES) || performance.now() < holdUntil) {
          step();
        }
      });
    };
    step();
  }
  $effect(() => {
    const front = shifted;
    void rows;
    // A change only in front is virtua's own `shift`, exact (prototype
    // question 3), unless a landing's place is still held.
    if (!front || performance.now() < holdUntil) {
      untrack(holdPlace);
    }
    return () => cancelAnimationFrame(keepFrame);
  });

  // ── The reader ─────────────────────────────────────────────────────

  /** The block at the view's top `top` and how far into its row the view stands. */
  function placeAt(top) {
    if (!list || rows.length === 0) {
      return null;
    }
    const index = list.findItemIndex(top);
    const row = rows[index];
    return row ? { block: row.key, into: top - listStart - list.getItemOffset(index) } : null;
  }
  function rowAt(top) {
    const index = list.findItemIndex(top);
    return { key: rows[index].key, at: listStart + list.getItemOffset(index) - top };
  }
  function stillAt(was, top) {
    const index = rowHolding(was.key);
    return index >= 0 && Math.abs(listStart + list.getItemOffset(index) - top - was.at) <= 1;
  }

  /**
   * Input that only the reader makes: a wheel, a finger, a key, a press on
   * the scrollbar. A scroll that follows none of it is this component's
   * write or virtua's correction (see `readScroll`).
   */
  let handled = false;
  let handLifted = 0;
  const READER_INPUT = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"];
  function reading() {
    handled = true;
    clearTimeout(handLifted);
  }
  function letHandGo() {
    clearTimeout(handLifted);
    // A fling goes on after the finger lifts; its scroll events are still the reader's.
    handLifted = setTimeout(() => {
      handled = false;
    }, 1000);
  }

  /** What a scroll did (Transcript.svelte `readScroll`, with the reader told by input). */
  function readScroll() {
    if (!(scroller && listing && landed && list)) {
      return;
    }
    lastTop = scroller.scrollTop;
    listStart = listing.getBoundingClientRect().top - scroller.getBoundingClientRect().top + lastTop;
    const was = onScreen;
    onScreen = rowAt(lastTop);
    if (!shown) {
      return;
    }
    edges();
    if (lastWrite !== null && Math.abs(scroller.scrollTop - lastWrite) <= 1) {
      return;
    }
    if (was && stillAt(was, lastTop)) {
      return;
    }
    // THE HOLD ENDS ON THE READER'S INPUT, NOT ON A MOVED ROW (prototype
    // finding 4). On an iPhone virtua 0.53.4 puts off its correction for rows
    // measured above the view while the view counts as scrolling, which the
    // landing's own writes start: the growth goes into its store's pending
    // jump (`p() && 0 !== I ? b += t : S += t`), and is written with
    // `scrollBy` when its 150ms scroll-end timer fires (`l && b && (S += b,
    // b = 0)`). While the jump is pending, `getItemOffset` subtracts it
    // (`t => r(t) - b`) and `findItemIndex` does not (`layout.$findIndex`),
    // so the top row read at the scroll event before (`rowAt`) is a row
    // hundreds of pixels above the view, and the flush's scroll event fails
    // `stillAt`: it read as the reader, the hold ended, and the place was
    // left to drift. A scroll the reader makes always follows their input (a
    // wheel, a finger, a key, a press on the scrollbar); one that follows
    // none is the list's own, and the hold goes on.
    if (!handled) {
      log.held.push({
        ms: Math.round(performance.now() - t0),
        top: lastTop,
        lastWrite,
        sinceWrite: Math.round(performance.now() - t0) - (log.writes.at(-1)?.ms ?? 0),
        was: was && { ...was },
        now: onScreen,
      });
      return;
    }
    readerMoved += 1;
    log.readerMoved.push({ ms: Math.round(performance.now() - t0), top: lastTop });
    holdUntil = 0;
    unfound = false;
    const end = scroller.scrollHeight - scroller.clientHeight;
    atBottom = after === null && end - lastTop <= 1;
    keptPlace = atBottom ? null : placeAt(lastTop);
    keepPlace(SESSION, keptPlace);
  }

  // ── Pages either side ──────────────────────────────────────────────

  /** Ask for the page before or after what is held once less than a screen of rows is left that way. */
  function edges() {
    if (!(shown && list && scroller)) {
      return;
    }
    const view = scroller.clientHeight;
    const above = scroller.scrollTop - listStart;
    const below = listStart + list.getScrollSize() - (scroller.scrollTop + view);
    if (cursor !== null && !readingOlder && above < view) {
      readingOlder = true;
      older(cursor).then((page) => {
        readingOlder = false;
        shifted = true;
        cursor = page.cursor;
        rows = [...page.blocks, ...rows];
      });
    }
    if (after !== null && !readingNewer && below < view) {
      readingNewer = true;
      newer(after).then((page) => {
        readingNewer = false;
        shifted = false;
        after = page.after;
        rows = [...rows, ...page.blocks];
      });
    }
  }
  // A page landing can leave less than a screen of rows that way still: ask again, a frame on.
  $effect(() => {
    void rows.length;
    const frame = requestAnimationFrame(() => untrack(edges));
    return () => cancelAnimationFrame(frame);
  });

  /**
   * THE STRIP BEFORE THE LIST MOVES NOTHING (Transcript.svelte `keepPlace`):
   * it goes when the conversation's start is in hand, above every row, so the
   * view moves with it, after the layout and before the paint.
   */
  function keepStrip(node) {
    // Its height before the landing's first write, so that write is made against it.
    olderRoom = node.offsetHeight;
    const watch = new ResizeObserver(() => {
      const grew = node.offsetHeight - olderRoom;
      if (grew === 0) {
        return;
      }
      olderRoom = node.offsetHeight;
      flushSync();
      if (!(landed && scroller)) {
        return;
      }
      scroller.scrollTop += grew;
      lastWrite = scroller.scrollTop;
    });
    watch.observe(node);
    return () => watch.disconnect();
  }

  // The buffer, stepped up to a screen a frame-and-task at a time (Transcript.svelte).
  $effect(() => {
    const full = viewHeight;
    if (untrack(() => buffer) >= full) {
      buffer = full;
      return;
    }
    const by = Math.max(1, full / BUFFER_STEPS);
    let frame = 0;
    let task;
    const grow = () => {
      frame = requestAnimationFrame(() => {
        task = setTimeout(() => {
          buffer = Math.min(full, buffer + by);
          if (buffer !== full) {
            grow();
          }
        });
      });
    };
    grow();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });

  // ── Leaving ────────────────────────────────────────────────────────

  /** The page is going (a refresh among them): the place into its cookie, the sizes into the tab. */
  function leave() {
    if (!(list && shown)) {
      return;
    }
    const [sizes] = list.getCache();
    const fresh = {};
    rows.forEach((row, i) => {
      if (sizes[i] !== -1) {
        fresh[row.key] = sizes[i];
      }
    });
    keepSizes(fresh);
    keepPlace(SESSION, atBottom ? null : (keptPlace ?? placeAt(lastTop)));
    flushPlace();
  }

  function blockTop(key) {
    const el = listing?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    return el ? el.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null;
  }

  onMount(() => {
    viewHeight = scroller.clientHeight;
    for (const kind of READER_INPUT) {
      scroller.addEventListener(kind, reading, { passive: true });
    }
    scroller.addEventListener("touchend", letHandGo, { passive: true });
    scroller.addEventListener("pointerup", letHandGo, { passive: true });
    scroller.addEventListener("wheel", letHandGo, { passive: true });
    scroller.addEventListener("keyup", letHandGo, { passive: true });
    addEventListener("pagehide", leave);
    window.__coldLoad = {
      log,
      blockTop,
      keptPlace: () => keptPlace,
      rows: () => rows.map((row) => row.key),
      edges: () => ({ cursor, after, readingOlder, readingNewer }),
      gen: () => veilRun?.read() ?? null,
    };

    loading.then(async ({ landing, page }) => {
      log.landing = landing;
      resume = landing;
      unfound = !!landing.gone;
      // The sizes this tab kept, as virtua's cache for exactly these rows,
      // set before the rows so the list is made with it.
      const saved = readSizes();
      const blocks = page.blocks;
      cache = [blocks.map((row) => saved[row.key] ?? -1), ROW_ESTIMATE];
      cursor = page.cursor;
      after = page.after;
      rows = blocks;
      mounted = true;
      if (landing.gone) {
        keepPlace(SESSION, null);
      }
      // virtua attaches to its scroller a tick after it mounts.
      await tick();
      await tick();
      landed = true;
      phase = "land";
      restore();
      await tick();
      reveal();
    });
    return () => removeEventListener("pagehide", leave);
  });
</script>

<div class="transcript">
  <div class="scroller" data-shown={shown || undefined} bind:this={scroller} onscroll={readScroll} role="log" aria-label="Transcript">
    {#if mounted}
      <div class="strip" bind:this={strip} {@attach keepStrip}>
        {#if cursor !== null}
          <GenStrip />
        {/if}
      </div>
      <div class="listing" data-shown={shown || undefined} bind:this={listing}>
        <Virtualizer
          bufferSize={buffer}
          {cache}
          data={rows}
          getKey={(row) => row.key}
          itemSize={ROW_ESTIMATE}
          scrollRef={scroller}
          shift={shifted}
          startMargin={olderRoom}
          bind:this={list}
        >
          {#snippet children(row)}
            <Row {row} />
          {/snippet}
        </Virtualizer>
      </div>
      {#if after !== null}
        <GenStrip />
      {/if}
    {/if}
    <div class="room"></div>
  </div>
  {#if veiled}
    <Veil {align} bind:run={veilRun} />
  {/if}
  <p class="dock" role="status">{unfound ? GONE_WORDS : ""}</p>
</div>
