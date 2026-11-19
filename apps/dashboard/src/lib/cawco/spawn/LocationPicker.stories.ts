/**
 * The location chip's popover, to use (Component Story Format 3, live
 * components): the real LocationChip open in the New session form's place
 * (location-live), its machine's gh and folders answered by a bench
 * (location-mock). Search, pick an owner, pick a repository, paste a git
 * URL, switch to Folder, browse. The dials set what the machine's gh
 * answers, and which of the mock's URLs is pasted into the search: one the
 * list holds, one on GitHub with a social image and one without, one gh
 * sees nothing at, a GitLab project's page, and an ssh URL on a
 * self-hosted server.
 */
import LocationLive from "./location-live.svelte";

export default {
  title: "Spawn/Location picker",
  component: LocationLive,
  args: {
    answer: "listed",
    mode: "repo",
    repo: "",
    dir: "~",
    height: 760,
    paste: "Nothing pasted",
  },
  parameters: { viewport: 1440 },
};

/** Choosing where a new session works: your GitHub repositories, latest first. */
export const Live = {};
