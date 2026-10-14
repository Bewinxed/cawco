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
  import { type Snippet, untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn } from "#lib/utils.js";
  import {
    provideList,
    restRank,
    TabsListState,
    useTabs,
  } from "./context.svelte";
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

  /* ── Folder tabs: one stack, shuffled on a switch ──────────────────
     Folder tabs overlap like a drawer of real folders (owner: "spacing
     between inactive tabs should overlap a bit just like actual folder
     tabs"), so which one is drawn over which is a choice. Each tab, as the
     track lays it out (the tab, or the box a host wraps round it), is one
     stack of its own at its rank (`--z`, written here): its sheet and rim,
     one path (TabItem), and everything written on it. The chosen tab is on
     top, then each tab above those farther from it, the nearer the first
     (`restRank`); until the track has measured its tabs (the first render,
     the server's included) each stands at that rank from the order and the
     value alone (`--z-rest`). A side whose foot lies under a tab ranked
     above it, where the two are drawn now, draws no foot (`list.folds`,
     read by TabItem): the path, not a mask, says so. Covered is where the
     two bodies still meet, so a side folds and unfolds only out of sight:
     at that point the foot lies whole under the other's sheet. Read as
     the tabs are drawn, slides and lifts included, every frame anything in
     the track moves (`watchFolds`), never only from the ranks: a tab
     sliding out from under its neighbour shows its foot as it emerges, not
     a square side that flares later, and the neighbour a lifted tab leaves
     stands on its own foot.

     A switch is a shuffle, not a fold (owner: "instead of the fold we can
     have a fold like right-forward-left, so the tab that is "behind" slides
     to be in front of the other tabs"): the tab being chosen slides out
     sideways, away from its neighbour toward the tab it leaves, just far
     enough to clear that neighbour's foot (the overlap, the flare and
     `--space-1`); at the furthest point the stack is ranked for the new
     choice, so it comes in front and the tab it leaves drops back; and it
     slides back into its slot, in front. Out and back are one run of
     `translate` on the compositor (`tab-shuffle`), each half on the
     choice's curve over half its length (`--choose-dur`,
     `--choose-ease`), and the stack is read off that run's own clock each
     frame, so a slowed or seeked clock swaps it with the slide. Under a
     gesture (the root's `travel`) the run stands where the gesture's
     fraction puts it. With less motion the choice is instant: the stack
     ranked for it at once, nothing slides. A tab lifted by a drag
     (`data-lifted`, workspace/tab-drag) stands over every tab, both its
     feet drawn. */
  /** The item a tab is laid out as: the tab, or the host's box round it. */
  function laidOf(item: HTMLElement, track: HTMLElement): HTMLElement {
    let laid = item;
    while (laid.parentElement && laid.parentElement !== track) {
      laid = laid.parentElement;
    }
    return laid;
  }
  /** The shuffle's run's id, on the tab being chosen. */
  const SHUFFLE = "tab-shuffle";
  /** The item a drag has lifted, laid out (`data-lifted`), if one is. */
  let lifted = $state<HTMLElement | null>(null);
  /** Each tab's rank as the stack was last ranked, by its item. */
  const ranks = new Map<HTMLElement, number>();
  /**
   * Ranks the stack for the choice at `chosen` (the lifted tab over every
   * other), writes each tab's rank (`--z`) and folds the sides that stand
   * under a tab above them.
   */
  function stack(track: HTMLElement, items: HTMLElement[], chosen: number) {
    const n = items.length;
    ranks.clear();
    items.forEach((item, i) => {
      const laid = laidOf(item, track);
      const rank =
        lifted !== null && laid === lifted ? n + 1 : restRank(n, chosen, i);
      ranks.set(item, rank);
      const z = String(rank);
      if (laid.style.getPropertyValue("--z") !== z) {
        laid.style.setProperty("--z", z);
      }
    });
    fold(items);
    watchFolds(track);
  }
  /** Half a pixel: an edge as drawn, rounded. */
  const EDGE = 0.5;
  /**
   * Folds each side whose foot a tab ranked above it covers where the two
   * are drawn now (`list.folds`): the other's body reaches from that side's
   * edge back over the tab. Its sheet then holds the foot whole (its own
   * foot curving out at least as far), so the side changes out of sight.
   */
  function fold(items: HTMLElement[]) {
    const drawn = items.map((item) => {
      const box = item.getBoundingClientRect();
      return {
        item,
        left: box.left,
        right: box.right,
        z: ranks.get(item) ?? 0,
      };
    });
    for (const t of drawn) {
      const over = drawn.filter((u) => u.z > t.z);
      const start = over.some(
        (u) => u.left <= t.left + EDGE && u.right >= t.left - EDGE
      );
      const end = over.some(
        (u) => u.right >= t.right - EDGE && u.left <= t.right + EDGE
      );
      const was = list.folds.get(t.item);
      if (!was || was[0] !== start || was[1] !== end) {
        list.folds.set(t.item, [start, end]);
      }
    }
  }
  /**
   * Frames with nothing moving the folds are kept through before the watch
   * stops: a slide a change starts is started in the next frame's
   * callbacks (PaneTabs `slide`), after the change ranks the stack.
   */
  const STILL_FRAMES = 3;
  let watching = 0;
  /** A run that still stands somewhere between its ends: playing, or held there. */
  const underWay = (run: Animation) =>
    run.playState === "running" || run.playState === "paused";
  /**
   * Keeps the folds on the tabs as drawn, each frame, while anything moves
   * them: a shuffle, a lifted tab, or a slide or settle of a tab's box.
   */
  function watchFolds(track: HTMLElement) {
    if (watching) {
      return;
    }
    let still = 0;
    const moving = () =>
      shuffle !== null ||
      lifted !== null ||
      [...track.children].some((laid) => laid.getAnimations().some(underWay));
    const step = () => {
      fold(rects.items);
      still = moving() ? 0 : still + 1;
      watching = still > STILL_FRAMES ? 0 : requestAnimationFrame(step);
    };
    watching = requestAnimationFrame(step);
  }
  /** The shuffle under way, from one choice to another, and its frame. */
  let shuffle: {
    run: Animation;
    from: number;
    to: number;
    frame: number;
    swapped: boolean;
    /** Placed by a gesture, not playing on its own. */
    held: boolean;
  } | null = null;
  /** Its length, ms, and its curve, the choice's own. */
  const timing = (track: HTMLElement) => {
    const style = getComputedStyle(track);
    const length = style.getPropertyValue("--choose-dur").trim();
    return {
      duration: length.endsWith("ms")
        ? Number.parseFloat(length)
        : Number.parseFloat(length) * 1000,
      easing: style.getPropertyValue("--choose-ease").trim() || "ease",
    };
  };
  /** How far the tab being chosen slides out, px: past its neighbour's foot. */
  const clearance = (track: HTMLElement) => {
    const style = getComputedStyle(track);
    const px = (name: string) =>
      Number.parseFloat(style.getPropertyValue(name)) || 0;
    return px("--overlap") + px("--flare") + px("--space-1");
  };
  /** Ends the shuffle, its slide gone, the stack ranked for `chosen`. */
  function settleShuffle(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number,
    how: "finish" | "cancel"
  ) {
    const was = shuffle;
    if (!was) {
      return;
    }
    shuffle = null;
    cancelAnimationFrame(was.frame);
    if (how === "finish") {
      was.run.finish();
    } else {
      was.run.cancel();
    }
    track.removeAttribute("data-shuffling");
    stack(track, items, chosen);
  }
  /**
   * The tab at `to` slides out from under its neighbour toward `from` and
   * back, coming in front at the furthest point. Started playing, or held
   * (`paused`) for a gesture to place.
   */
  function startShuffle(
    track: HTMLElement,
    items: HTMLElement[],
    from: number,
    to: number,
    paused: boolean
  ) {
    const mover = items[to];
    if (!mover) {
      return;
    }
    stack(track, items, from);
    const out = clearance(track) * Math.sign(to - from);
    const { duration, easing } = timing(track);
    const run = laidOf(mover, track).animate(
      [
        { translate: "0px 0px", easing },
        { translate: `${out}px 0px`, easing, offset: 0.5 },
        { translate: "0px 0px" },
      ],
      { id: SHUFFLE, duration }
    );
    if (paused) {
      run.pause();
    }
    track.toggleAttribute("data-shuffling", true);
    const now = { run, from, to, frame: 0, swapped: false, held: paused };
    shuffle = now;
    const step = () => {
      if (shuffle !== now) {
        return;
      }
      const at = Number(run.currentTime ?? 0) / duration;
      const past = at >= 0.5;
      if (past !== now.swapped) {
        now.swapped = past;
        stack(track, items, past ? to : from);
      }
      if (run.playState === "finished") {
        settleShuffle(track, items, to, "finish");
        return;
      }
      now.frame = requestAnimationFrame(step);
    };
    now.frame = requestAnimationFrame(step);
  }
  /** The choice the stack was last ranked for, at rest. */
  let shown: number | null = null;
  $effect(() => {
    const track = node;
    const { items } = rects;
    const chosen = list.optimisticIndex ?? -1;
    const { travel } = tabs;
    const lift = lifted;
    if (!track?.closest('[data-variant="folder"]')) {
      return;
    }
    untrack(() => {
      const toward = travel ? tabs.order.indexOf(travel.toward) : -1;
      if (travel && toward >= 0 && chosen >= 0 && toward !== chosen) {
        follow(track, items, chosen, toward, travel.fraction);
      } else {
        land(track, items, chosen, lift === null);
      }
    });
  });
  /** A gesture places the shuffle toward the tab it heads to, by its fraction. */
  function follow(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number,
    toward: number,
    fraction: number
  ) {
    if (!(shuffle?.held && shuffle.from === chosen && shuffle.to === toward)) {
      settleShuffle(track, items, chosen, "cancel");
      startShuffle(track, items, chosen, toward, true);
    }
    const run = shuffle?.run;
    if (run) {
      run.currentTime =
        Math.min(1, Math.max(0, fraction)) * timing(track).duration;
    }
  }
  /**
   * The choice where it now stands: a gesture let go (landed on its tab, or
   * back where it began), a choice that shuffles to it, or the stack ranked
   * for it at once.
   */
  function land(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number,
    shuffles: boolean
  ) {
    if (shuffle?.held) {
      settleShuffle(
        track,
        items,
        chosen,
        chosen === shuffle.to ? "finish" : "cancel"
      );
    } else if (
      shuffles &&
      shown !== null &&
      shown >= 0 &&
      chosen >= 0 &&
      shown !== chosen &&
      motionOk.current
    ) {
      settleShuffle(track, items, shown, "finish");
      startShuffle(track, items, shown, chosen, false);
    } else if (!shuffle) {
      stack(track, items, chosen);
    }
    shown = chosen;
  }
  /** A drag's lift (`data-lifted` on a tab's box), heard as it comes and goes. */
  $effect(() => {
    const track = node;
    if (!track) {
      return;
    }
    const read = () => {
      lifted = track.querySelector<HTMLElement>(":scope > [data-lifted]");
    };
    const watch = new MutationObserver(read);
    watch.observe(track, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-lifted"],
    });
    return () => watch.disconnect();
  });
  $effect(() => () => {
    cancelAnimationFrame(watching);
    watching = 0;
    if (shuffle) {
      cancelAnimationFrame(shuffle.frame);
      shuffle.run.cancel();
      shuffle = null;
    }
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

  // Keep the chosen item in view. The rect, not the element: it is re-read
  // as items resize, so the scroll lands on where the item ends up. The
  // scroll is read and written in the next frame's callbacks, never in the
  // task that moved the choice: reading it there lays the page out mid-task,
  // and a swipe's release paid 30ms for it. The callbacks run before that
  // frame's layout, so it paints already scrolled.
  //
  // Mid-gesture the track stands between where it rests for the chosen
  // item and where it rests for the one the gesture is heading to, by the
  // fraction travelled, both read from where the track stood as the
  // gesture began: it moves with the finger and is already at the new
  // item's resting place when the gesture lands, so landing moves nothing.
  // A release that hands the choice over mid-gesture swaps the two ends
  // and the fraction with it, and the track does not move for it either.
  //
  // One frame is asked for at a time, and it places the track by whatever
  // was last asked of it. A frame cancelled and asked for again on every
  // change never came while a gesture's settle ran: the settle moves its
  // fraction in a frame callback queued ahead of this one, and the change
  // cancelled this one in the very frame it was due, every frame, so the
  // track stood still until the settle landed and then jumped.
  let rideFrom: number | null = null;
  let place: (() => void) | null = null;
  let placeFrame: number | null = null;
  $effect(() => {
    const rect = selectedRect;
    const { travel } = tabs;
    const toward = travel && rects.at(tabs.order.indexOf(travel.toward));
    const { width } = rects.viewport;
    const track = node;
    if (!(scrollable && track && rect && width > 0)) {
      place = null;
      return;
    }
    place = () => {
      // An instant write, not a smooth one: a smooth scroll is an animation
      // the browser abandons when the track's content changes under it, and
      // the tabs' own motion is the motion here.
      const at = track.scrollLeft;
      const style = getComputedStyle(track);
      const room = {
        start: Number.parseFloat(style.getPropertyValue("--edge-room-start")),
        end: Number.parseFloat(style.getPropertyValue("--edge-room-end")),
      };
      let to: number;
      if (travel && toward) {
        rideFrom ??= at;
        to = lerp(
          inView(rideFrom, rect, width, room),
          inView(rideFrom, toward, width, room),
          Math.min(1, Math.max(0, travel.fraction))
        );
      } else {
        rideFrom = null;
        to = inView(
          at,
          rect,
          width,
          room,
          outgoing === null ? undefined : rects.at(outgoing)
        );
      }
      if (Math.abs(to - at) > 0.5) {
        stopGlide();
        track.scrollLeft = to;
      }
      capFades();
    };
    placeFrame ??= requestAnimationFrame(() => {
      placeFrame = null;
      place?.();
    });
  });
  $effect(() => () => {
    if (placeFrame !== null) {
      cancelAnimationFrame(placeFrame);
    }
  });

  /**
   * Where the track stands to show the chosen item: whole and clear of each
   * edge's fade (`room`, `--edge-room-start`/`-end`), scrolled from `at`
   * only as far as it takes and not at all when it is already in view, so
   * choosing a tab never moves the strip under the others. The owner:
   * "switching between them kinda shifts things around in a way that
   * doesn't make sense" — the track had stood only where no tab's box
   * straddled its leading edge, which overlapping folder tabs never allow,
   * so every choice right-aligned the chosen tab. A tab cut at either edge
   * dissolves into that edge's fade (`.kit-edge-fade`).
   */
  function inView(
    at: number,
    chosen: { left: number; width: number },
    width: number,
    room: { end: number; start: number },
    keep?: { left: number; width: number }
  ): number {
    const fit = (r: { end: number; start: number }) => {
      const least = chosen.left + chosen.width + r.end - width;
      const most = chosen.left - r.start;
      return Math.max(
        0,
        least > most ? most : Math.min(most, Math.max(least, at))
      );
    };
    const roomy = fit(room);
    /* While a switch runs, the tab it leaves is still drawn chosen: it
       stays whole too, the edges' fades standing aside for both
       (`capFades`), when the two fit the track together. Where they do
       not, the tab being chosen is the one shown whole. */
    const whole = (s: number, r: { left: number; width: number }) =>
      r.left >= s - 0.5 && r.left + r.width <= s + width + 0.5;
    if (!keep || whole(roomy, keep)) {
      return roomy;
    }
    const least = Math.max(chosen.left + chosen.width, keep.left + keep.width);
    const most = Math.min(chosen.left, keep.left);
    if (least - width > most) {
      return fit({ start: 0, end: 0 });
    }
    return Math.max(0, Math.min(most, Math.max(least - width, at)));
  }

  /**
   * The tab a switch is leaving, until the switch lands: it is still drawn
   * chosen, so the strip keeps it whole and its edges do not fade it.
   */
  let outgoing: number | null = null;
  let lastChosen: number | null = null;
  $effect.pre(() => {
    const now = list.optimisticIndex;
    untrack(() => {
      if (lastChosen !== null && now !== null && now !== lastChosen) {
        outgoing = lastChosen;
      }
      lastChosen = now;
    });
  });
  /* A switch lands, on every track, once its shuffle has run its course (at
     once on a track that draws no folder tabs): the tab it left is no
     longer drawn chosen, so the edges' fades stop standing aside for it.
     Not under a gesture, whose landing is the gesture's release. */
  $effect(() => {
    const { travel } = tabs;
    if (list.optimisticIndex === null || travel) {
      return;
    }
    let frame = requestAnimationFrame(function step() {
      if (shuffle) {
        frame = requestAnimationFrame(step);
        return;
      }
      outgoing = null;
      capFades();
    });
    return () => cancelAnimationFrame(frame);
  });
  /**
   * A scrolling track's edge fades never lie over a tab drawn chosen (the
   * chosen tab, and the one a switch is leaving) while it stands clear of
   * that edge: the edge's fade is cut short at the nearest of them
   * (`--fade-cap-start`, `--fade-cap-end`, read by the fade's mask). One the
   * track has been scrolled past, cut by the edge, caps nothing there: that
   * edge's fade is drawn whole, the cue that the strip goes on that way
   * (a phone that swiped its views on showed none, its chosen tab half cut
   * at the edge with nothing to say the strip scrolls). Kept as the track
   * scrolls.
   */
  function capFades() {
    const track = node;
    if (!(scrollable && track)) {
      return;
    }
    const at = track.scrollLeft;
    const { width } = rects.viewport;
    let start = Number.POSITIVE_INFINITY;
    let end = Number.POSITIVE_INFINITY;
    for (const i of [list.optimisticIndex, outgoing]) {
      const r = i === null ? undefined : rects.at(i);
      if (r) {
        const before = r.left - at;
        const after = at + width - (r.left + r.width);
        if (before >= -0.5) {
          start = Math.min(start, before);
        }
        if (after >= -0.5) {
          end = Math.min(end, after);
        }
      }
    }
    const write = (name: string, value: number) => {
      if (Number.isFinite(value)) {
        track.style.setProperty(name, `${Math.max(0, value)}px`);
      } else {
        track.style.removeProperty(name);
      }
    };
    write("--fade-cap-start", start);
    write("--fade-cap-end", end);
  }

  /**
   * A vertical wheel over the track moves it sideways on a spring: each
   * notch pushes the target along and the track glides after it, carrying
   * its speed into the next notch, instead of jumping 100px a click.
   * Critically damped at the app's 0.3s response, so it lands without
   * overshoot. A sideways trackpad swipe is the browser's own scroll and
   * is left alone.
   */
  /** Whether a tab stands past the track's viewport: there is somewhere to scroll. */
  const overflows = $derived(
    [...rects.rects.values()].some(
      (rect) => rect.left + rect.width > rects.viewport.width + 0.5
    )
  );
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
      if (event.deltaX !== 0) {
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
    // Not passive: a vertical wheel is the track's own, turned sideways, and
    // must not also scroll whatever holds the track. Held only while the
    // track overflows (its tabs' measured boxes and its viewport say when),
    // so a track with nothing to scroll never holds a wheel for the main
    // thread to answer before the page scrolls.
    // The fades' caps follow the track as it scrolls, once a frame.
    let capFrame = 0;
    const onscroll = () => {
      capFrame ||= requestAnimationFrame(() => {
        capFrame = 0;
        capFades();
      });
    };
    el.addEventListener("scroll", onscroll, { passive: true });
    const stopListening = $effect.root(() => {
      $effect(() => {
        if (!overflows) {
          stop();
          return;
        }
        el.addEventListener("wheel", onwheel, { passive: false });
        return () => el.removeEventListener("wheel", onwheel);
      });
    });
    return {
      destroy() {
        stop();
        stopListening();
        cancelAnimationFrame(capFrame);
        el.removeEventListener("scroll", onscroll);
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
  data-overflows={overflows ? "" : undefined}
  data-ride={ride ? "" : undefined}
  {onfocusin}
  {onfocusout}
  {onkeydown}
  role="tablist"
  bind:this={node}
  style:--stack-top={4 * (tabs.order.length + 1)}
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
      /* A chosen tab is brought clear of each edge's fade (`inView`); a
         host whose fades differ sets its own. */
      --edge-room-start: var(--fade-len);
      --edge-room-end: var(--fade-len);
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
    /* The tabs' stacks meet in this one (the script above), kept in the
       track. */
    isolation: isolate;
    /* The sides of every outline bring their top corners in by
       `--slope-start` and `--slope-end` from the foot (the owner's pick:
       1px and 0px). A choice travels over `--choose-dur` on
       `--choose-ease`, every part of it together (the owner's pick, "Slow ·
       400ms"; DESIGN.md, Folder tabs). */
    --slope-start: 1px;
    --slope-end: 0px;
    --choose-dur: var(--dur-settle);
    --choose-ease: var(--ease-crossfade);

    /* While a shuffle runs on a track with nothing past its ends, the tab
       sliding out past the first or last tab is drawn whole, not cut at
       the track's box; a track that scrolls keeps its clip, its ends faded. */
    &.scrollable[data-shuffling]:not([data-overflows]) {
      overflow: visible;
    }
  }

  /* Each folder tab, or the host's box round it, steps back over its
     leading neighbour by the overlap, and is one stack at its rank (`--z`,
     the script; `--z-rest` until the track has ranked it): its sheet, rim
     and everything written on it rise and fall together. The track's own
     layers are not tabs: the highlight's ghost and pills (absolutely
     placed, app.css .kit-highlight) taken into the flow with the overlap's
     margin pulled every tab 16px back past the track's leading flare
     room. */
  :global([data-variant="folder"])
    .ff-tabs-list
    > :global(:not(.segment, .ring, .kit-ghost, .kit-pill, .kit-pill-trail)) {
    position: relative;
    z-index: var(--z, var(--z-rest, 1));
    isolation: isolate;
    margin-inline-start: calc(-1 * var(--overlap));
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
  /* Above every tab and every outline a host draws on them. */
  :global([data-variant="folder"]) .ring {
    z-index: calc(var(--stack-top) + 2);
    border-radius: calc(var(--radius) + 2px) calc(var(--radius) + 2px) 0 0;
  }
</style>
