/**
 * A forgotten project brought back (hub project-trash.ts,
 * `POST /api/projects/:id/restore`): the hub's refusals, said to whoever
 * asked, and the head of the journal line each forget and restore writes.
 */
export const projectTrashWords = {
  /** A forget's journal line, before who asked and how it went. */
  forgetLine: (id: string) => `[hub] forget project=${id}`,
  /** A restore's journal line, before who asked and how it went. */
  restoreLine: (id: string) => `[hub] restore project=${id}`,
  /** Nothing in the trash under that id. */
  notForgotten: (id: string) =>
    `There is no forgotten project ${id} in the trash.`,
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
