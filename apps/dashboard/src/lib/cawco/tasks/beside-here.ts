/**
 * The conversation a component stands in, for a task to stand beside it
 * (beside.svelte.ts `standBeside`): a task or to-do chip in its transcript
 * (ThingReference), and one in a page its panel shows (preview/frame-links,
 * through references.ts `followReference`). Context, not a store: a desk
 * shows two conversations at once, each its own. Its own module, so the
 * artifact's own tab, which stands in no conversation and never loads the
 * conversation's code, can ask it and hear none.
 */
import { getContext, setContext } from "svelte";

const HERE = Symbol("task-beside");

/**
 * The components under this one stand in a conversation that can hold a
 * task beside it: `at` answers its session, or null where nothing stands
 * beside it (a conversation docked in a project's panel).
 */
export function provideBeside(at: () => string | null): void {
  setContext(HERE, at);
}

/** The session a task chip here stands its task beside; none outside a conversation (a project's page, Home, an artifact's own tab). */
export const besideHere = (): (() => string | null) | undefined =>
  getContext<(() => string | null) | undefined>(HERE);
