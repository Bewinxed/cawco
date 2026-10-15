/**
 * The hub's routes for a project's decision pages (hub decisions.ts), as
 * plain requests: the project page's Decisions tab reads and acts through
 * them. Each refusal is thrown in the hub's own words.
 */
import type {
  DecisionGraph,
  DecisionPageRead,
  DecisionSent,
  DecisionsList,
} from "@cawco/core/decisions";

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/decisions`;

async function answered<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `The hub answered ${response.status}.`
    );
  }
  return (await response.json()) as T;
}

/** The project's pages, newest first, and whether its decisions form a graph. */
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

/** I'm done picking (no words), or a comment: its session hears it, or Caw. */
export async function sendDecision(
  projectId: string,
  name: string,
  text?: string
): Promise<DecisionSent> {
  return answered(
    await fetch(`${base(projectId)}/${encodeURIComponent(name)}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(text ? { text } : {}),
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

/** The graph (`decisions/decisions.json`), each card's pick read from its page. */
export async function readDecisionGraph(
  projectId: string
): Promise<DecisionGraph> {
  return answered(await fetch(`${base(projectId)}/graph`));
}

/** The person's drags: each card's new place, saved into the file. */
export async function placeDecisionCards(
  projectId: string,
  places: { id: string; x: number; y: number }[]
): Promise<void> {
  await answered(
    await fetch(`${base(projectId)}/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ places }),
    })
  );
}
