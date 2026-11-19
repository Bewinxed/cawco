/**
 * The location chip's popover, to use (Component Story Format 3, live
 * components): the real LocationChip open in the New session form's place
 * (location-live), its machine's gh and folders answered by a bench
 * (location-mock). Search, pick an owner, pick a repository, paste a git
 * URL, switch to Folder, browse. The dial sets what a press can't reach:
 * what the machine's gh answers.
 */
import LocationLive from "./location-live.svelte";

export default {
  title: "Spawn/Location picker",
  component: LocationLive,
  args: { answer: "listed", mode: "repo", repo: "", dir: "~", height: 760 },
  parameters: { viewport: 1440 },
};

/** Choosing where a new session works: your GitHub repositories, latest first. */
export const Live = {};
