/**
 * A project's custom views (PRD §5.2), as plain requests: the project page
 * and a view alone in its route (what the iOS app's web view loads) call
 * them alike. Its own module, apart from the fleet store, so that route
 * loads only what the view needs.
 */

import { hubRequestAsGiven } from "@cawco/core/hub-request";
import type { ViewToolName } from "@cawco/core/views";
import { hub } from "#lib/platform/hub.js";
import {
  hubData,
  hubJson,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";

/** A project's views: kept ones, then Caw's drafts. */
export const viewsOf = (projectId: string) =>
  hubData(hub.api.projects({ id: projectId }).views.get(), refusedOrUnreached);

/** Keeps a draft view: it becomes `views/<name>.oui`, one commit. */
export const keepView = (projectId: string, name: string) =>
  hubData(
    hub.api.projects({ id: projectId }).views({ name }).keep.post(),
    refusedOrUnreached
  );

/** Discards a draft view. */
export const discardView = (projectId: string, name: string) =>
  hubData(
    hub.api.projects({ id: projectId }).views.drafts({ name }).delete(),
    refusedOrUnreached
  );

/**
 * One view tool's answer: what a view's `Query("<tool>", args)` reads, the
 * hub's route for it (views.ts). A view reaches nothing else. Its arguments
 * are the view's own, as its program wrote them: data no type holds here,
 * held to the tool's schema by the hub's draft check and, as they are sent,
 * by the route's 422 naming any field it doesn't take, whose words the view
 * shows. So they go as given (core `hubRequestAsGiven`).
 */
export const viewTool = (
  projectId: string,
  tool: ViewToolName,
  args: Record<string, unknown>
): Promise<unknown> =>
  hubJson(
    hubRequestAsGiven(`POST /api/projects/:id/view-tools/${tool}`, {
      path: { id: projectId },
      body: args,
    }),
    { failure: refusedOrUnreached }
  );
