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
 * from `getAnimations()`. Returns a fault per run off the first, and the
 * runs read (none read is a fault).
 */
export function oneClock(
  page: Page,
  selectors: string[]
): Promise<{ faults: string[]; runs: number }> {
  return page.evaluate((sels) => {
    const runs = sels.flatMap((sel) =>
      [...document.querySelectorAll(sel)].flatMap((el) =>
        el.getAnimations({ subtree: true })
      )
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
