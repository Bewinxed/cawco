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
   * surface with the page's gutter round it (`--space-6`), as the product
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
  import { type Component as SvelteComponent, tick, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur, motionOk, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconError } from "#lib/icons.js";
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
    fits = $bindable(false),
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
    /** The drawing stands narrower than its room: the stage is its own width, and its column takes no more. */
    fits?: boolean;
  } = $props();

  /** A width no state names: the desk form (core stage.ts `FORMS.desk`). */
  const DESK = 1280;
  /** The page's gutter round the component, each side. */
  const GUTTER = "--space-6";
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
  $effect(() => {
    fits = fit !== null;
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

  const endless = (animation: Animation) =>
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
          (one) => one.playState === "running" && !endless(one)
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
          if (!(known.has(animation) || endless(animation))) {
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
      return await act(
        play ??
          (async () => {
            live = { ...args };
            await tick();
          }),
        still
      );
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
    const t0 = performance.now();
    const seen = new Map<Animation, number>();
    /** Each clip as the engine had it when it was first seen: a transition's engine drops its effect once it ends. */
    const clips: Clip[] = [];
    /** A new animation read as a clip (a loop is a state's own, not the move's); with `still`, landed at once. */
    const take = (animation: Animation) => {
      if (endless(animation)) {
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
    } finally {
      watching = false;
      giveBack(holder, had);
      if (scroller && left) {
        scroller.scrollTo({ ...left, behavior: "instant" });
      }
    }
    if (holder.isConnected) {
      measureFit(holder);
    }
    // Each thing named as it stands once the move has ended: what he sees.
    return clips.map((clip) =>
      clip.thing?.isConnected ? { ...clip, element: nameOf(clip.thing) } : clip
    );
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
    const first = against ? found[0] : undefined;
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
  /**
   * Compare turned on, or turned to another state: once its differences
   * are read, the first one's ring is brought into view, so the words at
   * the head and the ring they name are on screen together.
   */
  let firstPending = false;
  $effect(() => {
    if (against?.story) {
      firstPending = true;
    }
  });
  $effect(() => {
    const [first] = found;
    if (first && firstPending) {
      firstPending = false;
      untrack(() => showBox(first.box));
    }
  });
  const Component = $derived(review.component);
  const ringOut = "(var(--c-change-ring-offset) + var(--c-change-ring-width))";
</script>

<section
  data-slot="stage"
  aria-label={shown.name}
  class="flex min-h-0 min-w-0 flex-initial flex-col"
>
  <!-- Its head: the state's name in the title role, its record set, and
       while comparing the state it is compared with. -->
  <header
    data-slot="stage-head"
    class="flex min-h-c-btn-h min-w-0 flex-wrap items-baseline gap-x-space-3 gap-y-space-1 px-space-1 pb-space-3"
  >
    <h2 class="m-0 min-w-0 type-title text-ink-strong">
      <span class="block truncate">{shown.name}</span>
    </h2>
    {#if shown.variant}
      <span class="min-w-0 truncate type-label text-ink-muted"
        >{shown.variant}</span
      >
    {/if}
    {#if against}
      <span
        data-slot="stage-against"
        class="min-w-0 truncate type-label text-ink-muted"
        >{words.comparedWith(against.name)}</span
      >
    {/if}
  </header>

  {#if stale}
    <p
      data-slot="stage-stale"
      role="status"
      class="m-0 mb-space-3 type-meta text-status-attn-ink"
    >
      {words.stale}
    </p>
  {/if}

  {#if against && lines.length > 0}
    <!-- What differs, in words: one line per difference, its mark the
         ring's own (solid for came in or changed, dashed for went), each a
         link to its ring: a press brings that ring into view. -->
    <ul
      data-slot="differences"
      aria-label={words.differences}
      class="m-0 mb-space-2 flex list-none flex-wrap gap-x-space-1 gap-y-0 p-0"
    >
      {#each lines as line, at (at)}
        <li class="min-w-0">
          <button
            type="button"
            class="mark-line pointer-hit touch-hit flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2 rounded-sm px-space-1 text-start type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
            onclick={() => showBox(line.box)}
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
        <li class="flex items-center px-space-1 type-meta text-ink-muted num">
          +{figureOf(found.length - LINES_SHOWN, lang)}
        </li>
      {/if}
    </ul>
  {:else if against && mounted}
    <p class="m-0 mb-space-3 type-label text-ink-muted">
      {words.sameAs(against.name)}
    </p>
  {/if}

  <!-- The field: the stage's room, which scrolls when the page is taller
       or wider. No well and no edge of its own: the component stands on
       the page it lives on, which fills the field (a hairline, a recess
       and then the page round every component was two frames nested). Its
       one bound is where that page's surface meets the surface's, seen
       when the scheme picked is the other one, at the panels' corner. The
       page's gutter holds the room a change ring takes outside an
       element's box (5px, under --space-6), so a ring on an element at the
       drawing's edge stands whole. -->
  <div
    bind:this={scroller}
    data-slot="stage-scroll"
    class="relative min-h-0 min-w-0 flex-initial overflow-auto overscroll-contain rounded-lg scrollbar-gutter-stable"
    {@attach frameSize((node: HTMLElement) => {
      const style = getComputedStyle(node);
      room =
        node.clientWidth -
        Number.parseFloat(style.paddingInlineStart) -
        Number.parseFloat(style.paddingInlineEnd) -
        2 * numberOf(GUTTER);
    })}
  >
    <!-- The page the component stands on: the product's surface and its
         gutter round the drawing, in the scheme he picked. -->
    <div
      data-slot="stage-page"
      data-scheme={scheme}
      class={[
        "w-max min-w-full bg-surface-page p-space-6 text-ink-strong",
        scheme === "dark" ? "scheme-dark" : "scheme-light",
        stale && "opacity-(--account-stale-opacity)",
      ]}
    >
      <div
        data-slot="stage-frame"
        style:--frame-w="{drawnWidth}px"
        style:--against-h="{Math.max(
          against ? againstTall : 0,
          mounted ? 0 : lastTall
        )}px"
        class="relative min-h-(--against-h) w-(--frame-w)"
      >
        {#if against}
          <!-- The state it is compared with, drawn hidden under the kept one
               at the same width, read for what differs and never seen or
               pressed. -->
          <div
            bind:this={hidden}
            {@attach relaid}
            {@attach frameSize((node: HTMLElement) => {
              againstTall = node.offsetHeight;
            })}
            aria-hidden="true"
            data-stage-drawing
            inert
            class="pointer-events-none invisible absolute inset-x-0 top-0"
          >
            {#key against}
              <svelte:boundary>
                <Component {...against.args} />
              </svelte:boundary>
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
          class="relative"
        >
          {#key mount}
            <svelte:boundary
              onerror={(error) => {
                fault = {
                  message:
                    error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? (error.stack ?? "") : "",
                };
              }}
            >
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
            {#each found as mark, at (at)}
              <span
                data-slot="change-ring"
                data-kind={mark.kind}
                class={[
                  "absolute start-(--ring-x) top-(--ring-y) h-(--ring-h) w-(--ring-w) rounded-(--ring-r) border-(length:--c-change-ring-width) border-c-change-ring",
                  mark.kind === "went" && "border-dashed",
                ]}
                style:--ring-x="calc({mark.box.x}px - {ringOut})"
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
      <!-- The component failed to mount: the error formula in the stage's place. -->
      <div
        data-slot="stage-failed"
        role="alert"
        class="absolute inset-0 flex flex-col items-start gap-space-3 overflow-auto bg-surface-recess-deep p-space-6"
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
        class={["inset-0 p-space-6", lastTall > 0 ? "absolute" : "relative"]}
        aria-busy="true"
      >
        <span class="sr-only">{words.mounting(review.name)}</span>
        <Skeleton height="board" />
      </div>
    {/if}
  </div>
</section>
