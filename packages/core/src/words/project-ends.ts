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
  /** The line under the title, in each step; `done` is what the stops did. */
  line: (step: EndStep, n: number, cut: number, done: string) => string;
  /** Parked, while the stops land. */
  parked: (stopped: number, total: number) => string;
  /** Parked, once a stop failed: what was left. */
  partway: (stopped: number, total: number) => string;
  /** The plain question's confirm, with nothing running. */
  plain: string;
  /** The first press, with sessions running. */
  stop: (n: number) => string;
  title: string;
}

/** The armed line: what the second press cuts short. */
const armedLine = (cut: number) =>
  cut === 1
    ? "1 session is mid-turn: stopping it now cuts its turn short."
    : `${cut} sessions are mid-turn: stopping them now cuts their turns short.`;

const runningFirst = (n: number) =>
  `${count(n, "running session stops", "running sessions stop")} first.`;

export const projectEndWords = {
  // ── The menus ──
  /** The More menu's and the rail menu's forget. */
  forgetProject: "Forget project…",
  /** The More menu's and the rail menu's delete for good. */
  deleteProject: "Delete project…",

  /** Forgetting `name`: it waits in Forgotten projects, to be brought back. */
  forget: (name: string): EndWords => ({
    title: `Forget ${name}?`,
    plain: "Forget project",
    stop: (n) => `Stop ${n} and forget`,
    armed: (n, cut) =>
      cut === n
        ? `Stop ${n} mid-turn and forget`
        : `Stop ${n}, ${cut} mid-turn, and forget`,
    ending: "Forgetting…",
    ended: "Forgotten",
    line: (step, n, cut, done) => {
      switch (step) {
        case "none":
          return "It waits in Forgotten projects to be brought back. Its files stay on disk.";
        case "list":
          return `${runningFirst(n)} It waits in Forgotten projects to be brought back.`;
        case "armed":
          return armedLine(cut);
        case "stopping":
          return "It waits in Forgotten projects to be brought back.";
        case "fail":
          return `${name} is kept until every session is stopped.`;
        case "ending":
        case "done":
          return done;
      }
    },
    parked: (stopped, total) =>
      `Forgetting ${name}: stopped ${stopped} of ${count(total, "session", "sessions")}…`,
    partway: (stopped, total) =>
      `Stopped ${stopped} of ${total}; ${name} kept.`,
  }),

  /** Deleting `name` for good; `fromDisk`: its checkouts and transcripts too. */
  delete: (name: string, fromDisk: boolean): EndWords => ({
    title: `Delete ${name} for good?`,
    plain: "Delete project",
    stop: (n) => `Stop ${n} and delete`,
    armed: (n, cut) =>
      cut === n
        ? `Stop ${n} mid-turn and delete`
        : `Stop ${n}, ${cut} mid-turn, and delete`,
    ending: "Deleting…",
    ended: "Deleted",
    line: (step, n, cut, done) => {
      const gone = fromDisk
        ? "Its tasks, pages, browsers, workspaces and files on disk are removed. This cannot be undone."
        : "Its tasks, pages, browsers and workspaces are removed. This cannot be undone.";
      switch (step) {
        case "none":
          return gone;
        case "list":
          return `${runningFirst(n)} ${gone}`;
        case "armed":
          return armedLine(cut);
        case "stopping":
          return gone;
        case "fail":
          return `${name} is kept until every session is stopped.`;
        case "ending":
        case "done":
          return done;
      }
    },
    parked: (stopped, total) =>
      `Deleting ${name}: stopped ${stopped} of ${count(total, "session", "sessions")}…`,
    partway: (stopped, total) =>
      `Stopped ${stopped} of ${total}; ${name} kept.`,
  }),

  /** Said under what asked while what runs in the project is read. */
  reading: (name: string) => `Reading what runs in ${name}…`,

  /** Delete's box: its places on disk and its transcripts go too. */
  fromDisk: "Also delete its files on disk",
  /** Checked: the list of what goes, by machine and path. */
  placesGo: "Removed from disk",
  /** A project whose only place is its folder on the hub: nothing on a machine to remove. */
  noPlaces:
    "It has no checkout on a machine; its folder on the hub is removed.",
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
  /** The page's one line under its title. */
  forgottenLine:
    "Brought back, a project returns as it was forgotten. Deleted, it is gone for good.",
  /** A row forgotten before the hub kept a project's name. */
  unnamed: "Unnamed project",
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
  /** That question's box, checked: what else goes. */
  checkoutsGo:
    "Its checkouts on disk and its sessions' transcripts are removed too.",
  /** The page with nothing forgotten. */
  noneTitle: "Nothing forgotten",
  noneBody:
    "A project you forget waits here, to be brought back or deleted for good.",
  /** The empty page's one action. */
  newProject: "New project",
  /** The list could not be read. */
  unreadThen: "so the forgotten projects were not listed. Try again.",
  /** A restore refused by the hub, said after the hub's sentence. */
  notBroughtBackThen: "so it was not brought back. Try again.",
  /** A delete refused by the hub, said after the hub's sentence. */
  notDeletedThen: "so it was not deleted. Try again.",
};
