/**
 * Planted mistakes in a module's class strings and script, each where its
 * rule must report it (expected.txt), as planted.svelte holds the markup's.
 */
const cn = (...classes: string[]): string => classes.join(" ");

export const look = cn("rounded-md p-[3px]", "rounded-huge");

export const settle = (node: HTMLElement): string =>
  node.style.getPropertyValue("--dur-settle");

export const cutsAndMoves = [{ translate: "0 4px", clipPath: "inset(2px)" }];
export const cuts = [{ clipPath: "inset(2px)", opacity: 0 }];
export const css = (t: number): string =>
  `transform: scale(${t}); clip-path: inset(0 ${1 - t}% 0 0)`;
export const cut = (node: HTMLElement, frame: Keyframe): void => {
  frame.clipPath = "inset(2px)";
  node.style.clipPath = "inset(2px)";
};
export const reveals = (node: HTMLElement): void => {
  node.scrollIntoView({ block: "nearest" });
};
export const slide = (node: HTMLElement): Animation =>
  node.animate([{ opacity: 0 }, { opacity: 1 }], 120);
export const fade = { duration: 200, delay: 0, easing: "ease-out" };
export const glide = "transform 120ms var(--ease-out)";
export const swap = { transition: "opacity var(--dur-fade) ease" };
export const bend = "cubic-bezier(0.2, 0, 0, 1)";
export const still = { duration: 0, easing: "linear" };
export const said = "timed out after 30000ms";
export const drop = (node: HTMLElement): Animation =>
  node.animate([{ translate: "0 18px" }, { translate: "0 0" }], {
    duration: 0,
  });
const NUDGE_PX = 40;
export const nudge = (node: HTMLElement, dir: number): Animation =>
  node.animate(
    [{ transform: `translateX(${dir * NUDGE_PX}px)` }, { transform: "none" }],
    { duration: 0 }
  );
export const rise = () => ({
  css: (t: number) => `transform: translateY(${(1 - t) * 8}px)`,
});
export const cascade = (i: number) => ({ delay: i * 30 });
export const risen = (node: HTMLElement, t: number): Animation =>
  node.animate(
    [
      { translate: "0 var(--pop-rise)", outline: "1px solid" },
      { translate: `0 calc(var(--pop-rise) * ${1 - t})` },
    ],
    { duration: 0 }
  );
export const tokenTimes = (ms: number) => ({ delay: ms * 1.5 });
