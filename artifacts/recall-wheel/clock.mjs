/**
 * A page clock the checks can stop and step, in Chromium and WebKit alike:
 * `performance.now()` and every requestAnimationFrame callback read a
 * virtual time, and every animation (Web Animations and CSS transitions)
 * plays at the clock's rate. Stopped, `__clock.advance(ms)` steps it a
 * 60Hz frame at a time, one real frame each, so the spring the wheel rolls
 * on, the grown shape's rAF morph and the CSS fades all land where they
 * would at that moment on a real clock.
 *
 *   await context.addInitScript(CLOCK);
 *   await page.evaluate(() => __clock.stop());
 *   await page.keyboard.press("ArrowUp");
 *   await page.evaluate(() => __clock.advance(160)); // 50% of --dur-grow
 */
export const CLOCK = () => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  let base = realNow();
  let virtual = base;
  let rate = 1;
  const now = () => virtual + (realNow() - base) * rate;
  performance.now = now;
  window.requestAnimationFrame = (callback) => realRaf(() => callback(now()));
  /** Animations on the page's clock; scroll-driven ones follow the scroll. */
  const timed = () =>
    document
      .getAnimations()
      .filter((run) => run.timeline === document.timeline);
  /** Each animation's own direction: 1, or -1 once reversed. */
  const way = new WeakMap();
  const dir = (run) => way.get(run) ?? 1;
  const sync = () => {
    for (const run of timed()) {
      if (
        run.playState !== "finished" &&
        run.playbackRate !== dir(run) * rate
      ) {
        run.playbackRate = dir(run) * rate;
      }
    }
  };
  const { animate } = Element.prototype;
  Element.prototype.animate = function (...args) {
    const run = animate.apply(this, args);
    run.playbackRate = rate;
    return run;
  };
  const { reverse } = Animation.prototype;
  Animation.prototype.reverse = function () {
    way.set(this, -dir(this));
    if (rate === 0) {
      this.playbackRate = 0;
      this.play();
    } else {
      reverse.call(this);
    }
  };
  /** Steps a stopped animation `d` ms on its own way, finishing it at its end. */
  const nudge = (run, d) => {
    const end = run.effect?.getComputedTiming().endTime ?? 0;
    const next = run.currentTime + dir(run) * d;
    if (dir(run) > 0 ? next >= end : next <= 0) {
      run.playbackRate = dir(run);
      run.finish();
    } else {
      run.currentTime = next;
    }
  };
  // Transitions started by a style change get the rate on the next frame;
  // getAnimations() flushes style first, so it sees them before they tick.
  const poll = () => {
    sync();
    realRaf(poll);
  };
  realRaf(poll);
  const frame = () => new Promise((done) => realRaf(() => done()));
  window.__clock = {
    stop() {
      virtual = now();
      base = realNow();
      rate = 0;
      sync();
    },
    run() {
      virtual = now();
      base = realNow();
      rate = 1;
      sync();
    },
    /** Steps the stopped clock `ms` on, a 60Hz frame at a time. */
    async advance(ms) {
      const step = 1000 / 60;
      for (let done = 0; done < ms - 0.01; done += step) {
        const d = Math.min(step, ms - done);
        sync();
        virtual += d;
        for (const run of timed()) {
          if (run.playState !== "finished" && run.currentTime !== null) {
            nudge(run, d);
          }
        }
        // biome-ignore lint/performance/noAwaitInLoops: one frame a step
        await frame();
      }
      await frame();
      await frame();
    },
  };
};
