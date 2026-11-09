/**
 * The hub's routes for a project's decision pages (hub decisions.ts), as
 * plain requests: the project page's Decisions tab reads and acts through
 * them. Each refusal is thrown in the hub's own words.
 */
import type {
  DecisionPageRead,
  DecisionSent,
  DecisionsList,
} from "@cawco/core/decisions";
import { hubRequest } from "@cawco/core/hub-request";
import { openPageWrites } from "#lib/cawco/preview/open-pages.js";
import { hubJson } from "#lib/platform/hub-read.js";

/** The project's pages, newest first, each with the pages it links to. */
export async function listDecisions(projectId: string): Promise<DecisionsList> {
  return await hubJson(
    hubRequest("GET /api/projects/:id/decisions", { path: { id: projectId } })
  );
}

/** One page: its progress, its state, its writer and, once decided, its record. */
export async function readDecision(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  return await hubJson(
    hubRequest("GET /api/projects/:id/decisions/:name", {
      path: { id: projectId, name },
    })
  );
}

/**
 * I'm done picking (no words), the page's Send, carrying what a frame open
 * on page `artifactId` in this tab shows that the hub isn't known to hold
 * (open-pages.ts; with none open, the hub's doc is what goes); or a note
 * (words), said to its session as the person's words, never a Send: its
 * session hears it, or Caw.
 */
export async function sendDecision(
  projectId: string,
  name: string,
  artifactId: string | null,
  text?: string
): Promise<DecisionSent> {
  const writes =
    text || !artifactId ? undefined : await openPageWrites(artifactId);
  return hubJson(
    hubRequest("POST /api/projects/:id/decisions/:name/send", {
      path: { id: projectId, name },
      body: {
        ...(text ? { text } : {}),
        ...(writes ? { writes } : {}),
      },
    })
  );
}

/** Make tasks: the record written, and its session (or Caw) asked to file them. */
export async function makeDecisionTasks(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  return await hubJson(
    hubRequest("POST /api/projects/:id/decisions/:name/tasks", {
      path: { id: projectId, name },
    })
  );
}
