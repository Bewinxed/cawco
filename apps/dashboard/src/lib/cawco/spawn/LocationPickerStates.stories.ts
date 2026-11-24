/**
 * The location popover's states, read one frame each (Component Story
 * Format 3, live components): the popover's form itself on the live
 * story's bench (location-live, `bare`), on what each situation leaves the
 * form holding. The owner strip's presses (its "+N" list is portalled out
 * of the frame, so its rows are found in the document) run from the strip
 * at rest.
 */
import LocationLive from "./location-live.svelte";

export default {
  title: "Spawn/Location picker states",
  tags: ["reading"],
  component: LocationLive,
  args: {
    answer: "listed",
    mode: "repo",
    repo: "",
    dir: "~",
    height: 640,
    bare: true,
    paste: "Nothing pasted",
    lookupMs: 0,
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

/** A pasted URL of one of my repositories: its own row, as in the list. */
export const PastedListed = { args: { paste: "One of my repositories" } };

/** A GitHub repository pasted, with its owners' preview picture. */
export const PastedOnGithub = { args: { paste: "GitHub, with a picture" } };

/** A GitHub repository pasted, still being looked up. */
export const PastedLookingUp = {
  args: { paste: "GitHub, with a picture", lookupMs: 600_000 },
};

/** A GitHub repository pasted that has no preview picture of its own. */
export const PastedNoPicture = { args: { paste: "GitHub, no picture" } };

/** A GitHub URL where gh sees no repository. */
export const PastedNotOnGithub = { args: { paste: "GitHub, nothing there" } };

/** A GitLab project pasted: what its page says, and its picture. */
export const PastedOnGitlab = { args: { paste: "GitLab" } };

/** An ssh URL on our own git server: only what the URL says. */
export const PastedSelfHosted = { args: { paste: "Our own server, over ssh" } };

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

interface Play {
  canvas: {
    getByRole: (role: string, options: { name: RegExp }) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    type: (element: Element, text: string) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

const MORE = /more owners/u;
const SEARCH = "Search owners";
const HARBOUR = "harbour-collective";
/** Longer than the popover takes to open, and a list to settle. */
const SETTLED_MS = 500;

/** "+N" pressed once the location popover stands open: the owners there's no room for in the strip, listed. */
const openMore = async ({ canvas, userEvent }: Play): Promise<void> => {
  await userEvent.wait(SETTLED_MS);
  await userEvent.click(canvas.getByRole("button", { name: MORE }));
  await userEvent.wait(SETTLED_MS);
};

/** The strip at rest: the owners latest active first, as many as fit. */
export const Owners = {};

/** The other owners, opened from "+N". */
export const MoreOwners = { from: "Owners", play: openMore };

/** Searching the other owners by name. */
export const SearchingOwners = {
  from: "Owners",
  play: async (play: Play) => {
    await openMore(play);
    const search = document.querySelector(`[aria-label="${SEARCH}"]`);
    if (search) {
      await play.userEvent.type(search, "har");
    }
    await play.userEvent.wait(SETTLED_MS);
  },
};

/** An owner picked from the list: it stands last in the strip, picked. */
export const OwnerFromList = {
  from: "Owners",
  play: async (play: Play) => {
    await openMore(play);
    const row = document.querySelector(
      `[role="option"][data-value="${HARBOUR}"]`
    );
    if (row) {
      await play.userEvent.click(row);
    }
    await play.userEvent.wait(SETTLED_MS);
  },
};
