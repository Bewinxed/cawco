/**
 * What a folder workspace's carry is said to be: the files its delegate
 * changed in its private view or copy of a folder that is no git
 * repository, saved as the workspace retires with its work landing none.
 * Only the view or copy goes; the folder itself is never touched by it.
 */

/**
 * How a folder workspace held its folder (agent layer.ts `LayerForm`): a
 * Linux view of the folder at its own path (`overlay`), or a macOS copy of
 * it at a path of its own (`copy`). The hub reads it from the workspace's
 * row (workspaces.ts `ownCopy`), the agent from its layer record.
 */
type FolderForm = "overlay" | "copy";

/** A folder workspace's view or copy: its form, the folder, and where it worked. */
export interface FolderCopy {
  /** The folder the workspace was made from. */
  folder: string;
  form: FolderForm;
  /** Where it worked: the folder itself (overlay), or its copy (copy). */
  path: string;
}

/** "Its view of <folder> is gone" or "Its copy <path> of <folder> is gone", in `its` case. */
const goneWords = (its: "Its" | "its", { form, folder, path }: FolderCopy) =>
  form === "overlay"
    ? `${its} view of ${folder} is gone`
    : `${its} copy ${path} of ${folder} is gone`;

export const carryWords = {
  /**
   * The notice to the session that started a folder workspace's work, as it
   * retires with the files it changed in a carry (hub workspaces.ts
   * `carryNotice`): `ws` its handle, `title` its latest item's.
   */
  folderNotice: (
    ws: string,
    title: string,
    carry: string,
    machine: string,
    copy: FolderCopy
  ) =>
    `Workspace ${ws} of “${title}” retired: its work lands none, so the files it changed were saved to the carry ${carry} on ${machine} (its README says how to take each one back). ${goneWords("Its", copy)}; the folder itself is as it was. A handoff or a follow-up to it starts a new ${copy.form === "overlay" ? "view" : "copy"} with those files.`,
  /** That notice's headline. */
  folderHeadline: (ws: string, carry: string, machine: string) =>
    `Workspace ${ws} retired; the files it changed are in the carry ${carry} on ${machine}.`,
  /** The end of the hub's log line for a folder workspace retired (hub workspaces.ts `closeSettled`). */
  folderGone: (copy: FolderCopy) =>
    `${goneWords("its", copy)}; the folder is untouched`,
  /**
   * The body of a folder workspace's carry README (agent carry.ts
   * `carryReadme`): `id` the workspace's, `words` what it held ("3 changed
   * files"), `time` when it was let go.
   */
  folderReadme: (id: string, copy: FolderCopy, words: string, time: string) =>
    [
      copy.form === "overlay"
        ? `Workspace ${id} worked on a private view of the folder ${copy.folder} and held ${words} when it was let go, on ${time}.`
        : `Workspace ${id} worked on a private copy ${copy.path} of the folder ${copy.folder} and held ${words} when it was let go, on ${time}.`,
      "Each file it wrote is in `changes/` at the path it had there, and each it deleted is named in `deleted.txt`.",
      copy.form === "overlay"
        ? `The view is gone; ${copy.folder} itself is as it was.`
        : `The copy is gone; ${copy.folder} itself is as it was.`,
    ].join(" "),
};
