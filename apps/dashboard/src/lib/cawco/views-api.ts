/**
 * A project's custom views (PRD §5.2), as plain requests: the project page
 * and a view alone in its route (what the iOS app's web view loads) call
 * them alike. Its own module, apart from the fleet store, so that route
 * loads only what the view needs.
 */
import type { ProjectView, ViewToolName } from "@cawco/core";
import { send as askHub, json } from "./project-tasks";

const projectPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;

/** A project's views: kept ones, then Caw's drafts. */
export const viewsOf = (projectId: string): Promise<ProjectView[]> =>
  askHub(`${projectPath(projectId)}/views`);

/** Keeps a draft view: it becomes `views/<name>.oui`, one commit. */
export const keepView = (
  projectId: string,
  name: string
): Promise<ProjectView> =>
  askHub(
    `${projectPath(projectId)}/views/${encodeURIComponent(name)}/keep`,
    json("POST", {})
  );

/** Discards a draft view. */
export const discardView = (
  projectId: string,
  name: string
): Promise<{ ok: true }> =>
  askHub(`${projectPath(projectId)}/views/drafts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

/**
 * One view tool's answer: what a view's `Query("<tool>", args)` reads, the
 * hub's route for it (views.ts). A view reaches nothing else.
 */
export const viewTool = (
  projectId: string,
  tool: ViewToolName,
  args: Record<string, unknown>
): Promise<unknown> =>
  askHub(`${projectPath(projectId)}/view-tools/${tool}`, json("POST", args));
