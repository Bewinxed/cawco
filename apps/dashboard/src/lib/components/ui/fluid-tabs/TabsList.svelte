<script lang="ts">
  /**
   * The segmented control's track. Two overlays travel under the items —
   * the active segment and the focus ring — positioned from measurements,
   * which is what lets one element slide between tabs rather than each tab
   * drawing its own. The hover layer is the kit's ghost (components/ui/
   * highlight), the same one every list in the app has.
   *
   * `scrollable` lets a track that overflows scroll sideways: the chosen
   * item is kept in view and a wheel over the track, which has no vertical
   * travel to spend it on, moves it along.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { cn } from "$lib/utils";
  import { motionOk } from "$lib/whiffle/motion/curves.svelte";
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
  const rects = new TabRects();
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
  $effect(() => {
    const jump = leap;
    if (!(jump && node && motionOk.current)) {
      return;
    }
    const tab = (i: number) =>
      node?.querySelector<HTMLElement>(`[data-tab-index="${i}"]`);
    const from = tab(jump.from);
    const to = tab(jump.to);
    if (!(from && to)) {
      return;
    }
    const dx =
      from.getBoundingClientRect().left - to.getBoundingClientRect().left;
    const slide = to.animate(
      [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
      {
        duration: 260,
        easing: getComputedStyle(to).getPropertyValue("--ease-drawer"),
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
    return () => slide.cancel();
  });

  const selectedRect = $derived(
    list.optimisticIndex === null
      ? undefined
      : rects.rects[list.optimisticIndex]
  );
  const focusRect = $derived(
    list.focusedIndex === null ? undefined : rects.rects[list.focusedIndex]
  );

  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  /**
   * The segment part-way to another item, when a gesture is driving it: the
   * chosen box and the target's, mixed by the fraction. Undefined at rest,
   * or while the target has no box yet.
   */
  const travelRect = $derived.by(() => {
    const { travel } = tabs;
    const from = selectedRect;
    const to = travel && rects.rects[tabs.order.indexOf(travel.toward)];
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
    const items = [
      ...node.querySelectorAll<HTMLElement>("[data-tab-index] > .hit"),
    ];
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
  // resize, so the scroll lands on where the item ends up.
  $effect(() => {
    const rect = segmentRect;
    const { width } = rects.viewport;
    if (!(scrollable && node && rect && width > 0)) {
      return;
    }
    // An instant write, not a smooth one: a smooth scroll is an animation the
    // browser abandons when the track's content changes under it, and the
    // segment sliding into place is the motion here.
    const pad = 8;
    if (rect.left - pad < node.scrollLeft) {
      stopGlide();
      node.scrollLeft = rect.left - pad;
    } else if (rect.left + rect.width + pad > node.scrollLeft + width) {
      stopGlide();
      node.scrollLeft = rect.left + rect.width + pad - width;
    }
  });

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
  class={cn("ff-tabs-list", scrollable && "scrollable", className)}
  data-direction={direction}
  data-leap={leap ? '' : undefined}
  {onfocusin}
  {onfocusout}
  {onkeydown}
  role="tablist"
  bind:this={node}
  use:rects.container
  use:sideways
  {@attach highlight({ rows: ".ff-tab", axis: "x", covered: ".ff-tab.selected" })}
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
    <div
      aria-hidden="true"
      class="ring"
      style={px({
        left: focusRect.left - 2,
        top: focusRect.top - 2,
        width: focusRect.width + 4,
        height: focusRect.height + 4,
      })}
    ></div>
  {/if}
  {@render children()}
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
    /* Where tabs run past an edge, that edge fades them out — and only that
       edge, only while there is more to scroll to. The fade lengths ride
       the track's own scroll: at the start there is nothing behind, so the
       leading edge is sharp; at the end, nothing ahead. A track that does
       not overflow has no scroll timeline, the animation never applies,
       and neither edge fades. */
    &.scrollable {
      flex: 0 1 auto;
      min-inline-size: 0;
      max-inline-size: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      mask-image: linear-gradient(
        to right,
        transparent,
        #000 var(--fade-start),
        #000 calc(100% - var(--fade-end)),
        transparent
      );
      animation: track-edge-fade linear both;
      animation-timeline: scroll(self inline);
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }
  }
  :global([data-size="compact"]) .ff-tabs-list {
    --pad: 2px;
    --item: 24px;
    --px: 10px;
    --icon: 14px;
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
    padding-inline: var(--flare);
    padding-block-end: 0;
    border-radius: 0;
    background: none;
    /* The app's own curve and the tab details' morph length, so the sheet
       and the popover that follows it move as one. */
    --wipe: 260ms;
    --wipe-ease: var(--ease-drawer);
    --wipe-in: left;
    --wipe-out: right;

    &[data-direction="back"] {
      --wipe-in: right;
      --wipe-out: left;
    }
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
        transform 160ms var(--ease-out),
        width 160ms var(--ease-out),
        height 160ms var(--ease-out),
        opacity 80ms linear;
    }
  }
  /* Folder tabs draw their own sheet (TabItem): it has to sit exactly on
     the chosen tab in the same frame the tabs reflow, and a box placed
     from measurements lands a frame late, wherever the tab used to be. */
  :global([data-variant="folder"]) .segment {
    display: none;
  }
  /* The hover ghost is the kit's (app.css .kit-ghost), cut to the tab's
     own shape; in a well it sits one register down from the segment. */
  .ff-tabs-list > :global(.kit-ghost) {
    background: color-mix(in oklch, var(--surface-hover) 40%, transparent);
  }
  /* Folder tabs: the ghost glides over the unchosen tabs' tints and under
     the chosen sheet (TabItem: tint 0, ghost 1, sheet 2, contents 3), in
     the tabs' own hover tint. Clicking the tab under it, the sheet wipes
     in over the ghost, so the hover becomes the selection. */
  :global([data-variant="folder"]) .ff-tabs-list > :global(.kit-ghost) {
    z-index: 1;
    background: var(--tab-hover, var(--surface-hover));
  }
  .ring {
    z-index: 4;
    border: 1px solid var(--focus-ring);
    border-radius: calc(var(--radius) - var(--pad) + 2px);

    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform 80ms var(--ease-out),
        width 80ms var(--ease-out),
        height 80ms var(--ease-out);
    }
  }
  :global([data-variant="folder"]) .ring {
    border-radius: calc(var(--radius) + 2px) calc(var(--radius) + 2px) 0 0;
  }
  @keyframes track-edge-fade {
    0% {
      --fade-start: 0px;
      --fade-end: 40px;
    }
    6%,
    94% {
      --fade-start: 40px;
      --fade-end: 40px;
    }
    100% {
      --fade-start: 40px;
      --fade-end: 0px;
    }
  }
</style>
