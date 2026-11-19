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

/** A repository picked: it clones into the home folder. */
export const Picked = {
  args: { repo: "https://github.com/petralab/agent-evals.git" },
};

/** A repository already cloned there: the session uses that clone. */
export const AlreadyCloned = {
  args: { repo: "https://github.com/bewinxed/cockpit.git" },
};

/** A folder of the repository's name holds another one: nothing can be cloned there. */
export const FolderInTheWay = {
  args: { repo: "https://github.com/bewinxed/dotfiles.git" },
};

/** A git URL from another host, taken as it is written. */
export const PastedUrl = {
  args: { repo: "git@gitlab.com:someone/notes.git" },
};

/** The repositories are still being read. */
export const Reading = { args: { answer: "loading" } };

/** The machine has no gh: paste a git URL instead. */
export const NoGh = { args: { answer: "no-gh" } };

/** gh isn't signed in on the machine. */
export const SignedOut = { args: { answer: "signed-out" } };

/** The machine's CawCo is too old to list repositories. */
export const OldDaemon = { args: { answer: "old-daemon" } };

/** Working in a folder that isn't on the machine. */
export const FolderMissing = { args: { mode: "dir", dir: "~/code/new-thing" } };
