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
