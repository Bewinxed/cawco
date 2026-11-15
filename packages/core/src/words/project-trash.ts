/**
 * A forgotten project brought back (hub project-trash.ts,
 * `POST /api/projects/:id/restore`), the rows its restore held back, listed
 * in Forgotten projects and tried again (`POST /api/projects/:id/held/…`),
 * or a project deleted for good (hub project-delete.ts,
 * `POST /api/projects/:id/discard`): the hub's refusals, said to whoever
 * asked, the words of the held rows' entry and its results, and the head of
 * the journal line each forget, restore, try again and delete writes.
 */
import type { RestoreHeldRow, RestoreHeldWhy } from "../forgotten-project";
import { unhandled } from "../unhandled";

/** Why a restore held one row back (hub db forget.ts), as a clause. */
const rows = (n: number) => (n === 1 ? "1 row" : `${n} rows`);

const heldWhy = (why: RestoreHeldWhy): string => {
  switch (why.kind) {
    case "unread":
      return `a migration kept ${why.columns.join(", ")} as not read`;
    case "shape":
      return `${why.column} is not its shape: ${why.issue}`;
    case "constraint":
      return `the database does not take it: ${why.detail}`;
    case "depends":
      return `it hangs off ${why.table} ${why.title ?? why.id ?? "row"}, which was held back`;
    case "taken":
      return "a row made since holds its key";
    case "orphan":
      return why.parent
        ? `the ${why.parent} row it names is gone`
        : "a row it hangs off is gone";
    case "table":
      return "its table is no longer kept";
    default:
      return unhandled("held row's reason", why);
  }
};

export const projectTrashWords = {
  /** A forget's journal line, before who asked and how it went. */
  forgetLine: (id: string) => `[hub] forget project=${id}`,
  /** A restore's journal line, before who asked and how it went. */
  restoreLine: (id: string) => `[hub] restore project=${id}`,
  /** A delete's journal line, before who asked and how it went. */
  deleteLine: (id: string) => `[hub] delete project=${id}`,
  /** A try again of held rows' journal line, or their delete's, before who asked and how it went. */
  heldLine: (id: string, act: "retry" | "discard") =>
    `[hub] held rows ${act} project=${id}`,

  // ── Delete for good ──
  /** Neither a live project nor one in the trash. */
  noProject: (id: string) =>
    `There is no project ${id} on this hub, live or forgotten.`,
  /** Its sessions run: they stop first, as a forget's do. */
  stillRuns: (name: string, count: number) =>
    count === 1
      ? `1 session still runs in ${name}; stop it first.`
      : `${count} sessions still run in ${name}; stop them first.`,
  /** One of its places on disk is another live project's checkout too: removing it would remove theirs. */
  placeShared: (name: string, path: string, machine: string, holder: string) =>
    `${path} on ${machine} is ${holder}'s place too, so ${name} was not deleted from disk: removing it would remove ${holder}'s files. Remove that place from one of them first, or delete without removing its files.`,
  /** One of its places on disk holds another live project's checkout: removing it would remove theirs. */
  placeHolds: (
    name: string,
    path: string,
    machine: string,
    holder: string,
    theirs: string
  ) =>
    `${path} on ${machine} holds ${holder}'s place ${theirs}, so ${name} was not deleted from disk: removing it would remove ${holder}'s files. Remove that place from one of them first, or delete without removing its files.`,
  /** A machine holding something of it is away: nothing was removed. */
  machinesAway: (name: string, machines: readonly string[]) =>
    `${machines.join(", ")} ${machines.length === 1 ? "holds" : "hold"} part of ${name} and ${machines.length === 1 ? "is" : "are"} not connected, so nothing of it was deleted. Delete it again once ${machines.length === 1 ? "it is" : "they are"} back.`,
  /** A machine's agent predates deleting a workspace's clone: it is updated first, then the delete runs again. */
  agentTooOld: (name: string, what: string, machine: string) =>
    `CawCo on ${machine} is too old to remove ${what.charAt(0).toLowerCase()}${what.slice(1)}, so ${name} is not deleted yet. Update it (Configure › Updates), then delete ${name} again.`,
  /** A machine refused or failed one removal: what went before it stays gone, the project stays listed. */
  notRemoved: (name: string, what: string, machine: string, why: string) =>
    `${what} on ${machine} was not removed (${why}), so ${name} is not deleted yet. What was removed before it stays removed; delete it again to finish.`,
  /** Nothing in the trash under that id. */
  notForgotten: (id: string) =>
    `There is no forgotten project ${id} in the trash.`,
  /** A duplicate folded into another project: its rows and tasks live on there. */
  foldedInto: (id: string, into: string) =>
    `Project ${id} was folded into ${into}, which holds its tasks, so there is nothing of it to bring back.`,
  /** A live project has the id now. */
  idTaken: (name: string, id: string) =>
    `${name} is a project on this hub with the id ${id}, so the forgotten one was not brought back.`,
  /** A live project holds one of its places now. */
  placeTaken: (forgotten: string, holder: string, path: string) =>
    `${holder} holds ${path} now, so ${forgotten} was not brought back. Remove that place from ${holder} first.`,
  /** A folder stands where its folder goes back to. */
  folderTaken: (forgotten: string, path: string) =>
    `A folder stands at ${path} already, so ${forgotten} was not brought back over it.`,
  /** Forgotten before the hub kept a project's name: the restore names it. */
  nameNeeded: (id: string) =>
    `Project ${id} was forgotten before the hub kept its name, so bringing it back needs one: send its name.`,
  /** A read that outlived a project's forget, which would make its folder again. */
  forgottenFolder: (id: string) =>
    `Project ${id} was forgotten: its folder is in the trash, and is not made again until it is brought back.`,
  // ── A record brought to today's schema (hub db restore-schema.ts) ──
  /** The record names migrations this build does not have. */
  schemaNewer: (name: string, count: number) =>
    `${name}'s record names ${count === 1 ? "1 migration" : `${count} migrations`} this build doesn't have, so it was not brought back. Its record stays in the trash; bring it back again once CawCo is updated.`,
  /** No migration's schema holds the record's tables as it keeps them. */
  schemaNone: (name: string) =>
    `${name}'s record matches the schema of no migration in this build, so where its rows stand can't be told and it was not brought back. Its record stays in the trash.`,
  /** Several migrations' schemas hold its tables, and a migration between them writes them. */
  schemaSeveral: (name: string, first: string, last: string) =>
    `${name}'s record matches the schema of every migration from ${first} to ${last}, and they differ for its tables, so where its rows stand can't be told and it was not brought back. Its record stays in the trash.`,
  /** A recorded column its schema does not have. */
  columnMissing: (name: string, column: string) =>
    `${name}'s record holds ${column}, which the schema it names does not have, so it was not brought back. Its record stays in the trash.`,
  /** A migration since it was forgotten threw on its rows. */
  migrationFailed: (name: string, why: string) =>
    `${name}'s rows did not go through the migrations since it was forgotten (${why}), so it was not brought back. Its record stays in the trash.`,
  /** The project's own row is held back: nothing of it goes back. */
  ownHeld: (name: string, why: string) =>
    `${name}'s own row was held back (${why}), so it was not brought back. Its record stays in the trash.`,
  /** Why one row was held back, as a clause. */
  heldWhy,
  /** One held row, named: its table, its title or id, and why. */
  heldRow: (row: RestoreHeldRow): string => {
    const named = row.title ?? row.id;
    return `${row.table}${named === null ? "" : ` ${named}`}: ${heldWhy(row.why)}`;
  },
  /** The head of a restore's held rows, beside the project. */
  heldTitle: (count: number) =>
    count === 1 ? "1 row held back" : `${count} rows held back`,
  /** Where the held rows are now, under the head after a restore: "They are listed under Forgotten projects and can be tried again." */
  heldWhere: {
    before: "They are listed under ",
    /** The page's name, its link. */
    place: "Forgotten projects",
    after: " and can be tried again.",
  },
  /** The held rows' dismiss. */
  heldDismiss: "Dismiss",

  // ── The held rows' entry in Forgotten projects ──
  /** What the entry holds, in its row. */
  heldEntry: (n: number) => `${rows(n)} not restored`,
  /** Under the entry's name on a phone, where the heads are gone: what it holds and when its project was forgotten. */
  heldFacts: (n: number, when: string) =>
    `${rows(n)} not restored · forgotten ${when}`,
  /** The entry's name, to a reader: it opens the project. */
  heldOpenProject: (name: string) => `Open ${name}`,
  /** The entry's rows, to a reader. */
  heldListLabel: (name: string) => `${name}'s rows not restored`,
  /** Under the entry's name while its project is forgotten again. */
  heldProjectGone: (name: string) =>
    `${name} is forgotten. These rows can be tried again once it is brought back.`,
  /** The entry's act, and its pending word. */
  heldRetry: "Try again",
  heldRetrying: "Trying again…",
  /** That act, to a reader. */
  heldRetryOne: (name: string) => `Try ${name}'s rows again`,
  /** A try again that put every row back: the entry is gone. */
  heldAllBack: (name: string, n: number) => `${rows(n)} back in ${name}.`,
  /** A try again that held some back again, under the entry, its rows listed with why. */
  heldStill: (back: number, held: number) =>
    back === 0
      ? `${rows(held)} still held back.`
      : `${rows(back)} back; ${rows(held)} still held back.`,
  /** The entry's delete, to a reader. */
  heldDeleteOne: (name: string) => `Delete ${name}'s rows not restored…`,
  /** The question under the entry. */
  heldDeleteAsk: (name: string, n: number) =>
    `Delete ${name}'s ${rows(n)} not restored?`,
  heldDeleteBody: "Their values are removed. This cannot be undone.",
  /** That question's confirm. */
  heldDeleteConfirm: "Delete rows",
  /** The held rows' list, a try again and a delete refused or unanswered, said after the hub's sentence. */
  heldUnreadThen: "so the rows not restored were not listed. Try again.",
  heldNotRetriedThen: "so the rows were not tried again. Try again.",
  heldNotDeletedThen: "so the rows were not deleted. Try again.",
  /** No such entry: none of the project's rows are held back from that forget. */
  heldNone: (id: string) =>
    `Project ${id} has no rows held back from that restore.`,
  /** Its project is forgotten again: nothing goes back into it. */
  heldProjectForgotten: (name: string) =>
    `${name} is forgotten, so its rows were not tried again. Bring it back first.`,
  /** The entry is asked to bring its project back: it holds rows, not a forgotten project. */
  heldNotForgotten: (name: string, n: number) =>
    `${name} is not forgotten: this entry holds ${rows(n)} of it that were not restored, which can be tried again.`,

  /** The record beside its folder could not be read. */
  unreadable: (id: string, why: string) =>
    `What the hub kept of project ${id} could not be read (${why}), so it was not brought back.`,
};
