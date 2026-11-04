<script lang="ts" module>
  /** What the stage draws: the kept state, at a width or as one of its variants, of the component in front. */
  export interface Shown {
    args: Record<string, unknown>;
    line: number | null;
    /** The state's name, at the stage's head. */
    name: string;
    /** Its story, for a pin's place (`data-cawco-story`). */
    story: string;
    /** The variant's name, when it is not the state as written. */
    variant: string | null;
    width: number | null;
  }
</script>

<script lang="ts">
  /**
   * The stage (spec, The stage): the real component, mounted live with its
   * states file's records, at the width the person picks and in the scheme
   * he picks, always at 1:1: at its own width up to its room's (a form
   * asked at 1440 lays itself out at the room's width, as a window that
   * wide would), and at a width he picks wider than the room, scrolling
   * sideways, never scaled, so no type renders under its size. It shows
   * the kept state, the one its head names, and nothing else: it changes
   * only when he keeps another. The component stands on the page's own
   * surface with the page's gutter round it (`--space-4`, the head's inset), as the product
   * shows it, never flush with the stage's edge. Nothing of the surface's
   * own stands over it: the comparison's rings stand outside each
   * element's box in a layer of the stage's own, under the pins, taking
   * no press. The drawing starts at its room's leading edge, so putting
   * the room beside it away never moves it.
   *
   * The component on it is one live instance for as long as he stays
   * with it: it mounts once (again only for another component, or Try
   * again after a fault), and a component under the canvas follows its
   * props while mounted. `reach` is the one way the instance moves: a
   * press sets the pressed state's args on it in place, or, when the
   * states file plays a move into that state from the state on stage,
   * runs that `play` on it; either way its own motion runs
   * (component-canvas moves.md) and is read as clips. While comparing,
   * the state it is compared with is drawn hidden under it at the same
   * width, mounted afresh from its story as written and never moved, and
   * the two are read for what came in, what changed and what went on the
   * way to the kept state (diff.ts).
   */
  import { readWithin } from "@cawco/core/bounded";
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { queriesIn, userEventIn } from "@cawco/core/stage-play";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { BitsConfig } from "bits-ui";
  import { type Component as SvelteComponent, tick, untrack } from "svelte";
  import { detailsOf } from "#lib/cawco/fault/rebuild.svelte.js";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur, motionOk, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import RegionHeld from "#lib/cawco/RegionHeld.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronDown, IconError } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { type Difference, differences, LINES_SHOWN } from "./diff";
  import { figureOf } from "./figures";
  import type { PlayContext, Review } from "./model";
  import { type Clip, clipOf } from "./motion";
  import { nameOf } from "./names";

  let {
    review,
    shown,
    against = null,
    width,
    scheme,
    stale = false,
    lit = null,
    lang,
    need = $bindable(0),
  }: {
    review: Review;
    /** The kept state, as it is drawn. */
    shown: Shown;
    /** The state it is compared with, while comparing. */
    against?: Shown | null;
    /** The width he picked; the state's own when null. */
    width: number | null;
    scheme: "light" | "dark";
    /** The hub's link is down: this is the last drawing. */
    stale?: boolean;
    /** What a row rested on names: ringed on the stage, nothing else changed. */
    lit?: Element | null;
    /** The page's language, for its figures. */
    lang: string | undefined;
    /**
     * The width the stage asks of its column, px: the drawing's width and
     * the panel round it (its edge, the page's gutter, the scroller's
     * gutter). A form held to its measure asks for that and no more, so
     * the room beside it takes the rest; 0 until the drawing is measured.
     */
    need?: number;
  } = $props();

  /** A width no state names: the desk form (core stage.ts `FORMS.desk`). */
  const DESK = 1280;
  /** The page's gutter round the component, each side. */
  const GUTTER = "--space-4";
  let room = $state(0);
  /** The width it is laid out at: his pick, else its own up to its room's. */
  const roomWidth = $derived(
    width ?? Math.min(shown.width ?? DESK, room > 0 ? room : DESK)
  );
  /**
   * The component's own width, where it stands narrower than the width it
   * was laid out at (a form held to its measure in a desk's room): the
   * stage takes that and no more, so no paper stands beside it as if it
   * were the component's. Kept per component and width pick, and only ever
   * widened, so a press on a state never narrows the stage and moves the
   * room beside it.
   */
  let fitOf = $state<Record<string, number>>({});
  const fitKey = $derived(`${review.name}@${width ?? "own"}`);
  const fit = $derived(fitOf[fitKey] ?? null);
  const drawnWidth = $derived(
    fit === null ? roomWidth : Math.min(roomWidth, fit)
  );
  /** The panel's own width less the drawing's room: its edge, the scroller's gutter and the page's gutters. */
  let chrome = $state(0);
  /** The drawing's width has been read once, the frame after it mounted. */
  let laid = $state(false);
  $effect(() => {
    need = laid && chrome > 0 ? Math.ceil(drawnWidth + chrome) : 0;
  });
  /** The drawing's own width read as it rests: its root's box, or what overflows it. */
  const measureFit = (holder: HTMLElement) => {
    const root = holder.firstElementChild as HTMLElement | null;
    if (!root) {
      return;
    }
    const own = Math.ceil(
      Math.max(root.getBoundingClientRect().width, root.scrollWidth)
    );
    const known = fitOf[fitKey];
    if (known === undefined ? own < drawnWidth - 1 : own > known) {
      fitOf = { ...fitOf, [fitKey]: Math.min(roomWidth, own) };
    }
  };
  let frame = $state<HTMLElement>();
  /** The stage's scroller. */
  let scroller = $state<HTMLElement>();
  let hidden = $state<HTMLElement>();

  /** The component mounted live: taken as it mounts, so another component's props never reach it. */
  let Live = $state<SvelteComponent<Record<string, unknown>> | null>(null);
  /** The props the live instance has: replaced by each press, changed in place by a play's `update`. */
  let live = $state<Record<string, unknown>>({});
  /** Counts the mounts: the first, another component's, and Try again's. */
  let mount = $state(0);
  let fault = $state<{ message: string; stack: string } | null>(null);
  let details = $state(false);
  let mounted = $state(false);
  /**
   * The drawing's height as it last stood: held while the next drawing
   * mounts, so the stage's scroll is kept across a press (a frame that
   * emptied as it remounted took the scroll back to its top).
   */
  let lastTall = $state(0);

  /** The wait grace (DESIGN.md, The Real Wait Rule): no skeleton before it has lasted. */
  let waited = $state(false);
  $effect(() => {
    if (mounted) {
      return;
    }
    waited = false;
    const timer = setTimeout(() => {
      waited = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (mount === 0) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      mounted = true;
      // Its width read the frame it mounts, not once its arrivals rest
      // (885 ms in): the split laid out for a 973px stage, then jumped to
      // 693 under him. The read at rest only ever widens it.
      if (frame) {
        measureFit(frame);
      }
      laid = true;
    });
    return () => cancelAnimationFrame(raf);
  });
  /** The drawing coming to rest as it mounts, its own arrivals landed (`restOf`); a new drawing ends it. */
  let resting: Rest | null = null;
  $effect(() => {
    const holder = frame;
    if (mount === 0 || !holder) {
      return;
    }
    const rest = restOf(holder);
    resting = rest;
    rest.done.then(() => {
      if (holder.isConnected && mounted) {
        measureFit(holder);
        lastTall = holder.offsetHeight;
      }
    });
    return () => rest.end();
  });

  // The differences, once both drawings have laid out, and again as either lays itself out anew (a read-back the hub answered).
  let found = $state<Difference[]>([]);
  let laidOut = $state(0);
  /** The compared drawing's height: the frame stands at least that tall, so a ring where something went stands whole inside it. */
  let againstTall = $state(0);
  const relaid = frameSize(() => {
    laidOut += 1;
  });
  $effect(() => {
    const k = hidden;
    const f = frame;
    if (laidOut < 0) {
      return;
    }
    if (!(against && k && f && mounted && mount > 0 && drawnWidth > 0)) {
      found = [];
      return;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        found = differences(k, f, 1);
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  const settle = () =>
    new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    );

  /** How long a move's play may run, then its motion (component-canvas moves.md). */
  const PLAY_MS = 6000;
  const MOTION_MS = 3000;
  /** The quiet that ends a move: no new animation and none running for this long. */
  const QUIET_MS = 250;
  /** The rest the from state comes to before the move starts: its own arrivals (a read-back the hub answered) have played. */
  const REST_MS = 600;

  /**
   * Motion that is the state's own and never a move's: a loop, or one that
   * runs on a scroller and not on the clock (the house edge fade, a
   * scroll-driven animation). Landed, an edge fade jumped to its scroll's
   * end: a strip of chips lost the fade at its cut edge on the stage.
   */
  const statesOwn = (animation: Animation) =>
    !(animation.timeline instanceof DocumentTimeline) ||
    animation.effect?.getComputedTiming().iterations ===
      Number.POSITIVE_INFINITY;

  /** Waits until no clip has run for {@link QUIET_MS}, at most {@link MOTION_MS}. */
  async function quietOf(seen: Map<Animation, number>): Promise<void> {
    const end = performance.now() + MOTION_MS;
    let quiet = performance.now();
    while (performance.now() < end) {
      await settle();
      if (
        [...seen.keys()].some(
          (one) => one.playState === "running" && !statesOwn(one)
        )
      ) {
        quiet = performance.now();
      } else if (performance.now() - quiet > QUIET_MS) {
        return;
      }
    }
  }

  /** The play pressed inside the stage: the person's focus goes back where it was, or off the stage. */
  function giveBack(holder: HTMLElement, had: Element | null): void {
    if (!holder.contains(document.activeElement)) {
      return;
    }
    if (
      had instanceof HTMLElement &&
      had !== document.body &&
      had.isConnected
    ) {
      had.focus({ preventScroll: true });
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  interface Rest {
    /** Settles once the drawing has rested, or the watch was ended. */
    done: Promise<void>;
    end: () => void;
  }
  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));

  /**
   * A drawing as it mounts comes to rest: every animation it starts of its
   * own (a read-back the hub answered unfolding, RoutineForm's schedule
   * strip) is landed at once, until none has started for {@link REST_MS},
   * at most {@link MOTION_MS}. The stage shows a state at rest, so a press
   * changes what it shows and nothing slides in; only a move plays, once
   * its from state has rested. A loop is the state's own and runs.
   */
  function restOf(holder: HTMLElement): Rest {
    let ended = false;
    const done = (async () => {
      const end = performance.now() + MOTION_MS;
      const known = new Set<Animation>();
      let still = performance.now();
      while (performance.now() < end && performance.now() - still < REST_MS) {
        await nextFrame();
        if (ended) {
          return;
        }
        for (const animation of holder.getAnimations({ subtree: true })) {
          if (!(known.has(animation) || statesOwn(animation))) {
            known.add(animation);
            land(animation);
            still = performance.now();
          }
        }
      }
    })();
    return {
      done,
      end: () => {
        ended = true;
      },
    };
  }

  /** An animation at its end at once; one that can't be (paused at no rate) is left as it stands. */
  function land(animation: Animation): void {
    try {
      animation.finish();
    } catch {
      // InvalidStateError: a rate of 0 or an endless effect has no end to land on.
    }
  }

  /** The component mounted afresh with `args`; its drawing comes to rest (`restOf`). */
  async function open(args: Record<string, unknown>): Promise<void> {
    Live = review.component;
    live = { ...args };
    fault = null;
    mounted = false;
    mount += 1;
    await tick();
    await resting?.done;
  }

  /** The state's args drawn on a hidden fresh instance, to hold the live one to; null when none is checked. */
  let fresh = $state<{ args: Record<string, unknown>; n: number } | null>(null);
  let freshHost = $state<HTMLElement>();
  /**
   * A state set in place lands whatever the component's own handlers did
   * with the one before: the live instance is read against the state drawn
   * afresh, and mounted anew with its args where they differ. Set in place
   * on Open one member, a press outside the open column closed it through
   * the roster's own handler, and Open many members, naming the same
   * column, reached a component that held it shut. Any states file, not
   * one fixture: the lint (house/follows-props) holds a component to its
   * props, and this to what its args draw.
   */
  /** What a drawing's controls say they stand at (open, pressed, checked, chosen), in order: what its words alone don't show. */
  const STATED = [
    "aria-expanded",
    "aria-pressed",
    "aria-checked",
    "aria-selected",
  ];
  const statesOf = (root: Element): string =>
    [...root.querySelectorAll(STATED.map((name) => `[${name}]`).join(","))]
      .map((el) => STATED.map((name) => el.getAttribute(name) ?? "").join(""))
      .join("|");
  async function landed(args: Record<string, unknown>): Promise<void> {
    fresh = { args, n: (fresh?.n ?? 0) + 1 };
    await tick();
    const host = freshHost;
    const holder = frame;
    if (host && holder) {
      await restOf(host).done;
      await settle();
      if (
        differences(host, holder, 1).length > 0 ||
        statesOf(host) !== statesOf(holder)
      ) {
        await open(args);
      }
    }
    fresh = null;
  }

  /** The last `reach` asked for: one still waiting its turn is passed over. */
  let asked = 0;
  /** The reach under way: each waits for the one before it, so no two act on the instance at once. */
  let reaching: Promise<unknown> = Promise.resolve();

  /**
   * The one way the live instance moves. A press sets the pressed state's
   * `args` on it, replacing its props whole (a key the state lacks falls
   * to the component's default); with `play` (the states file plays the
   * move into that state from the state on stage) that play runs on it
   * instead. The first press, or one on another component, mounts it with
   * `args` instead, at rest. Answers every animation the engine ran, as
   * clips, from the press; null when a later press took its turn; throws
   * what the play threw. With `still` (reduced motion) each animation is
   * read, then landed at once, so nothing travels.
   */
  export function reach(
    args: Record<string, unknown>,
    play: ((context: PlayContext) => Promise<void> | void) | null = null,
    still = false
  ): Promise<Clip[] | null> {
    asked += 1;
    const mine = asked;
    const turn = reaching.then(async () => {
      if (mine !== asked) {
        return null;
      }
      if (Live !== review.component) {
        await open(args);
        return [];
      }
      const clips = await act(
        play ??
          (async () => {
            live = { ...args };
            await tick();
          }),
        still
      );
      if (!play && mine === asked) {
        await landed(args);
      }
      return clips;
    });
    reaching = turn.catch(() => undefined);
    return turn;
  }

  /** `run` done on the live instance, every animation it starts read as a clip. */
  async function act(
    run: (context: PlayContext) => Promise<void> | void,
    still: boolean
  ): Promise<Clip[]> {
    await tick();
    const holder = frame;
    if (!holder) {
      return [];
    }
    const had = document.activeElement;
    // Where he left the stage's scroll: a play's press focuses a control,
    // which scrolls it into view; the scroll is put back once it has run.
    const left = scroller
      ? { top: scroller.scrollTop, left: scroller.scrollLeft }
      : null;
    // Held there while it runs, not only put back after: a capture taken
    // mid-play showed the stage scrolled to the pressed control, the first
    // field's label cut under the stage's head.
    const pinned = scroller;
    const pin = () => {
      if (pinned && left) {
        pinned.scrollTo({ ...left, behavior: "instant" });
      }
    };
    pinned?.addEventListener("scroll", pin);
    const t0 = performance.now();
    const seen = new Map<Animation, number>();
    /** Each clip as the engine had it when it was first seen: a transition's engine drops its effect once it ends. */
    const clips: Clip[] = [];
    /** A new animation read as a clip (a loop is a state's own, not the move's); with `still`, landed at once. */
    const take = (animation: Animation) => {
      if (statesOwn(animation)) {
        return;
      }
      const clip = clipOf(
        animation,
        Math.round(performance.now() - t0),
        clips.length
      );
      if (clip.duration > 0) {
        clips.push(clip);
      }
      if (still) {
        land(animation);
      }
    };
    let watching = true;
    const scan = () => {
      for (const animation of holder.getAnimations({ subtree: true })) {
        if (!seen.has(animation)) {
          seen.set(animation, performance.now() - t0);
          take(animation);
        }
      }
    };
    const watch = () => {
      if (watching) {
        scan();
        requestAnimationFrame(watch);
      }
    };
    // What already runs is the state's own, not this press's.
    for (const animation of holder.getAnimations({ subtree: true })) {
      seen.set(animation, -1);
    }
    requestAnimationFrame(watch);
    const update = async (next: Record<string, unknown>) => {
      Object.assign(live, next);
      await tick();
    };
    try {
      await readWithin(PLAY_MS, async () => {
        await run({
          args: live,
          update,
          canvas: queriesIn(holder),
          userEvent: userEventIn(holder),
        });
      });
      // The press's own frame: what it set has started its animations.
      await settle();
      scan();
      await quietOf(seen);
      // A move longer than its read (a 30-minute fill, cut at MOTION_MS)
      // is whole in its clips, read from its timing: the stage rests at
      // its end, where a shorter move's own animations end, and nothing of
      // it is left running under a playhead at rest.
      for (const [animation, since] of seen) {
        if (
          since >= 0 &&
          animation.playState === "running" &&
          !statesOwn(animation)
        ) {
          land(animation);
        }
      }
    } finally {
      pinned?.removeEventListener("scroll", pin);
      watching = false;
      giveBack(holder, had);
      if (scroller && left) {
        scroller.scrollTo({ ...left, behavior: "instant" });
      }
    }
    if (holder.isConnected) {
      measureFit(holder);
    }
    // The move begins where its first animation was set off: the press's
    // own frames before it (25 ms on the routine form's Create routine)
    // stood as an empty lead-in, so the first bar sat off the ruler's 0.
    const origin = Math.min(...clips.map((clip) => clip.start));
    // Each thing named as it stands once the move has ended: what he sees.
    return clips.map((clip) => ({
      ...clip,
      start: clip.start - origin,
      ...(clip.thing?.isConnected ? { element: nameOf(clip.thing) } : {}),
    }));
  }

  /** Where `el` stands in the drawing, unscaled. */
  const boxOf = (el: Element) => {
    const a = el.getBoundingClientRect();
    const b = (frame as HTMLElement).getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  };
  /** The region brought into view, with room for a ring round it (DESIGN.md, The One Ring Rule: a scroller brings a mark into view with room for its ring). */
  let shownBox = $state<{ h: number; w: number; x: number; y: number } | null>(
    null
  );
  let marker = $state<HTMLElement>();
  /**
   * Brings the region `els` stand in into view in the stage's scroller,
   * room for a ring round it, never cut at its head: the region the kept
   * state changed, as the phone's drawer moves to another stop. While
   * comparing, the first difference's ring stands for it.
   */
  export async function reveal(els: readonly Element[]): Promise<void> {
    const first = against ? ringed[0] : undefined;
    if (first) {
      await showBox(first.box);
      return;
    }
    const drawn = els.filter((el) => el.isConnected && frame?.contains(el));
    if (!frame || drawn.length === 0) {
      return;
    }
    const boxes = drawn.map(boxOf);
    const top = Math.min(...boxes.map((box) => box.y));
    const left = Math.min(...boxes.map((box) => box.x));
    await showBox({
      x: left,
      y: top,
      w: Math.max(...boxes.map((box) => box.x + box.w)) - left,
      h: Math.max(...boxes.map((box) => box.y + box.h)) - top,
    });
  }

  /** A box of the drawing brought into view, room for its ring. */
  async function showBox(box: {
    h: number;
    w: number;
    x: number;
    y: number;
  }): Promise<void> {
    shownBox = box;
    await tick();
    // After the head lays out what it says: brought into view as Compare
    // turned on, the ring was pushed back under the fold by the
    // differences' lines landing in the head a frame later.
    await new Promise(requestAnimationFrame);
    if (marker) {
      bringIntoView(marker, {
        behavior: motionOk.current ? "smooth" : "instant",
      });
    }
  }

  /**
   * Where `el` stands once every animation in the drawing has run to its
   * end: the move's replays hold their frames (a scrub at 0 holds the
   * failure line folded, 10px tall), and an element mid-move is not its
   * whole box. Each is stood at its end for the read and put back at
   * once, before anything paints; a loop is the state's own and is left.
   */
  function restBoxOf(el: Element) {
    const held: [Animation, CSSNumberish | null][] = [];
    for (const animation of (frame as HTMLElement).getAnimations({
      subtree: true,
    })) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end)) {
        held.push([animation, animation.currentTime]);
        animation.currentTime = end;
      }
    }
    const box = boxOf(el);
    for (const [animation, at] of held) {
      animation.currentTime = at;
    }
    return box;
  }

  /** The ring on what a rested row names: its whole box at rest, read again as the drawing lays out anew. */
  const litBox = $derived.by(() => {
    if (laidOut < 0 || !(lit && frame && mounted && frame.contains(lit))) {
      return null;
    }
    return restBoxOf(lit);
  });

  /** Reduced motion's Play: the end state fades in where it stands (DESIGN.md, The Reduced Motion Rule). */
  export function fadeIn(): void {
    frame?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: "linear",
    });
  }

  const lines = $derived(found.slice(0, LINES_SHOWN));
  /** He showed or folded the lines himself; null until he has. */
  let listOpen = $state<boolean | null>(null);
  /**
   * The lines stand open on a stage a desk's least wide or wider
   * (`c-graph-stage-min`) and folded on a narrower one, until he chooses:
   * at 390 thirteen lines took the stage above the drawer.
   */
  const listShown = $derived(
    listOpen ?? room + chrome >= (browser ? numberOf("--c-graph-stage-min") : 0)
  );
  const uid = $props.id();
  /**
   * What differs on the drawing he sees: what came in and what changed.
   * What went is no part of it, and its box is where it stood in the other
   * drawing: ringed there, it stood over whatever stands there now (a
   * removed field drawn over "Each run starts"). It is a line, unringed.
   */
  const ringed = $derived(found.filter((mark) => mark.kind !== "went"));
  /** What went: ringed, dashed, where it stood, on the compared drawing while it is shown. */
  const went = $derived(found.filter((mark) => mark.kind === "went"));
  /** The gap between two drawings side by side, px. */
  const besideGap = browser ? numberOf("--space-6") : 0;
  /**
   * Compare draws the two states side by side where the stage holds both
   * at their width with the gap between (a desk with the room closed, a
   * narrow component, a wide window); else the flip shows one in the
   * other's place.
   */
  const beside = $derived(
    against !== null && room > 0 && room >= 2 * drawnWidth + besideGap
  );
  /** The rings drawn: side by side both drawings' (what went on the compared one); flipped what went; else what came in or changed. */
  const drawnRings = $derived.by(() => {
    if (beside) {
      return [...ringed, ...went];
    }
    return flipped ? went : ringed;
  });
  /** The compared state stands in the kept one's place (Compare's flip). */
  let flipped = $state(false);
  $effect(() => {
    if (!against) {
      flipped = false;
    }
  });
  /**
   * Compare turned on, or turned to another state: once its differences
   * are read, the first one's ring is brought into view, so the words at
   * the head and the ring they name are on screen together.
   */
  // The differences are read again as either drawing lays itself out
  // anew, and the first read stands on a drawing still settling: shown
  // once at the first read, the ring was brought to where it stood, not
  // where it stands. Each read within the settle brings it again.
  const SETTLE_MS = 1200;
  let firstUntil = 0;
  $effect(() => {
    if (against?.story) {
      firstUntil = performance.now() + SETTLE_MS;
    }
  });
  $effect(() => {
    const [first] = ringed;
    if (first && performance.now() < firstUntil) {
      untrack(() => showBox(first.box));
    }
  });
  const Component = $derived(review.component);
  const ringOut = "(var(--c-change-ring-offset) + var(--c-change-ring-width))";
</script>

<!-- One panel, as the room beside it is one: the same corner, edge and
     raised head, the two sharing a top and a foot (Base44's preview beside
     its panel). Its head holds the kept state's name on the head line the
     room's faces stand on; the component stands on its page under it, the
     page's gutter the head's own inset, so the name and the drawing share
     one leading edge. -->
<section
  data-slot="stage"
  aria-label={shown.name}
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
>
  <!-- Its head: the state's name in the title role, its record set, and
       while comparing the state it is compared with; under them the stale
       line and what differs. -->
  <header
    data-slot="stage-head"
    class="flex min-w-0 flex-none flex-col border-b border-border-hairline px-space-4"
  >
    <div
      class="flex min-h-c-top-bar-h min-w-0 items-center gap-x-space-3 overflow-clip"
    >
      <h2 class="m-0 min-w-0 flex-none type-title text-ink-strong">
        <span class="block truncate">{shown.name}</span>
      </h2>
      {#if shown.variant}
        <span class="min-w-0 truncate type-label text-ink-muted"
          >{shown.variant}</span
        >
      {/if}
      {#if against && beside}
        <span
          class="min-w-0 truncate type-label text-ink-muted"
          data-slot="stage-against">{words.comparedWith(against.name)}</span
        >
      {:else if against}
        <!-- The state it is compared with, a press that shows it in the
             kept one's place, rings where its gone parts stood, and back. -->
        <button
          type="button"
          aria-pressed={flipped}
          class="pointer-hit touch-hit min-w-0 truncate rounded-sm px-space-1 type-label text-ink-muted transition-control aria-pressed:bg-selected-bg aria-pressed:text-selected-ink aria-pressed-false:can-hover:hover:bg-surface-hover"
          data-slot="stage-against"
          onclick={() => {
            flipped = !flipped;
          }}
          title={words.showCompared(against.name)}
          >{flipped
            ? words.showingCompared(against.name)
            : words.comparedWith(against.name)}</button
        >
      {/if}
    </div>

    {#if stale}
      <p
        data-slot="stage-stale"
        role="status"
        class="m-0 pb-space-3 type-meta text-status-attn-ink"
      >
        {words.stale}
      </p>
    {/if}

    {#if against && lines.length > 0}
      <!-- What differs: led by its count, a press that shows or folds the
           lines (folded where the stage is a phone's, so the drawing
           stands in sight under the head); each line's mark the ring's own,
           solid for came in or changed, dashed for went, and a line that
           is ringed a link to its ring. -->
      <button
        type="button"
        aria-controls="{uid}-differences"
        aria-expanded={listShown}
        class="mark-line pointer-hit touch-hit -ms-space-1 mb-space-2 flex h-c-btn-h-sm items-center gap-space-1 self-start rounded-sm px-space-1 type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
        data-slot="differences-count"
        onclick={() => {
          listOpen = !listShown;
        }}
      >
        <span
          aria-hidden="true"
          data-box
          class="inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring"
        ></span>
        <span class="num"
          >{words.differenceCount(
            found.length,
            figureOf(found.length, lang)
          )}</span
        >
        <IconChevronDown
          aria-hidden="true"
          class={[
            "size-icon-md flex-none text-ink-muted transition-transform duration-(--dur-control) ease-out",
            listShown && "rotate-180",
          ]}
          data-box
        />
      </button>
      {#if listShown}
        <ul
          id="{uid}-differences"
          data-slot="differences"
          aria-label={words.differences}
          class="-ms-space-1 m-0 flex list-none flex-wrap gap-x-space-1 gap-y-0 p-0 pb-space-2"
        >
          {#each lines as line, at (at)}
            <li class="min-w-0">
              <!-- Each line a link to its ring: one that went shows the
                   compared state, where it stood, its ring dashed; one
                   that came in or changed, the kept state. -->
              <button
                type="button"
                class="mark-line pointer-hit touch-hit flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2 rounded-sm px-space-1 text-start type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
                onclick={() => {
                  flipped = !beside && line.kind === "went";
                  showBox(
                    beside && line.kind === "went"
                      ? { ...line.box, x: line.box.x + drawnWidth + besideGap }
                      : line.box
                  );
                }}
              >
                <span
                  aria-hidden="true"
                  data-box
                  class={[
                    "inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring",
                    line.kind === "went" && "border-dashed",
                  ]}
                ></span>
                <span class="min-w-0 wrap-anywhere">{line.line}</span>
              </button>
            </li>
          {/each}
          {#if found.length > LINES_SHOWN}
            <li
              class="flex items-center px-space-1 type-meta text-ink-muted num"
            >
              +{figureOf(found.length - LINES_SHOWN, lang)}
            </li>
          {/if}
        </ul>
      {/if}
    {:else if against && mounted}
      <p class="m-0 pb-space-3 type-label text-ink-muted">
        {words.sameAs(against.name)}
      </p>
    {/if}
  </header>

  <!-- The field: the stage's room, which scrolls when the page is taller
       or wider. No well and no edge of its own: the component stands on
       the page it lives on, which fills the field (a hairline, a recess
       and then the page round every component was two frames nested); the
       panel's edge is its one bound. The
       page's gutter holds the room a change ring takes outside an
       element's box (5px, under --space-4), so a ring on an element at the
       drawing's edge stands whole. -->
  <div
    bind:this={scroller}
    data-slot="stage-scroll"
    class={[
      "relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-surface-page scrollbar-gutter-stable",
      scheme === "dark" ? "scheme-dark" : "scheme-light",
    ]}
    {@attach frameSize((node: HTMLElement) => {
      const style = getComputedStyle(node);
      room =
        node.clientWidth -
        Number.parseFloat(style.paddingInlineStart) -
        Number.parseFloat(style.paddingInlineEnd) -
        2 * numberOf(GUTTER);
      const panel = node.closest<HTMLElement>('[data-slot="stage"]');
      chrome = panel ? panel.offsetWidth - room : 0;
    })}
  >
    <!-- The page the component stands on: the product's surface and its
         gutter round the drawing, in the scheme he picked. -->
    <div
      data-slot="stage-page"
      data-scheme={scheme}
      class={[
        "min-h-full w-max min-w-full bg-surface-page p-space-4 text-ink-strong",
        scheme === "dark" ? "scheme-dark" : "scheme-light",
        stale && "opacity-(--account-stale-opacity)",
        fault && "hidden",
      ]}
    >
      {#if beside && against}
        <!-- Side by side: each drawing named over it, on its own column. -->
        <div
          class="mb-space-2 flex gap-(--beside-gap) type-meta text-ink-muted"
          data-slot="beside-names"
          style:--beside-gap="{besideGap}px"
        >
          <span class="w-(--frame-w) truncate" style:--frame-w="{drawnWidth}px"
            >{shown.name}</span
          >
          <span class="w-(--frame-w) truncate" style:--frame-w="{drawnWidth}px"
            >{against.name}</span
          >
        </div>
      {/if}
      <div
        data-slot="stage-frame"
        style:--frame-w="{drawnWidth}px"
        style:--beside-x="{beside ? drawnWidth + besideGap : 0}px"
        style:--frame-span="{beside
          ? 2 * drawnWidth + besideGap
          : drawnWidth}px"
        style:--against-h="{Math.max(
          against ? againstTall : 0,
          mounted ? 0 : lastTall
        )}px"
        class="relative min-h-(--against-h) w-(--frame-span)"
      >
        {#if fresh}
          <!-- The state just set in place, drawn afresh and hidden, read
               against the live instance (`landed`) and gone. -->
          <div
            bind:this={freshHost}
            id="{uid}-fresh"
            aria-hidden="true"
            data-stage-drawing
            inert
            class="pointer-events-none invisible absolute inset-x-0 top-0"
          >
            {#key fresh.n}
              <!-- Its layers (a popover the state opens) portal into it,
                   hidden with it, never onto the page. -->
              <BitsConfig defaultPortalTo="#{uid}-fresh">
                <svelte:boundary>
                  <RegionHeld />
                  <Component {...fresh.args} />
                </svelte:boundary>
              </BitsConfig>
            {/key}
          </div>
        {/if}
        {#if against}
          <!-- The state it is compared with, drawn hidden under the kept one
               at the same width, read for what differs and never seen or
               pressed. -->
          <div
            bind:this={hidden}
            id="{uid}-against"
            {@attach relaid}
            {@attach frameSize((node: HTMLElement) => {
              againstTall = node.offsetHeight;
            })}
            aria-hidden="true"
            data-stage-drawing
            inert
            class={[
              "pointer-events-none absolute start-(--beside-x) top-0 w-(--frame-w)",
              !(flipped || beside) && "invisible",
            ]}
          >
            {#key against}
              <BitsConfig defaultPortalTo="#{uid}-against">
                <svelte:boundary>
                  <RegionHeld />
                  <Component {...against.args} />
                </svelte:boundary>
              </BitsConfig>
            {/key}
          </div>
        {/if}
        <div
          bind:this={frame}
          {@attach relaid}
          data-stage-drawing
          data-cawco-story={shown.story}
          data-cawco-source={shown.line
            ? `${review.file}:${shown.line}:1`
            : undefined}
          class={["relative w-(--frame-w)", flipped && !beside && "invisible"]}
        >
          {#key mount}
            <svelte:boundary
              onerror={(error) => {
                // What the client `handleError` made of the throw: its own
                // words (fault/rebuild `detailsOf`), not "[object Object]".
                const said = detailsOf(error);
                fault = {
                  message: said,
                  stack: error instanceof Error ? (error.stack ?? said) : said,
                };
              }}
            >
              <RegionHeld />
              {#if Live}
                <Live {...live} />
              {/if}
              {#snippet failed()}
                <span></span>
              {/snippet}
            </svelte:boundary>
          {/key}
        </div>
        <!-- What a rested row names, ringed; and the region brought into
             view, with room for its ring. Neither takes a press. -->
        {#if litBox}
          <span
            aria-hidden="true"
            data-slot="lit-ring"
            class="pointer-events-none absolute start-(--ring-x) top-(--ring-y) h-(--ring-h) w-(--ring-w) rounded-sm border-(length:--c-change-ring-width) border-c-change-ring"
            style:--ring-x="calc({litBox.x}px - {ringOut})"
            style:--ring-y="calc({litBox.y}px - {ringOut})"
            style:--ring-w="calc({litBox.w}px + 2 * {ringOut})"
            style:--ring-h="calc({litBox.h}px + 2 * {ringOut})"
          ></span>
        {/if}
        {#if shownBox}
          <span
            bind:this={marker}
            aria-hidden="true"
            class="pointer-events-none invisible absolute start-(--at-x) top-(--at-y) h-(--at-h) w-(--at-w) scroll-my-space-4"
            style:--at-x="{shownBox.x}px"
            style:--at-y="{shownBox.y}px"
            style:--at-w="{shownBox.w}px"
            style:--at-h="{shownBox.h}px"
          ></span>
        {/if}
        {#if against}
          <!-- The rings: outside each element's box on its own shape, in
               the stage's own layer, taking no press. -->
          <div aria-hidden="true" class="pointer-events-none absolute inset-0">
            {#each drawnRings as mark, at (at)}
              <span
                data-slot="change-ring"
                data-kind={mark.kind}
                class={[
                  "absolute start-(--ring-x) top-(--ring-y) h-(--ring-h) w-(--ring-w) rounded-(--ring-r) border-(length:--c-change-ring-width) border-c-change-ring",
                  mark.kind === "went" && "border-dashed",
                ]}
                style:--ring-x="calc({mark.box.x}px - {ringOut}{beside &&
                mark.kind === 'went'
                  ? ` + ${drawnWidth + besideGap}px`
                  : ''})"
                style:--ring-y="calc({mark.box.y}px - {ringOut})"
                style:--ring-w="calc({mark.box.w}px + 2 * {ringOut})"
                style:--ring-h="calc({mark.box.h}px + 2 * {ringOut})"
                style:--ring-r="calc({mark.radius} + var(--c-change-ring-offset))"
              ></span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if fault}
      <!-- The component failed to mount: the error formula in the stage's
           place, in the scroller's flow (the drawing it stands for holds
           nothing, so a panel laid over the drawing's box was cut to the
           page's gutters). -->
      <div
        data-slot="stage-failed"
        role="alert"
        class="flex min-w-0 flex-col items-start gap-space-3 p-space-4"
      >
        <p
          class="mark-line m-0 flex items-center gap-space-2 type-label text-status-fail-ink"
        >
          <IconError
            aria-hidden="true"
            class="size-icon-md flex-none"
            data-box
          />
          <span>{words.mountFailed(review.name, shown.name)}</span>
        </p>
        <p class="m-0 max-w-c-measure type-body text-ink-row wrap-anywhere">
          {fault.message}
        </p>
        <div class="flex gap-space-2">
          <Button
            onclick={() => {
              open({ ...live });
            }}
            size="sm"
            variant="outline">{words.tryAgain}</Button
          >
          <Button
            aria-expanded={details}
            onclick={() => {
              details = !details;
            }}
            size="sm"
            variant="ghost"
            >{details ? words.hideDetails : words.showDetails}</Button
          >
        </div>
        {#if details}
          <pre
            class="m-0 max-w-full overflow-auto rounded-md bg-code-bg p-space-3 type-code text-ink-row">{fault.stack}</pre>
        {/if}
      </div>
    {:else if !mounted && waited}
      <div
        class={["inset-0 p-space-4", lastTall > 0 ? "absolute" : "relative"]}
        aria-busy="true"
      >
        <span class="sr-only">{words.mounting(review.name)}</span>
        <Skeleton height="board" />
      </div>
    {/if}
  </div>
</section>
