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
  import { easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn } from "#lib/utils.js";
  import {
    provideList,
    restRank,
    TabsListState,
    useTabs,
  } from "./context.svelte";
  import { type FoldPose, restPose } from "./fold-path";
  import { lastInput } from "./last-input";
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

  /* ── Folder tabs: one stack; a switch comes forward ────────────────
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
     read by TabItem): the path, not a mask, says so. Read as the tabs are
     drawn, lifts included, every frame anything in the track moves
     (`watchFolds`): the neighbour a lifted tab leaves stands on its own
     foot.

     A switch is a come-forward, drawn by the tabs' own paths (owner: "u
     know in folder tabs when u pull one forward and it bends the others
     before it snaps forward and releases the pressure"; "since it's svg
     shapes can't u do the 'come forward' movement?"). No tab's box moves:
     every tab stays in its slot, and only the paths change (fold-path,
     `FoldPose`). First the pull, over the first half of the choice's
     length on `--ease-in-out`: the tab being chosen rises from behind
     (`--tab-rise`, its feet on the shelf), still drawn under its
     neighbours, and each neighbour ranked above it bows its side out over
     it (`--tab-press`) as if pushed. Then it snaps through: the stack is
     ranked for the new choice at that instant, and every tab springs from
     where the pull left it to its rest for the new stack (`--bounce-snap`,
     its response the other half, so it has settled to a hundredth of its
     travel as the clock ends), released at the speed the pull stored
     (toward rest at the spring's own pace), so the chosen tab's feet spread
     out over its neighbours a little past the flare and settle, its top
     comes down, and the bowed sides spring back a little past straight and
     settle; the tab it left folds its side under it out of sight. The
     whole runs over the choice's length (`--choose-dur`), the sheets' and
     rims' `--pick` on the same clock: one run on the track
     (`tab-come-forward`) whose time each pose is read from each frame, so
     a slowed or seeked clock draws the paths where it stands, and a jump
     past several tabs is the same (only the tabs the stack re-ranks change
     their feet, nothing in between moves). A new switch caught mid-way
     starts its pull from the paths as drawn then. Under a gesture (the
     root's `travel`) the run stands where the gesture's fraction puts it,
     and plays on, or back, as the gesture lets go. A choice that scrolls
     the strip to show its tab whole scrolls it on the same clock and curve
     (`forward.ride`), never before the motion's first frame. A choice
     made from the keyboard (`lastInput`), and every choice with less
     motion, is instant: the stack ranked for it at once, nothing moves. A
     tab lifted by a drag (`data-lifted`, workspace/tab-drag) stands over
     every tab, both its feet drawn. */
  /** The item a tab is laid out as: the tab, or the host's box round it. */
  function laidOf(item: HTMLElement, track: HTMLElement): HTMLElement {
    let laid = item;
    while (laid.parentElement && laid.parentElement !== track) {
      laid = laid.parentElement;
    }
    return laid;
  }
  /** The come-forward's clock: one run on the track. */
  const FORWARD = "tab-come-forward";
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
    for (const [item, [start, end]] of coverOf(
      items,
      (one) => ranks.get(one) ?? 0
    )) {
      const was = list.folds.get(item);
      if (!was || was[0] !== start || was[1] !== end) {
        list.folds.set(item, [start, end]);
      }
    }
  }
  /** Which sides of each tab a tab ranked above it (by `rank`) covers where the two are drawn now. */
  function coverOf(
    items: HTMLElement[],
    rank: (item: HTMLElement) => number
  ): Map<HTMLElement, readonly [boolean, boolean]> {
    const drawn = items.map((item) => {
      const box = item.getBoundingClientRect();
      return { item, left: box.left, right: box.right, z: rank(item) };
    });
    return new Map(
      drawn.map((t) => {
        const over = drawn.filter((u) => u.z > t.z);
        return [
          t.item,
          [
            over.some(
              (u) => u.left <= t.left + EDGE && u.right >= t.left - EDGE
            ),
            over.some(
              (u) => u.right >= t.right - EDGE && u.left <= t.right + EDGE
            ),
          ],
        ];
      })
    );
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
   * them: a lifted tab, or a slide or settle of a tab's box.
   */
  function watchFolds(track: HTMLElement) {
    if (watching) {
      return;
    }
    let still = 0;
    const moving = () =>
      lifted !== null ||
      [...track.children].some((laid) => laid.getAnimations().some(underWay));
    const step = () => {
      fold(rects.items);
      still = moving() ? 0 : still + 1;
      watching = still > STILL_FRAMES ? 0 : requestAnimationFrame(step);
    };
    watching = requestAnimationFrame(step);
  }
  /** The come-forward under way, from one tab to another, and its frame. */
  let forward: {
    /** Its clock: the run on the track whose time each pose is read at. */
    clock: Animation;
    /** Where the stack is ranked anew, ms into the clock. */
    flipAt: number;
    flipped: boolean;
    /** The tab being chosen, and the tab it leaves. */
    mover: HTMLElement;
    leaving: HTMLElement;
    /** Every tab's pose `t` ms into the clock. */
    poseAt: (t: number) => Map<HTMLElement, FoldPose>;
    frame: number;
    /** Placed by a gesture, not playing on its own. */
    held: boolean;
    /**
     * The strip's scroll riding the clock, when the choice scrolls it
     * (`place`): from where it stood to where it shows the tab whole, over
     * the clock's progress from `p0`, where the ride began.
     */
    ride: { from: number; to: number; p0: number } | null;
  } | null = null;
  /** How far a come-forward's clock has gone, on its curve, 0 to 1. */
  const progressOf = (clock: Animation) => {
    const timing = clock.effect?.getComputedTiming();
    if (Number(clock.currentTime ?? 0) >= Number(timing?.endTime ?? 0)) {
      return 1;
    }
    return timing?.progress ?? 0;
  };
  /** A length token on the track in ms (the minifier writes `280ms` as `.28s`). */
  const msOf = (style: CSSStyleDeclaration, name: string) => {
    const value = style.getPropertyValue(name).trim();
    const n = Number.parseFloat(value) || 0;
    return value.endsWith("ms") ? n : n * 1000;
  };
  /** The come-forward's measures, read off the track: its tokens. */
  function measures(track: HTMLElement) {
    const style = getComputedStyle(track);
    const px = (name: string) =>
      Number.parseFloat(style.getPropertyValue(name)) || 0;
    const duration = msOf(style, "--choose-dur");
    return {
      duration,
      easing: style.getPropertyValue("--choose-ease").trim() || "ease",
      pull: duration / 2,
      response: duration / 2,
      bounce: px("--bounce-snap"),
      press: px("--tab-press"),
      rise: px("--tab-rise"),
    };
  }
  /** A pose's numbers in one row (spread, bow, rise), and back. */
  const flat = (p: FoldPose) => [
    p.spread[0],
    p.spread[1],
    p.bow[0],
    p.bow[1],
    p.rise,
  ];
  /** Back from the row; a foot folds no further than straight down (a spring past 0 would curl it in under its own side). */
  const posed = (n: number[]): FoldPose => ({
    spread: [Math.max(0, n[0] ?? 0), Math.max(0, n[1] ?? 0)],
    bow: [n[2] ?? 0, n[3] ?? 0],
    rise: n[4] ?? 0,
  });
  /**
   * Where a spring released `x0` from rest, moving `v0` a second, stands
   * `s` seconds later (Apple's terms: response, bounce; damping ratio
   * 1 − bounce): the closed form, so any time on the clock reads the same.
   */
  function sprung(
    x0: number,
    v0: number,
    s: number,
    response: number,
    bounce: number
  ) {
    const omega = (2 * Math.PI) / response;
    const zeta = Math.min(1, Math.max(0, 1 - bounce));
    if (zeta >= 1) {
      return (x0 + (v0 + omega * x0) * s) * Math.exp(-omega * s);
    }
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    return (
      Math.exp(-zeta * omega * s) *
      (x0 * Math.cos(damped * s) +
        ((v0 + zeta * omega * x0) / damped) * Math.sin(damped * s))
    );
  }
  /** Every tab's pose as drawn now: the come-forward's where one runs, else its rest. */
  function drawnPoses(items: HTMLElement[]) {
    const running = forward?.poseAt(Number(forward.clock.currentTime ?? 0));
    return new Map(
      items.map((item) => [
        item,
        running?.get(item) ?? restPose(list.folds.get(item) ?? [false, false]),
      ])
    );
  }
  /**
   * Ends the come-forward: its clock and its poses gone, every tab drawn
   * at rest on its folds, the stack ranked for `chosen`.
   */
  function endForward(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number
  ) {
    const was = forward;
    if (!was) {
      return;
    }
    forward = null;
    cancelAnimationFrame(was.frame);
    was.clock.cancel();
    stack(track, items, chosen);
    list.poses.clear();
  }
  /**
   * The tab at `to` comes forward past the tab at `from`: pulled up from
   * behind while its neighbours above it bow, then snapped through, the
   * stack ranked for it, every tab springing to its rest. Started from the
   * paths as drawn (a come-forward caught mid-way included), playing, or
   * held (`paused`) for a gesture to place.
   */
  function startForward(
    track: HTMLElement,
    items: HTMLElement[],
    from: number,
    to: number,
    paused: boolean
  ) {
    const mover = items[to];
    const leaving = items[from];
    if (!(mover && leaving)) {
      return;
    }
    const start = drawnPoses(items);
    if (forward) {
      cancelAnimationFrame(forward.frame);
      forward.clock.cancel();
      forward = null;
    }
    const m = measures(track);
    const n = items.length;
    const rankFor = (chosen: number) => (item: HTMLElement) =>
      restRank(n, chosen, items.indexOf(item));
    const before = coverOf(items, rankFor(from));
    const after = coverOf(items, rankFor(to));
    const rankBefore = rankFor(from);
    // The pull: the mover risen, each neighbour ranked above it bowed out
    // over it on the side that lies over it.
    const pulled = new Map(
      items.map((item, i) => {
        const pose = flat(restPose(before.get(item) ?? [false, false]));
        if (item === mover) {
          pose[4] = m.rise;
        } else if (
          Math.abs(i - to) === 1 &&
          rankBefore(item) > rankBefore(mover)
        ) {
          pose[i < to ? 3 : 2] = m.press;
        }
        return [item, pose];
      })
    );
    const landing = new Map(
      items.map((item) => [
        item,
        flat(restPose(after.get(item) ?? [false, false])),
      ])
    );
    const from0 = new Map(
      items.map((item) => [item, flat(start.get(item) as FoldPose)])
    );
    const omega = (2 * Math.PI) / (m.response / 1000);
    const poseAt = (t: number) =>
      new Map(
        items.map((item) => {
          const a = from0.get(item) as number[];
          const p = pulled.get(item) as number[];
          const r = landing.get(item) as number[];
          if (t >= m.duration) {
            return [item, posed(r)];
          }
          if (t < m.pull) {
            const e = easeInOut(Math.max(0, t) / m.pull);
            return [item, posed(a.map((x, k) => x + ((p[k] ?? 0) - x) * e))];
          }
          // Released with the speed the pull stored: toward rest at the
          // spring's own pace, so it snaps.
          const s = (t - m.pull) / 1000;
          return [
            item,
            posed(
              r.map((x, k) => {
                const x0 = (p[k] ?? 0) - x;
                return (
                  x + sprung(x0, -omega * x0, s, m.response / 1000, m.bounce)
                );
              })
            ),
          ];
        })
      );
    stack(track, items, from);
    const clock = track.animate([{ "--forward": 0 }, { "--forward": 1 }], {
      id: FORWARD,
      duration: m.duration,
      easing: m.easing,
    });
    if (paused) {
      clock.pause();
    }
    const now = {
      clock,
      flipAt: m.pull,
      flipped: false,
      mover,
      leaving,
      poseAt,
      frame: 0,
      held: paused,
      ride: null as { from: number; to: number; p0: number } | null,
    };
    forward = now;
    /** The strip's scroll where the clock puts it, while it rides. */
    const scroll = (p: number) => {
      const on = now.ride;
      if (!on) {
        return;
      }
      const f = on.p0 >= 1 ? 1 : Math.max(0, (p - on.p0) / (1 - on.p0));
      track.scrollLeft = on.from + (on.to - on.from) * f;
    };
    // Ranked by the tabs themselves, in the strip as it stands each frame:
    // a tab that opens or closes meanwhile moves the others' places.
    const rank = (around: HTMLElement) => {
      const fresh = rects.items;
      return { fresh, at: fresh.indexOf(around) };
    };
    /** The stack ranked for the side of the flip the clock stands on. */
    const flipAt = (t: number) => {
      const flip = t >= now.flipAt;
      if (flip !== now.flipped) {
        now.flipped = flip;
        const { fresh, at } = rank(flip ? mover : leaving);
        stack(track, fresh, at);
      }
    };
    const step = () => {
      if (forward !== now) {
        return;
      }
      const t = Number(clock.currentTime ?? 0);
      const back = clock.playbackRate < 0;
      flipAt(t);
      const done =
        !now.held && (back ? clock.playState === "finished" : t >= m.duration);
      scroll(done ? 1 : progressOf(clock));
      if (done) {
        const { fresh, at } = rank(back ? leaving : mover);
        endForward(track, fresh, at);
        return;
      }
      for (const [item, pose] of poseAt(t)) {
        list.poses.set(item, pose);
      }
      now.frame = requestAnimationFrame(step);
    };
    for (const [item, pose] of poseAt(0)) {
      list.poses.set(item, pose);
    }
    now.frame = requestAnimationFrame(step);
  }
  /** The tab the stack was last ranked for, and the tabs the strip held then. */
  let shown: HTMLElement | null = null;
  let held = new Set<HTMLElement>();
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
  /** A gesture places the come-forward toward the tab it heads to, by its fraction. */
  function follow(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number,
    toward: number,
    fraction: number
  ) {
    if (!(
      forward?.held &&
      forward.leaving === items[chosen] &&
      forward.mover === items[toward]
    )) {
      startForward(track, items, chosen, toward, true);
    }
    const clock = forward?.clock;
    if (clock) {
      clock.currentTime =
        Math.min(1, Math.max(0, fraction)) *
        Number(clock.effect?.getTiming().duration ?? 0);
    }
  }
  /**
   * The choice where it now stands: a gesture let go (its come-forward plays
   * on to its tab, or back to where it began), a choice between two tabs
   * the strip already held that comes forward, or the stack ranked for it
   * at once. A tab that has just opened grows in at its place in front
   * (PaneTabs `entering`), a choice that moves because its tab closed
   * moves at once, and a choice made from the keyboard (`lastInput`) is
   * instant: none of them comes forward. The same choice again (the tabs
   * measured anew) leaves a come-forward under way to run its course.
   */
  function land(
    track: HTMLElement,
    items: HTMLElement[],
    chosen: number,
    moves: boolean
  ) {
    const next = items[chosen] ?? null;
    const from = shown ? items.indexOf(shown) : -1;
    if (forward?.held) {
      forward.held = false;
      if (next === forward.mover) {
        forward.clock.play();
      } else {
        forward.clock.reverse();
      }
    } else if (next === shown) {
      if (!forward) {
        stack(track, items, chosen);
      }
    } else if (
      moves &&
      from >= 0 &&
      next &&
      held.has(next) &&
      motionOk.current &&
      lastInput.current === "pointer"
    ) {
      startForward(track, items, from, chosen, false);
    } else {
      endForward(track, items, chosen);
      stack(track, items, chosen);
    }
    shown = next;
    held = new Set(items);
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
    if (forward) {
      cancelAnimationFrame(forward.frame);
      forward.clock.cancel();
      forward = null;
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
  // frame's layout, so it paints already scrolled. While a choice comes
  // forward the scroll rides that clock instead (`forward.ride`): the
  // strip moves with the motion, on its curve, never ahead of it.
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
        // The tab chosen, and the tab a switch leaves.
        rideFrom = null;
        to = inView(
          at,
          rect,
          width,
          room,
          outgoing === null ? undefined : rects.at(outgoing),
          Number.parseFloat(style.getPropertyValue("--flare")) || 0
        );
      }
      if (Math.abs(to - at) > 0.5) {
        stopGlide();
        // A choice that comes forward carries the scroll on its own clock
        // and curve, from where the strip stands now (owner's preview: the
        // strip had jumped before the motion's first frame).
        const riding =
          !travel && forward && !forward.held && forward.clock.playbackRate > 0
            ? forward
            : null;
        if (riding) {
          riding.ride = { from: at, to, p0: progressOf(riding.clock) };
        } else {
          track.scrollLeft = to;
        }
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
    keep?: { left: number; width: number },
    feet = 0
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
       stays whole too, its feet with it (`feet`, a folder tab's flare), the
       edges' fades standing aside for both (`capFades`), when the two fit
       the track together. Where they do not, the tab being chosen is the
       one shown whole, feet and all. */
    const shod = (r: { left: number; width: number }) => ({
      left: r.left - feet,
      width: r.width + 2 * feet,
    });
    const whole = (s: number, r: { left: number; width: number }) =>
      r.left >= s - 0.5 && r.left + r.width <= s + width + 0.5;
    if (!keep || whole(roomy, shod(keep))) {
      return roomy;
    }
    const a = shod(chosen);
    const b = shod(keep);
    const least = Math.max(a.left + a.width, b.left + b.width);
    const most = Math.min(a.left, b.left);
    if (least - width > most) {
      return fit({ start: feet, end: feet });
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
  /* A switch lands, on every track, once its come-forward has run its course (at
     once on a track that draws no folder tabs): the tab it left is no
     longer drawn chosen, so the edges' fades stop standing aside for it.
     Not under a gesture, whose landing is the gesture's release. */
  $effect(() => {
    const { travel } = tabs;
    if (list.optimisticIndex === null || travel) {
      return;
    }
    let frame = requestAnimationFrame(function step() {
      if (forward) {
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
  }
  /* The come-forward's clock (`tab-come-forward`): a number on the track
     the run carries from 0 to 1, which nothing draws; each tab's pose is
     read off the run's time. */
  @property --forward {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
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
