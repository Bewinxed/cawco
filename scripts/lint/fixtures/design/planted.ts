/**
 * Planted mistakes in a module's class strings and script, each where its
 * rule must report it (expected.txt), as planted.svelte holds the markup's.
 */
const cn = (...classes: string[]): string => classes.join(" ");

export const look = cn("rounded-md p-[3px]", "rounded-huge");

export const settle = (node: HTMLElement): string =>
  node.style.getPropertyValue("--dur-settle");
