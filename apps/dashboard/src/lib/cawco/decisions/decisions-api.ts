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
import { openPageWrites } from "#lib/cawco/preview/open-pages.js";
import { hub } from "#lib/platform/hub.js";
import { hubRefusal } from "#lib/platform/hub-read.js";

/** The project's pages, newest first, each with the pages it links to. */
export async function listDecisions(projectId: string): Promise<DecisionsList> {
  const answer = await hub.api.projects({ id: projectId }).decisions.get();
  if (answer.error) {
    throw hubRefusal(answer);
  }
  return answer.data;
}

/** One page: its progress, its state, its writer and, once decided, its record. */
export async function readDecision(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  const answer = await hub.api
    .projects({ id: projectId })
    .decisions({ name })
    .get();
  if (answer.error) {
    throw hubRefusal(answer);
  }
  return answer.data;
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
  const answer = await hub.api
    .projects({ id: projectId })
    .decisions({ name })
    .send.post({
      ...(text ? { text } : {}),
      ...(writes ? { writes } : {}),
    });
  if (answer.error) {
    throw hubRefusal(answer);
  }
  return answer.data;
}

/** Make tasks: the record written, and its session (or Caw) asked to file them. */
export async function makeDecisionTasks(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  const answer = await hub.api
    .projects({ id: projectId })
    .decisions({ name })
    .tasks.post();
  if (answer.error) {
    throw hubRefusal(answer);
  }
  return answer.data;
}
