<script lang="ts">
  /**
   * The segmented control's track. Two overlays travel under the items —
   * the active segment and the focus ring — positioned from measurements,
   * which is what lets one element slide between tabs rather than each tab
   * drawing its own. The hover layer is the kit's ghost (components/ui/
   * highlight), the same one every list in the app has, placed from the
   * same measurements, so it follows the tabs when they move under a
   * pointer that stays still.
   *
   * `scrollable` lets a track that overflows scroll sideways: the chosen
   * item is kept in view and a wheel over the track, which has no vertical
   * travel to spend it on, moves it along.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn } from "#lib/utils.js";
  import { provideList, TabsListState, useTabs } from "./context.svelte";
  import { TabRects } from "./rects.svelte";

  let {
    class: className,
    scrollable = false,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    scrollable?: boolean;
    children: Snippet;
  } = $props();

  const tabs = useTabs();
  const rects = new TabRects((order) => tabs.setOrder(order));
  const list = new TabsListState(rects);
  provideList(list);

  const selectedIndex = $derived(
    tabs.value === undefined ? -1 : tabs.order.indexOf(tabs.value)
  );
  $effect.pre(() => {
    list.optimisticIndex = selectedIndex >= 0 ? selectedIndex : null;
  });

  // Which way the last switch went: a folder tab's sheet wipes in from the
  // side facing the tab it came from, and the old one out toward it.
  let direction = $state<"forward" | "back">("forward");
  let lastIndex: number | null = null;
  /**
   * A switch past a neighbour. The two wipes would play at either end of
   * the row with bare tabs between them, so instead the chosen sheet is
   * shown whole at once and slides over from the tab it left, on the same
   * --wipe and curve. Set before the tabs re-render, so the masks skip
   * their transition in the same frame the choice moves.
   */
  let leap = $state<{ from: number; to: number } | null>(null);
  $effect.pre(() => {
    const index = list.optimisticIndex;
    if (index !== null && lastIndex !== null && index !== lastIndex) {
      direction = index > lastIndex ? "forward" : "back";
      leap =
        Math.abs(index - lastIndex) > 1 ? { from: lastIndex, to: index } : null;
    }
    lastIndex = index;
  });
  // Measured and started in the next frame's callbacks, never in the task
  // that made the switch (reading layout there lays the page out mid-task).
  // The callbacks run before that frame's style, so the slide is already
  // under way in the first frame the new choice paints.
  $effect(() => {
    const jump = leap;
    const track = node;
    if (!(jump && track && motionOk.current)) {
      return;
    }
    let slide: Animation | undefined;
    const frame = requestAnimationFrame(() => {
      const tab = (i: number) =>
        track.querySelector<HTMLElement>(`[data-tab-index="${i}"]`);
      const from = tab(jump.from);
      const to = tab(jump.to);
      if (!(from && to)) {
        return;
      }
      const dx =
        from.getBoundingClientRect().left - to.getBoundingClientRect().left;
      slide = to.animate(
        [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
        {
          duration: dur("--dur-pop"),
          easing: ease("--ease-drawer"),
          pseudoElement: "::after",
        }
      );
      slide.finished.then(
        () => {
          if (leap === jump) {
            leap = null;
          }
        },
        () => {
          /* a newer switch cancelled it and owns `leap` now */
        }
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      slide?.cancel();
    };
  });

  /**
   * A gesture carrying the indicator (the root's `travel`), and two frames
   * past it: the folder sheets it drew are handed back to their resting
   * rules with transitions still off, so the hand-back starts none. One
   * frame is not enough — a frame's callbacks run before its style, so the
   * attribute would go in the same style pass as the carried sheets.
   */
  let ride = $state(false);
  $effect(() => {
    if (tabs.travel) {
      ride = true;
      return;
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        ride = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * Folder tabs overlap like a drawer of real folders (owner: "spacing
   * between inactive tabs should overlap a bit just like actual folder
   * tabs"), so which one is drawn over which is a choice: the chosen tab on
   * top, then each tab above the ones farther from it, so every edge tucks
   * behind its neighbour toward the chosen tab. With none chosen the first
   * is on top. Each tab is its own stack, ranked here on the item the track
   * lays out (a host may wrap the tab), and the focus ring rides above them
   * all. A tap on an overlap goes to the tab drawn there.
   */
  $effect(() => {
    const track = node;
    const { items } = rects;
    const chosen = list.optimisticIndex ?? -1;
    if (!track?.closest('[data-variant="folder"]')) {
      return;
    }
    const top = items.length + 1;
    items.forEach((item, i) => {
      let laid: HTMLElement = item;
      while (laid.parentElement && laid.parentElement !== track) {
        laid = laid.parentElement;
      }
      laid.style.zIndex = String(
        i === chosen ? top : items.length - Math.abs(i - Math.max(chosen, 0))
      );
    });
    track.style.setProperty("--stack-top", String(top + 1));
  });

  const selectedRect = $derived(rects.at(list.optimisticIndex));
  const focusRect = $derived(rects.at(list.focusedIndex));

  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  /**
   * The segment part-way to another item, when a gesture is driving it: the
   * chosen box and the target's, mixed by the fraction. Undefined at rest,
   * or while the target has no box yet.
   */
  const travelRect = $derived.by(() => {
    const { travel } = tabs;
    const from = selectedRect;
    const to = travel && rects.at(tabs.order.indexOf(travel.toward));
    if (!(from && to)) {
      return;
    }
    const f = Math.min(1, Math.max(0, travel.fraction));
    return {
      left: lerp(from.left, to.left, f),
      top: lerp(from.top, to.top, f),
      width: lerp(from.width, to.width, f),
      height: lerp(from.height, to.height, f),
    };
  });
  const segmentRect = $derived(travelRect ?? selectedRect);

  let node = $state<HTMLElement | undefined>();

  function onfocusin(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLElement>("[data-tab-index]");
    if (!trigger) {
      return;
    }
    list.focusedIndex = target.matches(":focus-visible")
      ? Number(trigger.dataset.tabIndex)
      : null;
  }
  function onfocusout(event: FocusEvent): void {
    if (
      event.relatedTarget instanceof Node &&
      node?.contains(event.relatedTarget)
    ) {
      return;
    }
    list.focusedIndex = null;
  }

  /** Arrow keys move AND choose — Base UI's `activateOnFocus`. */
  function onkeydown(event: KeyboardEvent): void {
    const keys: Record<string, number | "start" | "end"> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: "start",
      End: "end",
    };
    const step = keys[event.key];
    if (step === undefined || !node) {
      return;
    }
    // The tabs in the order (`rects.items`), which a leaving tab has left.
    const items = rects.items.flatMap(
      (item) => item.querySelector<HTMLElement>(":scope > .hit") ?? []
    );
    if (items.length === 0) {
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    let to = (at + (step as number) + items.length) % items.length;
    if (step === "start") {
      to = 0;
    } else if (step === "end") {
      to = items.length - 1;
    }
    event.preventDefault();
    items[to].focus();
    items[to].click();
  }

  // Keep the chosen item in view — or, mid-gesture, the segment on its way
  // to the next one. The rect, not the element: it is re-read as items
  // resize, so the scroll lands on where the item ends up. The scroll is
  // read and written in the next frame's callbacks, never in the task that
  // moved the choice: reading it there lays the page out mid-task, and a
  // swipe's release paid 30ms for it. The callbacks run before that frame's
  // layout, so it paints already scrolled.
  //
  // Every tab's box is read here, not only the chosen one's: a tab beside it
  // settling to its width (a title arriving) moves where a whole leading
  // tab starts, and the scroll is placed again for it.
  $effect(() => {
    const rect = segmentRect;
    const boxes = [...rects.rects.values()];
    const { width } = rects.viewport;
    const track = node;
    const room = endRoom;
    if (!(scrollable && track && room && rect && width > 0)) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      // An instant write, not a smooth one: a smooth scroll is an animation
      // the browser abandons when the track's content changes under it, and
      // the segment sliding into place is the motion here.
      const at = track.scrollLeft;
      const to = inView(at, rect, boxes, width);
      // The end room is what the track lacks to reach `to`: written before
      // the scroll, which is clamped to the track's width as laid out.
      const max = track.scrollWidth - track.clientWidth - room.offsetWidth;
      room.style.inlineSize = `${Math.max(0, Math.ceil(to - max))}px`;
      if (Math.abs(to - at) > 0.5) {
        stopGlide();
        track.scrollLeft = to;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * Where the track stands: the chosen item whole in view, and the leading
   * edge on no item's middle (a tab cut at the left edge reads as a broken
   * tab, not as more to scroll to). Any tab's start from where the chosen
   * one's end comes into view to the chosen one's own start qualifies, the
   * nearest to where the track stands now, so a track already showing the
   * chosen item over a whole leading edge stays put. Past the last tab the
   * track gets the room it needs (`endRoom`): a strip ending in empty room,
   * as a browser's does, rather than starting on a sliver of a tab.
   */
  function inView(
    at: number,
    chosen: { left: number; width: number },
    boxes: readonly { left: number; width: number }[],
    width: number
  ): number {
    const pad = 8;
    const lo = Math.max(0, chosen.left + chosen.width + pad - width);
    const whole = (s: number) =>
      !boxes.some(
        (box) => box.left < s - 0.5 && box.left + box.width > s + 0.5
      );
    const [nearest] = [at, 0, ...boxes.map((box) => box.left)]
      .filter((s) => s >= lo - 0.5 && s <= chosen.left + 0.5 && whole(s))
      .sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    return nearest ?? Math.min(lo, chosen.left);
  }

  /** The room after the last tab that lets the leading edge reach a whole tab. */
  let endRoom = $state<HTMLElement | undefined>();

  /**
   * A vertical wheel over the track moves it sideways on a spring: each
   * notch pushes the target along and the track glides after it, carrying
   * its speed into the next notch, instead of jumping 100px a click.
   * Critically damped at the app's 0.3s response, so it lands without
   * overshoot. A sideways trackpad swipe is the browser's own scroll and
   * is left alone.
   */
  const GLIDE = 0.3;
  const STIFFNESS = ((2 * Math.PI) / GLIDE) ** 2;
  const DAMPING = (4 * Math.PI) / GLIDE;
  let stopGlide = () => {
    /* replaced once the track is mounted */
  };

  function sideways(el: HTMLElement) {
    let target = 0;
    let at = 0;
    let velocity = 0;
    let frame: number | null = null;
    let last = 0;

    const stop = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };
    stopGlide = stop;

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      velocity += (STIFFNESS * (target - at) - DAMPING * velocity) * dt;
      at += velocity * dt;
      if (Math.abs(target - at) < 0.5 && Math.abs(velocity) < 10) {
        el.scrollLeft = target;
        frame = null;
        return;
      }
      el.scrollLeft = at;
      frame = requestAnimationFrame(step);
    };

    const onwheel = (event: WheelEvent) => {
      if (event.deltaX !== 0 || el.scrollWidth <= el.clientWidth) {
        stop();
        return;
      }
      event.preventDefault();
      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        delta *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        delta *= el.clientWidth;
      }
      if (!motionOk.current) {
        el.scrollLeft += delta;
        return;
      }
      if (frame === null) {
        at = el.scrollLeft;
        target = at;
        velocity = 0;
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
      const max = el.scrollWidth - el.clientWidth;
      target = Math.max(0, Math.min(max, target + delta));
    };
    el.addEventListener("wheel", onwheel, { passive: false });
    return {
      destroy() {
        stop();
        el.removeEventListener("wheel", onwheel);
      },
    };
  }

  const px = (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) =>
    `transform:translate(${rect.left}px,${rect.top}px);width:${rect.width}px;height:${rect.height}px`;
</script>

<div
  class={cn(
    "ff-tabs-list",
    scrollable && "scrollable kit-edge-fade",
    className
  )}
  data-direction={direction}
  data-leap={leap ? "" : undefined}
  data-ride={ride ? "" : undefined}
  {onfocusin}
  {onfocusout}
  {onkeydown}
  role="tablist"
  bind:this={node}
  use:rects.container
  use:sideways
  {@attach highlight({
    rows: ".ff-tab",
    axis: "x",
    covered: ".ff-tab.selected",
    laidOut: () => rects.rects,
  })}
  {...rest}
>
  {#if selectedRect}
    <div
      aria-hidden="true"
      class="segment"
      style={px(segmentRect ?? selectedRect)}
      class:travelling={travelRect !== undefined}
    ></div>
  {/if}
  {#if focusRect}
    <div aria-hidden="true" class="ring" style={px(focusRect)}></div>
  {/if}
  {@render children()}
  {#if scrollable}
    <span aria-hidden="true" class="end-room" bind:this={endRoom}></span>
  {/if}
</div>

<style>
  /* The size ladder: the pad and the item add up to the control height —
     36px by default, 28px compact — so the control lines up with the
     buttons, selects and inputs beside it. `--shape` is the corner the
     overlays and items share; `--sheet` is the chosen segment's surface. */
  .ff-tabs-list {
    --pad: 4px;
    --item: 28px;
    --gap: 2px;
    --px: 12px;
    --icon: 16px;
    --text: var(--text-label);
    --radius: var(--radius-sm);
    --shape: calc(var(--radius) - var(--pad));
    --sheet: var(--surface-raised);
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: var(--gap);
    padding: var(--pad);
    border-radius: var(--radius);
    background: var(--muted);
    user-select: none;
    -webkit-user-select: none;

    /* A finger needs more room than a pointer: one step up the ladder on
       a coarse pointer — a 40px control — its shape unchanged. */
    @media (pointer: coarse) {
      --item: 32px;
    }

    /* A scrolling track hugs its items and gives way — never grows —
       when the row it sits in is narrower than they are. */
    /* Where tabs run past an edge, that edge fades them out (app.css
       .kit-edge-fade, on the track). */
    &.scrollable {
      flex: 0 1 auto;
      min-inline-size: 0;
      max-inline-size: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }
  }
  /* A track that scrolls keeps every tab at its own width and scrolls past
     the edge (its fades say there is more), never squeezing a tab toward an
     ellipsis to fit: a tab's own cap is what ends a long title. */
  .ff-tabs-list.scrollable > :global(.ff-tab) {
    flex-shrink: 0;
  }
  :global([data-size="compact"]) .ff-tabs-list {
    --pad: 2px;
    --item: 24px;
    --px: 10px;
    --icon: 16px;
    --text: var(--text-label);
    --radius: var(--radius-xs);

    /* Its own step up (24 → 28): this rule outranks the bare class, so
       the ladder above would not move it. */
    @media (pointer: coarse) {
      --item: 28px;
    }
  }

  /* Folder tabs: no well. The items stand on the row's shelf — the row
     draws that hairline along its own bottom edge — and the chosen one
     is a sheet with a rounded top and no bottom, in the surface of what
     lies below, so it opens into it. */
  :global([data-variant="folder"]) .ff-tabs-list {
    --shape: var(--radius) var(--radius) 0 0;
    /* The chosen sheet flares outward at its foot into the page below;
       the track keeps that much room at each end so a scrolling track
       does not clip the first or last flare. */
    --flare: var(--radius);
    /* Neighbouring tabs overlap by the flare: a tucked edge lies exactly
       under the chosen sheet's foot, and the gap between tabs is gone. The
       track's leading pad takes the first tab's overlap back. */
    --overlap: var(--flare);
    gap: 0;
    padding-inline: calc(var(--flare) + var(--overlap)) var(--flare);
    padding-block-end: 0;
    border-radius: 0;
    background: none;
    /* The app's own curve and the tab details' morph length, so the sheet
       and the popover that follows it move as one. */
    --wipe: var(--dur-pop);
    --wipe-ease: var(--ease-drawer);
    --wipe-in: left;
    --wipe-out: right;

    &[data-direction="back"] {
      --wipe-in: right;
      --wipe-out: left;
    }
  }

  /* Each folder tab, or the host's box round it, steps back over its
     leading neighbour by the overlap and stands in its own stack, ranked
     from the chosen tab by the script. */
  :global([data-variant="folder"])
    .ff-tabs-list
    > :global(:not(.segment, .ring, .kit-ghost, .end-room)) {
    position: relative;
    margin-inline-start: calc(-1 * var(--overlap));
  }

  /* The room after the last tab (`endRoom`): none at rest, its gap taken
     back, so it changes nothing until the scroll needs it. */
  .end-room {
    flex: none;
    align-self: stretch;
    inline-size: 0;
    margin-inline-start: calc(-1 * var(--gap));
    pointer-events: none;
  }
  /* Placed by `transform`, not `left`/`top`: moving between tabs is then a
     compositor-only translate. Only the width change lays out, and it lays
     out one empty absolutely-positioned box. */
  .segment,
  .ring {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    pointer-events: none;
    border-radius: var(--shape);
  }
  /* The active segment: raised, at the moderate tier — critically
     damped, lands without overshoot. Steps back a little while another
     tab is under the hover ghost, so the ghost reads as the thing about
     to take over. */
  .segment {
    z-index: 1;
    background: var(--sheet);
    box-shadow: var(--shadow-tile);

    @media (hover: hover) {
      .ff-tabs-list:has(:global(.ff-tab[data-ghosted]:not(.selected))) > & {
        opacity: 0.85;
      }
    }
    /* Under a hand, or riding a settle read off its clock each frame: the
       position is the motion, and an easing on top would lag the finger. */
    &.travelling {
      transition: none;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform var(--dur-toggle) var(--ease-out),
        width var(--dur-toggle) var(--ease-out),
        height var(--dur-toggle) var(--ease-out),
        opacity var(--dur-ghost) var(--ease-out);
    }
  }
  /* Folder tabs draw their own sheet (TabItem): it has to sit exactly on
     the chosen tab in the same frame the tabs reflow, and a box placed
     from measurements lands a frame late, wherever the tab used to be. */
  :global([data-variant="folder"]) .segment {
    display: none;
  }
  /* The hover ghost is the kit's (app.css .kit-ghost), cut to the tab's
     own shape and filled as the kit fills it: surface-hover, whole.
     Folder tabs overlap, each in its own stack, so no one layer can glide
     between a tab's card and its label: the tab under the pointer lights
     its own card in the hover tint instead (TabItem, `data-ghosted`). */
  :global([data-variant="folder"]) .ff-tabs-list > :global(.kit-ghost) {
    display: none;
  }
  /* The focus ring, gliding from tab to tab: the app's one ring, drawn on
     the tab's own box (a tab sits flush in the strip). */
  .ring {
    z-index: 4;
    border: var(--focus-ring-width) solid var(--focus-ring);
    border-radius: var(--shape);

    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform var(--dur-ghost) var(--ease-out),
        width var(--dur-ghost) var(--ease-out),
        height var(--dur-ghost) var(--ease-out);
    }
  }
  :global([data-variant="folder"]) .ring {
    z-index: var(--stack-top);
    border-radius: calc(var(--radius) + 2px) calc(var(--radius) + 2px) 0 0;
  }
</style>
