/**
 * A skeleton handing its place to a read (DESIGN.md, The Claim Of Nothing
 * Rule and The Real Wait Rule), proven on one held read: a site's leg holds
 * the read with `holdRead` before it opens the page, and `proveSwap` reads
 * the four things the rules ask of it from the engine.
 *
 *  1. Inside `--dur-wait-grace` nothing skeleton-like is seen: at grace −
 *     100 ms (from the skeleton's own birth) every kit skeleton in it has a
 *     computed opacity of 0; past grace + `--dur-fade` + 50 ms every one
 *     stands seen (`checkVisibility({ opacityProperty: true })`), and by
 *     +400 ms every one is whole.
 *  2. The skeleton's outer box is the content's: the same inline start and
 *     size within 2 px, and the same block size within `pitch` (2 px, or a
 *     list's documented row pitch where the count of rows is the read's).
 *  3. The arrival is one cross-fade: the transitions Svelte runs on the
 *     skeleton and on what replaces it (`element.animate`, never a CSS
 *     animation) each last `--dur-control`, on one easing, from one start.
 *  4. No empty state stands while the read is held.
 *
 * A sibling's spec adds legs: one `SwapSite` and one held read each.
 */
import type { Page, Route } from "playwright-core";
import type { Kit } from "./kit";

/** A read held back until released: every request matching it waits. */
export interface HeldRead {
  release: () => Promise<void>;
}

/** Holds every request matching `read` from now until released; after, they pass. */
export async function holdRead(page: Page, read: RegExp): Promise<HeldRead> {
  const waiting: Route[] = [];
  let held = true;
  await page.route(read, async (route) => {
    if (held) {
      waiting.push(route);
    } else {
      await route.continue();
    }
  });
  return {
    release: async () => {
      held = false;
      await Promise.all(waiting.splice(0).map((route) => route.continue()));
    },
  };
}

/** One site's skeleton and what replaces it. */
export interface SwapSite {
  /** What the read brings: the node `crossIn` brings in. */
  content: string;
  /** Every empty state the site can draw, which must not stand while held. */
  empty?: string;
  /** The leg's name in each assertion. */
  name: string;
  /** The block-size tolerance, px: 2, or a list's row pitch. */
  pitch?: number;
  /** The skeleton's outer element: the node `crossOut` leaves. */
  skeleton: string;
}

interface Arrival {
  duration: number;
  easing: string;
  on: "skeleton" | "content";
  start: number | null;
}

declare global {
  interface Window {
    probeSwap?: {
      born: Record<string, number>;
      arrivals: Record<string, Arrival[]>;
    };
  }
}

/**
 * Watches the page from its first script on: when each site's skeleton is
 * born, and the transitions running on it and on its content once the
 * content is born. Added before the page opens.
 */
export const watchSwaps = (page: Page, sites: SwapSite[]) =>
  page.addInitScript((all: SwapSite[]) => {
    const state = {
      born: {} as Record<string, number>,
      arrivals: {} as Record<string, Arrival[]>,
    };
    window.probeSwap = state;
    const look = () => {
      for (const site of all) {
        const skeleton = document.querySelector(site.skeleton);
        if (skeleton && !(site.name in state.born)) {
          state.born[site.name] = performance.now();
        }
        const content = document.querySelector(site.content);
        if (!content || site.name in state.arrivals) {
          continue;
        }
        state.arrivals[site.name] = [];
        // A frame on, both transitions have started (an intro waits a microtask).
        requestAnimationFrame(async () => {
          const leaving = document.querySelector(site.skeleton);
          const runs = document.getAnimations().filter((run) => {
            if (run instanceof CSSAnimation || run instanceof CSSTransition) {
              return false;
            }
            const target = (run.effect as KeyframeEffect | null)?.target;
            // On the node itself, inside it, or on the wrapper that carries it.
            return (
              !!target &&
              (content.contains(target) ||
                target.contains(content) ||
                (!!leaving &&
                  (leaving.contains(target) || target.contains(leaving))))
            );
          });
          await Promise.all(runs.map((run) => run.ready.catch(() => run)));
          state.arrivals[site.name] = runs.map((run) => {
            const effect = run.effect as KeyframeEffect;
            return {
              duration: Number(effect.getTiming().duration),
              easing: String(effect.getTiming().easing),
              start: run.startTime === null ? null : Number(run.startTime),
              on:
                leaving &&
                effect.target &&
                (leaving.contains(effect.target) ||
                  effect.target.contains(leaving))
                  ? "skeleton"
                  : "content",
            };
          });
        });
      }
    };
    // Every node holding a kit skeleton taken out of the document, and when:
    // a skeleton put back starts its fade, and its grace, over.
    const moves: string[] = [];
    (window as unknown as { probeMoves: string[] }).probeMoves = moves;
    const named = (node: Element) =>
      `${node.tagName.toLowerCase()}${node.getAttribute("data-slot") ? `[${node.getAttribute("data-slot")}]` : ""}.${[...node.classList].filter((one) => !one.startsWith("svelte-")).join(".")}`;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const gone of record.removedNodes) {
          if (
            gone instanceof Element &&
            (gone.matches(".kit-skeleton") ||
              gone.querySelector(".kit-skeleton"))
          ) {
            moves.push(
              `${Math.round(performance.now())} out ${named(gone)} from ${record.target instanceof Element ? named(record.target) : "?"}`
            );
          }
        }
      }
      look();
    }).observe(document, {
      childList: true,
      subtree: true,
    });
  }, sites);

/** A duration token, in ms. */
export const tokenMs = async (page: Page, token: string): Promise<number> => {
  const said = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token
  );
  return said.endsWith("ms")
    ? Number.parseFloat(said)
    : Number.parseFloat(said) * 1000;
};

/** At `at` ms after the skeleton's birth (page clock): its kit skeletons' opacities and seen-ness, its box, and the empty states. */
const sample = (page: Page, site: SwapSite, at: number) =>
  page.evaluate(
    async ({ site: s, at: when }) => {
      const born = window.probeSwap?.born[s.name] ?? performance.now();
      const wait = born + when - performance.now();
      if (wait > 0) {
        await new Promise((done) => setTimeout(done, wait));
      }
      const skeleton = document.querySelector(s.skeleton);
      const bones = [...(skeleton?.querySelectorAll(".kit-skeleton") ?? [])];
      const r = skeleton?.getBoundingClientRect();
      return {
        late: Math.round(performance.now() - born - when),
        stands: !!skeleton,
        bones: bones.length,
        opacities: bones.map(
          (bone) =>
            Math.round(Number(getComputedStyle(bone).opacity) * 100) / 100
        ),
        seen: bones.filter((bone) =>
          bone.checkVisibility({ opacityProperty: true })
        ).length,
        // The first bone's fade: its delay and when it began, from the
        // skeleton's birth, and whether it is the node seen before.
        fade: (() => {
          const bone = bones[0] as
            (HTMLElement & { probeSeen?: true }) | undefined;
          const run = bone
            ?.getAnimations()
            .find((one) => one instanceof CSSAnimation);
          const again = !!bone?.probeSeen;
          if (bone) {
            bone.probeSeen = true;
          }
          return run
            ? {
                delay: getComputedStyle(bone as Element).animationDelay,
                began: Math.round(Number(run.startTime ?? 0) - born),
                again,
              }
            : null;
        })(),
        box: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        empties: s.empty ? document.querySelectorAll(s.empty).length : 0,
        born: Math.round(born),
        moves:
          (window as unknown as { probeMoves?: string[] }).probeMoves ?? [],
      };
    },
    { site, at }
  );

const near = (a: number, b: number, by: number) => Math.abs(a - b) <= by;

/**
 * The four assertions on one site, its read held by `held` and its page
 * opened with `watchSwaps`. Releases the read.
 */
export async function proveSwap(
  kit: Kit,
  page: Page,
  site: SwapSite,
  held: HeldRead
): Promise<void> {
  await page.waitForSelector(site.skeleton, {
    state: "attached",
    timeout: 60_000,
  });
  const grace = await tokenMs(page, "--dur-wait-grace");
  const fade = await tokenMs(page, "--dur-fade");
  const control = await tokenMs(page, "--dur-control");
  const inside = await sample(page, site, grace - 100);
  const past = await sample(page, site, grace + fade + 50);
  // Whole once its fade has had room: a style resolved a few frames after
  // the insertion (a loaded machine) starts the fade that much later.
  const whole = await sample(page, site, grace + fade + 400);
  kit.check(
    `${site.name}: nothing seen inside --dur-wait-grace (${grace} ms), every bone seen past it and --dur-fade (${fade} ms), whole by +400 ms`,
    inside.stands &&
      inside.bones > 0 &&
      inside.seen === 0 &&
      inside.opacities.every((one) => one === 0) &&
      past.stands &&
      past.seen === past.bones &&
      past.opacities.every((one) => one > 0) &&
      whole.stands &&
      whole.opacities.every((one) => one >= 0.99),
    `at grace − 100: ${JSON.stringify(inside)}; at grace + fade + 50: ${JSON.stringify(past)}; at grace + fade + 400: ${JSON.stringify(whole.opacities)}`
  );
  kit.check(
    `${site.name}: no empty state while the read is held`,
    inside.empties === 0 && past.empties === 0 && whole.empties === 0,
    `empties ${inside.empties}, ${past.empties}, then ${whole.empties} (${site.empty ?? "none named"})`
  );
  const { box: was } = past;
  await held.release();
  await page.waitForSelector(site.content, { timeout: 60_000 });
  // The cross-fade done, and the content's box settled.
  await page.waitForTimeout(control + 300);
  const after = await page.evaluate((s) => {
    const el = document.querySelector(s.content);
    const r = el?.getBoundingClientRect();
    return {
      box: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      skeletonGone: !document.querySelector(s.skeleton),
      arrivals: window.probeSwap?.arrivals[s.name] ?? [],
    };
  }, site);
  const pitch = site.pitch ?? 2;
  const { box } = after;
  kit.check(
    `${site.name}: the skeleton's box is the content's (inline within 2 px, block within ${pitch} px)`,
    !!was &&
      !!box &&
      near(was.x, box.x, 2) &&
      near(was.y, box.y, 2) &&
      near(was.w, box.w, 2) &&
      near(was.h, box.h, pitch),
    `skeleton ${JSON.stringify(was)}; content ${JSON.stringify(box)}`
  );
  const runs = after.arrivals;
  const starts = new Set(runs.map((run) => run.start));
  const easings = new Set(runs.map((run) => run.easing));
  kit.check(
    `${site.name}: the arrival is one cross-fade over --dur-control (${control} ms): the skeleton out and the content in, one clock`,
    after.skeletonGone &&
      runs.some((run) => run.on === "content") &&
      runs.some((run) => run.on === "skeleton") &&
      runs.every((run) => run.duration === control) &&
      starts.size === 1 &&
      !starts.has(null) &&
      easings.size === 1,
    `arrivals ${JSON.stringify(runs)}`
  );
}
