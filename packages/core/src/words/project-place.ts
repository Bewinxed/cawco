/**
 * A project's place refused by the hub (hub project-place-scratch.ts): the
 * sentence the refusal's `detail` carries, said to whoever asked.
 */
export const projectPlaceWords = {
  /** A checkout asked for at `path`, inside `root`, the machine's scratch root: every session's and workspace's scratch folder, removed when it ends. */
  inScratch: (path: string, root: string) =>
    `${path} is inside ${root}, where each session's scratch folder is removed when the session ends. A project's checkout must outlive the session that made it: name a folder outside ${root}.`,
};
