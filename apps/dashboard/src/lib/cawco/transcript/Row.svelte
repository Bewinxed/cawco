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
  import { dur, ease, motionOk } from "$lib/cawco/motion/curves.svelte";
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
  /** The height tween running on the row, if any: a fold takes over from it. */
  let growing: Animation | null = null;

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
   * wrappers a row can sit in (the live row's face); a surface that draws
   * its own frame (`data-frame`) is the same. Anything else is the row.
   */
  function contentOf(row: HTMLElement): Element[] {
    let element = row.firstElementChild;
    while (
      element &&
      !(
        element.classList.contains("rail-row") ||
        element.hasAttribute("data-frame")
      ) &&
      element.childElementCount === 1
    ) {
      element = element.firstElementChild;
    }
    if (
      element &&
      (element.classList.contains("rail-row") ||
        element.hasAttribute("data-frame"))
    ) {
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
  }

  /** The row's place from `from` to its own height. */
  function open(
    row: HTMLElement,
    from: number,
    timing: KeyframeAnimationOptions,
    clip: boolean
  ): Animation | null {
    const own = row.getBoundingClientRect().height;
    if (Math.abs(own - from) <= 0.5) {
      return null;
    }
    growing?.cancel();
    row.style.overflow = clip ? "hidden" : "";
    const tween = row.animate(
      [{ blockSize: `${from}px` }, { blockSize: `${own}px` }],
      timing
    );
    growing = tween;
    const done = () => {
      if (growing === tween) {
        growing = null;
        row.style.overflow = "";
      }
    };
    tween.finished.then(done, done);
    return tween;
  }

  /**
   * The one arrival: the place opens, then the content fades up into it.
   * Resolves with the last of its animations, or null when nothing plays.
   */
  function draw(
    row: HTMLElement,
    { from, delay, content, clip, over }: Draw
  ): Animation | null {
    const easing = ease("--ease-out");
    const moving = motionOk.current;
    const opening = moving ? dur(over) : 0;
    const place = moving
      ? open(
          row,
          from,
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
  function takePlace(row: HTMLElement, given: Handoff): void {
    given.taken = true;
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
  function arrive(row: HTMLElement): void {
    toDraw = false;
    const played = draw(row, {
      from: 0,
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

  // Measured and set going in the next frame's callbacks, never in the
  // update that drew the row: that update is a socket message's, and a
  // height read there laid out (and restyled) the transcript inside it, once
  // a row. The callbacks run before that frame's layout and paint, so the row
  // is never drawn at its own height before its entrance holds it.
  $effect(() => {
    const row = node;
    const given = handoff;
    if (!row) {
      return;
    }
    const frame = requestAnimationFrame(() =>
      untrack(() => {
        if (given && !given.taken) {
          takePlace(row, given);
        } else if (toDraw) {
          arrive(row);
        }
      })
    );
    return () => cancelAnimationFrame(frame);
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
    // Measured where any tween still running has it, then the fold takes
    // the row over from there: in the next frame's callbacks, as the
    // entrance above is.
    const frame = requestAnimationFrame(() => {
      const { height } = row.getBoundingClientRect();
      growing?.cancel();
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

<div class="row" data-row={rowKey} bind:this={node} class:continues={continues}>
  {@render children(ticket)}
</div>

<style>
  .row {
    /* The row's box is its whole height, its content's margins inside it:
       what is measured, handed on and tweened is what the list lays out, and
       clipping it for a tween changes nothing. */
    display: flow-root;

    /* Continuation is published, not reached for: rail blocks read these
       wherever they sit (`var(--rail-head, var(--rail))`). */
    &.continues {
      --rail-head: var(--rail-body);
      --rail-gap: 0px;
    }
  }
</style>
