/**
 * The side surface taking the whole split (SideSplit): the split gives its
 * head's Expand control what it needs through this context, so the panes
 * that draw the head (PlanPane, PreviewPane) need not carry it. Outside a
 * split (the artifact's own tab) there is none, and the head has no Expand.
 */
import { getContext, setContext } from "svelte";

export interface SideExpand {
  /** The split can expand here: a desk or tablet, with the surface open. */
  readonly available: boolean;
  /** Esc: back to the split at once, with no slide; false when it was not expanded. */
  readonly collapse: () => boolean;
  /** The surface has the whole split; the conversation is put away. */
  readonly expanded: boolean;
  readonly toggle: () => void;
}

const KEY = Symbol("side-expand");

export function setSideExpand(expand: SideExpand): void {
  setContext(KEY, expand);
}

export function sideExpand(): SideExpand | undefined {
  return getContext<SideExpand | undefined>(KEY);
}
