/**
 * What a workspace tab is. A tab is a string in its group's strip
 * (tree.ts `LeafNode.tabs`): a conversation's id, or a project's tab, its
 * id behind `project:`. A project opens beside the chats as a chat does
 * (the owner's pick on the project-tabs page, 2026-11-05), so the tree,
 * its cookie and every move (open, close, split, drag) carry both kinds
 * alike, and only what a tab draws and reads asks which it is. Nothing here
 * is reactive: the server's layout load reads it too.
 */

/** What a project's tab id starts with; a session id never does (it is a uuid). */
const PROJECT = "project:";

/** A project's tab. */
export const projectTab = (projectId: string): string =>
  `${PROJECT}${projectId}`;

/** The project a tab is, or `null` for a conversation's tab. */
export function projectOfTab(tab: string | null | undefined): string | null {
  return tab?.startsWith(PROJECT) ? tab.slice(PROJECT.length) : null;
}

/** Whether a tab is a conversation's. */
export const isSessionTab = (tab: string): boolean => !tab.startsWith(PROJECT);

/** The project pages that are pages of their own, not a project's tab. */
const NOT_A_PROJECT = new Set(["new", "forgotten"]);

/**
 * The tab a workspace address names: a conversation (`/session/<id>`), a
 * project (`/project/<id>`), or `null` for the board (`/session`).
 * `undefined` for an address that is no workspace's: another spoke, a
 * project's own deeper pages, New project.
 */
export function tabOfPath(pathname: string): string | null | undefined {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "session" && parts.length <= 2) {
    return parts[1] ?? null;
  }
  if (
    parts[0] === "project" &&
    parts.length === 2 &&
    !NOT_A_PROJECT.has(parts[1])
  ) {
    return projectTab(parts[1]);
  }
  return undefined;
}

/** A project tab's address, its view and what it has open carried in `search`. */
export const projectHref = (projectId: string, search = ""): string =>
  `/project/${encodeURIComponent(projectId)}${search}`;
