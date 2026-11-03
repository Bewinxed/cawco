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
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { openPageWrites } from "#lib/cawco/preview/open-pages.js";

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/decisions`;

async function answered<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await hubRefusal(response);
  }
  return (await response.json()) as T;
}

/** The project's pages, newest first, each with the pages it links to. */
export async function listDecisions(projectId: string): Promise<DecisionsList> {
  return answered(await fetch(base(projectId)));
}

/** One page: its progress, its state, its writer and, once decided, its record. */
export async function readDecision(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  return answered(
    await fetch(`${base(projectId)}/${encodeURIComponent(name)}`)
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
  return answered(
    await fetch(`${base(projectId)}/${encodeURIComponent(name)}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(text ? { text } : {}),
        ...(writes ? { writes } : {}),
      }),
    })
  );
}

/** Make tasks: the record written, and its session (or Caw) asked to file them. */
export async function makeDecisionTasks(
  projectId: string,
  name: string
): Promise<DecisionPageRead> {
  return answered(
    await fetch(`${base(projectId)}/${encodeURIComponent(name)}/tasks`, {
      method: "POST",
    })
  );
}
