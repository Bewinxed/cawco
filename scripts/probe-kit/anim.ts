/**
 * Motion by scrubbing the clock, never by filming it: the DevTools
 * protocol's Animation domain holds every animation still and seeks it to a
 * fraction of its run, and the engine's computed values are read there.
 *
 * `catchRuns` holds each run the page starts from then on: as
 * `Animation.animationStarted` reports it, `Animation.setPaused` pauses it by
 * its id, so what an action starts (a class change's CSS transitions, a
 * component's Web Animations) stands where it began; the runs whose target
 * lies in `within` are the clock, put at their first frame. A run in a child
 * frame's document is that frame's own and is let go.
 *
 * The clock never sets the document timeline's rate (`Animation.
 * setPlaybackRate`): Blink's agent sets it on every same-process frame's
 * document as it commits (inspector_animation_agent.cc,
 * `DidClearDocumentOfWindowObject`: `frame->GetDocument()->Timeline().
 * SetPlaybackRate(ReferenceTimeline().PlaybackRate())`), so at 0 a
 * same-origin iframe's own intro never finished and its page, waiting on it,
 * never came up.
 *
 * Nor does it ever call `Animation.resolveAnimation`: Blink reads the run's
 * target there without a check (`To<KeyframeEffect>(animation->effect())->
 * EffectTarget()`), and a run whose effect the page has since dropped (Svelte
 * aborts a transition with `animation.cancel(); animation.effect = null`)
 * crashes the renderer (SIGSEGV, SEGV_MAPERR 0x158, Chromium 153 and 156):
 * every DevTools command after it waits for ever, so a spec saw a frame wait
 * that never ended. A run is placed by the target node the protocol reports
 * as it starts (`source.backendNodeId`), through `DOM.resolveNode`.
 *
 * `seek` moves each with `Animation.seekAnimations`
 * ("Seek a set of animations to a particular time within each animation"),
 * held at its own end once past it. The page's own Animation objects move
 * (TabsList reads its sheet's transition progress each frame and follows),
 * so what a host draws from them is read on the same frame.
 *
 * A reading that needs the page drawn another way (a glow off, a layer
 * hidden, a piece drawn whole) lays it on with `overlay`, never a style
 * rule: a rule changes the after-change value of what it touches, and where
 * a transition is running on that property the engine cancels it and starts
 * another (CSS Transitions), so the clock loses a run it had caught.
 *
 * chromedevtools.github.io/devtools-protocol/tot/Animation
 */
import type { CDPSession, Page } from "playwright-core";
import { frames } from "./kit";

/** One caught run, as the protocol describes it. */
export interface Run {
  easing: string;
  /** Delay plus duration: where it stands whole, ms. */
  end: number;
  id: string;
  /** Whether it repeats for ever: a loop has no end to share. */
  loop: boolean;
  /** A CSS transition's property, a CSS animation's name, a Web Animation's id. */
  name: string;
  /** Whether it runs on a scroller's or a view's timeline, not on time. */
  scroll: boolean;
  /**
   * Its start time on the page's document timeline, ms, as the protocol
   * reported it starting; null where it reported none. Blink sends 0 for a
   * run with no start time (inspector_animation_agent.cc,
   * `NormalizedStartTime`: `if (!start_time) { return 0; }`), so 0 is none.
   */
  start: number | null;
  type: "CSSTransition" | "CSSAnimation" | "WebAnimation";
}

interface Described {
  id: string;
  name: string;
  source?: {
    /** The run's target: an element, or a pseudo-element. */
    backendNodeId?: number;
    delay: number;
    duration: number;
    easing: string;
    endDelay?: number;
    iterations?: number;
  };
  startTime?: number;
  type: Run["type"];
  /** Present for a scroll- or view-driven run. */
  viewOrScrollTimeline?: unknown;
}

/** A started run as the clock keeps it. */
const runOf = (one: Described): Run => {
  const s = one.source;
  return {
    id: one.id,
    name: one.name,
    type: one.type,
    easing: s?.easing ?? "",
    start: one.startTime ? one.startTime : null,
    // The protocol sends `iterations` only when it is finite.
    loop: s !== undefined && s.iterations === undefined,
    scroll: one.viewOrScrollTimeline !== undefined,
    end:
      (s?.delay ?? 0) +
      (s?.duration ?? 0) * (s?.iterations ?? 1) +
      (s?.endDelay ?? 0),
  };
};

/** Where a held run's target lies: the page's own document, and inside the catch's `within`. */
interface Place {
  inside: boolean;
  own: boolean;
}

/** Every run on a page's clock from here on, held still once caught. */
export class Clock {
  private readonly started: Described[] = [];
  /** Each run held since the catch began, by id: where its target lies. */
  private readonly held = new Map<string, Promise<Place>>();
  /** The catch's `within` while the clock holds; null while it runs. */
  private within: string | null = null;
  private readonly page: Page;
  private readonly cdp: CDPSession;
  runs: Run[] = [];

  private constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
    cdp.on("Animation.animationStarted", (event: { animation: Described }) => {
      this.started.push(event.animation);
      if (this.within !== null) {
        this.hold(event.animation, this.within);
      }
    });
  }

  /**
   * Pauses the run at once, the command sent before anything else is asked
   * of the page; then finds where its target lies, and lets a child frame's
   * run go.
   */
  private hold(run: Described, within: string): void {
    this.cdp
      .send("Animation.setPaused", { animations: [run.id], paused: true })
      .catch(() => undefined);
    this.held.set(run.id, this.letGoUnlessOwn(run, within));
  }

  /** Where the held run lies; a child frame's run is let go. */
  private async letGoUnlessOwn(run: Described, within: string): Promise<Place> {
    const at = await this.place(run.source?.backendNodeId, within);
    if (!at.own) {
      this.held.delete(run.id);
      await this.cdp
        .send("Animation.setPaused", { animations: [run.id], paused: false })
        .catch(() => undefined);
    }
    return at;
  }

  static async on(page: Page): Promise<Clock> {
    const cdp = await page.context().newCDPSession(page);
    const clock = new Clock(page, cdp);
    await cdp.send("Animation.enable");
    return clock;
  }

  /**
   * Holds every run the page starts from here on (until `release`), runs
   * `action`, and keeps as the clock every run it started on an element
   * inside `within` (a selector), frame by frame until one has (a component
   * may start its run a frame after it is placed), then one frame more for
   * any started beside it; those stand at their first frame. Throws when it
   * started none there within `ms`, every held run let go.
   */
  async catchRuns(
    action: () => Promise<unknown>,
    within: string,
    ms = 3000
  ): Promise<Run[]> {
    this.within = within;
    const from = this.started.length;
    let read = from;
    const kept: Run[] = [];
    const deadline = Date.now() + ms;
    try {
      await action();
      for (let after = 0; after < 2 && Date.now() < deadline; ) {
        // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, until the runs are in
        await frames(this.page);
        const fresh = this.started.slice(read);
        read += fresh.length;
        for (const one of fresh) {
          const run = runOf(one);
          // A run of no length (a 0ms transition) is over as it starts: the
          // page drops it at once, and it never stands on the clock.
          // biome-ignore lint/performance/noAwaitInLoops: each run is placed in turn
          if ((await this.held.get(one.id))?.inside && run.end > 0) {
            kept.push(run);
          }
        }
        after += kept.length > 0 ? 1 : 0;
      }
      if (kept.length === 0) {
        const fresh = this.started.slice(from);
        throw new Error(
          `no animation started inside ${within} within ${ms}ms (${fresh.length} elsewhere: ${fresh
            .map((one) => `${one.type} ${one.name}`)
            .slice(0, 8)
            .join(", ")})`
        );
      }
    } catch (error) {
      await this.release();
      throw error;
    }
    await this.cdp.send("Animation.seekAnimations", {
      animations: kept.map((one) => one.id),
      currentTime: 0,
    });
    // What a spec reads on the page (`kitRuns`) must hold every run the
    // protocol caught: a read that sees fewer (a shadow tree's runs, left
    // out of `document.getAnimations()`) would pass on what it never saw.
    const seen = await this.page.evaluate(
      (sel) =>
        window
          .kitRuns()
          .filter(
            (run) =>
              run.playState === "paused" &&
              window.kitInside(
                (run.effect as KeyframeEffect | null)?.target,
                sel
              )
          )
          .map((run) => {
            const named = run as Animation & {
              animationName?: string;
              transitionProperty?: string;
            };
            return `${run.constructor.name} ${named.animationName ?? named.transitionProperty ?? run.id}`;
          }),
      within
    );
    if (seen.length < kept.length) {
      await this.release();
      throw new Error(
        `the page reads ${seen.length} held runs inside ${within} (${seen.join(", ")}), the protocol caught ${kept.length} (${kept.map((one) => `${one.type} ${one.name}`).join(", ")})`
      );
    }
    this.runs = kept;
    return kept;
  }

  /**
   * Where a run's target node lies: whether in the page's own document (the
   * function runs in the node's own realm), and whether it (a
   * pseudo-element's host) lies inside `within`, out through any shadow
   * host (kit.ts `kitInside`). A run with no target, or
   * one whose node is gone, is the page's, outside.
   */
  private async place(
    backendNodeId: number | undefined,
    within: string
  ): Promise<Place> {
    const resolved =
      backendNodeId === undefined
        ? null
        : ((await this.cdp
            .send("DOM.resolveNode", { backendNodeId })
            .catch(() => null)) as { object: { objectId?: string } } | null);
    const objectId = resolved?.object.objectId;
    if (!objectId) {
      return { own: true, inside: false };
    }
    const { result } = (await this.cdp.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration:
        "function (sel) { const t = this instanceof Element ? this : this.element; return { own: window === window.top, inside: window.kitInside(t, sel) }; }",
      arguments: [{ value: within }],
      returnByValue: true,
    })) as { result: { value: Place } };
    return result.value;
  }

  /** The clock's length: the named run's end (its first by that name), or the longest run's. */
  length(of?: string): number {
    const named = of ? this.runs.find((one) => one.name === of) : undefined;
    if (of && !named) {
      throw new Error(
        `no caught run named ${of} (${this.runs.map((one) => one.name).join(", ")})`
      );
    }
    return named ? named.end : Math.max(0, ...this.runs.map((one) => one.end));
  }

  /**
   * Every caught run at `fraction` of the clock (`of` a run's name, else the
   * longest), each held at its own end once past it; then two frames, so
   * what reads the runs each frame has drawn from them.
   */
  async seek(fraction: number, of?: string): Promise<void> {
    const at = this.length(of) * fraction;
    const byTime = new Map<number, string[]>();
    for (const run of this.runs) {
      const t = Math.min(run.end, at);
      byTime.set(t, [...(byTime.get(t) ?? []), run.id]);
    }
    for (const [currentTime, animations] of byTime) {
      // biome-ignore lint/performance/noAwaitInLoops: one time at a time
      await this.cdp.send("Animation.seekAnimations", {
        animations,
        currentTime,
      });
    }
    await frames(this.page);
  }

  /**
   * One clock: every caught run has the same start time, length and
   * easing, the start time the protocol reported as it started (a held run's
   * page-side `startTime` reads null). Only runs on the document's own time
   * are read: a loop (a status's pulse) has no end to share, and a
   * scroll-driven run (`animation-timeline: scroll()`, a track's edge fade)
   * runs on its scroller, not on time. Returns a fault per run off the first
   * and per run with no start time, the runs read (none read is a fault),
   * and the first run's start time.
   */
  oneClock(): { faults: string[]; runs: number; start: number | null } {
    const all = this.runs.filter((run) => !(run.loop || run.scroll));
    const [first] = all;
    if (!first) {
      return {
        faults: ["no caught run on the document's time"],
        runs: 0,
        start: null,
      };
    }
    const what = (run: Run) =>
      `${run.type} ${run.name} ${run.start ?? "no start"}+${run.end} ${run.easing}`;
    const faults = all.flatMap((run) => {
      if (run.start === null || first.start === null) {
        return [`${what(run)}: no start time to compare`];
      }
      return Math.abs(run.start - first.start) > 0.5 ||
        Math.abs(run.end - first.end) > 0.5 ||
        run.easing !== first.easing
        ? [`${what(run)} against ${what(first)}`]
        : [];
    });
    return { faults, runs: all.length, start: first.start };
  }

  /** Lets the clock run again: every held run plays out from where it stands. */
  async release(): Promise<void> {
    this.within = null;
    const ids = [...this.held.keys()];
    this.held.clear();
    for (const id of ids) {
      // A run the page has since replaced or cancelled has nothing to play out.
      // biome-ignore lint/performance/noAwaitInLoops: one run at a time
      await this.cdp
        .send("Animation.setPaused", { animations: [id], paused: false })
        .catch(() => undefined);
    }
    this.runs = [];
  }
}

/** A way of drawing what `selector` names: CSS properties and values. */
export interface Look {
  selector: string;
  style: Record<string, string>;
}

/**
 * Draws the page with `looks` laid over it for a reading, replacing any
 * overlay before it; `[]` takes the overlay away and gives the page back as
 * it was, every caught run where it stood.
 *
 * Each look is a paused Web Animation on each element it names, its one
 * value held (`fill: both`). An animation's values never start, retarget or
 * cancel a CSS transition, as a rule's would; but a running transition
 * outranks an animation in the cascade, so where one runs on a property a
 * look sets, its effect is held aside (`effect = null`) while the look
 * stands and put back after, its time untouched. Throws where a look did not
 * take (an author `!important` outranks an animation), naming the element
 * and the property: a reading is never taken off a page drawn otherwise
 * than asked.
 */
export async function overlay(page: Page, looks: Look[]): Promise<void> {
  const misses = await page.evaluate((list) => {
    interface Held {
      effect: AnimationEffect | null;
      run: Animation;
    }
    const w = window as unknown as {
      __kitLook?: { held: Held[]; over: Animation[] };
    };
    if (w.__kitLook) {
      for (const run of w.__kitLook.over) {
        run.cancel();
      }
      for (const { run, effect } of w.__kitLook.held) {
        run.effect = effect;
      }
    }
    const look = { held: [] as Held[], over: [] as Animation[] };
    w.__kitLook = look;
    const camel = (prop: string) =>
      prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    /** Whether a run (a transition, or keyframes) drives `prop`. */
    const animates = (run: Animation, prop: string) =>
      run instanceof CSSTransition
        ? run.transitionProperty === prop
        : ((run.effect as KeyframeEffect | null)
            ?.getKeyframes()
            .some((frame) => camel(prop) in frame) ?? false);
    /** Holds aside the effect of every run on `el` that drives one of `props`, but the overlay's own. */
    const holdAside = (el: Element, props: string[]) => {
      for (const run of el.getAnimations()) {
        if (!look.over.includes(run) && props.some((p) => animates(run, p))) {
          look.held.push({ run, effect: run.effect });
          run.effect = null;
        }
      }
    };
    /** Lays `frame` on `el` as a paused animation holding its one value. */
    const lay = (el: Element, frame: Record<string, string>) => {
      const over = el.animate([frame, frame], { duration: 1, fill: "both" });
      over.pause();
      look.over.push(over);
    };
    for (const { selector, style } of list) {
      const props = Object.keys(style);
      const frame = Object.fromEntries(
        props.map((prop) => [camel(prop), style[prop] as string])
      );
      for (const el of document.querySelectorAll(selector)) {
        holdAside(el, props);
        lay(el, frame);
      }
    }
    /** Every property a look names that does not compute to its value (one through a var() is not compared). */
    const missed = (selector: string, style: Record<string, string>) =>
      [...document.querySelectorAll(selector)].flatMap((el) => {
        const s = getComputedStyle(el);
        return Object.entries(style).flatMap(([prop, value]) => {
          const now = s.getPropertyValue(prop);
          return value.includes("var(") || now === value
            ? []
            : [`${selector} ${prop}: ${now}, not ${value}`];
        });
      });
    return list.flatMap(({ selector, style }) => missed(selector, style));
  }, looks);
  if (misses.length > 0) {
    throw new Error(
      `the overlay did not take: ${misses.slice(0, 4).join("; ")}`
    );
  }
  await frames(page);
}
