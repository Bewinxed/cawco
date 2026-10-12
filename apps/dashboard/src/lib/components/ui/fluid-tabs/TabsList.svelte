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

  /* ── Folder tabs: the stack hands over at equal depth ──────────────
     Folder tabs overlap like a drawer of real folders (owner: "spacing
     between inactive tabs should overlap a bit just like actual folder
     tabs"), so which one is drawn over which is a choice. The tabs make no
     stacks of their own: every tab's card, sheet and contents meet in the
     track's one stack (TabItem), at the tab's rank (`--z`, written here on
     the item the track lays out, which a host may wrap), with anything a
     host draws on every outline (PaneTabs' rims) and the focus ring above
     them all (`--stack-top`, in the markup). Until the track has measured
     its tabs (the first render, the server's included), each tab stands at
     its rank at rest, drawn from the order and the value (TabItem
     `--z-rest`, `restRank`, the same ranking as below).

     A tab's rank follows how far back it stands now (its depth: 0 chosen,
     1 receded), not where the choice has gone. On a switch each tab's depth
     travels from where it was to where it is going on the switch's own
     clock (the eased progress of the sheets' fade, read every frame, so a
     slowed clock slows it too), and the stack is ranked again from those
     depths each frame. Two tabs trade places only when they stand equally
     far back, which is when they look the same, so the trade shows nothing
     (transitions.dev, banner stacking: "the swap happens at identity").
     Ties go to the order the choice ends in: nearer the chosen tab on top,
     the first tab on top with none chosen. A switch caught mid-way starts
     from the depths it has reached. Under a gesture (the root's `travel`)
     the depths are the gesture's, so the tab it is heading to takes the
     top as it passes half way. A tap on an overlap goes to the tab drawn
     there. */
  const depthNow = new WeakMap<HTMLElement, number>();
  const rankNow = new WeakMap<HTMLElement, number>();
  /** The item a tab is laid out as: the tab, or the host's box round it. */
  function laidOf(item: HTMLElement, track: HTMLElement): HTMLElement {
    let laid = item;
    while (laid.parentElement && laid.parentElement !== track) {
      laid = laid.parentElement;
    }
    return laid;
  }
  /** The eased progress of a switch under way, read off the sheets' fade: 1 when none runs. */
  function switchProgress(items: HTMLElement[]): number {
    for (const item of items) {
      for (const run of item.getAnimations({ subtree: true })) {
        if (
          run instanceof CSSTransition &&
          run.transitionProperty === "opacity" &&
          run.effect instanceof KeyframeEffect &&
          run.effect.target === item &&
          run.effect.pseudoElement === "::after"
        ) {
          const { progress } = run.effect.getComputedTiming();
          if (typeof progress === "number") {
            return progress;
          }
        }
      }
    }
    return 1;
  }
  /**
   * The stack's ranks for the tabs standing at these depths, farthest back
   * lowest; ties go to the order the choice ends in (nearer `chosen` on
   * top).
   */
  function ranksBy(
    items: HTMLElement[],
    depthOf: (item: HTMLElement, i: number) => number,
    chosen: number
  ): Map<HTMLElement, number> {
    const order = items
      .map((item, i) => ({ item, i, depth: depthOf(item, i) }))
      .sort(
        (a, b) =>
          b.depth - a.depth ||
          Math.abs(b.i - Math.max(chosen, 0)) -
            Math.abs(a.i - Math.max(chosen, 0))
      );
    return new Map(order.map(({ item }, at) => [item, at + 1]));
  }
  /** Each tab's depth as last written, with its neighbours'. */
  const depthWritten = new WeakMap<HTMLElement, string>();
  /**
   * Ranks the stack from each tab's depth now, and hands each tab its depth
   * and its two neighbours' (`--depth`, `--depth-prev`, `--depth-next`, 0
   * chosen to 1 receded, its own where it has no neighbour), so a host can
   * draw what follows the choice on the switch's own clock (PaneTabs'
   * rims, whose strength does, and whose sides at a gliding seam meet
   * their neighbour's).
   */
  function rank(track: HTMLElement, items: HTMLElement[], chosen: number) {
    const ranks = ranksBy(items, (item) => depthNow.get(item) ?? 1, chosen);
    for (const [item, z] of ranks) {
      if (rankNow.get(item) !== z) {
        rankNow.set(item, z);
        laidOf(item, track).style.setProperty("--z", String(z));
      }
    }
    const depth = (item: HTMLElement | undefined) =>
      item ? String(Math.round((depthNow.get(item) ?? 1) * 1000) / 1000) : null;
    items.forEach((item, i) => {
      const own = depth(item) as string;
      const prev = depth(items[i - 1]) ?? own;
      const next = depth(items[i + 1]) ?? own;
      const key = `${own} ${prev} ${next}`;
      if (depthWritten.get(item) !== key) {
        depthWritten.set(item, key);
        const laid = laidOf(item, track);
        laid.style.setProperty("--depth", own);
        laid.style.setProperty("--depth-prev", prev);
        laid.style.setProperty("--depth-next", next);
      }
    });
  }

  /* ── Where two tabs meet: one edge, gliding ─────────────────────────
     Where two folder tabs overlap, the edge that shows is the front
     tab's: its card covers the other's, and the other's side stands at
     its own edge under it (a host's outline drawn at each tab's rank,
     PaneTabs' rims, does the same). On a switch that changes which of
     the two is in front, the edge glides from where it stood to where it
     will stand, on the switch's clock: whichever of the two is in front
     at that frame draws it there, its card and outline standing in from
     its own edge by `--cut-start`/`--cut-end` (0 to 1 of the overlap
     less a host's stroke, `--seam-tuck`), and the one behind stands at
     its own edge. The front changes at equal depth, where the two stand
     in on the same pixels, so the handover moves nothing (transitions.dev,
     banner stacking: "the swap happens at identity"). Under a gesture the
     gesture's fraction is the clock. */
  /** Each seam's place, keyed by the tab on its left: 0 on that tab's own edge, 1 on its right neighbour's. */
  const seamAt = new WeakMap<HTMLElement, { right: HTMLElement; q: number }>();
  /** Each tab's start and end cut as written. */
  const cutNow = new WeakMap<HTMLElement, string>();
  /** Where each seam rests for a ranking: on the edge of the tab in front. */
  const seamsAtRest = (items: HTMLElement[], ranks: Map<HTMLElement, number>) =>
    items
      .slice(0, -1)
      .map((left, i) =>
        (ranks.get(left) ?? 0) > (ranks.get(items[i + 1]) ?? 0) ? 0 : 1
      );
  /** Where each seam stands now, or rests for `ranks` when it is a new one. */
  const seamsNow = (items: HTMLElement[], ranks: Map<HTMLElement, number>) => {
    const atRest = seamsAtRest(items, ranks);
    return items.slice(0, -1).map((left, i) => {
      const seam = seamAt.get(left);
      return seam?.right === items[i + 1] ? seam.q : atRest[i];
    });
  };
  /** Places every seam `f` of the way from `from` to `to`, drawn by the tab in front now. */
  function placeSeams(
    track: HTMLElement,
    items: HTMLElement[],
    from: number[],
    to: number[],
    f: number
  ) {
    const cuts = items.map(() => [0, 0]);
    /* Which of each tab's sides stands under its neighbour's card now. */
    const under = items.map(() => [false, false]);
    for (let i = 0; i < items.length - 1; i += 1) {
      const left = items[i];
      const right = items[i + 1];
      const q = from[i] + (to[i] - from[i]) * f;
      seamAt.set(left, { right, q });
      if ((rankNow.get(left) ?? 0) > (rankNow.get(right) ?? 0)) {
        cuts[i][1] = q;
        under[i + 1][0] = true;
      } else {
        cuts[i + 1][0] = 1 - q;
        under[i][1] = true;
      }
    }
    items.forEach((item, i) => {
      const [start, end] = cuts[i];
      const [startUnder, endUnder] = under[i];
      const key = `${start} ${end} ${startUnder} ${endUnder}`;
      if (cutNow.get(item) !== key) {
        cutNow.set(item, key);
        const laid = laidOf(item, track);
        laid.style.setProperty("--cut-start", String(start));
        laid.style.setProperty("--cut-end", String(end));
        // A side under a neighbour (1, else 0) draws no foot where a host
        // paints on it: the card over it covers it, but on a switch the
        // card is a compositor layer whose foot row is filtered half
        // clear, and a rim's foot under it showed through on the shelf.
        laid.style.setProperty("--under-start", startUnder ? "1" : "0");
        laid.style.setProperty("--under-end", endUnder ? "1" : "0");
      }
    });
  }
  $effect(() => {
    const track = node;
    const { items } = rects;
    const chosen = list.optimisticIndex ?? -1;
    const { travel } = tabs;
    if (!track?.closest('[data-variant="folder"]')) {
      return;
    }
    const toward = travel ? tabs.order.indexOf(travel.toward) : -1;
    const f = travel ? Math.min(1, Math.max(0, travel.fraction)) : 0;
    /** How far back a tab stands once the switch lands, or as the gesture holds it. */
    const target = (i: number) => {
      let pick = i === chosen ? 1 : 0;
      if (toward >= 0 && toward !== chosen) {
        pick += ((i === toward ? 1 : 0) - pick) * f;
      }
      return 1 - pick;
    };
    if (travel) {
      // The seams glide by the gesture's fraction, from where they rest
      // with the choice where it is to where they would with it landed.
      const at = (pick: number) => (_: HTMLElement, i: number) =>
        i === pick ? 0 : 1;
      const restFrom = seamsAtRest(items, ranksBy(items, at(chosen), chosen));
      const restTo =
        toward >= 0
          ? seamsAtRest(items, ranksBy(items, at(toward), toward))
          : restFrom;
      for (const [i, item] of items.entries()) {
        depthNow.set(item, target(i));
      }
      rank(track, items, toward >= 0 && f > 0.5 ? toward : chosen);
      placeSeams(track, items, restFrom, restTo, f);
      return;
    }
    const from = items.map((item, i) => depthNow.get(item) ?? target(i));
    // Where the seams stand before the switch moves anything: read before
    // the stack is ranked for it.
    const seamsFrom = seamsNow(
      items,
      ranksBy(items, (item, i) => from[i], chosen)
    );
    const seamsTo = seamsAtRest(
      items,
      ranksBy(items, (_, i) => target(i), chosen)
    );
    for (const [i, item] of items.entries()) {
      depthNow.set(item, from[i]);
    }
    rank(track, items, chosen);
    placeSeams(track, items, seamsFrom, seamsTo, 0);
    // While a switch runs, what a host draws from the depths follows them
    // frame by frame and eases nothing of its own (`data-switching`).
    track.toggleAttribute("data-switching", true);
    // Read in the next frame's callbacks, where the frame lays the page out
    // anyway, once the switch's transitions have started.
    let frame = requestAnimationFrame(function step() {
      const p = switchProgress(items);
      items.forEach((item, i) => {
        depthNow.set(item, from[i] + (target(i) - from[i]) * p);
      });
      rank(track, items, chosen);
      placeSeams(track, items, seamsFrom, seamsTo, p);
      if (p < 1) {
        frame = requestAnimationFrame(step);
      } else {
        outgoing = null;
        track.toggleAttribute("data-switching", false);
        capFades();
      }
    });
    return () => cancelAnimationFrame(frame);
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
  /**
   * A scrolling track's edge fades never lie over a tab drawn chosen (the
   * chosen tab, and the one a switch is leaving): each edge's fade is cut
   * short at the nearest of them (`--fade-cap-start`, `--fade-cap-end`,
   * read by the fade's mask). Kept as the track scrolls.
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
        start = Math.min(start, r.left - at);
        end = Math.min(end, at + width - (r.left + r.width));
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
    /* The tabs' layers meet in this one stack (the script above), kept in
       the track. */
    isolation: isolate;
    /* Folder tabs in depth (owner: the chosen tab "approaches from the
       horizon when it's selected, while the others recede and fold
       neatly"). Every tab is hinged on its foot, the shelf's line: the
       chosen one stands upright, every other leans back `--lean` (TabItem),
       all one step back. The sides of every outline (card, sheet, a host's
       rim) bring their top corners in by `--slope-start` and `--slope-end`
       from the foot (the owner's pick: 1px and 0px). A choice travels over
       `--choose-dur` on `--choose-ease`, every part of it together (the
       owner's pick, "Slow · 400ms"; DESIGN.md, Folder tabs). */
    --lean: 18deg;
    /* How much of its lean a receded tab gives up under a fine pointer. */
    --lean-lift: 0.6;
    --slope-start: 1px;
    --slope-end: 0px;
    /* How far a tab's side stands in at most where it draws a seam that
       is gliding (`--cut-start`, `--cut-end`, the script above): the
       overlap, less the stroke a host draws on the outline (PaneTabs). */
    --seam-tuck: calc(var(--overlap) - var(--seam-stroke, 0px));
    --choose-dur: var(--dur-settle);
    --choose-ease: var(--ease-crossfade);
  }

  /* Each folder tab, or the host's box round it, steps back over its
     leading neighbour by the overlap, and makes no stack of its own: its
     layers take their rank in the track's (`--z`, the script). The track's
     own layers are not tabs: the highlight's ghost and pills (absolutely
     placed, app.css .kit-highlight) taken into the flow with the overlap's
     margin pulled every tab 16px back past the track's leading flare
     room. */
  :global([data-variant="folder"])
    .ff-tabs-list
    > :global(:not(.segment, .ring, .kit-ghost, .kit-pill, .kit-pill-trail)) {
    position: relative;
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
