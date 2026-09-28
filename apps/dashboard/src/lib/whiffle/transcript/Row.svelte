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
   *           Nothing else moves — the row's height is there at once, and the
   *           transcript's follow carries the viewport onto it.
   *   settle  a card that asks for the reader: the prompt's own settle, 8px
   *           over two --dur-control.
   *   open    a tool call: its line opens (grid rows 0fr → 1fr) over
   *           --dur-panel while its content fades in, so a run's rail grows
   *           one call at a time. The transcript pins its bottom to the
   *           opening edge for exactly as long as it runs.
   *   emerge  the reader's own message, sent from this tab: no entrance of
   *           the row's own. Its turn is the composer's text landing
   *           (motion/share.svelte.ts, from MessageRow and Queued).
   *
   * A row leaving the tail (the turn's indicator, a finished tool's glance)
   * folds shut over --dur-exit instead of vanishing, so the tail never jumps.
   */
  import { type Snippet, untrack } from "svelte";
  import { dur, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import { type Motion, type Ticket, useLedger } from "./arrivals.svelte";

  let {
    id,
    motion = "rise",
    continues = false,
    leaving = false,
    onleft,
    children,
  }: {
    /**
     * What this row is to the ledger. Absent for a row that never arrives as a
     * whole — a run of tool calls, whose calls arrive one by one.
     */
    id?: string;
    motion?: Motion;
    /** Continues the rail above it: abut it, and paint the rail's body. */
    continues?: boolean;
    /** Leaving the tail: fold shut, then say so. */
    leaving?: boolean;
    onleft?: () => void;
    children: Snippet<[Ticket | null]>;
  } = $props();

  const ledger = useLedger();
  /** Taken at mount. See the component note. */
  const ticket = untrack(() => (id && ledger ? ledger.take(id) : null));
  /**
   * Until its entrance has run. A reasoning block folding shut, or an answer
   * settling, is a row already on screen: it does not arrive.
   */
  let arriving = $state(ticket?.kind === "arrive");
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

  /** The entrance has run — or will not, without motion: the ticket is spent. */
  function spent(): void {
    arriving = false;
    if (id) {
      ledger?.done(id);
    }
  }
  // The reader's own message plays no entrance: its content lands the
  // composer's text (motion/share.svelte.ts).
  if (
    ticket?.kind === "arrive" &&
    (!motionOk.current || untrack(() => motion) === "emerge")
  ) {
    spent();
  }

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
      const style = getComputedStyle(row);
      row.style.overflow = "hidden";
      fold = row.animate(
        [
          {
            blockSize: `${row.getBoundingClientRect().height}px`,
            opacity: 1,
          },
          { blockSize: "0px", opacity: 0 },
        ],
        {
          duration: dur("--dur-exit"),
          easing: style.getPropertyValue("--ease-out"),
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
  {#if motion === 'open'}
    <div class="inner">{@render children(ticket)}</div>
  {:else}
    {@render children(ticket)}
  {/if}
</div>

<style>
  .row {
    /* Continuation is published, not reached for: rail blocks read these
       wherever they sit (`var(--rail-head, var(--rail))`). */
    &.continues {
      --rail-head: var(--rail-body);
      --rail-gap: 0px;
    }

    &.open {
      display: grid;
      grid-template-rows: 1fr;

      > .inner {
        min-block-size: 0;
      }
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
      &.arriving.open {
        animation: row-open var(--dur-panel) var(--ease-out) var(--lead)
          backwards;

        > .inner {
          overflow: hidden;
          animation: row-fade var(--dur-panel) var(--ease-out) var(--lead)
            backwards;
        }
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
  @keyframes row-open {
    from {
      grid-template-rows: 0fr;
    }
  }
  @keyframes row-fade {
    from {
      opacity: 0;
    }
  }
</style>
