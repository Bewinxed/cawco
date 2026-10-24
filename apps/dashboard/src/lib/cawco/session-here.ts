/**
 * The session whose conversation a component stands in (Transcript.svelte
 * provides it): a chip pressed there opens its artifact in that session's
 * panel, the one on screen, never another session's (reference-open.svelte.ts
 * `openReference`). Context, not a store: a desk shows two conversations at
 * once, each its own.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("session-here");

/** The components under this one stand in session `id`'s conversation. */
export function provideSessionHere(id: () => string): void {
  setContext(KEY, id);
}

/** The session whose conversation this component stands in, or none (a task's page, Home). */
export const sessionHere = (): (() => string) | undefined =>
  getContext<(() => string) | undefined>(KEY);
