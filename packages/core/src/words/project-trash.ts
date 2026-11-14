/**
 * A forgotten project brought back (hub project-trash.ts,
 * `POST /api/projects/:id/restore`), or a project deleted for good (hub
 * project-delete.ts, `POST /api/projects/:id/discard`): the hub's refusals,
 * said to whoever asked, and the head of the journal line each forget,
 * restore and delete writes.
 */
export const projectTrashWords = {
  /** A forget's journal line, before who asked and how it went. */
  forgetLine: (id: string) => `[hub] forget project=${id}`,
  /** A restore's journal line, before who asked and how it went. */
  restoreLine: (id: string) => `[hub] restore project=${id}`,
  /** A delete's journal line, before who asked and how it went. */
  deleteLine: (id: string) => `[hub] delete project=${id}`,

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
  /** The record beside its folder could not be read. */
  unreadable: (id: string, why: string) =>
    `What the hub kept of project ${id} could not be read (${why}), so it was not brought back.`,
};
