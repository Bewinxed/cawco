<script lang="ts">
  /**
   * The rail's session card: resting the pointer on a session row (Working,
   * Finished, a project's sessions) opens the delegate tray's panel
   * (HoverPanel) beside the rail, level with the row, with what the row
   * cannot show: the session's live tail, and the question it is waiting on
   * or why it failed. Moving to the next row glides the one card there.
   *
   * Rows opt in with `data-hover-session="<instance id>"`. The tray's
   * timings: it opens after a 350ms rest, and closes 300ms after the
   * pointer leaves both the row and the card, so crossing the 4px gap to
   * the card (bridged) keeps it. A fine pointer only; touch has no hover.
   *
   * The card is portalled to the body: the rail isolates its stacking
   * (its highlight, components/ui/highlight), so a card drawn inside it
   * would paint under the panes.
   */
  import { Portal } from "bits-ui";
  import { cawco, readTranscript } from "./client.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import SessionCard, { readThreadCard, tailOf } from "./SessionCard.svelte";
  import { threadIdOf } from "./thread-tabs";

  /** The rail whose session rows open the card. */
  let { within }: { within: HTMLElement | undefined } = $props();

  const OPEN_AFTER = 350;
  const CLOSE_AFTER = 300;

  let openId = $state<string | null>(null);
  let gliding = $state(false);
  let place = $state({ x: 0, y: 0, origin: 0 });
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;

  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

  /**
   * The row the pointer is on starts reading its tail now, while the open
   * delay runs, so the card mostly opens (or glides) onto a tail already in.
   */
  let fetched: string | null = null;
  function prefetch(id: string): void {
    if (id === fetched) {
      return;
    }
    fetched = id;
    const threadId = threadIdOf(id);
    if (threadId) {
      readThreadCard(threadId);
      return;
    }
    if (!cawco.session(id)?.messages.length) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the card draws whatever has arrived.
      void readTranscript(id);
    }
  }

  /** The row the open card stands beside. */
  let anchor: HTMLElement | null = null;

  function stand(row: HTMLElement): void {
    const box = row.getBoundingClientRect();
    const rail = within?.getBoundingClientRect();
    place = {
      x: Math.round((rail?.right ?? box.right) + 4),
      y: Math.round(box.top),
      origin: Math.round(box.height / 2),
    };
  }
  function open(row: HTMLElement, id: string): void {
    gliding = openId !== null && openId !== id;
    anchor = row;
    stand(row);
    openId = id;
  }
  function close(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    openId = null;
    anchor = null;
    gliding = false;
  }
  function hold(): void {
    clearTimeout(closing);
  }
  function release(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    closing = setTimeout(close, CLOSE_AFTER);
  }

  $effect(() => {
    const root = within;
    if (!root) {
      return;
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !fine()) {
        return;
      }
      const row = (event.target as Element).closest<HTMLElement>(
        "[data-hover-session]"
      );
      const id = row?.dataset.hoverSession;
      if (!(row && id)) {
        if (openId) {
          release();
        } else {
          clearTimeout(dwell);
        }
        return;
      }
      if (id === openId) {
        hold();
        // A session listed twice (Working, and under its project): the card
        // glides to whichever of its rows the pointer is on.
        if (row !== anchor) {
          gliding = true;
          anchor = row;
          stand(row);
        }
        return;
      }
      prefetch(id);
      clearTimeout(dwell);
      hold();
      if (openId) {
        open(row, id);
      } else {
        dwell = setTimeout(() => open(row, id), OPEN_AFTER);
      }
    };
    const leave = () => release();
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerleave", leave);
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerleave", leave);
      clearTimeout(dwell);
      clearTimeout(closing);
    };
  });

  /**
   * The open card keeps to its row as the rail's list scrolls under a
   * resting pointer, a frame at a time and with no glide. A row scrolled out
   * of the list's box closes it, the way the pointer leaving does. Scroll
   * does not bubble, so the one listener captures on the rail.
   */
  const isOpen = $derived(openId !== null);
  $effect(() => {
    const root = within;
    if (!(root && isOpen)) {
      return;
    }
    let frame = 0;
    let gone = false;
    const follow = (event: Event) => {
      const scroller = event.target;
      if (frame || !(scroller instanceof Element)) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const row = anchor;
        if (!row || (row.isConnected && !scroller.contains(row))) {
          return;
        }
        const box = row.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        const out =
          !row.isConnected || box.bottom <= view.top || box.top >= view.bottom;
        if (out) {
          if (!gone) {
            release();
          }
        } else {
          gliding = false;
          stand(row);
        }
        gone = out;
      });
    };
    root.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", follow, { capture: true });
      cancelAnimationFrame(frame);
    };
  });
</script>

<Portal>
  <HoverPanel
    aria-hidden="true"
    {gliding}
    key={openId}
    onpointerenter={hold}
    onpointerleave={release}
    side="right"
    style="--x: {place.x}px; --y: {place.y}px; --origin: {place.origin}px; --room: var(--c-session-hover-room)"
    watch={tailOf(openId)}
  >
    {#snippet children(id)}
      <SessionCard {id} />
    {/snippet}
  </HoverPanel>
</Portal>
