/**
 * The location popover's states, read one frame each (Component Story
 * Format 3, live components): the popover's form itself on the live
 * story's bench (location-live, `bare`), on what each situation leaves the
 * form holding.
 */
import LocationLive from "./location-live.svelte";

export default {
  title: "Spawn/Location picker states",
  component: LocationLive,
  args: {
    answer: "listed",
    mode: "repo",
    repo: "",
    dir: "~",
    height: 640,
    bare: true,
  },
  parameters: { viewport: 1440 },
};

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
