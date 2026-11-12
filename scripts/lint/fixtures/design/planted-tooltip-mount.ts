/**
 * Planted mounts for house/tooltip-provider-at-root (expected.txt): a tree
 * whose root is off the rule's root list, which it reports, and one whose
 * root is on it, which it leaves alone.
 */
import { mount } from "svelte";
import Stray from "./planted-tooltip.svelte";
import Rooted from "./planted-tooltip-root.svelte";

export const unrooted = (target: HTMLElement) => mount(Stray, { target });
export const rooted = (target: HTMLElement) => mount(Rooted, { target });
