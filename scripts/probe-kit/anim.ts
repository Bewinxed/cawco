/**
 * Motion by scrubbing the clock, never by filming it: the DevTools
 * protocol's Animation domain holds every animation still and seeks it to a
 * fraction of its run, and the engine's computed values are read there.
 *
 * `catchRuns` sets the document timeline's rate to 0 (`Animation.
 * setPlaybackRate`), so what an action starts (a class change's CSS
 * transitions, a component's Web Animations) starts and stands at its first
 * frame; the runs `Animation.animationStarted` reports whose target lies in
 * `within` are the clock. `seek` moves each with `Animation.seekAnimations`
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
  /** A CSS transition's property, a CSS animation's name, a Web Animation's id. */
  name: string;
  type: "CSSTransition" | "CSSAnimation" | "WebAnimation";
}

interface Described {
  id: string;
  name: string;
  source?: {
    delay: number;
    duration: number;
    easing: string;
    endDelay?: number;
    iterations?: number;
  };
  type: Run["type"];
}

/** Every run on a page's clock from here on, held still once caught. */
export class Clock {
  private readonly started: Described[] = [];
  private readonly page: Page;
  private readonly cdp: CDPSession;
  runs: Run[] = [];

  private constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
    cdp.on("Animation.animationStarted", (event: { animation: Described }) => {
      this.started.push(event.animation);
    });
  }

  static async on(page: Page): Promise<Clock> {
    const cdp = await page.context().newCDPSession(page);
    const clock = new Clock(page, cdp);
    await cdp.send("Animation.enable");
    return clock;
  }

  /**
   * Holds the timeline still, runs `action`, and keeps as the clock every
   * run it started on an element inside `within` (a selector), frame by
   * frame until one has (a component may start its run a frame after it is
   * placed), then one frame more for any started beside it. Throws when it
   * started none there within `ms`, the timeline running again.
   */
  async catchRuns(
    action: () => Promise<unknown>,
    within: string,
    ms = 3000
  ): Promise<Run[]> {
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
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
          // biome-ignore lint/performance/noAwaitInLoops: each run is resolved in turn
          if (await this.targets(one.id, within)) {
            const s = one.source;
            kept.push({
              id: one.id,
              name: one.name,
              type: one.type,
              easing: s?.easing ?? "",
              end:
                (s?.delay ?? 0) +
                (s?.duration ?? 0) * (s?.iterations ?? 1) +
                (s?.endDelay ?? 0),
            });
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
      await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      throw error;
    }
    await this.cdp.send("Animation.setPaused", {
      animations: kept.map((one) => one.id),
      paused: true,
    });
    this.runs = kept;
    return kept;
  }

  /** Whether the run's target (a pseudo-element's host) lies inside `within`. */
  private async targets(id: string, within: string): Promise<boolean> {
    const { remoteObject } = (await this.cdp.send(
      "Animation.resolveAnimation",
      {
        animationId: id,
      }
    )) as { remoteObject: { objectId?: string } };
    if (!remoteObject.objectId) {
      return false;
    }
    const { result } = (await this.cdp.send("Runtime.callFunctionOn", {
      objectId: remoteObject.objectId,
      functionDeclaration:
        "function (sel) { const t = this.effect && this.effect.target; return !!t && !!t.closest(sel); }",
      arguments: [{ value: within }],
      returnByValue: true,
    })) as { result: { value: boolean } };
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

  /** Lets the clock run again: the caught runs play out from where they stand. */
  async release(): Promise<void> {
    for (const run of this.runs) {
      // A run the page has since replaced or cancelled has nothing to play out.
      // biome-ignore lint/performance/noAwaitInLoops: one run at a time
      await this.cdp
        .send("Animation.setPaused", { animations: [run.id], paused: false })
        .catch(() => undefined);
    }
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    this.runs = [];
  }
}

/**
 * One clock: every animation running on the elements `selectors` name
 * (pseudo-elements' included) has the same start time, duration and easing,
 * from `getAnimations()`. Only runs on the document's own time are read: a
 * loop (infinite iterations, a status's pulse) has no end to share, and a
 * scroll-driven one (`animation-timeline: scroll()`, a track's edge fade)
 * runs on its scroller, not on time. Returns a fault per run off the first,
 * and the runs read (none read is a fault).
 */
export function oneClock(
  page: Page,
  selectors: string[]
): Promise<{ faults: string[]; runs: number }> {
  return page.evaluate((sels) => {
    const runs = sels
      .flatMap((sel) =>
        [...document.querySelectorAll(sel)].flatMap((el) =>
          el.getAnimations({ subtree: true })
        )
      )
      .filter(
        (run) =>
          run.timeline instanceof DocumentTimeline &&
          run.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY
      );
    const read = (run: Animation) => {
      const timing = run.effect?.getTiming();
      return {
        what:
          run instanceof CSSTransition
            ? `transition ${run.transitionProperty}`
            : `${run.constructor.name} ${run.id}`,
        start: Number(run.startTime ?? Number.NaN),
        duration: Number(timing?.duration ?? 0) + Number(timing?.delay ?? 0),
        easing: timing?.easing ?? "",
      };
    };
    const all = runs.map(read);
    const [first] = all;
    if (!first) {
      return { faults: ["no animation running"], runs: 0 };
    }
    const faults = all.flatMap((r) =>
      Math.abs(r.start - first.start) > 0.5 ||
      Math.abs(r.duration - first.duration) > 0.5 ||
      r.easing !== first.easing
        ? [
            `${r.what} ${r.start}+${r.duration} ${r.easing} against ${first.what} ${first.start}+${first.duration} ${first.easing}`,
          ]
        : []
    );
    return { faults, runs: all.length };
  }, selectors);
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
