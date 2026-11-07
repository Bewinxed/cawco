/**
 * A fact the person forgets (hub forget-fact.ts, `POST /api/facts/forget`
 * and its dry run): the hub's refusals, each place a dry run names, and
 * what a forget says stays, its honest boundary (OpenClaw's "Review the
 * report and the deletion boundaries before applying it",
 * https://docs.openclaw.ai/concepts/memory-provenance; MemIndex's "Deleting
 * memory is not a promise that all copies are gone",
 * https://memindex.ai/docs/privacy).
 */

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

export const forgetFactWords = {
  /** The journal line a forget writes, before what it removed; never the words. */
  line: "[hub] forget fact",

  // ── Refusals ──
  noWords: "Say the words to forget, exactly as they were written.",
  oneLine:
    "Forget one line at a time: the words are matched letter for letter, and a line break never is.",
  tooShort: (least: number) =>
    `Give at least ${least} characters: shorter words stand in too many other things to forget them all.`,
  tooLong: (most: number) =>
    `Give at most ${most} characters: forget the line that holds the fact.`,
  dryRunFirst:
    "See what forgetting it reaches first: run the dry run, then forget with the confirm it answers.",
  noWorkspace: (id: string) => `There is no workspace ${id} on this hub.`,
  noCarry: (id: string) => `Workspace ${id} keeps no carry.`,
  confirmStale:
    "That confirm is for other words, or more than 15 minutes old: run the dry run again.",

  // ── What a dry run finds, and a forget removes ──
  trailer: (sha: string, subject: string, trailers: readonly string[]) =>
    `Commit ${sha.slice(0, 9)} “${subject}”: ${trailers.length > 0 ? trailers.join(", ") : "its message"}`,
  committedFile: (sha: string, subject: string, paths: readonly string[]) =>
    `Commit ${sha.slice(0, 9)} “${subject}”: ${paths.join(", ")}`,
  fileNow: (path: string) => `${path}, as it stands`,
  note: (id: string) => `Memory note ${id} and its commit`,
  knowledgeLines: (count: number) =>
    `${plural(count, "knowledge line")} stating it or resting on its notes alone`,
  rows: (table: string, column: string, count: number) =>
    `${table}.${column}: ${plural(count, "row")}`,
  carry: (path: string, machine: string, workspace: string) =>
    `The carry ${path} on ${machine}, of workspace ${workspace}`,
  index: (machine: string, documents: number | null) =>
    documents === null
      ? `The transcript index on ${machine}`
      : `The transcript index on ${machine}: ${plural(documents, "document")}`,
  mask: "From now on, every answer the hub gives an agent leaves it out, and the person's Find hides it",

  // ── What stays ──
  harnessTranscripts:
    "Each harness's own transcripts on its machine (Claude Code's, OpenCode's, pi's): CawCo does not rewrite them. Its words stay out of what the hub answers.",
  exports:
    "Anything exported, downloaded or copied out of CawCo, and backups of the hub's machine.",
  otherCopies:
    "Copies on other machines: a clone of a project's code, a delegate's workspace, a browser's cache.",
  codeRepos:
    "A project's code repositories: a commit there is the project's own history.",
  trash: "Projects in the trash keep what they held when they were forgotten.",
  machineAway: (machine: string) =>
    `${machine} was not connected: its transcript index still holds it. Forget it again once it is back.`,
  machineFailed: (machine: string, what: string, why: string) =>
    `${what} on ${machine} was not reached (${why}). Forget it again to finish.`,
  carryAway: (path: string, machine: string) =>
    `The carry ${path} on ${machine}: ${machine} was not connected. Forget it again once it is back.`,
  keyColumn: (table: string, column: string, count: number) =>
    `${table}.${column}: ${plural(count, "row")} where it is part of a row's key, which is not rewritten.`,
  historyKept: (project: string, why: string) => `${project}: ${why}`,
  python3Missing:
    "python3 is not installed on the hub's machine, and the tool that rewrites the project folder's history runs on it, so the history still holds it. Install python3 there, then forget it again.",
  uncommitted: (paths: readonly string[]) =>
    `${paths.join(", ")} ${paths.length === 1 ? "is" : "are"} changed and not committed in the project folder, so its history was not rewritten: commit or undo ${paths.length === 1 ? "it" : "them"} first.`,
  newIds:
    "Every commit of a folder from the first that held it gets a new id; a link to an older commit id no longer opens it.",
} as const;
