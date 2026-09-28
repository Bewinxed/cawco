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
   * The motions, all on the root tokens and all opt-in:
   *
   *   rise    a turn, a note, a card: fades up 6px over --dur-panel, --ease-out.
   *   settle  a card that asks for the reader: the prompt's own settle, 8px
   *           over two --dur-control.
   *   open    a tool call: its content fades in, so a run's rail grows one
   *           call at a time.
   *
   *   emerge  the reader's own message, sent from this tab: no entrance of
   *           the row's own. Its turn is the composer's text landing
   *           (motion/share.svelte.ts, from MessageRow).
   *
   * Each of them opens the row's place too: from nothing to its measured
   * height over --dur-panel, so the rows above make room on one clock
   * instead of jumping by the row's height in the frame it lands. The
   * transcript pins its bottom to the opening edge for exactly as long as it
   * runs. The reader's own message opens on the composer's clock instead
   * (--dur-control, --ease-out: the field's own collapse), because the room
   * it takes is the room the composer gives back in the same moment — drawn
   * whole at once, it lifted every row above by its height and the collapse
   * dropped them straight back, 115px up and 82px down on a three-line send.
   * It opens unclipped: its words are in flight from the composer into it.
   *
   * A row leaving the list (the turn's indicator, a finished tool's glance, a
   * replaced send) folds shut where it stands instead of vanishing, over
   * --dur-panel on --ease-out. A row that takes another's place in the update
   * that draws it (`handoff`: the indicator giving way to the tool it
   * announced, the live row settling, a glance landing in its run) starts at
   * the height it took over and tweens to its own, one height on one clock, so
   * nothing above it moves in a jump.
   *
   * Every height here is a measured `block-size` animated on the row itself,
   * never a grid track: WebKit sized a `0fr → 1fr` track off a stale
   * measurement, opened a tool's line to 5px of its 40 and snapped the rest
   * in one frame at the end.
   */
  import { type Snippet, untrack } from "svelte";
  import { dur, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import {
    type Handoff,
    type Motion,
    type Ticket,
    useLedger,
  } from "./arrivals.svelte";

  let {
    id,
    rowKey,
    motion = "rise",
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
  /** Taken at mount. See the component note. */
  const ticket = untrack(() => (id && ledger ? ledger.take(id) : null));
  const opens = untrack(() => motion) === "open";
  /**
   * Until its entrance has run. A reasoning block folding shut, or an answer
   * settling, is a row already on screen: it does not arrive. An opening is
   * played from here (`open`), not by a class.
   */
  let arriving = $state(ticket?.kind === "arrive" && !opens);
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
  const emerges = untrack(() => motion) === "emerge";
  /** The height tween running on the row, if any: a fold takes over from it. */
  let growing: Animation | null = null;

  /** The entrance has run — or will not, without motion: the ticket is spent. */
  function spent(): void {
    arriving = false;
    if (id) {
      ledger?.done(id);
    }
  }
  /** The opening of the row's place still owed: this mount plays it once. */
  let toOpen = ticket?.kind === "arrive" && motionOk.current;
  // The reader's own message plays no entrance: its content lands the
  // composer's text (motion/share.svelte.ts).
  if (ticket?.kind === "arrive" && (!motionOk.current || emerges)) {
    spent();
  }

  interface Growth {
    /** Clipped to the height it has got to. */
    clip: boolean;
    /** Starts after this long; negative resumes an arrival mid-way. */
    delay: number;
    /** Its content fades in with it. */
    fade: boolean;
    /** The duration token it runs over. */
    over: "--dur-panel" | "--dur-control";
  }
  const PLACE: Growth = {
    delay: 0,
    fade: false,
    clip: true,
    over: "--dur-panel",
  };

  /**
   * The row from `from` to its own height: the one height motion every
   * opening and every handoff plays.
   */
  function grow(
    row: HTMLElement,
    from: number,
    { delay, fade, clip, over }: Growth
  ): Animation | null {
    const own = row.getBoundingClientRect().height;
    const timing: KeyframeAnimationOptions = {
      duration: dur(over),
      easing: getComputedStyle(row).getPropertyValue("--ease-out"),
      delay,
      fill: "backwards",
    };
    const fading = fade
      ? row.animate([{ opacity: 0 }, { opacity: 1 }], timing)
      : null;
    if (Math.abs(own - from) <= 0.5) {
      return fading;
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

  $effect(() => {
    const row = node;
    const given = handoff;
    if (!row) {
      return;
    }
    untrack(() => {
      if (given && !given.taken) {
        // It takes the place it was handed: no entrance of its own. A new row
        // fades in over that place; a row that was already the object on
        // screen (a settled answer, a run taking its call in) only resizes.
        given.taken = true;
        toOpen = false;
        const fade = ticket?.kind === "arrive";
        if (fade) {
          spent();
        }
        if (motionOk.current && ledger?.watched) {
          grow(row, given.from, { ...PLACE, fade });
        }
        return;
      }
      if (toOpen) {
        // A rise or a settle fades by its own keyframes over the place
        // opening, a call's line fades with it, and the reader's own words
        // are flying in from the composer (see the component note).
        toOpen = false;
        grow(row, 0, {
          delay: lead,
          fade: opens,
          clip: !emerges,
          over: emerges ? "--dur-control" : "--dur-panel",
        })?.finished.then(spent, () => {
          /* taken down before it opened: a remount plays on from its ticket */
        });
      }
    });
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
    untrack(() => {
      if (!(motionOk.current && ledger?.watched)) {
        report?.();
        return;
      }
      // Measured where any tween still running has it, then the fold takes
      // the row over from there.
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
          easing: getComputedStyle(row).getPropertyValue("--ease-out"),
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
      fold?.cancel();
    };
  });
</script>

<div
  class="row {motion}"
  data-row={rowKey}
  onanimationend={(event) => {
  if (event.target === node) {
    spent();
  }
}}
  bind:this={node}
  style:--lead="{lead}ms"
  class:arriving={arriving}
  class:continues={continues}
>
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

    @media (prefers-reduced-motion: no-preference) {
      &.arriving.rise {
        animation: row-rise var(--dur-panel) var(--ease-out) var(--lead)
          backwards;
      }
      &.arriving.settle {
        animation: row-settle calc(var(--dur-control) * 2) var(--ease-out)
          var(--lead) backwards;
      }
    }
  }

  @keyframes row-rise {
    from {
      opacity: 0;
      translate: 0 6px;
    }
  }
  @keyframes row-settle {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
</style>
