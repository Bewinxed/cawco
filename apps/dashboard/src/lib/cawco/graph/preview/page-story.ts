/**
 * A story of the design graph's own states file, read for its page
 * (/dev/design-graph `?story=`): the args it hands its frame, so the page
 * draws that state at the window's own width.
 */

// biome-ignore lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as GraphStates from "../DesignGraph.stories";
import type { Ask } from "../DesignGraph.svelte";
import type { ReviewInput } from "../model";

/** What a story of the design graph hands its frame. */
export interface PageStory {
  alone?: ReviewInput | null;
  ask?: Ask;
  lang?: string;
  opensAt?: "head" | "half" | "whole";
  stale?: boolean;
  withRoster?: boolean;
}

const stories = GraphStates as unknown as Record<
  string,
  { args?: PageStory } | undefined
>;

/** The story `name`'s args over its meta's; null when the file has no such story. */
export function pageStory(name: string): PageStory | null {
  const story = stories[name];
  return story && name !== "default"
    ? { ...(GraphStates.default.args as PageStory), ...story.args }
    : null;
}
