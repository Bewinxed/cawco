/**
 * How an element came onto the page, read as the engine made it: every run
 * the page starts, recorded as it is made, from before the page's own
 * scripts. A Web Animation as `Element.animate` makes it (Svelte's
 * transitions, motion/curves `appearOnMount`, motion/pop); a CSS transition
 * or animation as its `transitionrun` / `animationstart` says, a
 * pseudo-element's included. Recorded as made, never polled: a run on a page
 * busy for longer than it lasts is gone before a frame's poll sees it.
 * Nothing is held.
 *
 *   await page.addInitScript(recordRuns);
 *   … the act that brings the element on …
 *   const seen = await page.evaluate(runsOn, { selector, pseudo: null });
 *   kit.check("…", seen.every((one) => oneEntrance(one.runs, ms)), …);
 *
 * An entrance is one run on the element itself, never a CSS transition (a
 * `@starting-style` entrance, which WebKit sometimes skips for an element
 * just added: bugs.webkit.org 275184), over the length its site names.
 */

/** One run as it was made. */
export interface Recorded {
  duration: number;
  easing: string;
  /** Web Animation, CSSTransition or CSSAnimation. */
  kind: string;
  /** A CSS transition's property, a CSS animation's name. */
  name: string;
  pseudo: string | null;
  target: Element | null;
}

declare global {
  interface Window {
    /** Every run the page made, as it made it (`recordRuns`). */
    probeEntranceRuns?: Recorded[];
  }
}

/** Before the page's own scripts (`page.addInitScript`): every run it makes, as it makes it. */
export function recordRuns(): void {
  const runs: Recorded[] = [];
  window.probeEntranceRuns = runs;
  const seen = new WeakSet<Animation>();
  const keep = (one: Animation) => {
    if (seen.has(one)) {
      return;
    }
    seen.add(one);
    const effect = one.effect as KeyframeEffect | null;
    const named = one as Animation & {
      animationName?: string;
      transitionProperty?: string;
    };
    runs.push({
      kind: one.constructor.name,
      name: named.transitionProperty ?? named.animationName ?? "",
      duration: Number(effect?.getTiming().duration ?? 0),
      easing: String(effect?.getTiming().easing ?? ""),
      target: effect?.target ?? null,
      pseudo: effect?.pseudoElement ?? null,
    });
  };
  const made = Element.prototype.animate;
  Element.prototype.animate = function animate(
    this: Element,
    ...args: Parameters<Element["animate"]>
  ) {
    const animation = made.apply(this, args);
    keep(animation);
    return animation;
  };
  /** A CSS list's items, split at its top-level commas (a `cubic-bezier(…)` keeps its own). */
  const items = (list: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let item = "";
    for (const c of list) {
      if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
      }
      if (c === "," && depth === 0) {
        out.push(item.trim());
        item = "";
      } else {
        item += c;
      }
    }
    out.push(item.trim());
    return out;
  };
  /** A CSS time (`0.28s`, `280ms`) in ms. */
  const ms = (time: string) => {
    const n = Number.parseFloat(time);
    return time.trim().endsWith("ms") ? n : n * 1000;
  };
  const started = (event: Event) => {
    const at = event.target instanceof Element ? event.target : null;
    if (!at) {
      return;
    }
    const css = event as AnimationEvent & TransitionEvent;
    const pseudo = css.pseudoElement || null;
    const found = at.getAnimations({ subtree: true }).filter((animation) => {
      const effect = animation.effect as KeyframeEffect | null;
      return effect?.target === at && (effect.pseudoElement ?? null) === pseudo;
    });
    for (const animation of found) {
      keep(animation);
    }
    if (found.length > 0) {
      return;
    }
    // WebKit lists no pseudo-element's run here (`getAnimations` on its
    // element comes back empty as its `animationstart` is heard): it is
    // said from the event, its length from the pseudo-element's style.
    const style = getComputedStyle(at, pseudo ?? undefined);
    const keyframed = event.type === "animationstart";
    const names = items(
      keyframed ? style.animationName : style.transitionProperty
    );
    const name = keyframed ? css.animationName : css.propertyName;
    const index = Math.max(0, names.indexOf(name));
    const pick = (list: string) => {
      const all = items(list);
      return all[index % all.length] ?? "";
    };
    runs.push({
      kind: keyframed ? "CSSAnimation" : "CSSTransition",
      name,
      duration: ms(
        pick(keyframed ? style.animationDuration : style.transitionDuration)
      ),
      easing: pick(
        keyframed
          ? style.animationTimingFunction
          : style.transitionTimingFunction
      ),
      target: at,
      pseudo,
    });
  };
  for (const type of ["transitionrun", "animationstart"]) {
    addEventListener(type, started, true);
  }
}

/** A run as a spec reads it. */
export interface Run {
  duration: number;
  easing: string;
  kind: string;
  name: string;
}

/**
 * Each element `selector` names, and the runs made on it (on its `pseudo`,
 * `::before`, when given; on the element itself when null) that had a
 * length: Svelte's lead-in before its keyframes has none.
 */
export function runsOn(args: {
  pseudo: string | null;
  selector: string;
}): { at: string; runs: Run[] }[] {
  const runs = window.probeEntranceRuns ?? [];
  return [...document.querySelectorAll(args.selector)].map((el) => ({
    at: `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}`,
    runs: runs
      .filter(
        (one) =>
          one.target === el &&
          (one.pseudo ?? null) === args.pseudo &&
          one.duration > 0
      )
      .map(({ duration, easing, kind, name }) => ({
        duration,
        easing,
        kind,
        name,
      })),
  }));
}

/** Its entrance was one run, not a CSS transition, over `ms`. */
export const oneEntrance = (runs: Run[], ms: number): boolean =>
  runs.length === 1 &&
  runs[0]?.kind !== "CSSTransition" &&
  Math.abs((runs[0]?.duration ?? 0) - ms) < 1;

/** A `--dur-*` token on the page, in ms (`0.2s` or `200ms` as the stylesheet says it). */
export function durOf(token: string): number {
  const said = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const n = Number.parseFloat(said);
  return said.endsWith("ms") ? n : n * 1000;
}
