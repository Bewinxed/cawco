<script lang="ts" module>
  import {
    deliverWithRoot,
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";

  /**
   * What rows ask of the next frame's callbacks (whether virtua has drawn
   * them, `look`; an arrival's first report, `onFirstLayout`), run together
   * in one: a scroll mounts rows by the dozen, and a frame request of each
   * one's own was a dozen requests a wheel.
   */
  const due = new Set<() => void>();
  let dueFrame = 0;
  function nextFrame(run: () => void): () => void {
    due.add(run);
    if (dueFrame === 0) {
      dueFrame = requestAnimationFrame(() => {
        dueFrame = 0;
        const now = [...due];
        due.clear();
        for (const each of now) {
          each();
        }
      });
    }
    return () => due.delete(run);
  }

  /**
   * THE ARRIVAL OPENS FROM THE HEIGHT THE FRAME LAID THE ROW OUT AT. A row
   * that arrives is heard in the shared size observer's delivery, on the
   * layout the frame has just done, and its opening is set going there,
   * before the frame paints: read in the frame's callbacks instead, its
   * height laid the page out under the rows the update had just written
   * (`open@Row.svelte`, a reply's long frames). The opening resizes the row
   * and its list item after their depth was delivered, so the root reports
   * in that delivery (`deliverWithRoot`): what it resized is delivered
   * again in the same frame, virtua measures the row at its opening height
   * and the pin follows, all before the paint. Both are asked for in the
   * frame's callbacks, as motion/rows' `heard` asks: a row mounted inside a
   * delivery (the pin's flush) that asked for the root there left it
   * undelivered, the root being shallower than what that delivery reached.
   */
  const arriving = new Map<Element, (height: number) => void>();
  let arrivalSizes: FrameObserver | null = null;
  function onFirstLayout(
    row: HTMLElement,
    start: (height: number) => void
  ): () => void {
    let asked = false;
    const unask = nextFrame(() => {
      asked = true;
      firstLayoutOf(row, start);
    });
    return () => {
      unask();
      if (asked && arriving.delete(row)) {
        arrivalSizes?.unobserve(row);
      }
    };
  }
  function firstLayoutOf(
    row: HTMLElement,
    start: (height: number) => void
  ): void {
    arrivalSizes ??= frameObserver(null, {
      inside: (entries) => {
        const writes: (() => void)[] = [];
        for (const entry of entries) {
          const take = arriving.get(entry.target);
          const height = entry.borderBoxSize[0]?.blockSize;
          if (take && height !== undefined) {
            arriving.delete(entry.target);
            arrivalSizes?.unobserve(entry.target);
            writes.push(() => take(height));
          }
        }
        return writes.length > 0
          ? () => {
              for (const write of writes) {
                write();
              }
            }
          : undefined;
      },
    });
    arriving.set(row, start);
    arrivalSizes.observe(row, { box: "border-box" });
    deliverWithRoot();
  }
</script>

<script lang="ts">
  /**
   * One row of the transcript — or one call inside a run of them — and the only
   * place a row's arrival is played.
   *
   * Whether it plays is not decided here. The transcript's ledger decided it
   * when the data changed (see `arrivals.svelte.ts`); this takes the answer as
   * it mounts. While the arrival is still playing, a remount — virtua dropping
   * the row for a frame as the follow carries it in — takes the same ticket and
   * plays on from where the arrival has got to. Once the entrance has run the
   * ticket is spent, and the reader scrolling back to the row, or a pane
   * coming back into view, finds none.
   *
   * THE ARRIVAL: THE RAIL FIRST, THEN WHAT STANDS ON IT. Every row that
   * arrives opens its place first — from nothing, or from the height of the
   * row it took over, to its own measured height over --dur-rail on
   * --ease-out — and a rail row's rail, being its own background, draws down
   * with that opening as one stroke. Only once the place is open does the
   * content fade up into it (--dur-menu, 3px). A rail row's content is what
   * stands on the rail — its children — so the rail is never faded with it;
   * any other row's content is the row. The rows above make room on that one
   * clock instead of jumping by the row's height in the frame it lands: the
   * transcript pins its bottom to the opening edge for as long as it runs.
   * Without motion nothing opens: the content fades in over --dur-control.
   *
   * The reader's own message (`emerge`) opens on the composer's clock instead
   * (--dur-control, --ease-out: the field's own collapse), because the room it
   * takes is the room the composer gives back in the same moment. It opens
   * unclipped and plays no fade: its words are in flight from the composer
   * into it.
   *
   * A row leaving the list (the turn's indicator, a finished tool's glance, a
   * replaced send) folds shut where it stands instead of vanishing, over
   * --dur-panel on --ease-out — unless another row takes its place in the
   * update that draws it (`handoff`): then the taker starts at the height it
   * took over and tweens to its own, one height on one clock, and the row it
   * replaced stays on top of the place, out of the flow, fading as the taker
   * opens under it. There is never a frame with the place empty.
   *
   * Every height here is a measured `block-size` animated on the row itself,
   * never a grid track: WebKit sized a `0fr → 1fr` track off a stale
   * measurement, opened a tool's line to 5px of its 40 and snapped the rest
   * in one frame at the end.
   */
  import { type Snippet, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import {
    type Handoff,
    type Motion,
    type Ticket,
    useLedger,
  } from "./arrivals.svelte";

  let {
    id,
    rowKey,
    motion = "draw",
    continues = false,
    leaving = false,
    handoff,
    onleft,
    marked,
    measured,
    heightOf,
    children,
  }: {
    /**
     * What this row is to the ledger. Absent for a row that never arrives as a
     * whole — a run of tool calls, whose calls arrive one by one.
     */
    id?: string;
    /**
     * The row's key in the transcript's list — what a slide finds it by
     * (Transcript's FLIP). Absent on a call inside a run, which moves with it.
     */
    rowKey?: string;
    motion?: Motion;
    /** Continues the rail above it: abut it, and paint the rail's body. */
    continues?: boolean;
    /** Leaving the tail: fold shut, then say so. */
    leaving?: boolean;
    /** The place this row took in the update that drew it. */
    handoff?: Handoff;
    onleft?: () => void;
    /**
     * The record the conversation was opened at (open-at.svelte.ts): `on`
     * while it is held, `off` as it fades once the reader has moved on.
     */
    marked?: "on" | "off";
    /** Hears the row's box as each frame lays it out (Transcript's `measureRow`): a row of the list. */
    measured?: Attachment<HTMLElement>;
    /** The row's height as the last frame laid it out, from what `measured` heard; none before any frame has. */
    heightOf?: (row: HTMLElement) => number | undefined;
    children: Snippet<[Ticket | null]>;
  } = $props();

  const ledger = useLedger();
  /**
   * The row's identity to the ledger, read once at mount. The entrance
   * reports back to the ledger when its animation finishes, which can be
   * after the row has unmounted; by then the prop is a value its parent no
   * longer keeps, so it is not read again.
   */
  const ledgerId = untrack(() => id);
  /** Taken at mount. See the component note. */
  const ticket = untrack(() =>
    ledgerId && ledger ? ledger.take(ledgerId) : null
  );
  const emerges = untrack(() => motion) === "emerge";
  /**
   * Where the entrance starts: its place in the burst, less however long the
   * arrival has already been playing on an earlier mount — a negative delay
   * resumes it mid-way instead of restarting it.
   */
  const lead =
    ticket?.kind === "arrive" && ticket.start !== null
      ? ticket.lead - ((document.timeline.currentTime as number) - ticket.start)
      : 0;
  let node = $state<HTMLElement>();
  /**
   * The height tween running on the row, if any, and the heights it runs
   * between: a fold takes over from where it has the row.
   */
  let growing: { animation: Animation; from: number; to: number } | null = null;

  /**
   * The list has drawn this row where it stands: virtua has measured it, so
   * its item is no longer hidden. From then on its item ignores virtua's
   * hiding and inherits the list's visibility (Transcript's `[data-drawn]`,
   * written on the item here: asked as `:has()` of the row, every node put
   * in anywhere under the row walked up and restyled its item, Chromium
   * copying that walk's flag to each inserted element and never resetting
   * it, has_invalidation_flags.h, style_engine.cc `ForInsertion`), so a
   * hidden page or pane above still hides it. virtua keeps sizes by index and
   * hides an item at an index it has no size for, so a row drawn long ago
   * that a row put in above moves down an index was hidden and shown again
   * in the same frame, as virtua measured it there. Visibility inherits, so
   * a streamed answer's 2,400 word spans were restyled twice for a change
   * no frame ever painted: the first time inside the pane's layout (it is a
   * size container), a 77ms frame each time a reply's reasoning landed
   * above its answer. Only a row's first measuring is virtua's to hide.
   *
   * What it waits for is virtua taking `visibility: hidden` off the item's
   * inline style, so that write is what it listens for. Asked again every
   * frame until then, a row virtua never measured (a pane out of view, a
   * list held hidden) asked for ever: seven such rows made every frame of
   * the page a main-thread frame, 435 callbacks a second at rest.
   */
  /** The item marked drawn: it stays marked for as long as this row lives. */
  let drawnOn: HTMLElement | null = null;
  $effect(() => () => drawnOn?.removeAttribute("data-drawn"));
  $effect(() => {
    const row = node;
    if (!(row && rowKey !== undefined)) {
      return;
    }
    let unlook: () => void = () => undefined;
    // Its item's style changed: looked at in the next frame's callbacks, as
    // the first look is.
    const styled = new MutationObserver(() => {
      unlook();
      unlook = nextFrame(look);
    });
    // Read in the frame's callbacks: an inline style, no layout.
    const look = (): void => {
      const item = row.parentElement;
      if (item?.style.visibility === "hidden") {
        styled.observe(item, { attributes: true, attributeFilter: ["style"] });
        return;
      }
      styled.disconnect();
      if (drawnOn !== item) {
        drawnOn?.removeAttribute("data-drawn");
        drawnOn = item;
      }
      item?.setAttribute("data-drawn", "");
    };
    unlook = nextFrame(look);
    return () => {
      unlook();
      styled.disconnect();
    };
  });

  /** The entrance has run: the ticket is spent. */
  function spent(): void {
    if (ledgerId) {
      ledger?.done(ledgerId);
    }
  }
  /** The entrance still owed: this mount plays it once. */
  let toDraw = ticket?.kind === "arrive";

  /**
   * What fades in once the place is open. A rail row's content is what
   * stands on its rail (its children), found through the single-child
   * wrappers a row can sit in (the live row's face); a rail row says so
   * (`data-tx-rail`), and a surface that draws its own frame (`data-frame`)
   * is the same. Anything else is the row.
   */
  function contentOf(row: HTMLElement): Element[] {
    const STANDS = "[data-tx-rail], [data-frame]";
    let element = row.firstElementChild;
    while (
      element &&
      !element.matches(STANDS) &&
      element.childElementCount === 1
    ) {
      element = element.firstElementChild;
    }
    if (element?.matches(STANDS)) {
      return [...element.children];
    }
    return row.firstElementChild ? [row.firstElementChild] : [];
  }

  interface Draw {
    /** Clipped to the height it has got to. */
    clip: boolean;
    /** Its content fades in once the place is open. */
    content: boolean;
    /** Starts after this long; negative resumes an arrival mid-way. */
    delay: number;
    /** The height the place opens from. */
    from: number;
    /** The duration token the place opens over. */
    over: "--dur-rail" | "--dur-control";
    /** The row's own height, as the frame laid it out (`onFirstLayout`). */
    own: number;
  }

  /** The row's place from `from` to `own`, its own height. */
  function open(
    row: HTMLElement,
    from: number,
    own: number,
    timing: KeyframeAnimationOptions,
    clip: boolean
  ): Animation | null {
    if (Math.abs(own - from) <= 0.5) {
      return null;
    }
    growing?.animation.cancel();
    row.style.overflow = clip ? "hidden" : "";
    const tween = row.animate(
      [{ blockSize: `${from}px` }, { blockSize: `${own}px` }],
      timing
    );
    growing = { animation: tween, from, to: own };
    const done = () => {
      if (growing?.animation === tween) {
        growing = null;
        row.style.overflow = "";
      }
    };
    tween.finished.then(done, done);
    return tween;
  }

  /**
   * Where the height tween running on the row has it now, read off its
   * clock and its two heights: no layout read. Null when none applies.
   */
  function grownTo(): number | null {
    const progress = growing?.animation.effect?.getComputedTiming().progress;
    if (!growing || progress === null || progress === undefined) {
      return null;
    }
    return growing.from + (growing.to - growing.from) * progress;
  }

  /**
   * The one arrival: the place opens, then the content fades up into it.
   * Resolves with the last of its animations, or null when nothing plays.
   */
  function draw(
    row: HTMLElement,
    { from, own, delay, content, clip, over }: Draw
  ): Animation | null {
    const easing = ease("--ease-out");
    const moving = motionOk.current;
    const opening = moving ? dur(over) : 0;
    const place = moving
      ? open(
          row,
          from,
          own,
          { duration: opening, easing, delay, fill: "backwards" },
          clip
        )
      : null;
    if (!content) {
      return place;
    }
    let last: Animation | null = null;
    const frames = moving
      ? [
          { opacity: 0, translate: "0 3px" },
          { opacity: 1, translate: "0 0" },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    // Held back until the place has opened; with nothing to open, at once.
    const after = place ? delay + opening : Math.max(delay, 0);
    for (const element of contentOf(row)) {
      last = element.animate(frames, {
        duration: dur(moving ? "--dur-menu" : "--dur-control"),
        easing,
        delay: moving ? after : 0,
        fill: "backwards",
      });
    }
    return last ?? place;
  }

  /**
   * The row this one took the place of, on top of the place and out of the
   * flow, fading as this one opens under it — inside this row, so the
   * opening's own clip holds it and it never reaches past the list's end.
   */
  function fadeGhost(row: HTMLElement, ghost: HTMLElement): void {
    const easing = ease("--ease-out");
    row.style.position = "relative";
    Object.assign(ghost.style, {
      position: "absolute",
      insetBlockStart: "0",
      insetInline: "0",
      margin: "0",
      pointerEvents: "none",
    });
    row.append(ghost);
    const gone = () => {
      ghost.remove();
      row.style.position = "";
    };
    ghost
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-exit"),
        easing,
        fill: "forwards",
      })
      .finished.then(gone, gone);
  }

  /**
   * It takes the place it was handed: no entrance of its own. A new row fades
   * in over that place once it has opened; a row that was already the object
   * on screen (a settled answer, a run taking its call in) only resizes.
   */
  function takePlace(row: HTMLElement, given: Handoff, own: number): void {
    const arrives = toDraw;
    toDraw = false;
    if (!ledger?.watched) {
      spent();
      return;
    }
    if (given.ghost && motionOk.current) {
      fadeGhost(row, given.ghost);
    }
    const played = draw(row, {
      from: given.from,
      own,
      delay: 0,
      content: arrives,
      clip: true,
      over: "--dur-rail",
    });
    if (!arrives) {
      return;
    }
    if (played) {
      played.finished.then(spent, spent);
    } else {
      spent();
    }
  }

  /** Its own entrance, from nothing. */
  function arrive(row: HTMLElement, own: number): void {
    toDraw = false;
    const played = draw(row, {
      from: 0,
      own,
      delay: lead,
      content: !emerges,
      clip: !emerges,
      over: emerges ? "--dur-control" : "--dur-rail",
    });
    if (played) {
      played.finished.then(spent, () => {
        /* taken down before it had run: a remount plays on from its ticket */
      });
    } else {
      spent();
    }
  }

  // Set going in the delivery of the frame that first lays the row out
  // (`onFirstLayout`), never in the update that drew it (a socket message's:
  // a height read there laid the transcript out inside it, once a row) nor
  // in the frame's callbacks (read there, it laid out what the update had
  // just written). The opening is written before that frame paints, so the
  // row is never drawn at its own height before its entrance holds it. A row
  // with nothing to play waits on nothing.
  $effect(() => {
    const row = node;
    const given = handoff;
    const handing = given && !given.taken ? given : null;
    if (!(row && (handing || toDraw))) {
      return;
    }
    return onFirstLayout(row, (own) =>
      untrack(() => {
        if (handing && !handing.taken) {
          handing.taken = true;
          takePlace(row, handing, own);
        } else if (toDraw) {
          arrive(row, own);
        }
      })
    );
  });

  $effect(() => {
    if (!(node && leaving)) {
      return;
    }
    const row = node;
    let fold: Animation | null = null;
    let standing = true;
    // Read as the fold starts, while this row is still the one it names: the
    // list can move under it before the fold ends (Transcript's `leaver`).
    const report = untrack(() => onleft);
    if (!untrack(() => motionOk.current && ledger?.watched)) {
      report?.();
      return;
    }
    const drawnAt = untrack(() => heightOf);
    // From where any tween still running has it (its clock), else the
    // height the last frame laid it out at (the list's size observer,
    // `heightOf`), the fold takes the row over, in the next frame's
    // callbacks. Read off the row there, its box laid out what the update
    // that let it go had just written (Row.svelte:413, a reply's frames). A
    // row no frame has laid out has nothing on screen to fold.
    const frame = requestAnimationFrame(() => {
      const height = grownTo() ?? drawnAt?.(row);
      if (height === undefined) {
        report?.();
        return;
      }
      growing?.animation.cancel();
      growing = null;
      row.style.overflow = "hidden";
      fold = row.animate(
        [
          { blockSize: `${height}px`, opacity: 1 },
          { blockSize: "0px", opacity: 0 },
        ],
        {
          duration: dur("--dur-panel"),
          easing: ease("--ease-out"),
          fill: "forwards",
        }
      );
      fold.finished.then(
        () => {
          if (standing) {
            report?.();
          }
        },
        () => {
          /* taken down before its fold finished: see the cleanup */
        }
      );
    });
    // A fold outlives nothing. The row taken down mid-fold — virtua dropping
    // the item, the tail changing under it — cancels it rather than letting
    // it finish on a detached element and report a row that no longer
    // exists; a row still leaving when it is drawn again folds again. One
    // that finished just before it was taken down has its report already
    // queued: `standing` answers that one.
    return () => {
      standing = false;
      cancelAnimationFrame(frame);
      fold?.cancel();
    };
  });
</script>

<!-- The row's box is its whole height, its content's margins inside it
     (flow-root): what is measured, handed on and tweened is what the list
     lays out, and clipping it for a tween changes nothing. Continuation is
     published, not reached for: rail blocks read --rail-head and --rail-gap
     wherever they sit (`var(--rail-head, var(--rail))`). A row marked is the
     record a conversation was opened at: the selection tint laid over the
     whole row, a well's step past its edges and on its radius, so a message
     in the reader's well and a line on the rail read the same. It fades in
     where it stands and out once the reader has moved on; with less motion
     it is simply there, then gone. The fade in is a keyframes animation on
     the tint (`--mark-in`), which runs as the tint is drawn. Not
     `@starting-style`: on the `::before` it ran nothing in iOS 27.2 Safari,
     the tint standing at full opacity on the first read, while the
     keyframes read 0.24, 0.76, 0.94 over the first 100ms (probe-kit
     ios-safari-motion, 2026-10-23). -->
<div
  data-slot="row"
  data-continues={continues || undefined}
  class="flow-root data-marked:relative data-marked:before:pointer-events-none data-marked:before:absolute data-marked:before:-inset-x-space-2 data-marked:before:inset-y-0 data-marked:before:rounded-well data-marked:before:bg-selection motion-safe:data-marked:before:animate-(--mark-in) marked-off:before:opacity-0 motion-safe:data-marked:before:transition-opacity motion-safe:data-marked:before:duration-(--dur-panel) motion-safe:data-marked:before:ease-out"
  data-marked={marked}
  data-row={rowKey}
  bind:this={node}
  {@attach measured}
  style:--mark-in={marked
    ? "kit-fade-in var(--dur-panel) var(--ease-out)"
    : undefined}
  style:--rail-head={continues ? "var(--rail-body)" : undefined}
  style:--rail-gap={continues ? "0" : undefined}
>
  {@render children(ticket)}
</div>
