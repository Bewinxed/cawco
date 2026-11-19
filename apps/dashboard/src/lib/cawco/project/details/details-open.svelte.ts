/**
 * The projects whose details card stands open. Kept past the head: on a
 * phone a task opens as its own page, and Back finds the card where it was
 * (The Open Page Rule: the surface waits).
 */
import { SvelteSet } from "svelte/reactivity";

const standing = new SvelteSet<string>();

export const detailsOpen = {
  /** Whether `projectId`'s details card stands open. */
  of: (projectId: string): boolean => standing.has(projectId),
  open: (projectId: string): void => {
    standing.add(projectId);
  },
  close: (projectId: string): void => {
    standing.delete(projectId);
  },
};
