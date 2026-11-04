/**
 * What the person reads when a project ends: forgotten (it waits in
 * Forgotten projects, to be brought back) or deleted for good, from the tray
 * under the project's head or its row in the rail (dashboard StopTray,
 * stop-work.svelte.ts), the toast after a forget, and the list of forgotten
 * projects (`/project/forgotten`). The hub's refusals, said under each, are
 * project-trash.ts's.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A count with its noun: "1 task", "3 pages". */
const count = (n: number, one: string, many: string) =>
  `${n} ${plural(n, one, many)}`;

/** A list of phrases as a sentence says them: "a, b and c". */
const listed = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** Where a tray stands in its end: asking, stops landing, the end running, ended, refused. */
type EndStep =
  "none" | "list" | "armed" | "stopping" | "fail" | "ending" | "done";

/** One end's words, for its tray, its parked line and its confirm. */
export interface EndWords {
  /** The second press, asked only while `cut` of the `n` listed are mid-turn. */
  armed: (n: number, cut: number) => string;
  /** The confirm's word once the end has run. */
  ended: string;
  /** The confirm's word while the stops land and the end runs. */
  ending: string;
  /**
   * The line under the title, in each step; `stopped` is what the stops did
   * ("Stopped 4 sessions."), empty when nothing ran.
   */
  line: (step: EndStep, n: number, cut: number, stopped: string) => string;
  /** Parked, while the stops land. */
  parked: (stopped: number, total: number) => string;
  /** Parked, once a stop failed: what was left. */
  partway: (stopped: number, total: number) => string;
  /** The plain question's confirm, with nothing running. */
  plain: string;
  /** The first press, with sessions running. */
  stop: (n: number) => string;
  /** The question, until the end has run. */
  title: string;
  /** The title once it has: the question answered. */
  titleDone: string;
}

/** What the stops did, then what stands: one sentence or two. */
const after = (stopped: string, stands: string) =>
  stopped ? `${stopped} ${stands}` : stands;

/** The armed line: that a second press stops them, and what it cuts short. */
const armedLine = (n: number, cut: number): string => {
  const cuts =
    cut === 1 ? "Its turn is cut short." : "Their turns are cut short.";
  if (cut === n) {
    return cut === 1
      ? `1 session is mid-turn. Press again to stop it. ${cuts}`
      : `${cut} sessions are mid-turn. Press again to stop them. ${cuts}`;
  }
  return `${cut} of ${n} sessions ${cut === 1 ? "is" : "are"} mid-turn. Press again to stop all ${n}. ${cuts}`;
};

/** A forget's line while it stands: where the project waits. */
const waits = "It waits in Forgotten projects to be brought back.";
/** A refused end's line: the project stays. */
const kept = "It is kept until every session is stopped.";

export const projectEndWords = {
  // ── The menus ──
  /** The More menu's and the rail menu's forget. */
  forgetProject: "Forget project…",
  /** The More menu's and the rail menu's delete for good. */
  deleteProject: "Delete project…",

  /** Forgetting `name`: it waits in Forgotten projects, to be brought back. */
  forget: (name: string): EndWords => ({
    title: `Forget ${name}?`,
    titleDone: `${name} is forgotten`,
    plain: "Forget project",
    stop: (n) => `Stop ${n} and forget`,
    armed: (n, cut) =>
      cut === n
        ? `Stop ${n} mid-turn and forget`
        : `Stop ${n}, ${cut} mid-turn, and forget`,
    ending: "Forgetting…",
    ended: "Forgotten",
    line: (step, n, cut, stopped) => {
      switch (step) {
        case "none":
        case "list":
        case "stopping":
          return waits;
        case "armed":
          return armedLine(n, cut);
        case "fail":
          return kept;
        case "ending":
        case "done":
          return after(stopped, waits);
      }
    },
    parked: (stopped, total) =>
      `Forgetting: stopped ${stopped} of ${count(total, "session", "sessions")}…`,
    partway: (stopped, total) =>
      `Stopped ${stopped} of ${count(total, "session", "sessions")}; it is kept.`,
  }),

  /** Deleting `name` for good (its files box says what else goes). */
  delete: (name: string): EndWords => ({
    title: `Delete ${name} for good?`,
    titleDone: `${name} is deleted`,
    plain: "Delete project",
    stop: (n) => `Stop ${n} and delete`,
    armed: (n, cut) =>
      cut === n
        ? `Stop ${n} mid-turn and delete`
        : `Stop ${n}, ${cut} mid-turn, and delete`,
    ending: "Deleting…",
    ended: "Deleted",
    line: (step, n, cut, stopped) => {
      switch (step) {
        case "none":
        case "list":
        case "stopping":
          return "Its tasks, pages, routines, workspaces and signed-in browsers are removed. This cannot be undone.";
        case "armed":
          return armedLine(n, cut);
        case "fail":
          return kept;
        case "ending":
          return after(
            stopped,
            "Removing its tasks, pages, routines, workspaces and signed-in browsers…"
          );
        case "done":
          return after(
            stopped,
            "Its tasks, pages, routines, workspaces and signed-in browsers are removed."
          );
      }
    },
    parked: (stopped, total) =>
      `Deleting: stopped ${stopped} of ${count(total, "session", "sessions")}…`,
    partway: (stopped, total) =>
      `Stopped ${stopped} of ${count(total, "session", "sessions")}; it is kept.`,
  }),

  /** Said under what asked while what runs in the project is read. */
  reading: "Checking for running sessions…",

  /** Delete's box: its places on disk and its transcripts go too. */
  fromDisk: "Also delete its files on disk",
  /** Checked, for a project whose only place is its folder on the hub: what the box still removes. */
  noPlaces:
    "It has no checkout on any machine; only its sessions' transcripts are removed.",
  /** Checked, under the checkouts it lists: what else goes. */
  transcriptsGo: "Its sessions' transcripts are removed too.",
  /** Unchecked: what a delete leaves, and where it may show again. */
  transcriptsStay:
    "Its sessions' transcripts stay on their machines and may show again as sessions with no project.",

  // ── After a forget ──
  /** The toast after a forget. */
  forgot: (name: string) => `Forgot ${name}.`,
  /** The toast's action, and each forgotten row's. */
  bringBack: "Bring back",
  bringingBack: "Bringing back…",

  // ── Forgotten projects ──
  /** The page's title (the bar's) and the rail glyph's name. */
  forgottenTitle: "Forgotten projects",
  /** A row forgotten before the hub kept a project's name. */
  unnamed: "Unnamed project",
  /** A named row's checkout, under its name. */
  placeAt: (machine: string, path: string) => `${machine} · ${path}`,
  /**
   * What a nameless folder says of itself, under its name: its newest task,
   * its pages, its stages, when its files last changed; a bare stub says so.
   */
  folderSays: (said: {
    task: { number: number; title: string } | null;
    pages: readonly string[];
    stages: number;
    changed: string | null;
  }): string => {
    const parts = [
      said.task && `#${said.task.number} ${said.task.title}`,
      said.pages.length > 0 &&
        (said.pages.length === 1
          ? `${said.pages[0]} page`
          : `pages ${listed(said.pages)}`),
      said.stages > 0 && count(said.stages, "stage", "stages"),
    ].filter((part): part is string => typeof part === "string");
    const changed = said.changed ? `files changed ${said.changed}` : null;
    if (parts.length === 0) {
      return changed ? `Only its stub; ${changed}` : "Only its stub";
    }
    const line = [...parts, ...(changed ? [changed] : [])].join(" · ");
    return line.charAt(0).toUpperCase() + line.slice(1);
  },
  /** A nameless row, to a reader and in its delete question. */
  unnamedAt: (when: string) => `The unnamed project forgotten ${when}`,
  /** A row's buttons, to a reader: which project each acts on. */
  bringBackOne: (name: string) => `Bring back ${name}`,
  deleteOne: (name: string) => `Delete ${name}…`,
  /** A refused restore's way on: the live project that holds its place. */
  openHolder: (name: string) => `Open ${name}`,
  /** That row's name field. */
  namePlaceholder: "Name it to bring it back",
  /** That row's name field's accessible name. */
  nameLabel: (id: string) => `Name for project ${id}`,
  /** When it was forgotten. */
  forgottenAt: (when: string) => `Forgotten ${when}`,
  /** What a row brings back, counted; empty counts are left out. */
  brings: (b: {
    tasks: number;
    pages: number;
    routines: number;
    sessions: number;
  }): string =>
    listed(
      [
        b.tasks > 0 && count(b.tasks, "task", "tasks"),
        b.pages > 0 && count(b.pages, "page", "pages"),
        b.routines > 0 && count(b.routines, "routine", "routines"),
        b.sessions > 0 && count(b.sessions, "session", "sessions"),
      ].filter((part): part is string => typeof part === "string")
    ) || "Its folder only",
  /** A folder from before the hub kept records whose tasks may live on in another project. */
  tasksIn: (name: string, n: number) =>
    `${count(n, "of its tasks lives", "of its tasks live")} in ${name} now`,
  /** A row's delete, before its question. */
  deleteRow: "Delete…",
  /** The question under a forgotten row. */
  deleteForgotten: (name: string) => `Delete ${name} for good?`,
  deleteForgottenBody:
    "Its folder on the hub and everything kept to bring it back are removed. This cannot be undone.",
  /** That question's confirm, and its pending word. */
  deletePlain: "Delete project",
  deleting: "Deleting…",
  /** The page with nothing forgotten. */
  noneTitle: "Nothing forgotten",
  noneBody:
    "A project you forget waits here, to be brought back or deleted for good.",
  /** The list could not be read. */
  unreadThen: "so the forgotten projects were not listed. Try again.",
  /** A restore refused by the hub, said after the hub's sentence. */
  notBroughtBackThen: "so it was not brought back. Try again.",
  /** A delete refused by the hub, said after the hub's sentence. */
  notDeletedThen: "so it was not deleted. Try again.",
};
